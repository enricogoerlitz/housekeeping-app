-- Deleting a recipe and "Rückgängig" (spec 0008, REQ-012, plan E1–E6): delete_recipe turns the
-- recipe's plan entries up to today into free text and removes the later and the "vorgemerkt"
-- ones, keeps a server-side snapshot in private.deletions, and restore_recipe brings
-- everything back for the person who deleted, within 1 hour. Recipes are deleted only through
-- delete_recipe (no delete grant, apply_changes refuses). Covers AC-043, AC-044, AC-045 (server),
-- AC-021 (foreign household) and the negative tests of the risk table in plan.md.
begin;
\ir _helpers.psql
select plan(84);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The SQL text of a delete_recipe / restore_recipe call, for throws_ok / lives_ok.
create function tests.delete_sql(p_recipe text, p_today date default current_date) returns text language sql stable
as $$ select format('select public.delete_recipe(%L, %L)', tests.fx(p_recipe), p_today) $$;
create function tests.restore_sql(p_recipe text) returns text language sql stable
as $$ select format('select public.restore_recipe(%L)', tests.fx(p_recipe)) $$;
-- An apply_changes call that sets the variants of Lasagne.
create function tests.variants_sql(p_variants jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'recipes', 'id', tests.fx('lasagne'), 'changes', jsonb_build_object('variants', p_variants)))) $$;
-- One plan entry as comparable JSON, without the server timestamps.
create function tests.entry(p_key text) returns jsonb language sql stable
as $$ select to_jsonb(e) - 'created_at' - 'updated_at' from public.meal_plan_entries e where e.id = tests.fx(p_key) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('mia', tests.create_user('mia@example.com', 'Mia')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja'), tests.fx('mia')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('slot_abend'), ('slot_b'), ('halloumi_article'), ('nudeln'), ('halloumi'), ('lasagne'), ('curry'), ('auflauf'),
  ('risotto'), ('pasta_b'), ('e_past'), ('e_today'), ('e_future'), ('e_noted'), ('e_leftovers'), ('e_other'),
  ('e_auflauf'), ('e_b'), ('e_new'), ('photo'),
  ('gulasch'), ('e_g_past'), ('e_g_past_left'), ('e_g_future'), ('e_g_left'), ('e_g_chain'), ('e_g_text'),
  ('e_g_text_left'), ('later_recipe'), ('squat'), ('e_squat');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_abend'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_a');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_b'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home_b');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('halloumi_article'), tests.fx('home_a'), 'Halloumi', 'halloumi'),
  (tests.fx('nudeln'), tests.fx('home_a'), 'Nudeln', 'nudeln');
insert into public.recipes (id, household_id, title, photo_path, servings, variants, ingredients, steps, tags, notes) values
  (tests.fx('halloumi'), tests.fx('home_a'), 'Halloumi-Pfanne',
   tests.fx('home_a') || '/recipes/' || tests.fx('halloumi') || '/' || tests.fx('photo') || '.jpg', 2,
   '[{"id": "v1", "name": "mit Tofu"}, {"id": "v2", "name": "mit Hähnchen"}]',
   jsonb_build_array(jsonb_build_object('id', 'i1', 'articleId', tests.fx('halloumi_article')::text, 'qty', 200,
                                        'unit', 'g', 'prepNote', 'gewürfelt')),
   '[{"id": "s1", "text": "Anbraten"}]', '{schnell}', 'Mit Minze');
insert into public.recipes (id, household_id, title) values
  (tests.fx('lasagne'), tests.fx('home_a'), 'Lasagne'),
  (tests.fx('curry'), tests.fx('home_a'), 'Curry'),
  (tests.fx('risotto'), tests.fx('home_a'), 'Risotto'),
  (tests.fx('pasta_b'), tests.fx('home_b'), 'Pasta');
insert into public.recipes (id, household_id, title, ingredients) values
  (tests.fx('auflauf'), tests.fx('home_a'), 'Nudelauflauf',
   jsonb_build_array(jsonb_build_object('id', 'i1', 'articleId', tests.fx('nudeln')::text)));
