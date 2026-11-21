-- Activities (spec 0004): the household's collection (REQ-002/003), per-person favourites and
-- ratings written only by RPCs (REQ-007), own photos referenced by photo_path (REQ-004, recipes
-- too) and activities in the meal plan with a note (REQ-005). Tenant isolation like every
-- household table; created_by is the caller; a photo_path can only point into the row's own
-- folder of its own household, named <uuid>.jpg like every upload.
begin;
\ir _helpers.psql
select plan(92);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The photo folder of a row as the client builds it: <household_id>/<activities|recipes>/<id>/
create function tests.media(p_household text, p_kind text, p_row text) returns text language sql stable
as $$ select tests.fx(p_household) || '/' || p_kind || '/' || tests.fx(p_row) || '/' $$;
grant execute on function tests.media(text, text, text) to anon, authenticated;

insert into fx (key, id) values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('dora', tests.create_user('dora@example.com', 'Dora')),
  ('mia', tests.create_user('mia@example.com', 'Mia')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
-- Mia belongs to A and B.
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('anna'), tests.fx('carla'), tests.fx('dora'), tests.fx('mia')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben'), tests.fx('mia')]));
insert into fx (key) values
  ('slot_a'), ('slot_b'), ('recipe_a'), ('recipe_a2'), ('act_a'), ('act_b'), ('act_iso'), ('act_dora'),
  ('entry_a'), ('entry_text');

update public.households h
set meal_slots = jsonb_build_array(jsonb_build_object(
  'id', case when h.id = tests.fx('home_a') then tests.fx('slot_a') else tests.fx('slot_b') end,
  'name', 'Vormittag', 'sort', 0))
where h.id in (tests.fx('home_a'), tests.fx('home_b'));
insert into public.recipes (id, household_id, title) values
  (tests.fx('recipe_a'), tests.fx('home_a'), 'Lasagne'),
  (tests.fx('recipe_a2'), tests.fx('home_a'), 'Spaghetti Bolognese');
insert into public.activities (id, household_id, name, name_key, created_by) values
  (tests.fx('act_a'), tests.fx('home_a'), 'Eislaufen', 'eislaufen', tests.fx('anna')),
  (tests.fx('act_b'), tests.fx('home_b'), 'Bouldern', 'bouldern', tests.fx('ben'));
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, text) values
  (tests.fx('entry_text'), tests.fx('home_a'), '2026-11-21', tests.fx('slot_a'), 'text', 'Spieleabend');

-- ===================== Tenant isolation (15) =====================
select * from tests.tenant_isolation('activities',
  jsonb_build_object('id', tests.fx('act_iso'), 'household_id', tests.fx('home_a'), 'name', 'Bouldern',
                     'name_key', 'bouldern', 'description', 'In der Halle', 'place_name', 'Boulderhalle',
                     'address', 'Halle 1, Berlin', 'lat', 52.5, 'lng', 13.4,
                     'maps_url', 'https://maps.app.goo.gl/abc', 'tags', array['drinnen']),
  jsonb_build_object('name', 'Bouldern (Halle)', 'name_key', 'bouldern halle', 'description', 'Mit Kurs',
                     'tags', array['sport'], 'photo_path', tests.media('home_a', 'activities', 'act_iso') || gen_random_uuid() || '.jpg'),
  tests.fx('anna'), tests.fx('ben'));

-- ===================== created_by (4) =====================
select tests.authenticate_as(tests.fx('dora'));
insert into public.activities (id, household_id, name, name_key, created_by)
values (tests.fx('act_dora'), tests.fx('home_a'), 'Spieleabend', 'spieleabend', tests.fx('anna'));
select is(
  (select created_by from public.activities where id = tests.fx('act_dora')), tests.fx('dora'),
  'REQ-003 activities: created_by is the caller, whatever the client sends');
select throws_ok(
  format($$ update public.activities set created_by = %L where id = %L $$, tests.fx('anna'), tests.fx('act_dora')),
  '42501', null, 'REQ-003 activities: created_by cannot be changed');
