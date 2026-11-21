-- Collections (spec 0009, plan E1–E4, E11): a collection is a row of recipes with the kind
-- 'collection'. The kind never changes, and a collection has none of the recipe fields (course,
-- time, cuisine, tags, variants, steps, lead time, variant ingredients). collection_recipes holds
-- the recipes a collection contains: only recipes, only in collections, at most 50, never across
-- households. delete_recipe / restore_recipe take the rows along. Covers AC-009, AC-010, AC-011,
-- AC-032, AC-033 (server), the conflict table and the negative tests of the risk table in plan.md.
begin;
\ir _helpers.psql
select plan(112);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The SQL text of an apply_changes call, for throws_ok / lives_ok.
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
-- An apply_changes insert op for a collection_recipes row (new id).
create function tests.link_op(p_collection text, p_recipe text, p_extra jsonb default '{}') returns jsonb
language sql volatile
as $$ select jsonb_build_object('kind', 'insert', 'table', 'collection_recipes', 'row',
       jsonb_build_object('id', gen_random_uuid(), 'collection_id', tests.fx(p_collection),
                          'recipe_id', tests.fx(p_recipe)) || p_extra) $$;
-- The SQL text of a direct insert into collection_recipes (server-set id).
create function tests.link_sql(p_household text, p_collection text, p_recipe text, p_extra jsonb default '{}')
returns text language sql stable
as $$
  select format(
    'insert into public.collection_recipes (%1$s) select %1$s from jsonb_populate_record(null::public.collection_recipes, %2$L::jsonb)',
    (select string_agg(format('%I', k), ', ') from jsonb_object_keys(v) k), v)
  from (select jsonb_build_object('household_id', tests.fx(p_household), 'collection_id', tests.fx(p_collection),
                                  'recipe_id', tests.fx(p_recipe)) || p_extra as v) x
$$;
-- The SQL text of an apply_changes call that creates a collection in home_a with extra columns.
create function tests.collection_sql(p_extra jsonb) returns text language sql volatile
as $$ select tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'recipes', 'row',
       jsonb_build_object('id', gen_random_uuid(), 'title', 'Testsammlung', 'kind', 'collection', 'course', null)
       || p_extra))) $$;
create function tests.delete_sql(p_recipe text) returns text language sql stable
as $$ select format('select public.delete_recipe(%L, current_date)', tests.fx(p_recipe)) $$;
create function tests.restore_sql(p_recipe text) returns text language sql stable
as $$ select format('select public.restore_recipe(%L)', tests.fx(p_recipe)) $$;
-- The rows of a collection as comparable JSON, without the server timestamps.
create function tests.links(p_collection text) returns jsonb language sql stable
as $$ select coalesce(jsonb_agg(to_jsonb(c) - 'created_at' - 'updated_at' order by c.sort, c.id), '[]')
      from public.collection_recipes c where c.collection_id = tests.fx(p_collection) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG', array[tests.fx('ben')]));
insert into fx (key) values
  ('wurst'), ('kartoffelsalat'), ('grillgemuese'), ('tzatziki'), ('pizza'), ('extra'),
  ('grillabend'), ('sommerbuffet'), ('raclette'), ('gross'), ('wg_abend'),
  ('l_g_kartoffel'), ('l_g_gemuese'), ('l_s_kartoffel'), ('l_wg_pizza'), ('l_r_tzatziki'),
  ('nudelsalat'), ('new_collection'), ('bad_collection');

insert into public.articles (id, household_id, name, name_key)
values (tests.fx('wurst'), tests.fx('home_a'), 'Bratwurst', 'bratwurst');
insert into public.recipes (id, household_id, title, servings, variants) values
  (tests.fx('kartoffelsalat'), tests.fx('home_a'), 'Kartoffelsalat', 4, '[]'),
  (tests.fx('grillgemuese'), tests.fx('home_a'), 'Grillgemüse', 4,
   '[{"id": "v-vegan", "name": "vegan", "isDefault": true}, {"id": "v-halloumi", "name": "mit Halloumi"}]'),
  (tests.fx('tzatziki'), tests.fx('home_a'), 'Tzatziki', 4, '[]'),
  (tests.fx('extra'), tests.fx('home_a'), 'Füller 50', 2, '[]'),
  (tests.fx('pizza'), tests.fx('home_b'), 'Pizza', 2, '[]');