insert into public.recipe_ratings (household_id, recipe_id, member_id, stars) values
  (tests.fx('home_a'), tests.fx('halloumi'), tests.fx('enrico'), 4),
  (tests.fx('home_a'), tests.fx('halloumi'), tests.fx('nadja'), 5),
  (tests.fx('home_a'), tests.fx('halloumi'), tests.fx('mia'), 3.5);
insert into public.recipe_favorites (household_id, recipe_id, member_id) values
  (tests.fx('home_a'), tests.fx('halloumi'), tests.fx('nadja')),
  (tests.fx('home_a'), tests.fx('halloumi'), tests.fx('mia'));
insert into public.meal_plan_entries
  (id, household_id, date, slot_id, kind, recipe_id, leftovers_of_entry_id, text, eater_ids, guests, portions,
   variants, cook_id, sort, not_done) values
  (tests.fx('e_past'), tests.fx('home_a'), current_date - 5, tests.fx('slot_abend'), 'recipe', tests.fx('halloumi'),
   null, null, array[tests.fx('enrico'), tests.fx('nadja'), tests.fx('mia')], 1, 4,
   '[{"variantId": "v1", "portions": 2}, {"variantId": "v2", "portions": 2}]', tests.fx('mia'), 0, false),
  (tests.fx('e_leftovers'), tests.fx('home_a'), current_date - 4, tests.fx('slot_abend'), 'leftovers',
   tests.fx('halloumi'), tests.fx('e_past'), null, array[tests.fx('enrico')], 0, 1, '[]', null, 0, false),
  (tests.fx('e_today'), tests.fx('home_a'), current_date, tests.fx('slot_abend'), 'recipe', tests.fx('halloumi'),
   null, null, array[tests.fx('enrico'), tests.fx('nadja')], 0, 2, '[{"variantId": "v1", "portions": 2}]',
   tests.fx('enrico'), 1, true),
  (tests.fx('e_future'), tests.fx('home_a'), current_date + 3, tests.fx('slot_abend'), 'recipe', tests.fx('halloumi'),
   null, null, array[tests.fx('enrico'), tests.fx('mia')], 2, 4, '[{"variantId": "v2", "portions": 4}]',
   tests.fx('mia'), 0, false),
  (tests.fx('e_noted'), tests.fx('home_a'), null, tests.fx('slot_abend'), 'recipe', tests.fx('halloumi'),
   null, null, array[tests.fx('nadja'), tests.fx('mia')], 0, 2, '[]', null, 0, false),
  (tests.fx('e_other'), tests.fx('home_a'), current_date + 3, tests.fx('slot_abend'), 'recipe', tests.fx('lasagne'),
   null, null, '{}', 0, 2, '[]', null, 1, false),
  (tests.fx('e_auflauf'), tests.fx('home_a'), current_date + 1, tests.fx('slot_abend'), 'recipe', tests.fx('auflauf'),
   null, null, '{}', 0, 2, '[]', null, 2, false),
  (tests.fx('e_b'), tests.fx('home_b'), current_date + 2, tests.fx('slot_b'), 'recipe', tests.fx('pasta_b'),
   null, null, array[tests.fx('ben')], 0, 1, '[]', null, 0, false);

-- Halloumi-Pfanne was created long ago (follow-up of T1: restore keeps created_at).
alter table public.recipes disable trigger recipes_set_timestamps;
update public.recipes set created_at = '2026-01-15 09:00+00' where id = tests.fx('halloumi');
alter table public.recipes enable trigger recipes_set_timestamps;

-- The state before any deletion, to compare after "Rückgängig".
create temp table original_recipe on commit drop as
  select to_jsonb(r) - 'created_at' - 'updated_at' as doc from public.recipes r where r.id = tests.fx('halloumi');
create temp table original_entries on commit drop as
  select e.id, to_jsonb(e) - 'created_at' - 'updated_at' as doc
  from public.meal_plan_entries e where e.recipe_id = tests.fx('halloumi');
create temp table household_b_before on commit drop as
  select (select jsonb_agg(to_jsonb(r) order by r.id) from public.recipes r where r.household_id = tests.fx('home_b'))
         || (select jsonb_agg(to_jsonb(e) order by e.id) from public.meal_plan_entries e
             where e.household_id = tests.fx('home_b')) as doc;

