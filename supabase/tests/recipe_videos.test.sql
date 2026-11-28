-- Spec 0046 "Rezept-Mediengalerie mit mehreren Videos": recipes.videos is the ordered list of a
-- recipe's videos ({path, url?, poster?}), checked by recipes_videos_valid (AC-004) and written
-- only through add_recipe_video, set_recipe_video_poster and remove_recipe_video as the caller
-- (AC-003); the video of spec 0043 (video_path) is gone (spec 0053); restore_recipe brings
-- the videos back; the nightly sweep keeps what a video names and takes the rest (AC-019).
begin;
\ir _helpers.psql
select plan(44);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- <household>/recipes/<recipe>/<uuid>.<ext> as the app and fetch-video build them.
create function tests.file(p_household text, p_recipe text, p_file text, p_ext text default 'mp4')
returns text language sql stable
as $$ select tests.fx(p_household) || '/recipes/' || tests.fx(p_recipe) || '/' || md5(p_file)::uuid || '.' || p_ext $$;
grant execute on function tests.file(text, text, text, text) to anon, authenticated;

create function tests.add_sql(p_household text, p_recipe text, p_video jsonb) returns text language sql stable
as $$ select format('select public.add_recipe_video(%L, %L, %L)', tests.fx(p_household), tests.fx(p_recipe), p_video) $$;
grant execute on function tests.add_sql(text, text, jsonb) to anon, authenticated;

create function tests.videos(p_recipe text) returns jsonb language sql stable
as $$ select videos from public.recipes where id = tests.fx(p_recipe) $$;
grant execute on function tests.videos(text) to anon, authenticated;

create function tests.store(p_name text, p_created_at timestamptz, p_bucket text default 'household-videos')
returns void language sql
as $$ insert into storage.objects (bucket_id, name, created_at, metadata)
      values (p_bucket, p_name, p_created_at, '{"mimetype": "video/mp4", "size": 1000}') $$;

create function tests.now() returns timestamptz language sql immutable
as $$ select '2026-11-26 02:30:00+00'::timestamptz $$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('wg', tests.create_household('WG', array[tests.fx('ben')]));
insert into fx (key) values ('pasta'), ('sammlung'), ('curry_b'), ('gone'), ('orphan_row');

insert into public.recipes (id, household_id, title, links)
values (tests.fx('pasta'), tests.fx('home'), 'Pasta Sorrentina',
        '[{"url": "https://www.chefkoch.de/rezepte/1"}, {"url": "https://vm.tiktok.com/ZGdXoJ8Ay/"},
          {"url": "https://www.tiktok.com/@koch/video/1"}]');
insert into public.recipes (id, household_id, kind, title, course)
values (tests.fx('sammlung'), tests.fx('home'), 'collection', 'Pasta-Abende', null);
insert into public.recipes (id, household_id, title)
values (tests.fx('curry_b'), tests.fx('wg'), 'Curry');

-- ===================== The column =====================
select is(tests.videos('pasta'), '[]'::jsonb, 'REQ-001: a recipe starts without videos');
select tests.authenticate_as(tests.fx('enrico'));
select is((select videos from public.recipes where id = tests.fx('pasta')), '[]'::jsonb,
  'REQ-001: a member reads the videos (they sync with the recipe)');
select throws_ok(format('select public.apply_changes(%L, %L)', tests.fx('home'), jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('pasta'),
    'changes', jsonb_build_object('videos', jsonb_build_array(jsonb_build_object('path', tests.file('home', 'pasta', 'v0'))))))),
  '22023', 'invalid_change', 'Entscheidung 2: apply_changes does not write videos');
select throws_ok(format('select public.apply_changes(%L, %L)', tests.fx('home'), jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('pasta'), 'changes', '{"video_path": null}'::jsonb))),
  '22023', 'invalid_change', 'Spec 0053, AC-002: apply_changes patches no video_path any more');
select throws_ok(format('select public.apply_changes(%L, %L)', tests.fx('home'), jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('id', gen_random_uuid(), 'title', 'Neu', 'video_path', null)))),
  '22023', 'invalid_change', 'Spec 0053, AC-002: … and inserts none');
select tests.clear_authentication();

-- ===================== add_recipe_video =====================
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.add_recipe_video(tests.fx('home'), tests.fx('pasta'),
             jsonb_build_object('path', tests.file('home', 'pasta', 'v1'), 'url', 'https://vm.tiktok.com/ZGdXoJ8Ay/'))),
  true, 'AC-006 add_recipe_video: a member adds the video of a link');
select is((select public.add_recipe_video(tests.fx('home'), tests.fx('pasta'),
             jsonb_build_object('path', tests.file('home', 'pasta', 'v2'), 'url', 'https://www.tiktok.com/@koch/video/1'))),
  true, 'AC-002 add_recipe_video: … and the video of a second link');