insert into public.recipes (id, household_id, title, kind, course, servings, ingredients) values
  (tests.fx('grillabend'), tests.fx('home_a'), 'Grillabend', 'collection', null, 6,
   jsonb_build_array(jsonb_build_object('id', 'i1', 'articleId', tests.fx('wurst')::text, 'qty', 12))),
  (tests.fx('sommerbuffet'), tests.fx('home_a'), 'Sommerbuffet', 'collection', null, 10, '[]'),
  (tests.fx('raclette'), tests.fx('home_a'), 'Raclette-Abend', 'collection', null, 4, '[]'),
  (tests.fx('gross'), tests.fx('home_a'), 'Großes Buffet', 'collection', null, 20, '[]'),
  (tests.fx('wg_abend'), tests.fx('home_b'), 'WG-Abend', 'collection', null, 4, '[]');
insert into public.collection_recipes (id, household_id, collection_id, recipe_id, servings, variant_id, sort) values
  (tests.fx('l_g_kartoffel'), tests.fx('home_a'), tests.fx('grillabend'), tests.fx('kartoffelsalat'), null, null, 0),
  (tests.fx('l_g_gemuese'), tests.fx('home_a'), tests.fx('grillabend'), tests.fx('grillgemuese'), 4, 'v-vegan', 1),
  (tests.fx('l_s_kartoffel'), tests.fx('home_a'), tests.fx('sommerbuffet'), tests.fx('kartoffelsalat'), 8, null, 0),
  (tests.fx('l_wg_pizza'), tests.fx('home_b'), tests.fx('wg_abend'), tests.fx('pizza'), null, null, 0);
-- Großes Buffet holds 49 filler recipes and Tzatziki: 50, the limit (E15).
insert into public.recipes (household_id, title)
select tests.fx('home_a'), 'Füller ' || n from generate_series(1, 49) n;
insert into public.collection_recipes (household_id, collection_id, recipe_id, sort)
select tests.fx('home_a'), tests.fx('gross'), r.id, row_number() over (order by r.title)
from public.recipes r where r.household_id = tests.fx('home_a') and r.title like 'Füller %' and r.id <> tests.fx('extra');
insert into public.collection_recipes (household_id, collection_id, recipe_id, sort)
values (tests.fx('home_a'), tests.fx('gross'), tests.fx('tzatziki'), 50);

-- The contained recipes changed long ago, so "unchanged" includes updated_at (AC-032).
alter table public.recipes disable trigger recipes_set_timestamps;
update public.recipes set updated_at = '2026-01-15 09:00+00'
where id in (tests.fx('kartoffelsalat'), tests.fx('grillgemuese'));
alter table public.recipes enable trigger recipes_set_timestamps;

-- ===================== The kind of a recipe (E2, E3) =====================
select tests.authenticate_as(tests.fx('enrico'));
select public.apply_changes(tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object('id', tests.fx('nudelsalat'), 'title', 'Nudelsalat'))));
select is((select kind from public.recipes where id = tests.fx('nudelsalat')), 'recipe',
  'E2 recipes: a new recipe without a kind is a recipe');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('title', 'X', 'kind', 'other')))),
  '23514', null, 'E2 recipes: an unknown kind is rejected');
select lives_ok(tests.collection_sql('{}'),
  'E2 apply_changes: a member creates a collection with kind collection and course null');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('title', 'X', 'kind', 'collection')))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection without course null keeps the default course and is rejected');