-- ===================== Signed out =====================
select tests.authenticate_as_anon();
select throws_ok(tests.delete_sql('halloumi'), '42501', null, 'T1 delete_recipe: anon cannot call it');
select throws_ok(tests.restore_sql('halloumi'), '42501', null, 'T1 restore_recipe: anon cannot call it');

-- ===================== Foreign household (AC-021) =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.delete_sql('halloumi'), 'P0002', 'recipe_not_found',
  'AC-021 delete_recipe: a member of another household gets recipe_not_found');
select throws_ok(format('select public.delete_recipe(%L, current_date)', gen_random_uuid()), 'P0002', 'recipe_not_found',
  'AC-021 delete_recipe: a missing recipe gives the same answer (existence is not revealed)');
select throws_ok(tests.restore_sql('halloumi'), 'P0002', 'recipe_not_restorable',
  'AC-021 restore_recipe: without a snapshot of the caller nothing is restorable');

-- ===================== Around the RPC (E2) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format('delete from public.recipes where id = %L', tests.fx('lasagne')), '42501', null,
  'E2 recipes: a member cannot delete a recipe directly');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'recipes', 'id', tests.fx('lasagne')))),
  '22023', 'invalid_change', 'E2 apply_changes: recipes cannot be deleted through apply_changes');
select throws_ok('select * from private.deletions', '42501', null,
  'E4 deletions: authenticated cannot read the snapshots');
select throws_ok(tests.delete_sql('halloumi', current_date - 2), '22023', 'invalid_value',
  'E3 delete_recipe: a device date two days back is rejected');
select throws_ok(tests.delete_sql('halloumi', current_date + 2), '22023', 'invalid_value',
  'E3 delete_recipe: a device date two days ahead is rejected');
select throws_ok(format('select public.delete_recipe(%L, null)', tests.fx('halloumi')), '22023', 'invalid_value',
  'E3 delete_recipe: a missing device date is rejected');

-- E8: variants have the same limits as the other JSON columns (security check of T9).
select throws_ok(tests.variants_sql(jsonb_build_array(jsonb_build_object('id', 'v1', 'name', repeat('x', 61), 'isDefault', true))),
  '23514', null, 'E8 recipes: a variant name of 61 characters is rejected');
select throws_ok(tests.variants_sql('[{"id": "v1", "name": "", "isDefault": true}]'),
  '23514', null, 'E8 recipes: an empty variant name is rejected');
select throws_ok(tests.variants_sql('[{"id": "v1", "name": 7, "isDefault": true}]'),
  '23514', null, 'E8 recipes: a variant name that is not text is rejected');
select throws_ok(tests.variants_sql('["mit Tofu"]'),
  '23514', null, 'E8 recipes: a variant that is not an object is rejected');
select throws_ok(
  tests.variants_sql(jsonb_build_array(jsonb_build_object('id', 'v1', 'name', 'mit Tofu', 'isDefault', true,
                                                          'extra', repeat('x', 20000)))),
  '23514', null, 'E8 recipes: variants over 20000 bytes are rejected');
select lives_ok(
  tests.variants_sql(jsonb_build_array(jsonb_build_object('id', 'v1', 'name', repeat('ä', 60), 'isDefault', true))),
  'E8 recipes: a variant name of 60 characters is allowed');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.recipes where id in (tests.fx('halloumi'), tests.fx('lasagne')))
  + (select count(*)::int from public.meal_plan_entries where recipe_id = tests.fx('halloumi') and kind <> 'text')
  + (select count(*)::int from private.deletions),
  2 + 5 + 0,
  'E3 delete_recipe: the refused calls changed nothing');

-- ===================== AC-043: delete =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select public.delete_recipe(tests.fx('halloumi'), current_date)),
  '{"converted": 3, "removed": 2, "collections": 0}'::jsonb,
  'AC-043 delete_recipe: returns how many entries became free text and how many were removed');
select tests.clear_authentication();
select is((select count(*)::int from public.recipes where id = tests.fx('halloumi')), 0,
  'AC-043 delete_recipe: the recipe is gone');