select is(tests.videos('pasta'), jsonb_build_array(
    jsonb_build_object('path', tests.file('home', 'pasta', 'v1'), 'url', 'https://vm.tiktok.com/ZGdXoJ8Ay/'),
    jsonb_build_object('path', tests.file('home', 'pasta', 'v2'), 'url', 'https://www.tiktok.com/@koch/video/1')),
  'AC-002: the videos stand in the order they were saved');
select is((select public.add_recipe_video(tests.fx('home'), tests.fx('pasta'),
             jsonb_build_object('path', tests.file('home', 'pasta', 'v3'), 'url', 'https://vm.tiktok.com/ZGdXoJ8Ay/'))),
  false, 'AC-004 add_recipe_video: a link has at most one video (the second save adds nothing)');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('wg', 'pasta', 'v4'))),
  '23514', null, 'AC-004 recipes_videos_valid: a path in another household''s folder is refused');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'curry_b', 'v4'))),
  '23514', null, 'AC-004 recipes_videos_valid: a path in another recipe''s folder is refused');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'v4', 'jpg'))),
  '23514', null, 'AC-004 recipes_videos_valid: a video is an .mp4');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'v4'), 'url', 'javascript:alert(1)')),
  '23514', null, 'AC-004 recipes_videos_valid: the source is a web address');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'v4'), 'poster', tests.file('home', 'pasta', 'p4', 'jpg'))),
  '22023', 'invalid_change', 'add_recipe_video: a new video has no poster yet');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'v4'), 'extra', 1)),
  '22023', 'invalid_change', 'add_recipe_video: only path and url');
select throws_ok(tests.add_sql('home', 'sammlung', jsonb_build_object('path', tests.file('home', 'sammlung', 'v4'))),
  '23514', null, 'AC-004 recipes_videos_valid: a collection has no videos');
-- Eight more fill the list to ten; the eleventh is refused.
do $$ begin
  perform public.add_recipe_video(tests.fx('home'), tests.fx('pasta'), jsonb_build_object('path', tests.file('home', 'pasta', 'fill' || n)))
  from generate_series(1, 8) n;
end $$;
select is(jsonb_array_length(tests.videos('pasta')), 10, 'AC-004: ten videos fit');
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'eleven'))),
  '23514', null, 'AC-004 recipes_videos_valid: an eleventh video is refused');
select tests.clear_authentication();
update public.recipes set videos = jsonb_path_query_array(videos, '$[0 to 1]') where id = tests.fx('pasta');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'v5'))),
  '42501', 'not_member', 'AC-003 add_recipe_video: a member of another household is refused');
select tests.authenticate_as_anon();
select throws_ok(tests.add_sql('home', 'pasta', jsonb_build_object('path', tests.file('home', 'pasta', 'v5'))),
  '42501', null, 'AC-003 add_recipe_video: a signed-out caller is refused');
select tests.clear_authentication();
select is(jsonb_array_length(tests.videos('pasta')), 2, 'AC-003: … and nothing changed');

-- ===================== set_recipe_video_poster =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(format('select public.set_recipe_video_poster(%L, %L, %L, %L)', tests.fx('home'), tests.fx('pasta'),
                        tests.file('home', 'pasta', 'v1'), tests.file('home', 'pasta', 'p1', 'jpg')),
  '42501', 'not_member', 'AC-003 set_recipe_video_poster: a member of another household is refused');
select tests.authenticate_as_anon();
select throws_ok(format('select public.set_recipe_video_poster(%L, %L, %L, %L)', tests.fx('home'), tests.fx('pasta'),
                        tests.file('home', 'pasta', 'v1'), tests.file('home', 'pasta', 'p1', 'jpg')),
  '42501', null, 'AC-003 set_recipe_video_poster: a signed-out caller is refused');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.set_recipe_video_poster(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'v1'),
                                                 tests.file('home', 'pasta', 'p1', 'jpg'))),
  true, 'AC-012 set_recipe_video_poster: the cover becomes the video''s poster');
select is(tests.videos('pasta') -> 0 ->> 'poster', tests.file('home', 'pasta', 'p1', 'jpg'),
  'AC-012: … on that video');
select is(tests.videos('pasta') -> 1 ? 'poster', false, 'AC-012: … and not on the other');
select is((select public.set_recipe_video_poster(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'v1'),
                                                 tests.file('home', 'pasta', 'p9', 'jpg'))),
  false, 'set_recipe_video_poster: a poster is never replaced (no file left behind)');
select throws_ok(format('select public.set_recipe_video_poster(%L, %L, %L, %L)', tests.fx('home'), tests.fx('pasta'),
                        tests.file('home', 'pasta', 'v2'), tests.file('wg', 'pasta', 'p2', 'jpg')),
  '23514', null, 'AC-004 recipes_videos_valid: a poster in another household''s folder is refused');
select is((select public.set_recipe_video_poster(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'v2'),
                                                 tests.file('home', 'pasta', 'p1', 'jpg'))),
  false, 'Risiken set_recipe_video_poster: a poster another video names is refused (removing one never takes the other''s)');
