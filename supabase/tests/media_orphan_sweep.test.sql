-- The nightly sweep of photo files (spec 0039, REQ-005): private.media_orphans(p_now) lists the
-- files of the photo folders in household-media that no recipe, activity or restaurant refers
-- to (nor the snapshot of a deleted one that can still come back) and that are older than one
-- day; private.run_media_orphan_sweep(p_now) hands them, signed, to the edge function
-- media-sweep through pg_net, which deletes them with the Storage API. pg_net is not called for
-- real: the request stays in net.http_request_queue and is rolled back with the test. Members and
-- signed-out callers can run neither.
begin;
\ir _helpers.psql
select plan(19);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

-- <household>/<kind>/<row>/<uuid>.jpg as the app builds it; p_file is a readable stand-in.
create function tests.media(p_kind text, p_row text, p_file text) returns text language sql stable
as $$ select tests.fx('home') || '/' || p_kind || '/' || tests.fx(p_row) || '/' || md5(p_file)::uuid || '.jpg' $$;

-- An object as the Storage API writes it, created at p_created_at.
create function tests.store(p_name text, p_created_at timestamptz, p_bucket text default 'household-media')
returns void language sql
as $$ insert into storage.objects (bucket_id, name, created_at, metadata)
      values (p_bucket, p_name, p_created_at, '{"mimetype": "image/jpeg", "size": 1000}') $$;

create function tests.set_sweep_vault() returns void language plpgsql
as $$
begin
  delete from vault.secrets where name in ('media_sweep_secret', 'media_sweep_url');
  perform vault.create_secret('test-sweep-secret', 'media_sweep_secret');
  perform vault.create_secret('http://media-sweep.test/functions/v1/media-sweep', 'media_sweep_url');
end
$$;

-- The run's "now": 26.11.2026 03:30 in Berlin.
create function tests.now() returns timestamptz language sql immutable
as $$ select '2026-11-26 02:30:00+00'::timestamptz $$;

insert into fx (key, id) values ('enrico', tests.create_user('enrico@example.com', 'Enrico'));
insert into fx (key, id) values ('home', tests.create_household('Zuhause', array[tests.fx('enrico')]));
insert into fx (key) values ('apfelkuchen'), ('gone_recipe'), ('boulder'), ('amrit'), ('orphan_row');

insert into public.recipes (id, household_id, title, photo_path)
values (tests.fx('apfelkuchen'), tests.fx('home'), 'Apfelkuchen', tests.media('recipes', 'apfelkuchen', 'apfel'));
insert into public.activities (id, household_id, name, name_key, photo_path)
values (tests.fx('boulder'), tests.fx('home'), 'Bouldern', 'bouldern', tests.media('activities', 'boulder', 'wand'));
insert into public.restaurants (id, household_id, name, photo_path)
values (tests.fx('amrit'), tests.fx('home'), 'AMRIT', tests.media('restaurants', 'amrit', 'curry'));
-- A recipe deleted a minute ago: its "Rückgängig" can still bring the photo back.
insert into private.deletions (household_id, kind, target_id, deleted_by, deleted_at, snapshot)
values (tests.fx('home'), 'recipe', tests.fx('gone_recipe'), tests.fx('enrico'), tests.now() - interval '1 minute',
        jsonb_build_object('recipe', jsonb_build_object('id', tests.fx('gone_recipe'),
                                                        'photo_path', tests.media('recipes', 'gone_recipe', 'torte'))));

select tests.store(tests.media('recipes', 'apfelkuchen', 'apfel'), tests.now() - interval '2 days');
select tests.store(tests.media('activities', 'boulder', 'wand'), tests.now() - interval '2 days');
select tests.store(tests.media('restaurants', 'amrit', 'curry'), tests.now() - interval '2 days');
select tests.store(tests.media('recipes', 'gone_recipe', 'torte'), tests.now() - interval '2 days');
select tests.store(tests.media('recipes', 'orphan_row', 'vorgestern'), tests.now() - interval '2 days');
select tests.store(tests.media('activities', 'orphan_row', 'alt'), tests.now() - interval '25 hours');
select tests.store(tests.media('recipes', 'orphan_row', 'upload'), tests.now() - interval '1 hour');
select tests.store(tests.media('recipes', 'orphan_row', 'grenze'), tests.now() - interval '1 day');
-- Not the app's photos: another bucket, and names outside the photo folders.
insert into storage.buckets (id, name) values ('tests-other', 'tests-other');
select tests.store(tests.media('recipes', 'orphan_row', 'fremd'), tests.now() - interval '3 days', 'tests-other');
select tests.store('loose.jpg', tests.now() - interval '3 days');
select tests.store(tests.fx('home') || '/exports/list.jpg', tests.now() - interval '3 days');

