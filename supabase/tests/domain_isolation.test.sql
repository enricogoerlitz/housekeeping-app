-- Tenant isolation of every household-scoped domain table (spec 0003, T3; AC-005, AC-011,
-- AC-015): a member reads and writes her household's rows, a member of another household and a
-- signed-out caller read and change nothing, no row moves between households, and every delete
-- leaves a tombstone only members see. Favourites, ratings and votes are written only by RPCs;
-- chore events only through the domain ops complete_chore / remove_chore_event (spec 0011).
begin;
\ir _helpers.psql
select plan(11 * 15 + 17 + 5 * 7);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('anna'), tests.fx('carla')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values
  ('slot_a'), ('area_a'), ('article_a'), ('article_a2'), ('article_a3'), ('store_a'),
  ('recipe_a'), ('restaurant_a'), ('chore_a'), ('event_a'), ('item_a'), ('feedback_a');

-- ---------- Fixtures in household A (as postgres) ----------
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_a'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_a');
insert into public.areas (id, household_id, name, sort)
values (tests.fx('area_a'), tests.fx('home_a'), 'Obst & Gemüse', 0);
insert into public.articles (id, household_id, name, name_key, area_id, diet) values
  (tests.fx('article_a'), tests.fx('home_a'), 'Äpfel', 'apfel', tests.fx('area_a'), 'vegan'),
  (tests.fx('article_a2'), tests.fx('home_a'), 'Birnen', 'birnen', tests.fx('area_a'), 'vegan'),
  (tests.fx('article_a3'), tests.fx('home_a'), 'Pflaumen', 'pflaumen', tests.fx('area_a'), 'vegan');
insert into public.stores (id, household_id, name) values (tests.fx('store_a'), tests.fx('home_a'), 'Edeka');
insert into public.recipes (id, household_id, title, servings, course)
values (tests.fx('recipe_a'), tests.fx('home_a'), 'Linsen-Dal', 2, 'main');
insert into public.restaurants (id, household_id, name)
values (tests.fx('restaurant_a'), tests.fx('home_a'), 'Pizzeria Roma');
insert into public.chores (id, household_id, title, recurrence, assignment)
values (tests.fx('chore_a'), tests.fx('home_a'), 'Bad putzen', '{"type": "flexible", "everyDays": 7}',
        '{"type": "anyone"}');
insert into public.chore_events (id, household_id, chore_id, title, kind, done_on, done_by)
values (tests.fx('event_a'), tests.fx('home_a'), tests.fx('chore_a'), 'Bad putzen', 'done', current_date, tests.fx('anna'));
insert into public.shopping_items (id, household_id, article_id)
values (tests.fx('item_a'), tests.fx('home_a'), tests.fx('article_a'));
insert into public.feedback (id, household_id, kind, text, author_id)
values (tests.fx('feedback_a'), tests.fx('home_a'), 'idea', 'Dunkler Modus', tests.fx('anna'));

-- ---------- Tables members write directly ----------
select * from tests.tenant_isolation('areas',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'name', 'Tiefkühl', 'sort', 5),
  '{"name": "TK", "sort": 6}',
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('articles',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'name', 'Hafermilch',
                     'name_key', 'hafermilch', 'synonyms', array['Haferdrink'], 'synonym_keys', array['haferdrink'],
                     'area_id', tests.fx('area_a'), 'diet', 'vegan', 'is_pantry', false),
  '{"name": "Haferdrink Barista", "name_key": "haferdrink barista", "area_id": null, "is_pantry": true,
    "default_shopping_rule": "recipeAmount", "needs_review": true}',
  tests.fx('anna'), tests.fx('ben'), false);

