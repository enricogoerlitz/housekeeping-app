-- Security check of spec 0004: the file of a photo is named exactly <uuid>.jpg — a new lower-case
-- uuid per upload, as the client builds it (packages/api/src/photos-remote.ts). Before, any name
-- without '/' was allowed in photo_path and in the bucket (e.g. 'x.html'); now nothing else can be
-- named or stored.
--
-- * activities_photo_path_valid, recipes_photo_path_valid: replaced by the full shape
--   <household_id>/<activities|recipes>/<row id>/<uuid>.jpg (same names, so the client's error
--   mapping stays). The shape fixes the length, so the separate length check is gone.
-- * private.media_household_id, which the storage.objects policies use: the same file name; any
--   other name has no household and is refused like a foreign one.
-- Existing rows and objects keep working: the client has only ever written <uuid>.jpg.

alter table public.activities
  drop constraint activities_photo_path_valid,
  add constraint activities_photo_path_valid check (
    photo_path ~ ('^' || household_id::text || '/activities/' || id::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'));

alter table public.recipes
  drop constraint recipes_photo_path_valid,
  add constraint recipes_photo_path_valid check (
    photo_path ~ ('^' || household_id::text || '/recipes/' || id::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'));

-- The household of an object name in household-media, or null if the name is not
-- <household_id>/<activities|recipes>/<row id>/<uuid>.jpg. Parses by regex before casting, so no
-- name can make a policy raise. `create or replace` keeps the grant and the policies using it.
create or replace function private.media_household_id(p_name text)
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
