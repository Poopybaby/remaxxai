-- Default avatars ("the REMAXX crew") and uploaded profile pictures.
-- Profile pictures may now be one of the built-in avatars (/avatars/<name>.webp) or an uploaded
-- image served by content hash (/media/<sha256>.<ext>), as well as an https:// URL as before.

do $$
declare c record;
begin
  -- Replace the old "https:// only" check, whatever it was named.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%avatar_url%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table profiles add constraint profiles_avatar_url_check check (
  avatar_url is null
  or avatar_url ~ '^https://'
  or avatar_url ~ '^/avatars/[a-z]+\.webp$'
  or avatar_url ~ '^/media/[a-f0-9]{64}\.(png|jpg|webp|gif)$'
);

-- Anyone created without a picture gets one of the crew at random (the app picks one too; this
-- covers every other way a profile can be created).
alter table profiles alter column avatar_url set default (
  (array['/avatars/sprinkles.webp', '/avatars/patch.webp', '/avatars/plume.webp', '/avatars/snooze.webp'])
  [1 + floor(random() * 4)::int]
);

-- Existing accounts without a picture get one now, each chosen at random.
update profiles
set avatar_url = (array['/avatars/sprinkles.webp', '/avatars/patch.webp', '/avatars/plume.webp', '/avatars/snooze.webp'])
  [1 + floor(random() * 4)::int]
where avatar_url is null;