select throws_ok(tests.collection_sql('{"course": "main"}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a course is rejected');
select throws_ok(tests.collection_sql('{"total_minutes": 30}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a time is rejected');
select throws_ok(tests.collection_sql('{"cuisine": "Grill"}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a cuisine is rejected');
select throws_ok(tests.collection_sql('{"tags": ["sommer"]}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a tag is rejected');
select throws_ok(tests.collection_sql('{"variants": [{"id": "v1", "name": "vegan", "isDefault": true}]}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a variant is rejected');
select throws_ok(tests.collection_sql('{"steps": [{"id": "s1", "text": "Kohle anzünden"}]}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a step is rejected');
select throws_ok(tests.collection_sql('{"lead_time": {"text": "Kohle kaufen"}}'),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a collection with a lead time is rejected');
select throws_ok(
  tests.collection_sql(jsonb_build_object('ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'i1', 'articleId', tests.fx('wurst')::text, 'variantId', 'v1')))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: an own ingredient of a collection with a variantId is rejected');
select lives_ok(
  tests.collection_sql(jsonb_build_object('ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'i1', 'articleId', tests.fx('wurst')::text, 'qty', 12, 'variantId', null)))),
  'E3 recipes: a collection has own ingredients (a null variantId is no variant)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('title', 'X', 'course', null)))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a recipe without a course is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'recipes',
    'id', tests.fx('kartoffelsalat'), 'changes', jsonb_build_object('course', null)))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a patch cannot clear the course of a recipe');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'recipes',
    'id', tests.fx('grillabend'), 'changes', jsonb_build_object('total_minutes', 30)))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'E3 recipes: a patch cannot give a collection a time');
select throws_ok(format('update public.recipes set kind = %L where id = %L', 'recipe', tests.fx('grillabend')),
  '42501', null, 'E2 recipes: a member cannot update the kind directly');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'recipes',
    'id', tests.fx('grillabend'), 'changes', jsonb_build_object('kind', 'recipe')))),
  '22023', 'invalid_change', 'E2 apply_changes: the kind is not patchable');
select tests.clear_authentication();
select throws_ok(
  format($$ update public.recipes set kind = 'recipe', course = 'main' where id = %L $$, tests.fx('grillabend')),
  '22023', 'kind_immutable', 'E2 recipes: a collection never becomes a recipe, not even for a definer path');
select throws_ok(
  format($$ update public.recipes set kind = 'collection', course = null where id = %L $$, tests.fx('kartoffelsalat')),
  '22023', 'kind_immutable', 'E2 recipes: a recipe never becomes a collection, not even for a definer path');
select results_eq(
  format($$ select kind from public.recipes where id in (%L, %L) order by title $$,
         tests.fx('grillabend'), tests.fx('kartoffelsalat')),
  $$ values ('collection'), ('recipe') $$,
  'E2 recipes: the refused changes left both kinds as they were');

-- ===================== collection_recipes: tenant isolation (AC-011) =====================
select * from tests.tenant_isolation('collection_recipes',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'), 'collection_id', tests.fx('grillabend'),
                     'recipe_id', tests.fx('tzatziki'), 'servings', 6, 'variant_id', null, 'sort', 2),
  '{"servings": 8, "variant_id": "v1", "sort": 3}',
  tests.fx('enrico'), tests.fx('ben'));

-- updated_at is the server's on every update.
alter table public.collection_recipes disable trigger collection_recipes_set_timestamps;
update public.collection_recipes set updated_at = '2026-01-15 09:00+00' where id = tests.fx('l_wg_pizza');
alter table public.collection_recipes enable trigger collection_recipes_set_timestamps;
select tests.authenticate_as(tests.fx('ben'));
select public.apply_changes(tests.fx('home_b'), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'collection_recipes', 'id', tests.fx('l_wg_pizza'), 'changes', '{"servings": 3}'::jsonb)));
select tests.clear_authentication();
select is((select updated_at from public.collection_recipes where id = tests.fx('l_wg_pizza')), now(),
  'E4 collection_recipes: an update sets updated_at to the server time');

-- ===================== AC-009: only recipes, only in collections =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.link_sql('home_a', 'grillabend', 'raclette'),
  '23514', 'collection_recipe_kind_invalid', 'AC-009 collection_recipes: a collection cannot contain a collection');
