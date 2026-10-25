-- Phase 5: credits and subscriptions.
-- credit_accounts: one row per person. `balance` is a cache of SUM(credit_ledger.delta), kept in the
--   same transaction as every ledger write and locked (FOR UPDATE) while it changes. Never negative.
--   `trial_prompts` are the free prompts every new account gets (no card needed).
-- credit_ledger: append-only history of every grant, hold, spend, release, expiry and adjustment.
--   Updates and deletes are refused by a trigger. Each row's idempotency_key is unique, so a retried
--   webhook or request can never apply twice.
-- subscriptions: the Stripe subscription behind each paid plan.
-- stripe_events: webhook events already processed (idempotency).

create table credit_accounts (
  user_id uuid primary key references profiles (id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  trial_prompts int not null default 0 check (trial_prompts >= 0),
  updated_at timestamptz not null default now()
);

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  delta int not null,
  kind text not null check (kind in (
    'trial_grant', 'subscription_grant', 'topup', 'hold', 'release', 'spend', 'refund', 'expiry', 'admin_adjust'
  )),
  ref_type text,
  ref_id text,
  idempotency_key text not null unique,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on credit_ledger (user_id, created_at desc);

create function remaxx_ledger_append_only() returns trigger language plpgsql as $$
begin
  -- Deleting a whole account (profiles cascade) is the one allowed exception.
  if tg_op = 'DELETE' and not exists (select 1 from profiles where id = old.user_id) then
    return old;
  end if;
  raise exception 'credit_ledger is append-only';
end;
$$;

create trigger credit_ledger_no_update before update on credit_ledger
  for each row execute function remaxx_ledger_append_only();
create trigger credit_ledger_no_delete before delete on credit_ledger
  for each row execute function remaxx_ledger_append_only();

create table subscriptions (
  user_id uuid primary key references profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  plan_id text,
  status text not null default 'none',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- The plan whose credits were granted for the current period (used to top up on upgrades).
  credited_plan_id text,
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function remaxx_set_updated_at();

create table stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table ai_messages
  add column credits_charged int not null default 0 check (credits_charged >= 0),
  add column used_trial boolean not null default false;

-- Every new profile starts with its free prompts. Existing profiles get them now.
create function remaxx_create_credit_account() returns trigger language plpgsql as $$
begin
  insert into credit_accounts (user_id, trial_prompts) values (new.id, 2) on conflict do nothing;
  return null;
end;
$$;

create trigger profiles_credit_account after insert on profiles
  for each row execute function remaxx_create_credit_account();

insert into credit_accounts (user_id, trial_prompts)
select id, 2 from profiles on conflict do nothing;

alter table credit_accounts enable row level security;
alter table credit_ledger enable row level security;
alter table subscriptions enable row level security;
alter table stripe_events enable row level security;
revoke all on table credit_accounts, credit_ledger, subscriptions, stripe_events from anon, authenticated;
