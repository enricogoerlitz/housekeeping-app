-- Spec 0043 "Rezeptvideo aus TikTok": recipes.video_path names the recipe's video in the private
-- bucket household-videos (<household>/recipes/<recipe>/<uuid>.mp4, only for a recipe, not a
-- collection). Members set and clear it through apply_changes; the storage policies let only the
-- household's members read, upload and delete its videos (AC-005); deleting the household lists
-- and waits for its videos (AC-010); the nightly sweep hands over videos without a reference
-- (AC-011); restore_recipe brings the video back with the recipe.
begin;
\ir _helpers.psql
select plan(33);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- <household>/recipes/<recipe>/<uuid>.mp4 as fetch-video builds it; p_file is a readable stand-in.
create function tests.video(p_household text, p_recipe text, p_file text) returns text language sql stable
as $$ select tests.fx(p_household) || '/recipes/' || tests.fx(p_recipe) || '/' || md5(p_file)::uuid || '.mp4' $$;
grant execute on function tests.video(text, text, text) to anon, authenticated;

create function tests.patch_sql(p_household text, p_recipe text, p_changes jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'recipes', 'id', tests.fx(p_recipe), 'changes', p_changes))) $$;
grant execute on function tests.patch_sql(text, text, jsonb) to anon, authenticated;

create function tests.upload_sql(p_name text) returns text language sql stable
as $$ select format('insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L)',
                    'household-videos', p_name, '{"mimetype": "video/mp4", "size": 21558855}') $$;
grant execute on function tests.upload_sql(text) to anon, authenticated;

-- An object as the Storage API writes it, created at p_created_at.
create function tests.store(p_name text, p_created_at timestamptz, p_bucket text default 'household-videos')
returns void language sql
as $$ insert into storage.objects (bucket_id, name, created_at, metadata)
      values (p_bucket, p_name, p_created_at, '{"mimetype": "video/mp4", "size": 1000}') $$;

create function tests.now() returns timestamptz language sql immutable
as $$ select '2026-11-26 02:30:00+00'::timestamptz $$;

select set_config('storage.allow_delete_query', 'true', true);

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('wg', tests.create_household('WG', array[tests.fx('ben')]));
insert into fx (key) values ('pasta'), ('sammlung'), ('curry_b'), ('gone'), ('orphan_row');

insert into public.recipes (id, household_id, title, links)
values (tests.fx('pasta'), tests.fx('home'), 'Pasta Sorrentina',
        '[{"url": "https://vm.tiktok.com/ZGdXoJ8Ay/"}]');
insert into public.recipes (id, household_id, kind, title, course)
values (tests.fx('sammlung'), tests.fx('home'), 'collection', 'Pasta-Abende', null);
insert into public.recipes (id, household_id, title)
values (tests.fx('curry_b'), tests.fx('wg'), 'Curry');

-- ===================== The bucket =====================
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'household-videos' $$,
  $$ values (false, 52428800::bigint, array['video/mp4']) $$,
  'Entscheidung 2: household-videos is a private bucket for MP4 files up to 50 MiB');

-- ===================== recipes.video_path =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('home', 'pasta', jsonb_build_object('video_path', tests.video('home', 'pasta', 'v1'))),
  'AC-001 apply_changes: a member sets the video of her recipe');
select is((select video_path from public.recipes where id = tests.fx('pasta')), tests.video('home', 'pasta', 'v1'),
  'AC-001: the recipe names its video');
select throws_ok(tests.patch_sql('home', 'pasta', jsonb_build_object('video_path', tests.video('wg', 'pasta', 'v1'))),
  '23514', null, 'AC-005 recipes_video_path_valid: a path in another household''s folder is refused');
select throws_ok(tests.patch_sql('home', 'pasta',
                   jsonb_build_object('video_path', tests.fx('home') || '/recipes/' || tests.fx('pasta') || '/x.jpg')),
  '23514', null, 'recipes_video_path_valid: only <uuid>.mp4 names');
select throws_ok(tests.patch_sql('home', 'sammlung',
                   jsonb_build_object('video_path', tests.video('home', 'sammlung', 'v1'))),
  '23514', null, 'recipes_video_path_valid: a collection has no video');
select lives_ok(tests.patch_sql('home', 'pasta', '{"video_path": null}'),
  'AC-009 apply_changes: "Video entfernen" clears the video');
select is((select video_path from public.recipes where id = tests.fx('pasta')), null::text,
  'AC-009: the recipe has no video any more, the link stays');
select is((select links -> 0 ->> 'url' from public.recipes where id = tests.fx('pasta')), 'https://vm.tiktok.com/ZGdXoJ8Ay/',
  'AC-009: … and the link is still there');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.patch_sql('home', 'pasta', jsonb_build_object('video_path', tests.video('home', 'pasta', 'v2'))),
  '42501', 'not_member', 'AC-005 apply_changes: a member of another household cannot set the video');
select tests.authenticate_as_anon();
select throws_ok(tests.patch_sql('home', 'pasta', jsonb_build_object('video_path', tests.video('home', 'pasta', 'v2'))),
  '42501', null, 'AC-005 apply_changes: a signed-out caller cannot set the video');
select tests.clear_authentication();

-- ===================== Storage policies (AC-005) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.upload_sql(tests.video('home', 'pasta', 'v3')),
  'AC-001 household-videos: a member uploads into her household''s folder');
select is((select count(*)::int from storage.objects where bucket_id = 'household-videos'
           and name = tests.video('home', 'pasta', 'v3')), 1,
  'AC-007 household-videos: … and reads it');
select throws_ok(tests.upload_sql(tests.video('wg', 'curry_b', 'v3')), '42501', null,
  'AC-005 household-videos: no upload into another household''s folder');