select throws_ok(tests.link_sql('home_a', 'kartoffelsalat', 'tzatziki'),
  '23514', 'collection_recipe_kind_invalid', 'AC-009 collection_recipes: a recipe cannot contain recipes');
select throws_ok(tests.link_sql('home_a', 'grillabend', 'grillabend'),
  '23514', 'collection_recipe_kind_invalid', 'AC-009 collection_recipes: a collection cannot contain itself');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('grillabend', 'raclette'))),
  '23514', 'collection_recipe_kind_invalid', 'AC-009 apply_changes: a collection in a collection is rejected');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('kartoffelsalat', 'tzatziki'))),
  '23514', 'collection_recipe_kind_invalid', 'AC-009 apply_changes: a recipe as container is rejected');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('grillabend', 'grillabend'))),
  '23514', 'collection_recipe_kind_invalid', 'AC-009 apply_changes: a collection in itself is rejected');
select tests.clear_authentication();
select results_eq(
  format($$ select recipe_id from public.collection_recipes where collection_id = %L order by sort $$,
         tests.fx('grillabend')),
  format($$ values (%L::uuid), (%L::uuid) $$, tests.fx('kartoffelsalat'), tests.fx('grillgemuese')),
  'AC-009: Grillabend is unchanged');

-- ===================== AC-010: at most once per collection =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.link_sql('home_a', 'grillabend', 'kartoffelsalat'),
  '23505', null, 'AC-010 collection_recipes: the same recipe twice in a collection is rejected');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('grillabend', 'kartoffelsalat'))),
  '23505', null, 'AC-010 apply_changes: a second device adding the same recipe is rejected');

-- ===================== AC-011: never across households =====================
select throws_ok(tests.link_sql('home_a', 'grillabend', 'pizza'),
  '23503', null, 'AC-011 collection_recipes: a member cannot put another household''s recipe into her collection');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('grillabend', 'pizza'))),
  '23503', null, 'AC-011 apply_changes: … nor through apply_changes');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.link_sql('home_b', 'grillabend', 'pizza'),
  '23503', null, 'AC-011 collection_recipes: WG cannot put Pizza into Grillabend from its own household');
select throws_ok(tests.link_sql('home_b', 'wg_abend', 'kartoffelsalat'),
  '23503', null, 'AC-011 collection_recipes: WG cannot put a recipe of Enrico & Nadja into its own collection');
select throws_ok(tests.apply_sql('home_b', jsonb_build_array(tests.link_op('grillabend', 'pizza'))),
  '23503', null, 'AC-011 apply_changes: WG cannot put Pizza into Grillabend through apply_changes');
select throws_ok(tests.apply_sql('home_b', jsonb_build_array(tests.link_op('wg_abend', 'kartoffelsalat'))),
  '23503', null, 'AC-011 apply_changes: … nor a foreign recipe into its own collection');
select throws_ok(tests.link_sql('home_a', 'grillabend', 'tzatziki'),
  '42501', null, 'AC-011 collection_recipes: WG cannot insert a row into Enrico & Nadja''s household');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('grillabend', 'tzatziki'))),
  '42501', 'not_member', 'AC-011 apply_changes: WG cannot write into Enrico & Nadja''s household');
select is(
  tests.affected(format('select 1 from public.collection_recipes where collection_id = %L', tests.fx('grillabend'))), 0,
  'AC-011 collection_recipes: WG does not see what Grillabend contains');
select is(
  tests.affected(format('update public.collection_recipes set servings = 1 where collection_id = %L', tests.fx('grillabend'))),
  0, 'AC-011 collection_recipes: WG changes nothing in Grillabend');
select is(
  tests.affected(format('delete from public.collection_recipes where collection_id = %L', tests.fx('grillabend'))),
  0, 'AC-011 collection_recipes: WG deletes nothing from Grillabend');
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'collection_recipes',
    'id', tests.fx('l_g_gemuese'), 'changes', '{"servings": 1}'::jsonb))),
  'P0002', 'row_not_found', 'AC-011 apply_changes: a patch of Grillabend''s row from WG finds no row');
