-- References between domain rows and to members (spec 0003, T3). A person who belongs to two
-- households cannot link a row of one to a row of the other (composite foreign keys); person
-- fields accept only members of the row's household; deleting a parent or removing a member
-- has a defined effect; domain checks reject invalid values.
begin;
\ir _helpers.psql
select plan(59);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('dora', tests.create_user('dora@example.com', 'Dora')),
  ('emil', tests.create_user('emil@example.com', 'Emil')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
-- Dora belongs to A and B, Emil only to A, Ben only to B.
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('dora'), tests.fx('emil')])),
  ('home_b', tests.create_household('B', array[tests.fx('dora'), tests.fx('ben')]));
insert into fx (key) values
  ('slot_a'), ('slot_b'),
  ('area_a'), ('area_b'), ('article_a'), ('article_b'), ('store_a'), ('store_b'), ('list_a'), ('list_b'),
  ('recipe_a'), ('recipe_b'), ('restaurant_a'), ('restaurant_b'), ('chore_a'), ('chore_b'),
  ('entry_a'), ('entry_b'), ('item_a'), ('item_b'), ('event_a');

update public.households h
set meal_slots = jsonb_build_array(jsonb_build_object(
  'id', case when h.id = tests.fx('home_a') then tests.fx('slot_a') else tests.fx('slot_b') end,
  'name', 'Abend', 'sort', 0))
where h.id in (tests.fx('home_a'), tests.fx('home_b'));

-- The same set of rows in both households (as postgres).
insert into public.areas (id, household_id, name, sort) values
  (tests.fx('area_a'), tests.fx('home_a'), 'Obst', 0), (tests.fx('area_b'), tests.fx('home_b'), 'Obst', 0);
insert into public.articles (id, household_id, name, name_key, area_id) values
  (tests.fx('article_a'), tests.fx('home_a'), 'Äpfel', 'apfel', tests.fx('area_a')),
  (tests.fx('article_b'), tests.fx('home_b'), 'Äpfel', 'apfel', tests.fx('area_b'));
insert into public.stores (id, household_id, name) values
  (tests.fx('store_a'), tests.fx('home_a'), 'Edeka'), (tests.fx('store_b'), tests.fx('home_b'), 'Edeka');
insert into public.shopping_lists (id, household_id, name, is_default) values
  (tests.fx('list_a'), tests.fx('home_a'), 'Standardliste', true),
  (tests.fx('list_b'), tests.fx('home_b'), 'Standardliste', true);
update public.households set default_list_id = tests.fx('list_b') where id = tests.fx('home_b');
insert into public.recipes (id, household_id, title, servings, course) values
  (tests.fx('recipe_a'), tests.fx('home_a'), 'Dal', 2, 'main'),
  (tests.fx('recipe_b'), tests.fx('home_b'), 'Dal', 2, 'main');
insert into public.restaurants (id, household_id, name) values
  (tests.fx('restaurant_a'), tests.fx('home_a'), 'Roma'), (tests.fx('restaurant_b'), tests.fx('home_b'), 'Roma');
insert into public.chores (id, household_id, title, recurrence, assignment) values
  (tests.fx('chore_a'), tests.fx('home_a'), 'Bad', '{"type": "flexible", "everyDays": 7}', '{"type": "anyone"}'),
  (tests.fx('chore_b'), tests.fx('home_b'), 'Bad', '{"type": "flexible", "everyDays": 7}', '{"type": "anyone"}');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, cook_id) values
  (tests.fx('entry_a'), tests.fx('home_a'), '2026-11-20', tests.fx('slot_a'), 'recipe', tests.fx('recipe_a'), tests.fx('emil')),
  (tests.fx('entry_b'), tests.fx('home_b'), '2026-11-20', tests.fx('slot_b'), 'recipe', tests.fx('recipe_b'), tests.fx('ben'));
