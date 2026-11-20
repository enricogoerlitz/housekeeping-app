-- Security check of spec 0004: the settings of the photo bucket household-media are enforced.
-- 20261120192524_storage_household_media inserted the bucket with `on conflict do nothing`, so a
-- bucket of that id that existed before (made by hand in the dashboard, public or without limits)
-- kept its settings. This sets them whatever was there; running it again changes nothing.
--
-- * public = false: objects only through the authenticated API and the storage.objects policies.
-- * file_size_limit 2 MiB and image/jpeg only, enforced by the Storage API on upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('household-media', 'household-media', false, 2097152, '{image/jpeg}')
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