select * from tests.tenant_isolation('stores',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'name', 'Rewe',
                     'area_order', array[tests.fx('area_a')], 'hidden_area_ids', '{}'::uuid[]),
  jsonb_build_object('name', 'Rewe City', 'hidden_area_ids', array[tests.fx('area_a')]),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('recipes',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'title', 'Shakshuka',
                     'servings', 2, 'course', 'main', 'tags', array['schnell'],
                     'variants', '[]'::jsonb, 'ingredients', '[]'::jsonb, 'steps', '[]'::jsonb),
  '{"title": "Shakshuka mit Feta", "servings": 4, "notes": "Mit Brot"}',
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('restaurants',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'name', 'Thai Garden',
                     'maps_url', 'https://maps.app.goo.gl/abc', 'lat', 50.94, 'lng', 6.96),
  '{"price_level": 2, "notes": "Mittags günstig"}',
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('absences',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'member_id', tests.fx('anna'),
                     'from_on', '2026-12-01', 'to_on', '2026-12-03', 'note', 'Dienstreise'),
  '{"to_on": "2026-12-04"}',
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('feedback',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'kind', 'problem',
                     'text', 'Liste springt'),
  '{"status": "accepted", "reason": "Nachvollziehbar"}',
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('chores',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'title', 'Fenster putzen',
                     'recurrence', '{"type": "monthly", "day": 1}'::jsonb,
                     'assignment', jsonb_build_object('type', 'rotating', 'memberIds', array[tests.fx('anna'), tests.fx('carla')]),
                     'effort', 2, 'next_assignee_id', tests.fx('anna'), 'active_months', array[3, 4, 5]),
  jsonb_build_object('effort', 3, 'next_assignee_id', tests.fx('carla')),
  tests.fx('anna'), tests.fx('ben'));

-- ---------- chore_events: select and update (chore_id, done_by) only (spec 0011, AC-055) ----------
select tests.authenticate_as(tests.fx('anna'));
select is(tests.affected(format('select 1 from public.chore_events where id = %L', tests.fx('event_a'))), 1,
  'AC-055 chore_events: a member reads the events of her household');
select is(
  tests.affected(format('update public.chore_events set done_by = %L where id = %L', tests.fx('carla'), tests.fx('event_a'))), 1,
  'AC-059 chore_events: a member changes "Erledigt von" directly');
select throws_ok(format($$ update public.chore_events set title = 'X' where id = %L $$, tests.fx('event_a')),
  '42501', null, 'AC-055 chore_events: a member cannot change the title (it comes from the chore)');
select throws_ok(format($$ update public.chore_events set prev_next_due_on = '2020-01-01', prev_recorded = true where id = %L $$,
                        tests.fx('event_a')),
  '42501', null, 'spec 0011 chore_events: a member cannot forge the recorded state before an event');
select throws_ok(
  format($$ insert into public.chore_events (household_id, chore_id, title, kind, done_on, done_by)
            values (%L, %L, 'Bad putzen', 'done', current_date, %L) $$, tests.fx('home_a'), tests.fx('chore_a'), tests.fx('anna')),
  '42501', null, 'spec 0011 chore_events: a member cannot insert an event directly, even in her household');
select throws_ok(format('delete from public.chore_events where id = %L', tests.fx('event_a')),
  '42501', null, 'spec 0011 chore_events: a member cannot delete an event directly, even in her household');
select throws_ok(format('update public.chore_events set household_id = %L where id = %L', tests.fx('home_b'), tests.fx('event_a')),
  '42501', null, 'AC-011 chore_events: a member cannot move an event to another household');

select tests.authenticate_as(tests.fx('ben'));
select is(tests.affected(format('select 1 from public.chore_events where household_id = %L', tests.fx('home_a'))), 0,
  'AC-055 chore_events: a member of another household reads no events');
select is(
  tests.affected(format('update public.chore_events set done_by = null where id = %L', tests.fx('event_a'))), 0,
  'AC-055 chore_events: a member of another household changes nothing');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(jsonb_build_object('kind', 'remove_chore_event', 'id', tests.fx('event_a')))),
  '42501', 'not_member', 'AC-055 remove_chore_event: a member of another household cannot remove in it');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_b'),
         jsonb_build_array(jsonb_build_object('kind', 'remove_chore_event', 'id', tests.fx('event_a')))),
  'P0002', 'chore_event_not_found', 'AC-055 remove_chore_event: an event of another household is not found');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_b'),
         jsonb_build_array(jsonb_build_object('kind', 'complete_chore', 'completion', jsonb_build_object(
           'chore_id', tests.fx('chore_a'), 'event_id', gen_random_uuid(), 'kind', 'done', 'done_on', current_date,
           'done_by', tests.fx('ben'), 'seen', '{}'::jsonb)))),
  'P0002', 'chore_not_found', 'AC-055 complete_chore: a chore of another household is not found');