insert into public.shopping_items (id, household_id, list_id, article_id) values
  (tests.fx('item_a'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a')),
  (tests.fx('item_b'), tests.fx('home_b'), tests.fx('list_b'), tests.fx('article_b'));
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by) values
  (tests.fx('event_a'), tests.fx('home_a'), tests.fx('chore_a'), 'Bad', 'done', '2026-11-19', tests.fx('emil'));

-- ===================== Composite foreign keys: no link into another household =====================
select tests.authenticate_as(tests.fx('dora'));

select throws_ok(
  format($$ insert into public.articles (household_id, name, name_key, area_id) values (%L, 'Birnen', 'birnen', %L) $$,
         tests.fx('home_a'), tests.fx('area_b')),
  '23503', null, 'T3 articles: area_id of another household is rejected');
select throws_ok(
  format($$ insert into public.shopping_lists (household_id, name, store_id) values (%L, 'X', %L) $$,
         tests.fx('home_a'), tests.fx('store_b')),
  '23503', null, 'T3 shopping_lists: store_id of another household is rejected');
select throws_ok(
  format($$ update public.shopping_lists set store_id = %L where id = %L $$, tests.fx('store_b'), tests.fx('list_a')),
  '23503', null, 'T3 shopping_lists: an update cannot point store_id into another household');
select throws_ok(
  format($$ update public.households set default_list_id = %L where id = %L $$, tests.fx('list_b'), tests.fx('home_a')),
  '23503', null, 'T3 households: default_list_id of another household is rejected');
select throws_ok(
  format($$ update public.households set default_store_id = %L where id = %L $$, tests.fx('store_b'), tests.fx('home_a')),
  '23503', null, 'T3 households: default_store_id of another household is rejected');
select throws_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id) values (%L, %L, %L) $$,
         tests.fx('home_a'), tests.fx('list_b'), tests.fx('article_a')),
  '23503', null, 'T3 shopping_items: list_id of another household is rejected');
select throws_ok(
  format($$ insert into public.shopping_items (household_id, list_id, article_id) values (%L, %L, %L) $$,
         tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_b')),
  '23503', null, 'T3 shopping_items: article_id of another household is rejected');
select throws_ok(
  format($$ insert into public.shopping_contributions (household_id, item_id, source) values (%L, %L, '{"kind": "manual"}') $$,
         tests.fx('home_a'), tests.fx('item_b')),
  '23503', null, 'T3 shopping_contributions: item_id of another household is rejected');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, recipe_id) values (%L, %L, 'recipe', %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('recipe_b')),
  '23503', null, 'T3 meal_plan_entries: recipe_id of another household is rejected');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, restaurant_id) values (%L, %L, 'restaurant', %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('restaurant_b')),
  '23503', null, 'T3 meal_plan_entries: restaurant_id of another household is rejected');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, recipe_id, leftovers_of_entry_id)
            values (%L, %L, 'leftovers', %L, %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('recipe_a'), tests.fx('entry_b')),
  '23503', null, 'T3 meal_plan_entries: leftovers_of_entry_id of another household is rejected');
select throws_ok(
  format($$ insert into public.chore_events (household_id, chore_id, title, kind, done_on, done_by)
            values (%L, %L, 'Bad', 'done', '2026-11-20', %L) $$,
         tests.fx('home_a'), tests.fx('chore_b'), tests.fx('dora')),
  '23503', null, 'T3 chore_events: chore_id of another household is rejected');
select throws_ok(
  format($$ select public.set_recipe_rating(%L, 3::smallint) $$, gen_random_uuid()),
  'P0002', 'recipe_not_found', 'T3 recipe_ratings: rating an unknown recipe is rejected');

-- ===================== Person fields: only members of the row's household =====================
-- Ben is a member of B, not of A; Dora writes in A.
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, text, cook_id) values (%L, %L, 'text', 'Pizza', %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('ben')),
  '23503', null, 'T3 meal_plan_entries: cook_id of a non-member is rejected');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, text, eater_ids) values (%L, %L, 'text', 'Pizza', %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), array[tests.fx('dora'), tests.fx('ben')]),
  '23503', 'invalid_member', 'T3 meal_plan_entries: eater_ids with a non-member are rejected');