update public.recipes set photo_path = tests.file('home', 'pasta', 'foto', 'jpg') where id = tests.fx('pasta');
select is((select public.set_recipe_video_poster(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'v2'),
                                                 tests.file('home', 'pasta', 'foto', 'jpg'))),
  false, 'Risiken set_recipe_video_poster: the recipe''s photo is no poster');
select is((select public.set_recipe_video_poster(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'gone'),
                                                 tests.file('home', 'pasta', 'p2', 'jpg'))),
  false, 'set_recipe_video_poster: no poster for a video the recipe does not have');
select tests.clear_authentication();

-- ===================== remove_recipe_video =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(format('select public.remove_recipe_video(%L, %L, %L)', tests.fx('home'), tests.fx('pasta'),
                        tests.file('home', 'pasta', 'v1')),
  '42501', 'not_member', 'AC-003 remove_recipe_video: a member of another household is refused');
select tests.authenticate_as_anon();
select throws_ok(format('select public.remove_recipe_video(%L, %L, %L)', tests.fx('home'), tests.fx('pasta'),
                        tests.file('home', 'pasta', 'v1')),
  '42501', null, 'AC-003 remove_recipe_video: a signed-out caller is refused');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.remove_recipe_video(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'v1'))),
  jsonb_build_object('path', tests.file('home', 'pasta', 'v1'), 'url', 'https://vm.tiktok.com/ZGdXoJ8Ay/',
                     'poster', tests.file('home', 'pasta', 'p1', 'jpg')),
  'AC-017 remove_recipe_video: the removed video comes back, so the app deletes its files');
select is(tests.videos('pasta'), jsonb_build_array(
    jsonb_build_object('path', tests.file('home', 'pasta', 'v2'), 'url', 'https://www.tiktok.com/@koch/video/1')),
  'AC-017: the other video stays');
select is((select public.remove_recipe_video(tests.fx('home'), tests.fx('pasta'), tests.file('home', 'pasta', 'v1'))),
  null::jsonb, 'remove_recipe_video: removing it again changes nothing');
select tests.clear_authentication();

-- ===================== The video of spec 0043 is gone (spec 0053, AC-001) =====================
select hasnt_column('public', 'recipes', 'video_path', 'Spec 0053, AC-001: recipes has no video_path');
select is((select count(*)::int from pg_catalog.pg_constraint
           where conrelid = 'public.recipes'::regclass and conname like 'recipes_video_path%'), 0,
  'Spec 0053, AC-001: … nor its checks');
select hasnt_function('private', 'videos_from_video_path', 'Spec 0053, AC-001: the carry-over of spec 0046 is gone');

-- ===================== restore_recipe keeps the videos =====================
update public.recipes set videos = jsonb_build_array(
  jsonb_build_object('path', tests.file('home', 'pasta', 'v7'), 'poster', tests.file('home', 'pasta', 'p7', 'jpg')))
where id = tests.fx('pasta');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format($$ select public.delete_recipe(%L, current_date) $$, tests.fx('pasta')),
  'REQ-005: the recipe with its videos is deleted');
select is((select public.restore_recipe(tests.fx('pasta'))), true, 'REQ-005: "Rückgängig" restores it');
select is(tests.videos('pasta'), jsonb_build_array(
    jsonb_build_object('path', tests.file('home', 'pasta', 'v7'), 'poster', tests.file('home', 'pasta', 'p7', 'jpg'))),
  'REQ-005 restore_recipe: … with its videos');
select tests.clear_authentication();

-- ===================== The nightly sweep (AC-019) =====================
insert into private.deletions (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
values (tests.fx('home'), 'recipe', tests.fx('gone'), tests.fx('enrico'), tests.now() - interval '1 minute',
        jsonb_build_object('recipe', jsonb_build_object('id', tests.fx('gone'), 'videos', jsonb_build_array(
          jsonb_build_object('path', tests.file('home', 'gone', 'torte'), 'poster', tests.file('home', 'gone', 'torte-bild', 'jpg'))))));
select tests.store(tests.file('home', 'pasta', 'v7'), tests.now() - interval '2 days');
select tests.store(tests.file('home', 'gone', 'torte'), tests.now() - interval '2 days');
select tests.store(tests.file('home', 'orphan_row', 'vorgestern'), tests.now() - interval '2 days');
select tests.store(tests.file('home', 'pasta', 'p7', 'jpg'), tests.now() - interval '2 days', 'household-media');
select tests.store(tests.file('home', 'gone', 'torte-bild', 'jpg'), tests.now() - interval '2 days', 'household-media');
select tests.store(tests.file('home', 'orphan_row', 'altes-bild', 'jpg'), tests.now() - interval '2 days', 'household-media');

select is(array(select private.video_orphans(tests.now())), array[tests.file('home', 'orphan_row', 'vorgestern')],
  'AC-019 video_orphans: a video in a recipe''s list or a restorable deletion''s stays, the orphan goes');
select is(array(select private.media_orphans(tests.now())), array[tests.file('home', 'orphan_row', 'altes-bild', 'jpg')],
  'AC-019 media_orphans: a poster a video names (also in a restorable deletion) stays, the orphan goes');

select * from finish();
rollback;