select is(tests.entry('e_past'),
  (select doc || jsonb_build_object('kind', 'text', 'recipe_id', null, 'text', 'Halloumi-Pfanne', 'variants', '[]'::jsonb)
   from original_entries where id = tests.fx('e_past')),
  'AC-043 delete_recipe: an entry in the past is free text with the title; eaters, portions, cook stay');
select is(tests.entry('e_today'),
  (select doc || jsonb_build_object('kind', 'text', 'recipe_id', null, 'text', 'Halloumi-Pfanne', 'variants', '[]'::jsonb)
   from original_entries where id = tests.fx('e_today')),
  'E3 delete_recipe: today counts as history, "nicht gekocht" stays');
select is(tests.entry('e_leftovers'),
  (select doc || jsonb_build_object('kind', 'text', 'recipe_id', null, 'text', 'Reste von Halloumi-Pfanne',
                                    'variants', '[]'::jsonb)
   from original_entries where id = tests.fx('e_leftovers')),
  'E3 delete_recipe: leftovers become "Reste von Halloumi-Pfanne"');
select is((select count(*)::int from public.meal_plan_entries where id in (tests.fx('e_future'), tests.fx('e_noted'))), 0,
  'AC-043 delete_recipe: a later entry and a "vorgemerkt" entry are removed');
select is(tests.entry('e_other') ->> 'recipe_id', tests.fx('lasagne')::text,
  'AC-043 delete_recipe: entries of other recipes are untouched');
select is(
  (select count(*)::int from public.recipe_ratings where recipe_id = tests.fx('halloumi'))
  + (select count(*)::int from public.recipe_favorites where recipe_id = tests.fx('halloumi')),
  0, 'AC-043 delete_recipe: ratings and favourites are gone');
select results_eq(
  format($$ select table_name, count(*)::int from public.deleted_records
            where household_id = %L and (record_id = %L or record_id like %L or record_id in (%L, %L))
            group by table_name order by table_name $$,
         tests.fx('home_a'), tests.fx('halloumi'), tests.fx('halloumi') || ':%', tests.fx('e_future'), tests.fx('e_noted')),
  $$ values ('meal_plan_entries', 2), ('recipe_favorites', 2), ('recipe_ratings', 3), ('recipes', 1) $$,
  'AC-043 delete_recipe: every removed row leaves a tombstone, so Nadja''s device drops it');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ insert into public.meal_plan_entries (household_id, slot_id, kind, recipe_id) values (%L, %L, 'recipe', %L) $$,
         tests.fx('home_a'), tests.fx('slot_abend'), tests.fx('halloumi')),
  '23503', null, 'E6 meal_plan_entries: planning the deleted recipe fails with 23503');
select ok(
  not (public.sync_pull(jsonb_build_object('households', jsonb_build_object(tests.fx('home_a'), '{"full": true}'::jsonb)))
       -> 'households' -> tests.fx('home_a')::text -> 'rows') ? 'deletions',
  'E4 sync_pull: the snapshot never reaches a device');
select tests.clear_authentication();
select results_eq(
  format($$ select household_id, deleted_by from private.deletions where target_id = %L $$, tests.fx('halloumi')),
  format($$ values (%L::uuid, %L::uuid) $$, tests.fx('home_a'), tests.fx('enrico')),
  'E4 delete_recipe: one snapshot of the deleting person in the recipe''s household');

-- ===================== Restore by someone else =====================
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(tests.restore_sql('halloumi'), 'P0002', 'recipe_not_restorable',
  'E4 restore_recipe: Nadja cannot undo Enrico''s deletion');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.restore_sql('halloumi'), 'P0002', 'recipe_not_restorable',
  'AC-021 restore_recipe: a member of another household cannot restore it');
select throws_ok(tests.delete_sql('halloumi'), 'P0002', 'recipe_not_found',
  'AC-021 delete_recipe: a deleted recipe of another household is not found either');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.recipes where id = tests.fx('halloumi'))
  + (select count(*)::int from private.deletions where target_id = tests.fx('halloumi')),
  1, 'E4 restore_recipe: the refused calls left the recipe deleted and the snapshot in place');