select throws_ok(
  format($$ update public.meal_plan_entries set eater_ids = %L where id = %L $$,
         array[gen_random_uuid()], tests.fx('entry_a')),
  '23503', 'invalid_member', 'T3 meal_plan_entries: an update cannot add an unknown person to eater_ids');
select throws_ok(
  format($$ insert into public.chore_events (household_id, title, kind, done_on, done_by) values (%L, 'Müll', 'spontaneous', '2026-11-20', %L) $$,
         tests.fx('home_a'), tests.fx('ben')),
  '23503', null, 'T3 chore_events: done_by of a non-member is rejected');
select throws_ok(
  format($$ update public.chore_events set done_by = %L where id = %L $$, tests.fx('ben'), tests.fx('event_a')),
  '23503', null, 'T3 chore_events: an update cannot book the event on a non-member');
select throws_ok(
  format($$ insert into public.absences (household_id, member_id, from_on, to_on) values (%L, %L, '2026-12-01', '2026-12-02') $$,
         tests.fx('home_a'), tests.fx('ben')),
  '23503', null, 'T3 absences: member_id of a non-member is rejected');
select throws_ok(
  format($$ update public.chores set next_assignee_id = %L where id = %L $$, tests.fx('ben'), tests.fx('chore_a')),
  '23503', null, 'T3 chores: next_assignee_id of a non-member is rejected');
select throws_ok(
  format($$ update public.chores set assignment = %L where id = %L $$,
         jsonb_build_object('type', 'fixed', 'memberId', tests.fx('ben')), tests.fx('chore_a')),
  '23503', 'invalid_member', 'T3 chores: a fixed assignment to a non-member is rejected');
select throws_ok(
  format($$ update public.chores set assignment = %L where id = %L $$,
         jsonb_build_object('type', 'rotating', 'memberIds', array[tests.fx('dora'), tests.fx('ben')]), tests.fx('chore_a')),
  '23503', 'invalid_member', 'T3 chores: a rotation with a non-member is rejected');
select lives_ok(
  format($$ update public.chores set assignment = %L, next_assignee_id = %L where id = %L $$,
         jsonb_build_object('type', 'rotating', 'memberIds', array[tests.fx('dora'), tests.fx('emil')]),
         tests.fx('emil'), tests.fx('chore_a')),
  'T3 chores: a rotation of members is accepted');
select lives_ok(
  format($$ insert into public.absences (household_id, member_id, from_on, to_on) values (%L, null, '2026-12-24', '2026-12-26') $$,
         tests.fx('home_a')),
  'T3 absences: member_id null is an absence of the whole household');

-- ===================== Domain checks =====================
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, text) values (%L, %L, 'text', 'Pizza') $$,
         tests.fx('home_a'), tests.fx('slot_b')),
  '23503', 'invalid_slot', 'T3 meal_plan_entries: a slot of another household is rejected');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, text) values (%L, %L, 'text', 'Pizza') $$,
         tests.fx('home_a'), gen_random_uuid()),
  '23503', 'invalid_slot', 'T3 meal_plan_entries: an unknown slot is rejected');
select lives_ok(
  format($$ insert into public.meal_plan_entries (household_id, date, slot_id, kind, recipe_id) values (%L, null, %L, 'recipe', %L) $$,
         tests.fx('home_a'), tests.fx('slot_a'), tests.fx('recipe_a')),
  'T3 meal_plan_entries: date null is a vorgemerkt entry');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind) values (%L, %L, 'recipe') $$,
         tests.fx('home_a'), tests.fx('slot_a')),
  '23514', null, 'T3 meal_plan_entries: kind recipe needs recipe_id');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind) values (%L, %L, 'restaurant') $$,
         tests.fx('home_a'), tests.fx('slot_a')),
  '23514', null, 'T3 meal_plan_entries: kind restaurant needs restaurant_id');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, text) values (%L, %L, 'text', '  ') $$,
         tests.fx('home_a'), tests.fx('slot_a')),
  '23514', null, 'T3 meal_plan_entries: kind text needs a non-blank text');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind) values (%L, %L, 'leftovers') $$,
         tests.fx('home_a'), tests.fx('slot_a')),
  '23514', null, 'T3 meal_plan_entries: kind leftovers needs the source entry or recipe');
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, text) values (%L, %L, 'snack', 'X') $$,
         tests.fx('home_a'), tests.fx('slot_a')),
  '23514', null, 'T3 meal_plan_entries: an unknown kind is rejected');