select tests.authenticate_as_anon();
select throws_ok('select * from public.chore_events', '42501', null, 'AC-055 chore_events: anon cannot read');
select throws_ok(format('update public.chore_events set done_by = null where id = %L', tests.fx('event_a')),
  '42501', null, 'AC-055 chore_events: anon cannot update');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(jsonb_build_object('kind', 'remove_chore_event', 'id', tests.fx('event_a')))),
  '42501', null, 'AC-055 remove_chore_event: anon cannot call apply_changes');

select tests.authenticate_as(tests.fx('anna'));
select public.apply_changes(tests.fx('home_a'),
  jsonb_build_array(jsonb_build_object('kind', 'remove_chore_event', 'id', tests.fx('event_a'))));
select is(
  tests.affected(format($$ select 1 from public.deleted_records where table_name = 'chore_events' and record_id = %L $$,
                        tests.fx('event_a'))), 1,
  'AC-015 chore_events: removing an event leaves a tombstone the member reads');
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format($$ select 1 from public.deleted_records where table_name = 'chore_events' and record_id = %L $$,
                        tests.fx('event_a'))), 0,
  'AC-011 chore_events: a member of another household does not see the tombstone');
select tests.clear_authentication();

select * from tests.tenant_isolation('meal_plan_entries',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'date', '2026-11-21',
                     'slot_id', tests.fx('slot_a'), 'kind', 'recipe', 'recipe_id', tests.fx('recipe_a'),
                     'eater_ids', array[tests.fx('anna')], 'guests', 0, 'portions', 1, 'variants', '[]'::jsonb,
                     'cook_id', tests.fx('anna'), 'sort', 0),
  jsonb_build_object('eater_ids', array[tests.fx('anna'), tests.fx('carla')], 'portions', 2, 'date', null),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('shopping_items',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'),
                     'article_id', tests.fx('article_a2')),
  jsonb_build_object('article_id', tests.fx('article_a3')),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('shopping_contributions',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'item_id', tests.fx('item_a'),
                     'source', '{"kind": "manual"}'::jsonb, 'count', 2),
  '{"count": 3, "note": "Bio"}',
  tests.fx('anna'), tests.fx('ben'));

-- ---------- Tables written only through RPCs ----------
select tests.authenticate_as(tests.fx('anna'));
select public.set_recipe_favorite(tests.fx('recipe_a'), true);
select public.set_recipe_rating(tests.fx('recipe_a'), 4::numeric);
select public.set_restaurant_favorite(tests.fx('restaurant_a'), true);
select public.set_restaurant_rating(tests.fx('restaurant_a'), 5::numeric);
select public.set_feedback_vote(tests.fx('feedback_a'), true);
select tests.clear_authentication();

select * from tests.rpc_only_isolation('recipe_favorites',
  jsonb_build_object('household_id', tests.fx('home_a'), 'recipe_id', tests.fx('recipe_a'), 'member_id', tests.fx('carla')),
  tests.fx('anna'), tests.fx('ben'));
select * from tests.rpc_only_isolation('recipe_ratings',
  jsonb_build_object('household_id', tests.fx('home_a'), 'recipe_id', tests.fx('recipe_a'), 'member_id', tests.fx('carla'),
                     'stars', 1),
  tests.fx('anna'), tests.fx('ben'));
select * from tests.rpc_only_isolation('restaurant_favorites',
  jsonb_build_object('household_id', tests.fx('home_a'), 'restaurant_id', tests.fx('restaurant_a'),
                     'member_id', tests.fx('carla')),
  tests.fx('anna'), tests.fx('ben'));
select * from tests.rpc_only_isolation('restaurant_ratings',
  jsonb_build_object('household_id', tests.fx('home_a'), 'restaurant_id', tests.fx('restaurant_a'),
                     'member_id', tests.fx('carla'), 'stars', 1),
  tests.fx('anna'), tests.fx('ben'));
select * from tests.rpc_only_isolation('feedback_votes',
  jsonb_build_object('household_id', tests.fx('home_a'), 'feedback_id', tests.fx('feedback_a'),
                     'member_id', tests.fx('carla')),
  tests.fx('anna'), tests.fx('ben'));

select * from finish();
rollback;