select is(
  (select (select jsonb_agg(to_jsonb(r) order by r.id) from public.recipes r where r.household_id = tests.fx('home_b'))
          || (select jsonb_agg(to_jsonb(e) order by e.id) from public.meal_plan_entries e
              where e.household_id = tests.fx('home_b'))),
  (select doc from household_b_before),
  'AC-021: household B is unchanged');

-- ===================== AC-044: undo =====================
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_recipe(tests.fx('halloumi'))), true, 'AC-044 restore_recipe: returns true');
select tests.clear_authentication();
select is(
  (select to_jsonb(r) - 'created_at' - 'updated_at' from public.recipes r where r.id = tests.fx('halloumi')),
  (select doc from original_recipe),
  'AC-044 restore_recipe: the recipe is back with the same id, photo_path, variants, ingredients and steps');
select results_eq(
  format($$ select member_id, stars from public.recipe_ratings where recipe_id = %L order by stars $$, tests.fx('halloumi')),
  format($$ values (%L::uuid, 3.5::numeric), (%L, 4), (%L, 5) $$, tests.fx('mia'), tests.fx('enrico'), tests.fx('nadja')),
  'AC-044 restore_recipe: Enrico''s, Nadja''s and Mia''s ratings are back unchanged');
select results_eq(
  format($$ select member_id from public.recipe_favorites where recipe_id = %L order by member_id $$, tests.fx('halloumi')),
  format($$ select id from fx where key in ('nadja', 'mia') order by id $$),
  'AC-044 restore_recipe: the favourites are back');
select is(
  (select jsonb_agg(tests.entry(k) order by k) from unnest(array['e_past', 'e_leftovers', 'e_today']) k),
  (select jsonb_agg(o.doc order by k) from unnest(array['e_past', 'e_leftovers', 'e_today']) k
   join original_entries o on o.id = tests.fx(k)),
  'AC-044 restore_recipe: the free-text entries are recipe entries again, with their variants');
select is(
  (select jsonb_agg(tests.entry(k) order by k) from unnest(array['e_future', 'e_noted']) k),
  (select jsonb_agg(o.doc order by k) from unnest(array['e_future', 'e_noted']) k
   join original_entries o on o.id = tests.fx(k)),
  'AC-044 restore_recipe: the removed entries are back with all their values');
select is((select created_at from public.recipes where id = tests.fx('halloumi')), '2026-01-15 09:00+00'::timestamptz,
  'AC-044 restore_recipe: the recipe keeps its original created_at');
select is((select count(*)::int from private.deletions), 0, 'AC-044 restore_recipe: the snapshot is gone');
select tests.authenticate_as(tests.fx('enrico'));
select public.apply_changes(tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object('id', tests.fx('later_recipe'), 'title', 'Neu'))));
select tests.clear_authentication();
select is((select created_at from public.recipes where id = tests.fx('later_recipe')), now(),
  'AC-044 restore_recipe: a recipe inserted after a restore in the same transaction gets the server time');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('halloumi'), 'P0002', 'recipe_not_restorable',
  'AC-044 restore_recipe: a second call is not restorable');

-- ===================== Undo after changes in between =====================
select is(
  (select public.delete_recipe(tests.fx('halloumi'), current_date - 1)),
  '{"converted": 2, "removed": 3, "collections": 0}'::jsonb,
  'E3 delete_recipe: with yesterday as the device date, today''s entry is removed');
select tests.authenticate_as(tests.fx('nadja'));
select public.apply_changes(tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx('e_past'),
  'changes', jsonb_build_object('text', 'Halloumi mit Reis'))));
select tests.clear_authentication();
delete from public.household_members where household_id = tests.fx('home_a') and profile_id = tests.fx('mia');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_recipe(tests.fx('halloumi'))), true,
  'E4 restore_recipe: works after a changed entry and a removed member');
select tests.clear_authentication();
select is(tests.entry('e_past') ->> 'text', 'Halloumi mit Reis',
  'E4 restore_recipe: a free-text entry changed in between stays free text');
