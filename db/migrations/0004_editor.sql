-- Phase 4: remix editor.
-- ai_sessions: one conversation per person per project (the editor's chat history).
-- ai_messages: every prompt and AI reply, with tokens and estimated cost. Phase 5 turns the cost
--   into credits through the credit ledger; for now it powers daily caps and usage tracking.
-- explanations: cached "Break it down" write-ups, one per version and model, so repeat views are free.

create table ai_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references ai_sessions (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  kind text not null check (kind in ('edit', 'explain')),
  role text not null check (role in ('user', 'assistant')),
  -- What the person asked, or the AI's summary of what it changed. Never full file contents.
  content text not null default '' check (char_length(content) <= 4000),
  model_id text,
  -- ok: delivered; error: provider failed or timed out; blocked: moderation or limits stopped it;
  -- pending: the call is in flight (counts toward concurrency limits).
  status text not null default 'ok' check (status in ('ok', 'error', 'blocked', 'pending')),
  error text check (error is null or char_length(error) <= 500),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  image_count int not null default 0 check (image_count between 0 and 10),
  -- The version an accepted AI edit produced, if any.
  result_version_id uuid references project_versions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_messages_session_idx on ai_messages (session_id, created_at);
create index ai_messages_user_day_idx on ai_messages (user_id, created_at desc);
create index ai_messages_created_idx on ai_messages (created_at desc);

create table explanations (
  version_id uuid not null references project_versions (id) on delete cascade,
  model_id text not null,
  content text not null check (char_length(content) <= 20000),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (version_id, model_id)
);

-- Remix counts show published remixes only, so private drafts don't inflate them.
-- Recounted when lineage rows change and when a remix's status changes (e.g. it's published).
create or replace function remaxx_recount_remixes(target uuid) returns void language sql as $$
  update projects set remix_count = (
    select count(*) from remix_lineage l
    join projects d on d.id = l.descendant_id
    where l.ancestor_id = target and l.depth = 1 and d.status = 'published'
  ) where id = target;
$$;

create or replace function remaxx_bump_remix_counter() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.depth = 1 then
    perform remaxx_recount_remixes(new.ancestor_id);
  elsif tg_op = 'DELETE' and old.depth = 1 then
    perform remaxx_recount_remixes(old.ancestor_id);
  end if;
  return null;
end;
$$;

create function remaxx_remix_status_changed() returns trigger language plpgsql as $$
begin
  if new.parent_project_id is not null and new.status is distinct from old.status then
    perform remaxx_recount_remixes(new.parent_project_id);
  end if;
  return null;
end;
$$;

create trigger projects_remix_status after update of status on projects
  for each row execute function remaxx_remix_status_changed();

select remaxx_recount_remixes(id) from projects where id in (select ancestor_id from remix_lineage);

alter table ai_sessions enable row level security;
alter table ai_messages enable row level security;
alter table explanations enable row level security;
revoke all on table ai_sessions, ai_messages, explanations from anon, authenticated;
