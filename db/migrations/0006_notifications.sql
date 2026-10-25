-- Phase 6: notifications.
-- Likes, follows and published remixes notify by trigger, so every code path that creates them
-- notifies the same way. Review outcomes (approved, removed) are written by the moderation code.
-- A like or follow notifies once per person and project: unliking and liking again is not news.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('like', 'follow', 'remix', 'approved', 'removed')),
  actor_id uuid references profiles (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  meta jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on notifications (recipient_id, created_at desc);
create index notifications_unread_idx on notifications (recipient_id) where read_at is null;
create unique index notifications_once_idx on notifications (
  recipient_id, kind, actor_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where kind in ('like', 'follow');

create function remaxx_notify_like() returns trigger language plpgsql as $$
declare
  owner uuid;
begin
  select owner_id into owner from projects where id = new.project_id and status = 'published';
  if owner is not null and owner <> new.user_id then
    insert into notifications (recipient_id, kind, actor_id, project_id)
    values (owner, 'like', new.user_id, new.project_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger likes_notify after insert on likes
  for each row execute function remaxx_notify_like();

create function remaxx_notify_follow() returns trigger language plpgsql as $$
begin
  if new.followee_id <> new.follower_id then
    insert into notifications (recipient_id, kind, actor_id)
    values (new.followee_id, 'follow', new.follower_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger follows_notify after insert on follows
  for each row execute function remaxx_notify_follow();

-- A remix going public tells the maker of the project it was remixed from.
create function remaxx_notify_remix() returns trigger language plpgsql as $$
declare
  parent_owner uuid;
begin
  if new.status = 'published' and old.status is distinct from 'published'
     and new.parent_project_id is not null then
    select owner_id into parent_owner from projects where id = new.parent_project_id;
    if parent_owner is not null and parent_owner <> new.owner_id
       and not exists (select 1 from notifications where kind = 'remix' and project_id = new.id) then
      insert into notifications (recipient_id, kind, actor_id, project_id, meta)
      values (parent_owner, 'remix', new.owner_id, new.id,
              jsonb_build_object('parent_id', new.parent_project_id));
    end if;
  end if;
  return null;
end;
$$;

create trigger projects_notify_remix after update of status on projects
  for each row execute function remaxx_notify_remix();

alter table notifications enable row level security;
revoke all on table notifications from anon, authenticated;
