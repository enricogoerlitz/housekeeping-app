-- Deleting a recipe or collection with "Zutaten auch von der Liste nehmen" (spec 0023, Decision
-- 15): delete_recipe(…, with_list => true) takes the contributions of the entries that go off open
-- items in the same transaction (replace_entry_contributions of spec 0021); other contributions,
-- checked items and the entries that become free text keep theirs. restore_recipe brings the
-- contributions back with the entries. Without with_list the list stays as it is.
begin;
\ir _helpers.psql
select plan(14);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The contributions of an entry on the list, open and checked (read past RLS).
create function tests.of_entry(p_entry text) returns int language sql stable security definer
as $$ select count(*)::int from public.shopping_contributions c
      where c.source ->> 'entryId' = tests.fx(p_entry)::text $$;
grant execute on function tests.of_entry(text) to anon, authenticated;
create function tests.item_exists(p_item text) returns boolean language sql stable security definer
as $$ select exists (select 1 from public.shopping_items i where i.id = tests.fx(p_item)) $$;
grant execute on function tests.item_exists(text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('jana', tests.create_user('jana@example.com', 'Jana'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico', array[tests.fx('enrico')])),
  ('schmidt', tests.create_household('Schmidt', array[tests.fx('jana')]));
insert into fx (key) values ('abend'), ('lasagne'), ('curry'), ('pasta'),
  ('e_past'), ('e_future'), ('e_noted'), ('e_curry'), ('e_pasta'),
  ('hack'), ('platten'), ('salz'), ('nudeln'), ('reis'), ('eier'),
  ('i_hack'), ('i_platten'), ('i_salz'), ('i_nudeln'), ('i_reis'), ('i_eier'), ('c_hand');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('abend'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home');
insert into public.recipes (id, household_id, title) values
  (tests.fx('lasagne'), tests.fx('home'), 'Lasagne'),
  (tests.fx('curry'), tests.fx('home'), 'Mango-Curry'),
  (tests.fx('pasta'), tests.fx('home'), 'Pasta');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, eater_ids, portions) values
  (tests.fx('e_past'), tests.fx('home'), current_date - 1, tests.fx('abend'), 'recipe', tests.fx('lasagne'), '{}', 2),
  (tests.fx('e_future'), tests.fx('home'), current_date + 3, tests.fx('abend'), 'recipe', tests.fx('lasagne'), '{}', 2),
  (tests.fx('e_noted'), tests.fx('home'), null, tests.fx('abend'), 'recipe', tests.fx('lasagne'), '{}', 2),
  (tests.fx('e_curry'), tests.fx('home'), current_date + 2, tests.fx('abend'), 'recipe', tests.fx('curry'), '{}', 2),
  (tests.fx('e_pasta'), tests.fx('home'), current_date + 4, tests.fx('abend'), 'recipe', tests.fx('pasta'), '{}', 2);
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('hack'), tests.fx('home'), 'Hackfleisch', 'hackfleisch'),
  (tests.fx('platten'), tests.fx('home'), 'Lasagneplatten', 'lasagneplatten'),
  (tests.fx('salz'), tests.fx('home'), 'Salz', 'salz'),
  (tests.fx('nudeln'), tests.fx('home'), 'Nudeln', 'nudeln'),
  (tests.fx('reis'), tests.fx('home'), 'Reis', 'reis'),
  (tests.fx('eier'), tests.fx('home'), 'Eier', 'eier');
insert into public.shopping_items (id, household_id, article_id, checked) values
  (tests.fx('i_hack'), tests.fx('home'), tests.fx('hack'), false),
  (tests.fx('i_platten'), tests.fx('home'), tests.fx('platten'), false),
  (tests.fx('i_salz'), tests.fx('home'), tests.fx('salz'), true),
  (tests.fx('i_nudeln'), tests.fx('home'), tests.fx('nudeln'), false),
  (tests.fx('i_reis'), tests.fx('home'), tests.fx('reis'), false),
  (tests.fx('i_eier'), tests.fx('home'), tests.fx('eier'), false);
create function tests.recipe_source(p_recipe text, p_entry text) returns jsonb language sql stable
as $$ select jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx(p_recipe), 'entryId', tests.fx(p_entry),
                                'label', 'Gericht') $$;
insert into public.shopping_contributions (household_id, item_id, source, count) values
  (tests.fx('home'), tests.fx('i_hack'), tests.recipe_source('lasagne', 'e_future'), 1),
  (tests.fx('home'), tests.fx('i_platten'), tests.recipe_source('lasagne', 'e_noted'), 1),
  (tests.fx('home'), tests.fx('i_salz'), tests.recipe_source('lasagne', 'e_future'), 1),
  (tests.fx('home'), tests.fx('i_nudeln'), tests.recipe_source('lasagne', 'e_past'), 1),
  (tests.fx('home'), tests.fx('i_reis'), tests.recipe_source('curry', 'e_curry'), 1),
  (tests.fx('home'), tests.fx('i_eier'), tests.recipe_source('pasta', 'e_pasta'), 1);
insert into public.shopping_contributions (id, household_id, item_id, source, count) values
  (tests.fx('c_hand'), tests.fx('home'), tests.fx('i_hack'), '{"kind": "manual"}', 1);

-- ===================== Foreign household, signed out =====================
select tests.authenticate_as(tests.fx('jana'));
select throws_ok(format('select public.delete_recipe(%L, current_date, true)', tests.fx('lasagne')),
  'P0002', null, 'Risiken delete_recipe: another household cannot delete the recipe or its ingredients');
select tests.authenticate_as_anon();
select throws_ok(format('select public.delete_recipe(%L, current_date, true)', tests.fx('lasagne')),
  '42501', null, 'Risiken delete_recipe: signed out cannot delete');
select is(tests.of_entry('e_future') + tests.of_entry('e_noted'), 3, 'Risiken: the list is unchanged');

-- ===================== Without the list =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(format('select public.delete_recipe(%L, current_date)', tests.fx('curry')),
  'Decision 15 delete_recipe: without with_list as before');
select is(tests.of_entry('e_curry'), 1, 'Decision 15: "Nur löschen" keeps the ingredients on the list');

-- ===================== With the list =====================
select lives_ok(format('select public.delete_recipe(%L, current_date, true)', tests.fx('lasagne')),
  'Decision 15 delete_recipe: "Zutaten auch von der Liste nehmen"');
select results_eq(
  format($$ select c.id from public.shopping_contributions c where c.item_id = %L $$, tests.fx('i_hack')),
  format($$ values (%L::uuid) $$, tests.fx('c_hand')),
  'Decision 15: "Hackfleisch" keeps only its manual contribution');
select is(tests.item_exists('i_platten'), false, 'Decision 15: "Lasagneplatten" of the noted entry goes, emptied');
select is(tests.of_entry('e_future'), 1, 'Decision 15: the checked "Salz" keeps the entry''s contribution');
select is(tests.of_entry('e_past'), 1, 'Decision 15: an entry that becomes free text keeps its ingredients');

-- ===================== Undo =====================
select is((select public.restore_recipe(tests.fx('lasagne'))), true, 'Decision 15 restore_recipe: returns true');
select is(tests.of_entry('e_future') + tests.of_entry('e_noted'), 3,
  'Decision 15 restore_recipe: the ingredients are back with the entries');
select is(tests.item_exists('i_platten'), true, 'Decision 15 restore_recipe: … the emptied item with its id');

-- ===================== Invalid input =====================
select throws_ok(format('select public.delete_recipe(%L, current_date + 5, true)', tests.fx('pasta')),
  '22023', 'invalid_value', 'Decision 15 delete_recipe: a day far from today is refused, the list untouched');

select * from finish();
rollback;