select is(tests.entry('e_past') ->> 'kind', 'text', 'E4 restore_recipe: … of kind text');
select is(tests.entry('e_leftovers') ->> 'kind', 'leftovers', 'E4 restore_recipe: unchanged entries are recipe entries again');
select results_eq(
  format($$ select member_id from public.recipe_ratings where recipe_id = %L order by member_id $$, tests.fx('halloumi')),
  format($$ select id from fx where key in ('enrico', 'nadja') order by id $$),
  'E4 restore_recipe: the rating of a removed member is not restored');
select results_eq(
  format($$ select member_id from public.recipe_favorites where recipe_id = %L $$, tests.fx('halloumi')),
  format($$ values (%L::uuid) $$, tests.fx('nadja')),
  'E4 restore_recipe: the favourite of a removed member is not restored');
select is(
  (select jsonb_build_object('eaters', to_jsonb(eater_ids), 'cook', cook_id)
   from public.meal_plan_entries where id = tests.fx('e_future')),
  jsonb_build_object('eaters', jsonb_build_array(tests.fx('enrico')), 'cook', null),
  'E4 restore_recipe: a removed member is left out of the eaters, and the cook is cleared');
select is(tests.entry('e_today') ->> 'kind', 'recipe', 'E4 restore_recipe: a removed entry of today is back');

-- ===================== Leftovers without a recipe of their own =====================
-- Leftovers point to their dish; the app copies the dish's recipe_id, but a leftovers entry may
-- name no recipe (leftovers of a free-text dish, or written through the API). When delete_recipe
-- removes the dish, such leftovers (and leftovers of them) go with it instead of failing on
-- meal_plan_entries_kind_complete (23514).
insert into public.recipes (id, household_id, title) values (tests.fx('gulasch'), tests.fx('home_a'), 'Gulasch');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, leftovers_of_entry_id, text) values
  (tests.fx('e_g_past'), tests.fx('home_a'), current_date - 2, tests.fx('slot_abend'), 'recipe', tests.fx('gulasch'), null, null),
  (tests.fx('e_g_future'), tests.fx('home_a'), current_date + 2, tests.fx('slot_abend'), 'recipe', tests.fx('gulasch'), null, null),
  (tests.fx('e_g_text'), tests.fx('home_a'), current_date + 2, tests.fx('slot_abend'), 'text', null, null, 'Pizza');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, leftovers_of_entry_id) values
  (tests.fx('e_g_past_left'), tests.fx('home_a'), current_date - 1, tests.fx('slot_abend'), 'leftovers', null, tests.fx('e_g_past')),
  (tests.fx('e_g_left'), tests.fx('home_a'), current_date + 3, tests.fx('slot_abend'), 'leftovers', null, tests.fx('e_g_future')),
  (tests.fx('e_g_text_left'), tests.fx('home_a'), current_date + 3, tests.fx('slot_abend'), 'leftovers', null, tests.fx('e_g_text'));
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, leftovers_of_entry_id) values
  (tests.fx('e_g_chain'), tests.fx('home_a'), current_date + 4, tests.fx('slot_abend'), 'leftovers', null, tests.fx('e_g_left'));
create temp table gulasch_entries on commit drop as
  select e.id, to_jsonb(e) - 'created_at' - 'updated_at' as doc from public.meal_plan_entries e
  where e.id in (select id from fx where key like 'e_g_%');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.delete_sql('gulasch'),
  'E3 delete_recipe: leftovers without a recipe of a removed dish do not make the deletion fail');
select tests.clear_authentication();
select is(
  (select array_agg(key order by key) from fx
   where key like 'e_g_%' and id in (select id from public.meal_plan_entries)),
  array['e_g_past', 'e_g_past_left', 'e_g_text', 'e_g_text_left'],
  'E3 delete_recipe: the removed dish takes its leftovers without a recipe along, also leftovers of them');
select is(tests.entry('e_g_past_left') ->> 'leftovers_of_entry_id', tests.fx('e_g_past')::text,
  'E3 delete_recipe: leftovers of a dish that becomes free text stay with it');
select is(
  (select jsonb_agg(x - 'created_at' - 'updated_at' order by (x ->> 'id')::uuid)
   from private.deletions d, jsonb_array_elements(d.snapshot -> 'removed') x
   where d.target_id = tests.fx('gulasch')),
  (select jsonb_agg(g.doc order by g.id) from gulasch_entries g
   where g.id in (tests.fx('e_g_future'), tests.fx('e_g_left'), tests.fx('e_g_chain'))),
  'E4 delete_recipe: the snapshot holds the removed leftovers in full');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.restore_sql('gulasch'), 'E4 restore_recipe: restores the dish with its leftovers');