select tests.clear_authentication();
delete from public.household_members where household_id = tests.fx('home_a') and profile_id = tests.fx('dora');
select results_eq(
  format($$ select name, created_by from public.activities where id = %L $$, tests.fx('act_dora')),
  $$ values ('Spieleabend', null::uuid) $$,
  'REQ-003 activities: removing the creator keeps the activity and clears created_by');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key, created_by) values (%L, 'X', 'x', %L) $$,
         tests.fx('home_a'), tests.fx('ben')),
  '23503', null, 'REQ-003 activities: created_by must be a member of the household (without a signed-in user)');

-- ===================== Constraints (14) =====================
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key) values (%L, '  ', 'x') $$, tests.fx('home_a')),
  '23514', null, 'AC-007 activities: a blank name is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key) values (%L, %L, 'x') $$,
         tests.fx('home_a'), repeat('n', 121)),
  '23514', null, 'REQ-003 activities: a name longer than 120 characters is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key) values (%L, 'eislaufen', 'eislaufen') $$,
         tests.fx('home_a')),
  '23505', null, 'AC-008 activities: the same name_key twice in one household is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key) values (%L, 'X', '') $$, tests.fx('home_a')),
  '23514', null, 'REQ-003 activities: an empty name_key is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key, description) values (%L, 'X', 'x', %L) $$,
         tests.fx('home_a'), repeat('d', 4001)),
  '23514', null, 'REQ-003 activities: a description longer than 4000 characters is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key, place_name) values (%L, 'X', 'x', %L) $$,
         tests.fx('home_a'), repeat('p', 201)),
  '23514', null, 'REQ-003 activities: a place name longer than 200 characters is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key, address) values (%L, 'X', 'x', %L) $$,
         tests.fx('home_a'), repeat('a', 301)),
  '23514', null, 'REQ-003 activities: an address longer than 300 characters is rejected');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key, maps_url) values (%L, 'X', 'x', 'http://maps.google.com/?q=x') $$,
         tests.fx('home_a')),
  '23514', null, 'AC-014 activities: a maps link must be https');
select throws_ok(
  format($$ insert into public.activities (household_id, name, name_key, maps_url) values (%L, 'X', 'x', 'javascript:alert(1)') $$,
         tests.fx('home_a')),
  '23514', null, 'AC-014 activities: a maps link with another scheme is rejected');
select lives_ok(
  format($$ update public.activities
            set place_name = 'Eisstadion Hohenschönhausen', address = 'Konrad-Wolf-Straße 42, Berlin',
                lat = 52.55, lng = 13.5,
                maps_url = 'https://www.google.com/maps/place/Eisstadion+Hohensch%%C3%%B6nhausen/@52.55,13.5,17z'
            where id = %L $$, tests.fx('act_a')),
  'AC-006 activities: a member stores a place with coordinates and the original link');
select throws_ok(
  format($$ update public.activities set lat = 91, lng = 0 where id = %L $$, tests.fx('act_a')),
  '23514', null, 'REQ-003 activities: a latitude outside -90…90 is rejected');
select throws_ok(
  format($$ update public.activities set lat = 50, lng = null where id = %L $$, tests.fx('act_a')),
  '23514', null, 'REQ-003 activities: latitude and longitude come together');
select throws_ok(
  format($$ update public.activities set tags = %L where id = %L $$,
         (select array_agg('t' || n) from generate_series(1, 31) n), tests.fx('act_a')),
  '23514', null, 'REQ-003 activities: more than 30 tags are rejected');
select tests.authenticate_as(tests.fx('ben'));
select lives_ok(
  format($$ insert into public.activities (household_id, name, name_key) values (%L, 'Eislaufen', 'eislaufen') $$,
         tests.fx('home_b')),
  'AC-008 activities: another household may have an activity of the same name');

