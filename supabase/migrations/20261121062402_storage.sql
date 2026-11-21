-- Baseline (ADR-0012) — the photo storage: private bucket household-media.
--
-- * Object names: <household_id>/<activities|recipes>/<row id>/<uuid>.jpg, ids in lower case as
--   Postgres prints them (the same names the photo_path checks of activities and recipes allow;
--   the client builds a new uuid per upload, packages/api/src/photos-remote.ts).
-- * Bucket settings, enforced by the Storage API on upload: private, 2 MiB, image/jpeg only. They
--   are set whatever a bucket of that id had before (made by hand in the dashboard); running it
--   again changes nothing. The client re-encodes every photo to a JPEG of at most 1600 px.
-- * Policies on storage.objects for authenticated only: a member reads, uploads, replaces and
--   deletes objects of her own households; nothing for anon (no policy = no access). A name
--   that does not have the shape above is rejected like a foreign one (policy violation), never
--   with a cast error.
-- * Objects are not deleted by the database (the Storage API refuses direct deletes and the
--   file would stay in the storage backend): the client deletes the old object after switching or
--   removing photo_path, and before deleting an activity with a photo. The photo of a deleted
--   recipe stays until its "Rückgängig" has expired, then the app deletes it (spec 0008, E5);
--   if the app stops before that, the object stays in the household's folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('household-media', 'household-media', false, 2097152, '{image/jpeg}')
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The household of an object name in household-media, or null if the name is not
-- <household_id>/<activities|recipes>/<row id>/<uuid>.jpg. Parses by regex before casting, so no
-- name can make a policy raise. Called by the
-- storage.objects policies as the caller.
create function private.media_household_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(activities|recipes)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
      then split_part(p_name, '/', 1)::uuid
  end
$$;

grant execute on function private.media_household_id(text) to authenticated;

create policy household_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'household-media'
    and private.media_household_id(name) in (select private.my_household_ids())
  );

create policy household_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'household-media'
    and private.media_household_id(name) in (select private.my_household_ids())
  );

create policy household_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'household-media'
    and private.media_household_id(name) in (select private.my_household_ids())
  )
  with check (
    bucket_id = 'household-media'
    and private.media_household_id(name) in (select private.my_household_ids())
  );

create policy household_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'household-media'
    and private.media_household_id(name) in (select private.my_household_ids())
  );