select throws_ok(
  format($$ insert into public.absences (household_id, from_on, to_on) values (%L, '2026-12-03', '2026-12-01') $$,
         tests.fx('home_a')),
  '23514', 'new row for relation "absences" violates check constraint "absences_range_valid"',
  'T3 absences: to_on before from_on is rejected');
select throws_ok(
  format($$ insert into public.recipes (household_id, title, servings, course) values (%L, 'X', 0, 'main') $$, tests.fx('home_a')),
  '23514', null, 'T3 recipes: servings must be at least 1');
select throws_ok(
  format($$ insert into public.recipes (household_id, title, servings, course) values (%L, 'X', 2, 'brunch') $$, tests.fx('home_a')),
  '23514', null, 'T3 recipes: course must be one of the known courses');
select throws_ok(
  format($$ insert into public.recipes (household_id, title, servings, course) values (%L, %L, 2, 'main') $$,
         tests.fx('home_a'), repeat('x', 201)),
  '23514', null, 'T3 recipes: a title over 200 characters is rejected');
select throws_ok(
  format($$ update public.recipes set notes = %L where id = %L $$, repeat('x', 4001), tests.fx('recipe_a')),
  '23514', null, 'T3 recipes: notes over 4000 characters are rejected');
select throws_ok(
  format($$ insert into public.articles (household_id, name, name_key, diet) values (%L, 'Tofu', 'tofu', 'carnivore') $$,
         tests.fx('home_a')),
  '23514', null, 'T3 articles: diet must be a known diet');
select throws_ok(
  format($$ insert into public.articles (household_id, name, name_key) values (%L, 'Äpfel!', 'apfel') $$, tests.fx('home_a')),
  '23505', null, 'T3 articles: name_key is unique per household');
select throws_ok(
  format($$ insert into public.shopping_lists (household_id, name, is_default) values (%L, 'Zweite', true) $$, tests.fx('home_a')),
  '23505', null, 'T3 shopping_lists: at most one default list per household');
select throws_ok(
  format($$ update public.restaurants set maps_url = 'javascript:alert(1)' where id = %L $$, tests.fx('restaurant_a')),
  '23514', null, 'T3 restaurants: maps_url must be an http(s) link');
select throws_ok(
  format($$ update public.restaurants set price_level = 5 where id = %L $$, tests.fx('restaurant_a')),
  '23514', null, 'T3 restaurants: price_level is 1 to 4');
select throws_ok(
  format($$ update public.chores set effort = 4 where id = %L $$, tests.fx('chore_a')),
  '23514', null, 'T3 chores: effort is 1 to 3');
select throws_ok(
  format($$ update public.chores set active_months = '{0, 13}' where id = %L $$, tests.fx('chore_a')),
  '23514', null, 'T3 chores: active months are 1 to 12');
select throws_ok(
  format($$ update public.chores set recurrence = '{"type": "hourly"}' where id = %L $$, tests.fx('chore_a')),
  '23514', null, 'T3 chores: an unknown recurrence type is rejected');
select throws_ok(
  format($$ update public.chore_events set kind = 'forgotten' where id = %L $$, tests.fx('event_a')),
  '23514', null, 'T3 chore_events: an unknown kind is rejected');
select throws_ok(
  format($$ insert into public.feedback (household_id, kind, text, status) values (%L, 'idea', 'X', 'maybe') $$, tests.fx('home_a')),
  '23514', null, 'T3 feedback: an unknown status is rejected');