-- ===================== photo_path (17) =====================
select tests.authenticate_as(tests.fx('anna'));
select lives_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || gen_random_uuid() || '.jpg', tests.fx('act_a')),
  'AC-009 activities: photo_path points into the activity''s folder of its household');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_b', 'activities', 'act_a') || gen_random_uuid() || '.jpg', tests.fx('act_a')),
  '23514', null, 'AC-012 activities: photo_path in the folder of another household is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_iso') || gen_random_uuid() || '.jpg', tests.fx('act_a')),
  '23514', null, 'AC-012 activities: photo_path in the folder of another activity is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'recipes', 'act_a') || gen_random_uuid() || '.jpg', tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: photo_path in the recipes folder is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a'), tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: photo_path without a file name is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || '../../' || tests.fx('home_b') || '/x.jpg', tests.fx('act_a')),
  '23514', null, 'AC-012 activities: photo_path with further folders (../) is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || repeat('x', 300) || '.jpg', tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: photo_path longer than 300 characters is rejected');
-- The file is always <uuid>.jpg (a new lower-case uuid per upload): nothing else can be named.
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || 'eislaufen.jpg', tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: a file name other than <uuid>.jpg is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || gen_random_uuid() || '.svg', tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: a file other than .jpg is rejected');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || gen_random_uuid() || '.jpg.html', tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: nothing may follow .jpg');
select throws_ok(
  format($$ update public.activities set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'act_a') || upper(gen_random_uuid()::text) || '.jpg', tests.fx('act_a')),
  '23514', null, 'REQ-004 activities: the file''s uuid is written in lower case, as the client builds it');
select lives_ok(
  format($$ update public.activities set photo_path = null where id = %L $$, tests.fx('act_a')),
  'AC-018 activities: removing the photo clears photo_path');
select lives_ok(
  format($$ update public.recipes set photo_path = %L where id = %L $$,
         tests.media('home_a', 'recipes', 'recipe_a2') || gen_random_uuid() || '.jpg', tests.fx('recipe_a2')),
  'AC-017 recipes: a member sets an own photo in the recipe''s folder');
select throws_ok(
  format($$ update public.recipes set photo_path = %L where id = %L $$,
         tests.media('home_b', 'recipes', 'recipe_a2') || gen_random_uuid() || '.jpg', tests.fx('recipe_a2')),
  '23514', null, 'AC-012 recipes: photo_path in the folder of another household is rejected');
select throws_ok(
  format($$ update public.recipes set photo_path = %L where id = %L $$,
         tests.media('home_a', 'activities', 'recipe_a2') || gen_random_uuid() || '.jpg', tests.fx('recipe_a2')),
  '23514', null, 'REQ-004 recipes: photo_path in the activities folder is rejected');
select throws_ok(
  format($$ update public.recipes set photo_path = %L where id = %L $$,
         tests.media('home_a', 'recipes', 'recipe_a') || gen_random_uuid() || '.jpg', tests.fx('recipe_a2')),
  '23514', null, 'AC-012 recipes: photo_path in the folder of another recipe is rejected');
select throws_ok(
  format($$ update public.recipes set photo_path = %L where id = %L $$,
         tests.media('home_a', 'recipes', 'recipe_a2') || 'lasagne.jpg', tests.fx('recipe_a2')),
  '23514', null, 'REQ-004 recipes: a file name other than <uuid>.jpg is rejected');

-- ===================== Favourites and ratings (17) =====================
select lives_ok(
  format($$ select public.set_activity_favorite(%L, true) $$, tests.fx('act_a')),
  'AC-020 set_activity_favorite: a member marks an activity as favourite');
select lives_ok(
  format($$ select public.set_activity_favorite(%L, true) $$, tests.fx('act_a')),
  'AC-020 set_activity_favorite: marking it again is harmless');