select lives_ok(
  tests.apply_sql('home_b', jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'collection_recipes',
    'id', tests.fx('l_g_gemuese')))),
  'AC-011 apply_changes: a delete of Grillabend''s row from WG is a no-op');
select tests.clear_authentication();
select is(tests.links('grillabend'),
  jsonb_build_array(
    jsonb_build_object('id', tests.fx('l_g_kartoffel'), 'household_id', tests.fx('home_a'),
                       'collection_id', tests.fx('grillabend'), 'recipe_id', tests.fx('kartoffelsalat'),
                       'servings', null, 'variant_id', null, 'sort', 0),
    jsonb_build_object('id', tests.fx('l_g_gemuese'), 'household_id', tests.fx('home_a'),
                       'collection_id', tests.fx('grillabend'), 'recipe_id', tests.fx('grillgemuese'),
                       'servings', 4, 'variant_id', 'v-vegan', 'sort', 1)),
  'AC-011: Grillabend still holds both rows, unchanged');

-- ===================== Fixed columns and values =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('update public.collection_recipes set collection_id = %L where id = %L', tests.fx('sommerbuffet'), tests.fx('l_g_gemuese')),
  '42501', null, 'E4 collection_recipes: a row cannot move to another collection');
select throws_ok(
  format('update public.collection_recipes set recipe_id = %L where id = %L', tests.fx('tzatziki'), tests.fx('l_g_gemuese')),
  '42501', null, 'E4 collection_recipes: a row cannot point to another recipe');
select throws_ok(
  format('update public.collection_recipes set household_id = %L where id = %L', tests.fx('home_b'), tests.fx('l_g_gemuese')),
  '42501', null, 'E4 collection_recipes: a row cannot move to another household');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'collection_recipes',
    'id', tests.fx('l_g_gemuese'), 'changes', jsonb_build_object('collection_id', tests.fx('sommerbuffet'))))),
  '22023', 'invalid_change', 'E4 apply_changes: collection_id is not patchable');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'patch', 'table', 'collection_recipes',
    'id', tests.fx('l_g_gemuese'), 'changes', jsonb_build_object('recipe_id', tests.fx('tzatziki'))))),
  '22023', 'invalid_change', 'E4 apply_changes: recipe_id is not patchable');
select throws_ok(tests.link_sql('home_a', 'raclette', 'tzatziki', '{"servings": 0}'),
  '23514', null, 'E4 collection_recipes: 0 servings are rejected');
select throws_ok(tests.link_sql('home_a', 'raclette', 'tzatziki', '{"servings": 101}'),
  '23514', null, 'E4 collection_recipes: 101 servings are rejected');
select throws_ok(tests.link_sql('home_a', 'raclette', 'tzatziki', '{"variant_id": ""}'),
  '23514', null, 'E4 collection_recipes: an empty variant id is rejected');
select throws_ok(tests.link_sql('home_a', 'raclette', 'tzatziki', jsonb_build_object('variant_id', repeat('v', 65))),
  '23514', null, 'E4 collection_recipes: a variant id of 65 characters is rejected');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    tests.link_op('raclette', 'tzatziki', jsonb_build_object('id', tests.fx('l_r_tzatziki'), 'servings', 100,
                                                             'variant_id', repeat('v', 64), 'sort', 0)))),
  'E4 apply_changes: 100 servings and a variant id of 64 characters are allowed');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'collection_recipes',
    'id', tests.fx('l_r_tzatziki')))),
  'E12 apply_changes: a member removes a recipe from a collection');
select is(tests.links('raclette'), '[]'::jsonb, 'E12 apply_changes: … and Raclette-Abend is empty again');

-- ===================== At most 50 recipes (E15) =====================
select throws_ok(tests.link_sql('home_a', 'gross', 'kartoffelsalat'),
  '23514', 'too_many_collection_recipes', 'E15 collection_recipes: a 51st recipe is rejected');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('gross', 'kartoffelsalat'))),
  '23514', 'too_many_collection_recipes', 'E15 apply_changes: … also through apply_changes');
