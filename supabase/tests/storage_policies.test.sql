-- Photo storage (spec 0004, REQ-004): the private bucket household-media holds the photos of
-- activities and recipes under <household_id>/<activities|recipes>/<id>/<file>. Members of the
-- household read, upload, replace and delete them; nobody else can, not even with the API
-- directly (AC-012); a malformed path is rejected without an error that leaks anything.
--
-- The Storage API runs every object query as the caller (role authenticated + JWT claims), so
-- the policies are tested the same way: rows in storage.objects written and read as the user.
-- Storage refuses direct SQL deletes unless storage.allow_delete_query is set, which the
-- Storage API does for its own deletes; this file sets it to test the delete policy.
begin;
\ir _helpers.psql
select plan(26);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- An object name as the client builds it: <household_id>/<kind>/<row id>/<file>.
create function tests.media(p_household text, p_kind text, p_row text, p_file text) returns text language sql stable
as $$ select tests.fx(p_household) || '/' || p_kind || '/' || tests.fx(p_row) || '/' || p_file $$;
grant execute on function tests.media(text, text, text, text) to anon, authenticated;

-- Uploads (inserts) an object into household-media as the current role.
create function tests.upload_sql(p_name text, p_bucket text default 'household-media') returns text language sql stable
as $$ select format('insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L)',
                    p_bucket, p_name, '{"mimetype": "image/jpeg", "size": 1000}') $$;
grant execute on function tests.upload_sql(text, text) to anon, authenticated;

select set_config('storage.allow_delete_query', 'true', true);

insert into fx (key, id) values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('anna'), tests.fx('carla')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('act_a'), ('recipe_a'), ('act_b');

-- Another bucket, and objects with names the client never builds (written as postgres).
insert into storage.buckets (id, name) values ('tests-other', 'tests-other');
insert into storage.objects (bucket_id, name) values
  ('household-media', 'not-a-uuid/activities/x/y.jpg'),
  ('household-media', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz/recipes/a/b.jpg'),
  ('household-media', 'loose.jpg');

-- ===================== The bucket =====================
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'household-media' $$,
  $$ values (false, 2097152::bigint, array['image/jpeg']) $$,
  'REQ-004 household-media: a private bucket for JPEG files up to 2 MiB');

-- ===================== Members =====================
select tests.authenticate_as(tests.fx('anna'));
select lives_ok(
  tests.upload_sql(tests.media('home_a', 'activities', 'act_a', 'eislaufen.jpg')),
  'AC-009 household-media: a member uploads an activity photo into her household''s folder');
select lives_ok(
  tests.upload_sql(tests.media('home_a', 'recipes', 'recipe_a', 'lasagne.jpg')),
  'AC-017 household-media: a member uploads a recipe photo into her household''s folder');

select tests.authenticate_as(tests.fx('carla'));
select is(
  tests.affected(format('select 1 from storage.objects where name = %L',
                        tests.media('home_a', 'activities', 'act_a', 'eislaufen.jpg'))), 1,
  'AC-009 household-media: another member of the household reads the photo');
select is(
  tests.affected(format($$ update storage.objects set metadata = '{"mimetype": "image/jpeg", "size": 900}' where name = %L $$,
                        tests.media('home_a', 'recipes', 'recipe_a', 'lasagne.jpg'))), 1,
  'AC-017 household-media: another member of the household replaces the photo');

select tests.authenticate_as(tests.fx('ben'));
select lives_ok(
  tests.upload_sql(tests.media('home_b', 'activities', 'act_b', 'bouldern.jpg')),
  'AC-012 household-media: a member of B uploads into B');

-- ===================== Another household (AC-012) =====================
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  tests.upload_sql(tests.media('home_b', 'activities', 'act_b', 'fremd.jpg')),
  '42501', null, 'AC-012 household-media: an upload into another household''s folder is rejected');
select is(
  tests.affected(format('select 1 from storage.objects where name = %L',
                        tests.media('home_b', 'activities', 'act_b', 'bouldern.jpg'))), 0,
  'AC-012 household-media: a photo of another household cannot be read');
