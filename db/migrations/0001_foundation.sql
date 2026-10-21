-- Phase 1: profiles, legal acceptances, waitlist.
-- Users themselves live in Supabase's auth.users. Every app table has RLS enabled with no
-- policies and no grants to the browser-facing roles, so the publishable (anon) key can never
-- read or write app data directly. All access goes through server code and tested permission checks.

create type user_role as enum ('user', 'admin');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$' and handle not like '%\_\_%'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  website_url text check (website_url is null or website_url ~ '^https?://'),
  role user_role not null default 'user',
  age_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every acceptance of a legal document, per version. Append-only by convention.
create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  document text not null check (document in ('terms', 'acceptable_use', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

create function remaxx_set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function remaxx_set_updated_at();

alter table profiles enable row level security;
alter table legal_acceptances enable row level security;
alter table waitlist enable row level security;

revoke all on table profiles, legal_acceptances, waitlist from anon, authenticated;