select is(jsonb_array_length(tests.links('gross')), 50, 'E15: Großes Buffet still holds 50 recipes');

-- ===================== One call, all or nothing (E12) =====================
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object(
      'id', tests.fx('new_collection'), 'title', 'Picknick', 'kind', 'collection', 'course', null)),
    tests.link_op('new_collection', 'grillgemuese'))),
  'AC-008 apply_changes: a new collection and its first row in one call');
select results_eq(
  format($$ select r.kind, c.recipe_id from public.recipes r join public.collection_recipes c on c.collection_id = r.id
            where r.id = %L $$, tests.fx('new_collection')),
  format($$ values ('collection', %L::uuid) $$, tests.fx('grillgemuese')),
  'AC-008 apply_changes: … both are stored');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object(
      'id', tests.fx('bad_collection'), 'title', 'Kaputt', 'kind', 'collection', 'course', null)),
    tests.link_op('bad_collection', 'grillgemuese'),
    tests.link_op('bad_collection', 'raclette'))),
  '23514', 'collection_recipe_kind_invalid', 'E12 apply_changes: an invalid row at the end fails the call');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.recipes where id = tests.fx('bad_collection'))
  + (select count(*)::int from public.collection_recipes where collection_id = tests.fx('bad_collection')),
  0, 'E12 apply_changes: … and nothing of it is stored');

-- ===================== AC-032: deleting a collection =====================
create temp table before_links on commit drop as
  select to_jsonb(c) as doc, c.collection_id from public.collection_recipes c
  where c.collection_id in (tests.fx('grillabend'), tests.fx('sommerbuffet'));
create temp table before_recipes on commit drop as
  select r.id, to_jsonb(r) as doc from public.recipes r
  where r.id in (tests.fx('kartoffelsalat'), tests.fx('grillgemuese'), tests.fx('grillabend'));
create temp table before_contents on commit drop as
  select k, tests.links(k) as doc from unnest(array['grillabend', 'sommerbuffet']) k;

select tests.authenticate_as(tests.fx('enrico'));
select is((select public.delete_recipe(tests.fx('grillabend'), current_date)),
  '{"converted": 0, "removed": 0, "collections": 0}'::jsonb,
  'AC-032 delete_recipe: deleting a collection removes it from no collection');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.collection_recipes where collection_id = tests.fx('grillabend'))
  + (select count(*)::int from public.recipes where id = tests.fx('grillabend')),
  0, 'AC-032 delete_recipe: the collection and its rows are gone');
select is(
  (select count(*)::int from public.deleted_records
   where household_id = tests.fx('home_a') and table_name = 'collection_recipes'
     and record_id in (tests.fx('l_g_kartoffel')::text, tests.fx('l_g_gemuese')::text)),
  2, 'AC-032 delete_recipe: both rows leave a tombstone, so Nadja''s device drops them');
select is(
  (select jsonb_agg(to_jsonb(r) order by r.id) from public.recipes r
   where r.id in (tests.fx('kartoffelsalat'), tests.fx('grillgemuese'))),
  (select jsonb_agg(doc order by id) from before_recipes where id <> tests.fx('grillabend')),
  'AC-032 delete_recipe: Kartoffelsalat and Grillgemüse are unchanged, including updated_at');
select is(tests.links('sommerbuffet'), (select doc from before_contents where k = 'sommerbuffet'),
  'AC-032 delete_recipe: other collections are untouched');
select is(
  (select jsonb_agg(x order by x ->> 'sort') from private.recipe_deletions d,
          jsonb_array_elements(d.snapshot -> 'collection_recipes') x
   where d.recipe_id = tests.fx('grillabend')),
  (select jsonb_agg(doc order by doc ->> 'sort') from before_links where collection_id = tests.fx('grillabend')),
  'E11 delete_recipe: the snapshot holds the collection''s rows in full');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_recipe(tests.fx('grillabend'))), true, 'AC-032 restore_recipe: returns true');