select throws_ok(tests.upload_sql(tests.fx('home') || '/recipes/' || tests.fx('pasta') || '/film.mp4'), '42501', null,
  'household-videos: a name the app never builds is refused like a foreign one');
select throws_ok(tests.upload_sql('../' || tests.video('home', 'pasta', 'v4')), '42501', null,
  'household-videos: no path tricks');
select is(tests.affected(format($$ update storage.objects set name = %L where bucket_id = 'household-videos' and name = %L $$,
                                tests.video('home', 'pasta', 'v5'), tests.video('home', 'pasta', 'v3'))), 0,
  'household-videos: a video is never overwritten or moved (no update policy)');

select tests.authenticate_as(tests.fx('ben'));
select is((select count(*)::int from storage.objects where bucket_id = 'household-videos'), 0,
  'AC-005 household-videos: a member of another household sees no video');
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'household-videos' and name = %L $$,
                                tests.video('home', 'pasta', 'v3'))), 0,
  'AC-005 household-videos: … and deletes none');
select tests.authenticate_as_anon();
select throws_ok(tests.upload_sql(tests.video('home', 'pasta', 'v6')), '42501', null,
  'AC-005 household-videos: a signed-out caller uploads nothing');
select is((select count(*)::int from storage.objects where bucket_id = 'household-videos'), 0,
  'AC-005 household-videos: a signed-out caller sees nothing');

select tests.authenticate_as(tests.fx('enrico'));
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'household-videos' and name = %L $$,
                                tests.video('home', 'pasta', 'v3'))), 1,
  'AC-009 household-videos: a member deletes her household''s video');
select tests.clear_authentication();

-- ===================== restore_recipe keeps the video =====================
update public.recipes set video_path = tests.video('home', 'pasta', 'v7') where id = tests.fx('pasta');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format($$ select public.delete_recipe(%L, '2026-11-26') $$, tests.fx('pasta')),
  'REQ-003: the recipe with its video is deleted');
select is((select public.restore_recipe(tests.fx('pasta'))), true, 'REQ-003: "Rückgängig" restores it');
select is((select video_path from public.recipes where id = tests.fx('pasta')), tests.video('home', 'pasta', 'v7'),
  'REQ-003 restore_recipe: … with its video');
select tests.clear_authentication();

-- ===================== The nightly sweep (AC-011) =====================
insert into private.deletions (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
values (tests.fx('home'), 'recipe', tests.fx('gone'), tests.fx('enrico'), tests.now() - interval '1 minute',
        jsonb_build_object('recipe', jsonb_build_object('id', tests.fx('gone'),
                                                        'video_path', tests.video('home', 'gone', 'torte'))));
select tests.store(tests.video('home', 'pasta', 'v7'), tests.now() - interval '2 days');
select tests.store(tests.video('home', 'gone', 'torte'), tests.now() - interval '2 days');
select tests.store(tests.video('home', 'orphan_row', 'vorgestern'), tests.now() - interval '2 days');
select tests.store(tests.video('home', 'orphan_row', 'upload'), tests.now() - interval '1 hour');
select tests.store(tests.fx('home') || '/recipes/' || tests.fx('orphan_row') || '/' || md5('foto')::uuid || '.jpg',
                   tests.now() - interval '2 days', 'household-media');

select is(array(select private.video_orphans(tests.now())), array[tests.video('home', 'orphan_row', 'vorgestern')],
  'AC-011 video_orphans: only the video without a reference from the day before yesterday goes '
  '(not the recipe''s, not a restorable deletion''s, not one uploading now, never a photo)');

delete from vault.secrets where name in ('media_sweep_secret', 'media_sweep_url');
select vault.create_secret('test-sweep-secret', 'media_sweep_secret');
select vault.create_secret('http://media-sweep.test/functions/v1/media-sweep', 'media_sweep_url');
create temp table queue_before on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
select is(private.run_media_orphan_sweep(tests.now()), 2,
  'AC-011 run_media_orphan_sweep: the orphan photo and the orphan video go');
select is(
  (select convert_from(q.body, 'utf8')::jsonb from net.http_request_queue q where q.id > (select id from queue_before)),
  jsonb_build_object(
    'names', jsonb_build_array(tests.fx('home') || '/recipes/' || tests.fx('orphan_row') || '/' || md5('foto')::uuid || '.jpg'),
    'videos', jsonb_build_array(tests.video('home', 'orphan_row', 'vorgestern'))),
  'AC-011 run_media_orphan_sweep: the videos go to media-sweep as "videos"');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok($$ select private.video_orphans(now()) $$, '42501', null,
  'Risiken: a member cannot list orphan videos');
select tests.clear_authentication();

-- ===================== Deleting the household (AC-010) =====================
delete from storage.objects where bucket_id = 'household-media';
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select array_agg(n order by n) from public.begin_household_deletion(tests.fx('home')) n),
  (select array_agg(n order by n) from unnest(array[tests.video('home', 'pasta', 'v7'), tests.video('home', 'gone', 'torte'),
                                                    tests.video('home', 'orphan_row', 'vorgestern'),
                                                    tests.video('home', 'orphan_row', 'upload')]) n),
  'AC-010 begin_household_deletion: the household''s videos are listed for the app to delete');
select throws_ok(format('select public.delete_household(%L)', tests.fx('home')),
  'P0001', 'media_remaining', 'AC-010 delete_household: refused while videos are stored');
select is(tests.affected($$ delete from storage.objects where bucket_id = 'household-videos' $$), 4,
  'AC-010: the app deletes the videos');
select lives_ok(format('select public.delete_household(%L)', tests.fx('home')),
  'AC-010 delete_household: without videos the household goes');
select tests.clear_authentication();

select * from finish();
rollback;