select throws_ok(
  format($$ insert into public.shopping_contributions (household_id, item_id, source) values (%L, %L, '{"kind": "magic"}') $$,
         tests.fx('home_a'), tests.fx('item_a')),
  '23514', null, 'T3 shopping_contributions: an unknown source kind is rejected');

-- ===================== Deleting parents =====================
select throws_ok(
  format($$ delete from public.recipes where id = %L $$, tests.fx('recipe_a')),
  '23503', null, 'T3 recipes: a recipe in the meal plan cannot be deleted (restrict)');
select throws_ok(
  format($$ delete from public.shopping_lists where id = %L $$, tests.fx('list_b')),
  '23503', null, 'T3 shopping_lists: the default list of a household cannot be deleted');

select tests.clear_authentication();
update public.households set default_store_id = tests.fx('store_a') where id = tests.fx('home_a');
update public.shopping_lists set store_id = tests.fx('store_a') where id = tests.fx('list_a');
select tests.authenticate_as(tests.fx('dora'));
delete from public.stores where id = tests.fx('store_a');
select results_eq(
  format($$ select (select default_store_id from public.households where id = %L),
                   (select store_id from public.shopping_lists where id = %L) $$,
         tests.fx('home_a'), tests.fx('list_a')),
  $$ values (null::uuid, null::uuid) $$,
  'T3 stores: deleting a store clears default_store_id and the lists'' store_id');

delete from public.chores where id = tests.fx('chore_a');
select results_eq(
  format($$ select household_id, chore_id, title from public.chore_events where id = %L $$, tests.fx('event_a')),
  format($$ values (%L::uuid, null::uuid, 'Bad') $$, tests.fx('home_a')),
  'T3 chore_events: deleting the chore keeps the event, clears chore_id and keeps household_id');

delete from public.areas where id = tests.fx('area_a');
select results_eq(
  format($$ select area_id from public.articles where id = %L $$, tests.fx('article_a')),
  $$ values (null::uuid) $$,
  'T3 areas: deleting an area keeps its articles and clears their area_id'
);

-- ===================== Removing a member =====================
select tests.clear_authentication();
insert into public.absences (household_id, member_id, from_on, to_on)
values (tests.fx('home_a'), tests.fx('emil'), '2026-12-01', '2026-12-02');
update public.meal_plan_entries set eater_ids = array[tests.fx('dora'), tests.fx('emil')] where id = tests.fx('entry_a');
select tests.authenticate_as(tests.fx('emil'));
select public.set_recipe_rating(tests.fx('recipe_a'), 5::smallint);
select tests.authenticate_as(tests.fx('dora'));
select public.remove_member(tests.fx('home_a'), tests.fx('emil'));

select results_eq(
  format($$ select cook_id from public.meal_plan_entries where id = %L $$, tests.fx('entry_a')),
  $$ values (null::uuid) $$,
  'T3 meal_plan_entries: removing the cook clears cook_id');
select results_eq(
  format($$ select done_by from public.chore_events where id = %L $$, tests.fx('event_a')),
  $$ values (null::uuid) $$,
  'T3 chore_events: removing the member keeps the event and clears done_by');
select is(
  (select count(*)::int from public.absences where member_id = tests.fx('emil')),
  0,
  'T3 absences: removing a member deletes her personal absences');
select is(
  (select count(*)::int from public.recipe_ratings where member_id = tests.fx('emil')),
  0,
  'T3 recipe_ratings: removing a member deletes her ratings');
select lives_ok(
  format($$ update public.meal_plan_entries set portions = 3 where id = %L $$, tests.fx('entry_a')),
  'T3 meal_plan_entries: a former member left in eater_ids does not block other edits');
select is(
  (select count(*)::int from public.deleted_records
   where table_name = 'recipe_ratings' and record_id = tests.fx('recipe_a') || ':' || tests.fx('emil')),
  1,
  'AC-015 recipe_ratings: the removed rating leaves a tombstone keyed recipe_id:member_id');

select * from finish();
rollback;
