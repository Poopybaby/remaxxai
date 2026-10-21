-- One-time repair for projects that already had a starter-template `profiles` table
-- (e.g. columns id, display_name, created_at) and an `on_auth_user_created` sign-up trigger.
--
-- What it does, only if public.profiles exists AND has no `handle` column (i.e. it isn't ours):
--   1. Renames the old table to profiles_legacy (nothing is deleted) and renames its indexes,
--      so REMAXX can create its own `profiles` table.
--   2. Removes the old sign-up trigger, which would otherwise try to insert into the new
--      table and make every sign-up fail. Its function is kept (unused) in case you want it back.
-- Running it again, or on a project without the old table, does nothing.
do $repair$
declare
  idx record;
begin
  if to_regclass('public.profiles') is null then
    raise notice 'No existing profiles table: nothing to repair.';
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'handle'
  ) then
    raise notice 'profiles already belongs to REMAXX: nothing to repair.';
    return;
  end if;
  if to_regclass('public.profiles_legacy') is not null then
    raise exception 'Both profiles and profiles_legacy exist. Stopping so nothing is overwritten.';
  end if;

  alter table public.profiles rename to profiles_legacy;

  -- Index names are schema-wide; free up names like profiles_pkey for the new table.
  for idx in
    select c.relname as name
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.profiles_legacy'::regclass and c.relname like 'profiles%'
  loop
    execute format('alter index public.%I rename to %I', idx.name, 'profiles_legacy' || substr(idx.name, 9));
  end loop;

  drop trigger if exists on_auth_user_created on auth.users;

  raise notice 'Old profiles table renamed to profiles_legacy and the old sign-up trigger removed.';
end
$repair$;