create temp table queue_before on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
create temp view new_requests as
  select q.id, q.url, q.headers, convert_from(q.body, 'utf8') as body
  from net.http_request_queue q where q.id > (select id from queue_before);

-- ===================== Which files go (AC-010 – AC-012) =====================
select ok(tests.media('recipes', 'orphan_row', 'vorgestern') in (select private.media_orphans(tests.now())),
  'AC-010 media_orphans: a file without a reference from the day before yesterday goes');
select ok(tests.media('activities', 'orphan_row', 'alt') in (select private.media_orphans(tests.now())),
  'AC-010 media_orphans: … as does one just over a day old');
select ok(tests.media('recipes', 'orphan_row', 'upload') not in (select private.media_orphans(tests.now())),
  'AC-011 media_orphans: a file without a reference from an hour ago (upload running) stays');
select ok(tests.media('recipes', 'orphan_row', 'grenze') not in (select private.media_orphans(tests.now())),
  'AC-011 media_orphans: … and one exactly a day old stays too');
select ok(tests.media('recipes', 'apfelkuchen', 'apfel') not in (select private.media_orphans(tests.now())),
  'AC-012 media_orphans: the photo of "Apfelkuchen" stays');
select ok(tests.media('activities', 'boulder', 'wand') not in (select private.media_orphans(tests.now()))
      and tests.media('restaurants', 'amrit', 'curry') not in (select private.media_orphans(tests.now())),
  'AC-012 media_orphans: the photos of an activity and a restaurant stay');
select ok(tests.media('recipes', 'gone_recipe', 'torte') not in (select private.media_orphans(tests.now())),
  'AC-012 media_orphans: the photo of a deleted recipe that can still be restored stays');
select is((select count(*)::int from private.media_orphans(tests.now())), 2,
  'media_orphans: other buckets and names outside the photo folders are never touched');
select is((select count(*)::int from private.media_orphans(tests.now() + interval '1 day')), 4,
  'media_orphans: a day later the two younger orphans go as well (p_now decides)');

-- ===================== The run =====================
delete from vault.secrets where name in ('media_sweep_secret', 'media_sweep_url');
select is(private.run_media_orphan_sweep(tests.now()), 0,
  'run_media_orphan_sweep: without the Vault entries nothing is sent');
select is((select count(*)::int from new_requests), 0, 'run_media_orphan_sweep: … and pg_net gets no request');

select tests.set_sweep_vault();
select is(private.run_media_orphan_sweep(tests.now()), 2, 'AC-010 run_media_orphan_sweep: hands over the two orphans');
select is(
  (select jsonb_build_object('url', r.url, 'names', (r.body::jsonb -> 'names')) from new_requests r),
  jsonb_build_object('url', 'http://media-sweep.test/functions/v1/media-sweep',
                     'names', (select jsonb_agg(n order by n) from private.media_orphans(tests.now()) n)),
  'AC-010 run_media_orphan_sweep: one request to media-sweep with the names');
select is(
  (select r.headers ->> 'x-sweep-signature' from new_requests r),
  (select encode(extensions.hmac((r.headers ->> 'x-sweep-timestamp') || '.' || r.body, 'test-sweep-secret', 'sha256'), 'hex')
   from new_requests r),
  'Risiken run_media_orphan_sweep: the request carries the HMAC of "<timestamp>.<body>", never the secret');
select ok((select r.headers::text not like '%test-sweep-secret%' and r.body not like '%test-sweep-secret%' from new_requests r),
  'Risiken run_media_orphan_sweep: the secret itself is nowhere in the queued request');

delete from net.http_request_queue where id > (select id from queue_before);
select is(private.run_media_orphan_sweep(tests.now() - interval '30 days'), 0,
  'run_media_orphan_sweep: nothing old enough, no request');

-- ===================== The job, and nobody else may run it =====================
select is(
  (select schedule || ' ' || command from cron.job where jobname = 'media-orphan-sweep'),
  '30 2 * * * select private.run_media_orphan_sweep()',
  'media-orphan-sweep: pg_cron runs the sweep nightly at 02:30 UTC (03:30 Berlin in winter)');

select tests.authenticate_as(tests.fx('enrico'));
select throws_ok($$ select private.run_media_orphan_sweep(now()) $$, '42501', null,
  'Risiken: a member cannot run the sweep');
select tests.authenticate_as_anon();
select throws_ok($$ select private.media_orphans(now()) $$, '42501', null,
  'Risiken: a signed-out caller cannot list the files');
select tests.clear_authentication();

select * from finish();
rollback;