select tests.clear_authentication();
select is(
  (select to_jsonb(r) - 'updated_at' from public.recipes r where r.id = tests.fx('grillabend')),
  (select doc - 'updated_at' from before_recipes where id = tests.fx('grillabend')),
  'AC-032 restore_recipe: Grillabend is back as a collection, with its own ingredients');
select is(tests.links('grillabend'), (select doc from before_contents where k = 'grillabend'),
  'AC-032 restore_recipe: … and holds both recipes again, with servings, variant and order');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('grillabend'), 'P0002', 'recipe_not_restorable',
  'E11 restore_recipe: a second call is not restorable');

-- ===================== AC-033: deleting a contained recipe =====================
select is((select public.delete_recipe(tests.fx('kartoffelsalat'), current_date)),
  '{"converted": 0, "removed": 0, "collections": 2}'::jsonb,
  'AC-033 delete_recipe: Kartoffelsalat is removed from 2 collections');
select throws_ok(tests.link_sql('home_a', 'grillabend', 'kartoffelsalat'),
  '23503', null, 'E11 collection_recipes: putting a deleted recipe into a collection fails with 23503');
select throws_ok(tests.apply_sql('home_a', jsonb_build_array(tests.link_op('sommerbuffet', 'kartoffelsalat'))),
  '23503', null, 'E11 apply_changes: … also through apply_changes');
select tests.clear_authentication();
select results_eq(
  format($$ select record_id, count(*)::int from public.deleted_records
            where household_id = %L and table_name = 'collection_recipes' and record_id in (%L, %L)
            group by record_id order by record_id $$,
         tests.fx('home_a'), tests.fx('l_g_kartoffel'), tests.fx('l_s_kartoffel')),
  format($$ select id::text, case when key = 'l_g_kartoffel' then 2 else 1 end from fx
            where key in ('l_g_kartoffel', 'l_s_kartoffel') order by id::text $$),
  'AC-033 delete_recipe: both rows of Kartoffelsalat leave a tombstone');
select results_eq(
  format($$ select r.title, (select array_agg(c.recipe_id) from public.collection_recipes c where c.collection_id = r.id)
            from public.recipes r where r.id in (%L, %L) order by r.title $$,
         tests.fx('grillabend'), tests.fx('sommerbuffet')),
  format($$ values ('Grillabend', array[%L::uuid]), ('Sommerbuffet', null::uuid[]) $$, tests.fx('grillgemuese')),
  'AC-033 delete_recipe: Grillabend holds only Grillgemüse, both collections stay');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_recipe(tests.fx('kartoffelsalat'))), true, 'AC-033 restore_recipe: returns true');
select tests.clear_authentication();
select is(
  (select jsonb_agg(tests.links(k) order by k) from unnest(array['grillabend', 'sommerbuffet']) k),
  (select jsonb_agg(doc order by k) from before_contents),
  'AC-033 restore_recipe: Kartoffelsalat is in both collections again, with its servings, variant and order');

-- ===================== A collection deleted in between =====================
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.delete_recipe(tests.fx('kartoffelsalat'), current_date) ->> 'collections'), '2',
  'E11 delete_recipe: Kartoffelsalat deleted again');
select is((select public.delete_recipe(tests.fx('sommerbuffet'), current_date)),
  '{"converted": 0, "removed": 0, "collections": 0}'::jsonb,
  'E11 delete_recipe: then Sommerbuffet, now empty, is deleted');
select is((select public.restore_recipe(tests.fx('kartoffelsalat'))), true,
  'E11 restore_recipe: Kartoffelsalat comes back although one of its collections is gone');
select tests.clear_authentication();
select is(
  jsonb_build_object('grillabend', tests.links('grillabend'),
                     'sommerbuffet', (select count(*)::int from public.collection_recipes
                                      where collection_id = tests.fx('sommerbuffet'))),
  jsonb_build_object('grillabend', (select doc from before_contents where k = 'grillabend'), 'sommerbuffet', 0),
  'E11 restore_recipe: the row of the deleted collection is left out, the rest is back');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_recipe(tests.fx('sommerbuffet'))), true,
  'E11 restore_recipe: Sommerbuffet comes back as well');