select is(
  tests.affected(format($$ update storage.objects set metadata = '{}' where name = %L $$,
                        tests.media('home_b', 'activities', 'act_b', 'bouldern.jpg'))), 0,
  'AC-012 household-media: a photo of another household cannot be overwritten');
select is(
  tests.affected(format('delete from storage.objects where name = %L',
                        tests.media('home_b', 'activities', 'act_b', 'bouldern.jpg'))), 0,
  'AC-012 household-media: a photo of another household cannot be deleted');
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format('select 1 from storage.objects where name = %L',
                        tests.media('home_b', 'activities', 'act_b', 'bouldern.jpg'))), 1,
  'AC-012 household-media: … and it is still there for its household');
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format('update storage.objects set name = %L where name = %L',
         tests.media('home_b', 'activities', 'act_b', 'verschoben.jpg'),
         tests.media('home_a', 'activities', 'act_a', 'eislaufen.jpg')),
  '42501', null, 'AC-012 household-media: a photo cannot be moved into another household''s folder');

-- ===================== Malformed paths =====================
select throws_ok(
  tests.upload_sql('not-a-uuid/activities/' || gen_random_uuid() || '/x.jpg'),
  '42501', null, 'REQ-004 household-media: a first folder that is no uuid is rejected as a policy violation, not a cast error');
select throws_ok(
  tests.upload_sql(tests.media('home_a', 'chores', 'act_a', 'x.jpg')),
  '42501', null, 'REQ-004 household-media: a second folder other than activities or recipes is rejected');
select throws_ok(
  tests.upload_sql(tests.fx('home_a') || '/activities/x.jpg'),
  '42501', null, 'REQ-004 household-media: a path without the row''s folder is rejected');
select throws_ok(
  tests.upload_sql(upper(tests.fx('home_a')::text) || '/activities/' || tests.fx('act_a') || '/x.jpg'),
  '42501', null, 'REQ-004 household-media: the household id must be written as the client builds it (lower case)');
select throws_ok(
  tests.upload_sql(tests.media('home_a', 'activities', 'act_a', 'x.jpg'), 'tests-other'),
  '42501', null, 'REQ-004 storage: the policies cover only household-media, not other buckets');
select lives_ok(
  'select count(*) from storage.objects',
  'REQ-004 household-media: objects with malformed names do not break reading the bucket');
select is(
  tests.affected('select 1 from storage.objects'), 2,
  'AC-012 household-media: a member sees exactly her household''s photos');

-- ===================== Signed out =====================
select tests.authenticate_as_anon();
select is(
  tests.affected($$ select 1 from storage.objects where bucket_id = 'household-media' $$), 0,
  'AC-005 household-media: anon reads nothing');
select throws_ok(
  tests.upload_sql(tests.media('home_a', 'activities', 'act_a', 'anon.jpg')),
  '42501', null, 'AC-005 household-media: anon cannot upload');
select is(
  tests.affected($$ update storage.objects set metadata = '{}' where bucket_id = 'household-media' $$), 0,
  'AC-005 household-media: anon overwrites nothing');
select is(
  tests.affected($$ delete from storage.objects where bucket_id = 'household-media' $$), 0,
  'AC-005 household-media: anon deletes nothing');

-- ===================== Removing a photo, removed members =====================
select tests.authenticate_as(tests.fx('anna'));
select is(
  tests.affected(format('delete from storage.objects where name = %L',
                        tests.media('home_a', 'activities', 'act_a', 'eislaufen.jpg'))), 1,
  'AC-018 household-media: a member deletes her household''s photo');

select tests.clear_authentication();
delete from public.household_members where household_id = tests.fx('home_a') and profile_id = tests.fx('carla');
select tests.authenticate_as(tests.fx('carla'));
select is(
  tests.affected($$ select 1 from storage.objects where bucket_id = 'household-media' $$), 0,
  'AC-012 household-media: a removed member reads none of the household''s photos');
select throws_ok(
  tests.upload_sql(tests.media('home_a', 'recipes', 'recipe_a', 'danach.jpg')),
  '42501', null, 'AC-012 household-media: a removed member cannot upload into the household''s folder');
select tests.clear_authentication();

select * from finish();
rollback;
