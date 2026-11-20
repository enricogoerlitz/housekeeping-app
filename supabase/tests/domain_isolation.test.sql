-- Tenant isolation of every household-scoped domain table (spec 0003, T3; AC-005, AC-011,
-- AC-015): a member reads and writes her household's rows, a member of another household and a
-- signed-out caller read and change nothing, no row moves between households, and every delete
-- leaves a tombstone only members see. Favourites, ratings and votes are written only by RPCs.
begin;
\ir _helpers.psql
select plan(13 * 15 + 5 * 7);

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
  ('slot_a'), ('area_a'), ('article_a'), ('article_a2'), ('store_a'), ('list_a'), ('list_a2'),
  ('recipe_a'), ('restaurant_a'), ('chore_a'), ('item_a'), ('feedback_a');

-- ---------- Fixtures in household A (as postgres) ----------
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_a'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_a');
insert into public.areas (id, household_id, name, sort)
values (tests.fx('area_a'), tests.fx('home_a'), 'Obst & Gemüse', 0);
insert into public.articles (id, household_id, name, name_key, area_id, diet) values
  (tests.fx('article_a'), tests.fx('home_a'), 'Äpfel', 'apfel', tests.fx('area_a'), 'vegan'),
  (tests.fx('article_a2'), tests.fx('home_a'), 'Birnen', 'birnen', tests.fx('area_a'), 'vegan');
insert into public.stores (id, household_id, name) values (tests.fx('store_a'), tests.fx('home_a'), 'Edeka');
insert into public.shopping_lists (id, household_id, name, is_default) values
  (tests.fx('list_a'), tests.fx('home_a'), 'Standardliste', true),
  (tests.fx('list_a2'), tests.fx('home_a'), 'Grillen', false);
insert into public.recipes (id, household_id, title, servings, course)
values (tests.fx('recipe_a'), tests.fx('home_a'), 'Linsen-Dal', 2, 'main');
insert into public.restaurants (id, household_id, name)
values (tests.fx('restaurant_a'), tests.fx('home_a'), 'Pizzeria Roma');
insert into public.chores (id, household_id, title, recurrence, assignment)
values (tests.fx('chore_a'), tests.fx('home_a'), 'Bad putzen', '{"type": "flexible", "everyDays": 7}',
        '{"type": "anyone"}');
insert into public.shopping_items (id, household_id, list_id, article_id)
values (tests.fx('item_a'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('article_a'));
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
  '{"name": "Haferdrink", "name_key": "haferdrink", "area_id": null, "is_pantry": true}',
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('stores',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'name', 'Rewe',
                     'area_order', array[tests.fx('area_a')], 'hidden_area_ids', '{}'::uuid[]),
  jsonb_build_object('name', 'Rewe City', 'hidden_area_ids', array[tests.fx('area_a')]),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('shopping_lists',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'name', 'Party',
                     'is_default', false, 'store_id', tests.fx('store_a')),
  '{"name": "Feier", "store_id": null}',
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

select * from tests.tenant_isolation('chore_events',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'chore_id', tests.fx('chore_a'),
                     'title', 'Bad putzen', 'kind', 'done', 'done_on', '2026-11-20', 'done_by', tests.fx('anna')),
  jsonb_build_object('done_by', tests.fx('carla')),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('meal_plan_entries',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'date', '2026-11-21',
                     'slot_id', tests.fx('slot_a'), 'kind', 'recipe', 'recipe_id', tests.fx('recipe_a'),
                     'eater_ids', array[tests.fx('anna')], 'guests', 0, 'portions', 1, 'variants', '[]'::jsonb,
                     'cook_id', tests.fx('anna'), 'sort', 0),
  jsonb_build_object('eater_ids', array[tests.fx('anna'), tests.fx('carla')], 'portions', 2, 'date', null),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('shopping_items',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'list_id', tests.fx('list_a'),
                     'article_id', tests.fx('article_a2')),
  jsonb_build_object('list_id', tests.fx('list_a2')),
  tests.fx('anna'), tests.fx('ben'));

select * from tests.tenant_isolation('shopping_contributions',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'item_id', tests.fx('item_a'),
                     'source', '{"kind": "manual"}'::jsonb, 'count', 2),
  '{"count": 3, "note": "Bio"}',
  tests.fx('anna'), tests.fx('ben'));

-- ---------- Tables written only through RPCs ----------
select tests.authenticate_as(tests.fx('anna'));
select public.set_recipe_favorite(tests.fx('recipe_a'), true);
select public.set_recipe_rating(tests.fx('recipe_a'), 4::smallint);
select public.set_restaurant_favorite(tests.fx('restaurant_a'), true);
select public.set_restaurant_rating(tests.fx('restaurant_a'), 5::smallint);
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