select tests.clear_authentication();
select is(
  (select jsonb_agg(tests.entry(k) order by k) from unnest(array['e_g_future', 'e_g_left', 'e_g_chain', 'e_g_past']) k),
  (select jsonb_agg(g.doc order by k) from unnest(array['e_g_future', 'e_g_left', 'e_g_chain', 'e_g_past']) k
   join gulasch_entries g on g.id = tests.fx(k)),
  'E4 restore_recipe: the leftovers are back with their links, the dish is a recipe entry again');

-- ===================== Failure cases =====================
-- Expired snapshot.
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.delete_recipe(tests.fx('lasagne'), current_date)), '{"converted": 0, "removed": 1, "collections": 0}'::jsonb,
  'E3 delete_recipe: a recipe only planned in the future');
select tests.clear_authentication();
update private.deletions set deleted_at = now() - interval '61 minutes' where target_id = tests.fx('lasagne');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('lasagne'), 'P0002', 'recipe_not_restorable',
  'E4 restore_recipe: a snapshot older than 1 hour is not restorable');

-- Every delete_recipe of the household purges its expired snapshots.
select is((select public.delete_recipe(tests.fx('curry'), current_date)), '{"converted": 0, "removed": 0, "collections": 0}'::jsonb,
  'E3 delete_recipe: a recipe without plan entries');
select tests.clear_authentication();
select results_eq(
  'select target_id from private.deletions',
  format($$ values (%L::uuid) $$, tests.fx('curry')),
  'E4 delete_recipe: deleting purges the household''s expired snapshots');

-- An article of the recipe is deleted in between: the whole restore fails, nothing half.
select tests.authenticate_as(tests.fx('enrico'));
select public.delete_recipe(tests.fx('auflauf'), current_date);
select lives_ok(format('select public.delete_article(%L)', tests.fx('nudeln')),
  'E4 delete_article: the article of the deleted recipe can be deleted');
select throws_ok(tests.restore_sql('auflauf'), '23503', 'ingredient_article_invalid',
  'E4 restore_recipe: with an article missing the restore fails');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.recipes where id = tests.fx('auflauf'))
  + (select count(*)::int from public.meal_plan_entries where id = tests.fx('e_auflauf')),
  0, 'E4 restore_recipe: … and nothing is restored halfway');
select is((select count(*)::int from private.deletions where target_id = tests.fx('auflauf')), 1,
  'E4 restore_recipe: … and the snapshot stays');

-- The recipe is back by other means: false, nothing changes; deleting again replaces the snapshot.
select tests.authenticate_as(tests.fx('enrico'));
select public.delete_recipe(tests.fx('risotto'), current_date);
select tests.clear_authentication();
insert into public.recipes (id, household_id, title) values (tests.fx('risotto'), tests.fx('home_a'), 'Risotto neu');
select tests.authenticate_as(tests.fx('enrico'));
select is((select public.restore_recipe(tests.fx('risotto'))), false,
  'E4 restore_recipe: a recipe that already exists again gives false');
select tests.clear_authentication();
select results_eq(
  format($$ select r.title, d.snapshot -> 'recipe' ->> 'title' from public.recipes r
            join private.deletions d on d.target_id = r.id where r.id = %L $$, tests.fx('risotto')),
  $$ values ('Risotto neu', 'Risotto') $$,
  'E4 restore_recipe: … and changes nothing');
select tests.authenticate_as(tests.fx('enrico'));
select public.delete_recipe(tests.fx('risotto'), current_date);
select tests.clear_authentication();
select results_eq(
  format($$ select snapshot -> 'recipe' ->> 'title' from private.deletions where target_id = %L $$,
         tests.fx('risotto')),
  $$ values ('Risotto neu') $$,
  'E4 delete_recipe: deleting the same id again replaces the snapshot');