select results_eq(
  format($$ select household_id, activity_id, member_id from public.activity_favorites where activity_id = %L $$,
         tests.fx('act_a')),
  format($$ values (%L::uuid, %L::uuid, %L::uuid) $$, tests.fx('home_a'), tests.fx('act_a'), tests.fx('anna')),
  'AC-020 set_activity_favorite: the favourite belongs to the caller and the activity''s household');
select public.set_activity_rating(tests.fx('act_a'), 3::numeric);
select public.set_activity_rating(tests.fx('act_a'), 5::numeric);
select results_eq(
  format($$ select member_id, stars from public.activity_ratings where activity_id = %L $$, tests.fx('act_a')),
  format($$ values (%L::uuid, 5::numeric) $$, tests.fx('anna')),
  'AC-020 set_activity_rating: rating again replaces the caller''s stars');
select throws_ok(
  format($$ select public.set_activity_rating(%L, 6::numeric) $$, tests.fx('act_a')),
  '22023', 'invalid_stars', 'AC-020 set_activity_rating: more than 5 stars are rejected');
select throws_ok(
  format($$ select public.set_activity_rating(%L, 0::numeric) $$, tests.fx('act_a')),
  '22023', 'invalid_stars', 'AC-020 set_activity_rating: 0 stars are rejected');
select throws_ok(
  format($$ select public.set_activity_favorite(%L, null) $$, tests.fx('act_a')),
  '22023', 'invalid_favorite', 'AC-020 set_activity_favorite: null is rejected');

select tests.authenticate_as(tests.fx('carla'));
select public.set_activity_rating(tests.fx('act_a'), 4::numeric);
select results_eq(
  format($$ select member_id, stars from public.activity_ratings where activity_id = %L order by stars $$, tests.fx('act_a')),
  format($$ values (%L::uuid, 4::numeric), (%L::uuid, 5::numeric) $$, tests.fx('carla'), tests.fx('anna')),
  'AC-020 set_activity_rating: ratings are kept per person');
select is(
  (select count(*)::int from public.activity_favorites where activity_id = tests.fx('act_a') and member_id = tests.fx('anna')),
  1, 'AC-020 activity_favorites: a member sees the other member''s favourite');
select public.set_activity_rating(tests.fx('act_a'), null);
select public.set_activity_favorite(tests.fx('act_a'), false);
select results_eq(
  format($$ select member_id from public.activity_ratings where activity_id = %L $$, tests.fx('act_a')),
  format($$ values (%L::uuid) $$, tests.fx('anna')),
  'AC-020 set_activity_rating: null removes only the caller''s rating');
select is(
  (select count(*)::int from public.activity_favorites where activity_id = tests.fx('act_a')), 1,
  'AC-020 set_activity_favorite: false removes only the caller''s favourite (Carla had none)');
select tests.authenticate_as(tests.fx('anna'));
select is(
  (select count(*)::int from public.deleted_records
   where table_name = 'activity_ratings' and record_id = tests.fx('act_a') || ':' || tests.fx('carla')),
  1, 'AC-015 activity_ratings: removing a rating leaves a tombstone keyed activity_id:member_id');

select tests.authenticate_as(tests.fx('ben'));
select is(
  (select count(*)::int from public.deleted_records where table_name like 'activity%'), 0,
  'AC-011 activity_ratings: a member of another household does not see the tombstone');
select throws_ok(
  format($$ select public.set_activity_favorite(%L, true) $$, tests.fx('act_a')),
  'P0002', 'activity_not_found', 'AC-011 set_activity_favorite: an activity of another household is not found');
select throws_ok(
  format($$ select public.set_activity_rating(%L, 1::numeric) $$, tests.fx('act_a')),
  'P0002', 'activity_not_found', 'AC-011 set_activity_rating: an activity of another household is not found');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.set_activity_favorite(%L, true) $$, tests.fx('act_a')),
  '42501', null, 'AC-005 set_activity_favorite: anon cannot call it');
select throws_ok(
  format($$ select public.set_activity_rating(%L, 1::numeric) $$, tests.fx('act_a')),
  '42501', null, 'AC-005 set_activity_rating: anon cannot call it');
