-- Phase 2: gallery. Projects, immutable versions, content-addressed files, remix lineage and
-- credits, licenses, tags, likes, collections, follows, reports and moderation records.
-- Same lockdown as 0001: RLS on, no policies, no grants to browser roles.

-- ── Licenses ────────────────────────────────────────────────────────────────
-- Catalog mirrors config/licenses.ts. Remix compatibility rules live in code (and tests);
-- this table exists so every project row points at a real license.
create table licenses (
  id text primary key,
  name text not null,
  spdx_id text,
  url text not null,
  commercial_use boolean not null,
  attribution_required boolean not null,
  share_alike boolean not null,
  sort_order int not null
);

insert into licenses (id, name, spdx_id, url, commercial_use, attribution_required, share_alike, sort_order) values
  ('mit', 'MIT License', 'MIT', 'https://opensource.org/license/mit', true, true, false, 1),
  ('apache-2.0', 'Apache License 2.0', 'Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0', true, true, false, 2),
  ('cc-by-4.0', 'Creative Commons Attribution 4.0', 'CC-BY-4.0', 'https://creativecommons.org/licenses/by/4.0/', true, true, false, 3),
  ('cc-by-sa-4.0', 'Creative Commons Attribution-ShareAlike 4.0', 'CC-BY-SA-4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', true, true, true, 4),
  ('cc0-1.0', 'CC0 1.0 (Public Domain Dedication)', 'CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/', true, false, false, 5),
  ('remaxx-personal', 'REMAXX Personal Use', null, '/legal/terms#personal-use-license', false, true, true, 6);

-- ── Files ───────────────────────────────────────────────────────────────────
-- Content-addressed: one row per distinct file body, shared by every version and remix that
-- contains it. MVP stores bytes in Postgres (projects are capped at 4 MB); storage_key is the
-- path for moving large files to object storage later.
create table blobs (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  size int not null check (size >= 0),
  content bytea,
  storage_key text,
  created_at timestamptz not null default now(),
  check (content is not null or storage_key is not null)
);

-- ── Projects ────────────────────────────────────────────────────────────────
create type project_status as enum (
  'draft',                 -- a remix being edited (Phase 4); owner only
  'pending_review',        -- held by the upload scanner or moderation; owner and admins
  'published',             -- public
  'unpublished',           -- hidden by its owner
  'removed',               -- taken down by an admin
  'hidden_pending_review'  -- an ancestor was removed for copyright; admin decides
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  project_type text not null default 'static' check (project_type in ('static', 'react')),
  category text not null,
  tool_used text not null,
  license_id text not null references licenses (id),
  status project_status not null default 'published',
  status_reason text,
  cover_url text check (cover_url is null or cover_url ~ '^(https://|/seed/covers/[a-z0-9-]+\.(jpg|png|webp)$|/media/[a-f0-9]{64}\.(png|jpg|webp|gif)$)'),
  entry_path text not null default 'index.html',
  current_version_id uuid,
  parent_project_id uuid references projects (id) on delete set null,
  parent_version_id uuid,
  root_project_id uuid references projects (id) on delete set null,
  like_count int not null default 0 check (like_count >= 0),
  save_count int not null default 0 check (save_count >= 0),
  remix_count int not null default 0 check (remix_count >= 0),
  is_staff_pick boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_feed_idx on projects (published_at desc) where status = 'published';
create index projects_owner_idx on projects (owner_id);
create index projects_category_idx on projects (category);
create index projects_tool_idx on projects (tool_used);
create index projects_license_idx on projects (license_id);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  number int not null check (number >= 1),
  message text not null default '' check (char_length(message) <= 200),
  created_by text not null default 'user' check (created_by in ('user', 'ai', 'system')),
  file_count int not null check (file_count >= 1),
  total_bytes int not null check (total_bytes >= 0),
  created_at timestamptz not null default now(),
  unique (project_id, number)
);

alter table projects
  add constraint projects_current_version_fk
    foreign key (current_version_id) references project_versions (id) on delete set null,
  -- Deferred: deleting a parent project cascades through two paths (parent_project_id and its
  -- versions); checking at commit lets both "set null" actions land first.
  add constraint projects_parent_version_fk
    foreign key (parent_version_id) references project_versions (id) on delete set null
    deferrable initially deferred;

create table project_files (
  version_id uuid not null references project_versions (id) on delete cascade,
  path text not null
    check (char_length(path) between 1 and 200 and path !~ '(^/|\\|(^|/)\.\.(/|$)|//)'),
  blob_sha256 text not null references blobs (sha256),
  size int not null check (size >= 0),
  mime text not null,
  primary key (version_id, path)
);

-- ── Remix lineage ───────────────────────────────────────────────────────────
-- Closure table: one row per (ancestor, descendant) pair at any depth, so "credit chain" and
-- "everything remixed from this" are single indexed queries.
create table remix_lineage (
  ancestor_id uuid not null references projects (id) on delete cascade,
  descendant_id uuid not null references projects (id) on delete cascade,
  depth int not null check (depth >= 1),
  primary key (ancestor_id, descendant_id),
  check (ancestor_id <> descendant_id)
);
create index remix_lineage_descendant_idx on remix_lineage (descendant_id);