select tests.clear_authentication();
select results_eq(
  format($$ select kind, (select count(*)::int from public.collection_recipes where collection_id = %1$L)
            from public.recipes where id = %1$L $$, tests.fx('sommerbuffet')),
  $$ values ('collection', 0) $$,
  'E11 restore_recipe: … as a collection, with the rows it had when it was deleted');

-- ===================== The limit on "Rückgängig" =====================
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.delete_recipe(tests.fx('tzatziki'), current_date) ->> 'collections'), '1',
  'E11 delete_recipe: Tzatziki is removed from Großes Buffet');
select tests.clear_authentication();
insert into public.collection_recipes (household_id, collection_id, recipe_id, sort)
values (tests.fx('home_a'), tests.fx('gross'), tests.fx('extra'), 51);
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('tzatziki'), '23514', 'too_many_collection_recipes',
  'E15 restore_recipe: a collection that is full again makes the restore fail');
select tests.clear_authentication();
select is(
  jsonb_build_object(
    'tzatziki', (select count(*)::int from public.recipes where id = tests.fx('tzatziki')),
    'snapshot', (select count(*)::int from private.recipe_deletions where recipe_id = tests.fx('tzatziki')),
    'gross', jsonb_array_length(tests.links('gross'))),
  '{"tzatziki": 0, "snapshot": 1, "gross": 50}'::jsonb,
  'E15 restore_recipe: … nothing is restored halfway and the snapshot stays');

-- ===================== Counted per household =====================
create temp table links_a_before on commit drop as
  select jsonb_agg(to_jsonb(c) order by c.id) as doc from public.collection_recipes c
  where c.household_id = tests.fx('home_a');
select tests.authenticate_as(tests.fx('ben'));
select is((select public.delete_recipe(tests.fx('pizza'), current_date)),
  '{"converted": 0, "removed": 0, "collections": 1}'::jsonb,
  'E11 delete_recipe: WG deletes Pizza, removed from its one collection');
select tests.clear_authentication();
select is(
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.collection_recipes c
   where c.household_id = tests.fx('home_a')),
  (select doc from links_a_before),
  'E11 delete_recipe: WG''s deletion leaves the rows of Enrico & Nadja alone');

-- ===================== Sync =====================
create temp table pulled (r jsonb) on commit drop;
grant select, insert on pulled to authenticated;
select tests.authenticate_as(tests.fx('enrico'));
insert into pulled select public.sync_pull(jsonb_build_object('households',
  jsonb_build_object(tests.fx('home_a'), '{"full": true}'::jsonb, tests.fx('home_b'), '{"full": true}'::jsonb)));
select tests.clear_authentication();
select is(
  (select jsonb_agg(e order by e ->> 'id') from pulled,
          jsonb_array_elements(r -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'collection_recipes') e),
  (select jsonb_agg(to_jsonb(c) order by c.id::text) from public.collection_recipes c
   where c.household_id = tests.fx('home_a')),
  'E4 sync_pull: collection_recipes come with all their columns, only of the caller''s household');
select ok(
  (select jsonb_path_exists(r -> 'households' -> tests.fx('home_a')::text -> 'tombstones',
                            '$[*] ? (@.table == "collection_recipes")') from pulled),
  'E4 sync_pull: the tombstones of collection_recipes reach the device');
select ok(
  (select not (r -> 'households' ? tests.fx('home_b')::text) from pulled),
  'AC-011 sync_pull: WG''s rows never reach Enrico');

-- ===================== The check trigger =====================
select ok(
  (select not p.prosecdef and 'search_path=""' = any (p.proconfig)
   from pg_catalog.pg_proc p where p.oid = 'private.check_collection_recipe()'::regprocedure),
  'E4 check_collection_recipe: security invoker with an empty search_path');
select ok(
  not has_function_privilege('authenticated', 'private.check_collection_recipe()', 'execute'),
  'E4 check_collection_recipe: not callable by the API roles');

select * from finish();
rollback;