select tests.clear_authentication();

-- ===================== Favourites and ratings: no direct writes (2 × 7) =====================
select * from tests.rpc_only_isolation('activity_favorites',
  jsonb_build_object('household_id', tests.fx('home_a'), 'activity_id', tests.fx('act_a'), 'member_id', tests.fx('carla')),
  tests.fx('anna'), tests.fx('ben'));
select * from tests.rpc_only_isolation('activity_ratings',
  jsonb_build_object('household_id', tests.fx('home_a'), 'activity_id', tests.fx('act_a'), 'member_id', tests.fx('carla'),
                     'stars', 1),
  tests.fx('anna'), tests.fx('ben'));

-- ===================== In the meal plan (11) =====================
select tests.authenticate_as(tests.fx('anna'));
select lives_ok(
  format($$ insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, activity_id, note)
            values (%L, %L, '2026-11-21', %L, 'activity', %L, 'Hohenschönhausen') $$,
         tests.fx('entry_a'), tests.fx('home_a'), tests.fx('slot_a'), tests.fx('act_a')),
  'AC-013 meal_plan_entries: a member plans an activity with a note');
select results_eq(
  format($$ select kind, activity_id, note from public.meal_plan_entries where id = %L $$, tests.fx('entry_a')),
  format($$ values ('activity', %L::uuid, 'Hohenschönhausen') $$, tests.fx('act_a')),
  'AC-013 meal_plan_entries: the entry keeps kind, activity and note');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind) values (%L, %L, 'activity') $$,
         tests.fx('home_a'), tests.fx('slot_a')),
  '23514', null, 'AC-023 meal_plan_entries: kind activity needs activity_id');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, recipe_id, note) values (%L, %L, 'recipe', %L, 'Oma') $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('recipe_a')),
  '23514', null, 'REQ-005 meal_plan_entries: a note is only allowed on an activity entry');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, activity_id, note) values (%L, %L, 'activity', %L, %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('act_a'), repeat('z', 121)),
  '23514', null, 'REQ-005 meal_plan_entries: a note longer than 120 characters is rejected');
select lives_ok(
  format($$ update public.meal_plan_entries set kind = 'activity', text = null, activity_id = %L, note = 'Halle 2' where id = %L $$,
         tests.fx('act_a'), tests.fx('entry_text')),
  'REQ-005 meal_plan_entries: a member changes an entry into an activity with a note');
select tests.authenticate_as(tests.fx('mia'));
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, activity_id) values (%L, %L, 'activity', %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('act_b')),
  '23503', null, 'AC-012 meal_plan_entries: an activity of another household is rejected (member of both)');
select throws_ok(
  format($$ update public.meal_plan_entries set activity_id = %L where id = %L $$, tests.fx('act_b'), tests.fx('entry_a')),
  '23503', null, 'AC-012 meal_plan_entries: an entry cannot be pointed at an activity of another household');
select tests.authenticate_as(tests.fx('anna'));
select throws_ok(
  format($$ delete from public.activities where id = %L $$, tests.fx('act_a')),
  '23503', null, 'REQ-006 activities: a planned activity cannot be deleted (its entries stay what they were)');
delete from public.meal_plan_entries where activity_id = tests.fx('act_a');
select is(
  tests.affected(format($$ delete from public.activities where id = %L $$, tests.fx('act_a'))), 1,
  'REQ-002 activities: without entries the activity can be deleted');
select is(
  (select count(*)::int from public.deleted_records
   where (table_name = 'activities' and record_id = tests.fx('act_a')::text)
      or (table_name in ('activity_favorites', 'activity_ratings') and record_id = tests.fx('act_a') || ':' || tests.fx('anna'))),
  3, 'AC-015 activities: the delete leaves tombstones for the activity, its favourite and its rating');
select tests.clear_authentication();

select * from finish();
rollback;