-- Credits snapshotted when the remix is made, so they survive renames, deletions and takedowns.
-- position 1 is the direct parent, 2 its parent, and so on.
create table lineage_credits (
  project_id uuid not null references projects (id) on delete cascade,
  position int not null check (position >= 1),
  ancestor_project_id uuid references projects (id) on delete set null,
  ancestor_title text not null,
  ancestor_slug text not null,
  ancestor_owner_handle text not null,
  ancestor_license_id text not null references licenses (id),
  primary key (project_id, position)
);

create table rights_attestations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  license_id text not null references licenses (id),
  statement_version text not null,
  created_at timestamptz not null default now()
);

-- ── Tags ────────────────────────────────────────────────────────────────────
create table tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 24),
  kind text not null default 'topic' check (kind in ('style', 'topic')),
  created_at timestamptz not null default now()
);

create table project_tags (
  project_id uuid not null references projects (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (project_id, tag_id)
);
create index project_tags_tag_idx on project_tags (tag_id);

-- ── Social ──────────────────────────────────────────────────────────────────
create table likes (
  user_id uuid not null references profiles (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index likes_project_idx on likes (project_id);

create table collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  is_default boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now()
);
create unique index collections_one_default_idx on collections (owner_id) where is_default;

create table collection_items (
  collection_id uuid not null references collections (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, project_id)
);
create index collection_items_project_idx on collection_items (project_id);

create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  followee_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows (followee_id);

-- Counters kept by triggers so they can't drift from the rows they count.
create function bump_project_counter() returns trigger language plpgsql as $$
declare
  delta int := case when tg_op = 'INSERT' then 1 else -1 end;
  pid uuid := case when tg_op = 'INSERT' then new.project_id else old.project_id end;
begin
  if tg_table_name = 'likes' then
    update projects set like_count = greatest(like_count + delta, 0) where id = pid;
  elsif tg_table_name = 'collection_items' then
    update projects set save_count = greatest(save_count + delta, 0) where id = pid;
  end if;
  return null;
end;
$$;

create trigger likes_count after insert or delete on likes
  for each row execute function bump_project_counter();
create trigger collection_items_count after insert or delete on collection_items
  for each row execute function bump_project_counter();

create function bump_remix_counter() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.depth = 1 then
    update projects set remix_count = remix_count + 1 where id = new.ancestor_id;
  elsif tg_op = 'DELETE' and old.depth = 1 then
    update projects set remix_count = greatest(remix_count - 1, 0) where id = old.ancestor_id;
  end if;
  return null;
end;
$$;

create trigger remix_lineage_count after insert or delete on remix_lineage
  for each row execute function bump_remix_counter();

-- ── Trust and safety ────────────────────────────────────────────────────────
create type report_status as enum ('open', 'actioned', 'dismissed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles (id) on delete set null,
  target_project_id uuid references projects (id) on delete cascade,
  target_profile_id uuid references profiles (id) on delete cascade,
  reason text not null
    check (reason in ('copyright', 'leaked_code', 'malware', 'phishing', 'sexual', 'hate', 'harassment', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  is_dmca boolean not null default false,
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  status report_status not null default 'open',
  resolved_by uuid references profiles (id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (target_project_id is not null or target_profile_id is not null)
);
create index reports_open_idx on reports (created_at) where status = 'open';

create table moderation_events (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('project', 'profile', 'prompt')),
  subject_id uuid,
  source text not null check (source in ('scanner', 'openai', 'admin', 'skipped')),
  verdict text not null check (verdict in ('pass', 'flag', 'block')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index moderation_events_subject_idx on moderation_events (subject_type, subject_id);

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Lockdown ────────────────────────────────────────────────────────────────
alter table licenses enable row level security;
alter table blobs enable row level security;
alter table projects enable row level security;
alter table project_versions enable row level security;
alter table project_files enable row level security;
alter table remix_lineage enable row level security;
alter table lineage_credits enable row level security;
alter table rights_attestations enable row level security;
alter table tags enable row level security;
alter table project_tags enable row level security;
alter table likes enable row level security;
alter table collections enable row level security;
alter table collection_items enable row level security;
alter table follows enable row level security;
alter table reports enable row level security;
alter table moderation_events enable row level security;
alter table admin_audit_log enable row level security;
-- The migration-tracking table also lives in public; lock it down too.
alter table schema_migrations enable row level security;

revoke all on table
  licenses, blobs, projects, project_versions, project_files, remix_lineage, lineage_credits,
  rights_attestations, tags, project_tags, likes, collections, collection_items, follows,
  reports, moderation_events, admin_audit_log, schema_migrations
from anon, authenticated;