-- An id deleted in household A and taken in household B (e.g. by a former member): restore does
-- not answer false (that would look like success), it refuses, and nothing changes in either.
insert into public.recipes (id, household_id, title) values (tests.fx('squat'), tests.fx('home_a'), 'Kürbissuppe');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id) values
  (tests.fx('e_squat'), tests.fx('home_a'), current_date + 2, tests.fx('slot_abend'), 'recipe', tests.fx('squat'));
select tests.authenticate_as(tests.fx('enrico'));
select public.delete_recipe(tests.fx('squat'), current_date);
select tests.authenticate_as(tests.fx('ben'));
select public.apply_changes(tests.fx('home_b'), jsonb_build_array(jsonb_build_object(
  'kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object('id', tests.fx('squat'), 'title', 'Besetzt'))));
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.restore_sql('squat'), 'P0002', 'recipe_not_restorable',
  'E4 restore_recipe: an id taken in another household is not restorable');
select tests.clear_authentication();
select results_eq(
  format($$ select r.household_id, r.title, (select count(*)::int from public.meal_plan_entries where id = %L),
                   (select count(*)::int from private.deletions where target_id = %L)
            from public.recipes r where r.id = %L $$, tests.fx('e_squat'), tests.fx('squat'), tests.fx('squat')),
  format($$ values (%L::uuid, 'Besetzt', 0, 1) $$, tests.fx('home_b')),
  'E4 restore_recipe: … the other household''s recipe stays, nothing comes back, the snapshot stays');
delete from public.recipes where id = tests.fx('squat');

-- Deleting a recipe around delete_recipe (superuser) while it is planned: the foreign key stops it.
select throws_ok(format('delete from public.recipes where id = %L', tests.fx('halloumi')), '23503', null,
  'E1 recipes: a planned recipe cannot be deleted around delete_recipe (on delete restrict)');
select is((select count(*)::int from public.recipes where id = tests.fx('halloumi')), 1,
  'E1 recipes: … and it stays');

-- ===================== Purge and household deletion =====================
select tests.authenticate_as(tests.fx('ben'));
select is((select public.delete_recipe(tests.fx('pasta_b'), current_date + 1)), '{"converted": 0, "removed": 1, "collections": 0}'::jsonb,
  'AC-043 delete_recipe: Ben deletes in his household, the day after tomorrow is the future');
select tests.clear_authentication();
update private.deletions set deleted_at = now() - interval '2 hours' where target_id = tests.fx('curry');
select private.purge_deletions();
select results_eq(
  'select target_id from private.deletions order by target_id',
  format($$ select id from fx where key in ('auflauf', 'risotto', 'pasta_b', 'squat') order by id $$),
  'E4 purge_deletions: removes only snapshots older than 1 hour');
select is(
  (select count(*)::int from cron.job where jobname = 'purge-deletions'
     and schedule = '20 * * * *' and command = 'select private.purge_deletions()'),
  1, 'E4 purge-recipe-deletions: the job runs hourly');
delete from public.households where id = tests.fx('home_b');
select is((select count(*)::int from private.deletions where household_id = tests.fx('home_b')), 0,
  'E4 deletions: deleting the household removes its snapshots');

-- ===================== Definer functions =====================
select is(
  (select array_agg(p.oid::regprocedure::text order by 1)
   from pg_catalog.pg_proc p
   where p.oid in ('private.delete_recipe(uuid,date,boolean)'::regprocedure, 'private.restore_recipe(uuid)'::regprocedure)
     and p.prosecdef and 'search_path=""' = any (p.proconfig)),
  array['private.restore_recipe(uuid)', 'private.delete_recipe(uuid,date,boolean)'],
  'E6 delete_recipe/restore_recipe: security definer with an empty search_path');
select ok(
  not has_function_privilege('authenticated', 'private.purge_deletions()', 'execute'),
  'E4 purge_deletions: not callable by the API roles');
select ok(
  not has_table_privilege('authenticated', 'private.deletions', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'private.deletions', 'select,insert,update,delete'),
  'E4 deletions: no grants');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.deletions'::regclass),
  'E4 deletions: row level security is on');
select ok(
  not has_table_privilege('authenticated', 'public.recipes', 'delete'),
  'E2 recipes: authenticated has no delete grant');

select * from finish();
rollback;
