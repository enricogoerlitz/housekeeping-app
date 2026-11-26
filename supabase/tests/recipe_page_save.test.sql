-- Spec 0037: saving the recipe page in one step (REQ-001, Entscheidung 1) and the time of a
-- collection (REQ-005, Entscheidung 2). save_recipe_page applies all changes of the page in one
-- transaction or none (AC-004), answers whether the recipe changed since the edit mode opened
-- (AC-006), runs as the caller (foreign household, signed out) and writes only the page's rows.
-- recipes_kind_fields allows a time on a collection and nothing else (AC-016, AC-017).
begin;
\ir _helpers.psql
select plan(26);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The SQL text of a save_recipe_page call.
create function tests.save_sql(p_household text, p_recipe text, p_seen timestamptz, p_ops jsonb)
returns text language sql stable
as $$ select format('select public.save_recipe_page(%L, %L, %L, %L)',
                    tests.fx(p_household), tests.fx(p_recipe), p_seen, p_ops) $$;
create function tests.patch_op(p_recipe text, p_changes jsonb) returns jsonb language sql stable
as $$ select jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx(p_recipe), 'changes', p_changes) $$;
create function tests.ingredient(p_article text) returns jsonb language sql stable
as $$ select jsonb_build_object('id', gen_random_uuid(), 'articleId', tests.fx(p_article)::text,
                                'shoppingRule', 'always') $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG', array[tests.fx('ben')]));
insert into fx (key) values ('apfelkuchen'), ('grillabend'), ('steak'), ('zimt'), ('wg_kuchen'), ('fremd');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('zimt'), tests.fx('home_a'), 'Zimt', 'zimt'),
  (tests.fx('fremd'), tests.fx('home_b'), 'Zucker', 'zucker');
insert into public.recipes (id, household_id, title, servings) values
  (tests.fx('apfelkuchen'), tests.fx('home_a'), 'Apfelkuchen', 2),
  (tests.fx('steak'), tests.fx('home_a'), 'Steak', 2),
  (tests.fx('wg_kuchen'), tests.fx('home_b'), 'WG-Kuchen', 2);
insert into public.recipes (id, household_id, kind, title, course) values
  (tests.fx('grillabend'), tests.fx('home_a'), 'collection', 'Grillabend', null);

-- The edit mode opened when the recipe looked like this.
create temp table seen on commit drop as
  select updated_at from public.recipes where id = tests.fx('apfelkuchen');
grant select on seen to anon, authenticated;

-- ===================== AC-003: everything in one step =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.save_sql('home_a', 'apfelkuchen', (select updated_at from seen), jsonb_build_array(
    tests.patch_op('apfelkuchen', jsonb_build_object(
      'title', 'Omas Apfelkuchen',
      'ingredients', jsonb_build_array(tests.ingredient('zimt')))))),
  'AC-003 save_recipe_page: title and a new ingredient are saved together');
select is((select title from public.recipes where id = tests.fx('apfelkuchen')), 'Omas Apfelkuchen',
  'AC-003 save_recipe_page: the title is stored');
select is((select jsonb_array_length(ingredients) from public.recipes where id = tests.fx('apfelkuchen')), 1,
  'AC-003 save_recipe_page: the ingredient is stored');
select is(
  (select (public.save_recipe_page(tests.fx('home_a'), tests.fx('apfelkuchen'),
     (select updated_at from public.recipes where id = tests.fx('apfelkuchen')),
     jsonb_build_array(tests.patch_op('apfelkuchen', '{"notes": "Mit Sahne"}'))) ->> 'changed_meanwhile')::boolean),
  false, 'AC-006 save_recipe_page: unchanged since the edit mode opened → no hint');

-- ===================== AC-004: all or nothing =====================
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, jsonb_build_array(
    tests.patch_op('apfelkuchen', '{"title": "Kuchen ohne Zutat"}'),
    tests.patch_op('apfelkuchen', jsonb_build_object('ingredients', jsonb_build_array(tests.ingredient('fremd')))))),
  '23503', 'ingredient_article_invalid',
  'AC-004 save_recipe_page: an ingredient the server refuses fails the whole save');
select is((select title from public.recipes where id = tests.fx('apfelkuchen')), 'Omas Apfelkuchen',
  'AC-004 save_recipe_page: after the refusal the title is unchanged');

-- ===================== AC-006: changed meanwhile =====================
-- Nadja saves while Enrico edits; the edit mode of Enrico opened before (seen).
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(tests.patch_op('apfelkuchen', '{"description": "Wie bei Oma", "servings": 4}'))),
  'AC-006 setup: Nadja changes description and portions');
-- updated_at is the transaction time of the one test transaction (the trigger sets it): Enrico's
-- edit mode opened a minute before Nadja's change.
select tests.clear_authentication();
update seen set updated_at = updated_at - interval '1 minute';
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select (public.save_recipe_page(tests.fx('home_a'), tests.fx('apfelkuchen'), (select updated_at from seen),
     jsonb_build_array(tests.patch_op('apfelkuchen', '{"title": "Apfelkuchen vom Blech"}'))) ->> 'changed_meanwhile')::boolean),
  true, 'AC-006 save_recipe_page: a change since the edit mode opened is reported');
select is((select title from public.recipes where id = tests.fx('apfelkuchen')), 'Apfelkuchen vom Blech',
  'AC-006 save_recipe_page: my changed field wins');
select is((select description || ' / ' || servings from public.recipes where id = tests.fx('apfelkuchen')),
  'Wie bei Oma / 4', 'AC-006 save_recipe_page: her other changes stay');

-- ===================== Only the page =====================
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, jsonb_build_array(tests.patch_op('steak', '{"title": "Rumpsteak"}'))),
  '22023', 'invalid_change', 'REQ-001 save_recipe_page: another recipe is not part of the page');
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Kasse', 'sort', 9)))),
  '22023', 'invalid_change', 'REQ-001 save_recipe_page: a table outside the page is refused');
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object('title', 'Neu')))),
  '22023', 'invalid_change', 'REQ-001 save_recipe_page: a new recipe is not part of the page');
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, '{}'::jsonb),
  '22023', 'invalid_change', 'REQ-001 save_recipe_page: the ops are an array');

-- ===================== Foreign household, signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, jsonb_build_array(tests.patch_op('apfelkuchen', '{"title": "Gekapert"}'))),
  '42501', 'not_member', 'Risiken save_recipe_page: a member of another household cannot save');
select throws_ok(
  tests.save_sql('home_b', 'apfelkuchen', null, jsonb_build_array(tests.patch_op('apfelkuchen', '{"title": "Gekapert"}'))),
  'P0002', 'row_not_found', 'Risiken save_recipe_page: a recipe of another household is not found from the own one');
select tests.authenticate_as_anon();
select throws_ok(
  tests.save_sql('home_a', 'apfelkuchen', null, jsonb_build_array(tests.patch_op('apfelkuchen', '{"title": "Gekapert"}'))),
  '42501', null, 'Risiken save_recipe_page: signed out cannot call it');
select tests.clear_authentication();
select is((select title from public.recipes where id = tests.fx('apfelkuchen')), 'Apfelkuchen vom Blech',
  'Risiken save_recipe_page: nothing of the refused calls is stored');
select ok(
  not has_function_privilege('anon', 'public.save_recipe_page(uuid, uuid, timestamptz, jsonb)', 'execute'),
  'Risiken save_recipe_page: anon has no execute grant');
select is(
  (select prosecdef from pg_proc where oid = 'public.save_recipe_page(uuid, uuid, timestamptz, jsonb)'::regprocedure),
  false, 'Risiken save_recipe_page: security invoker');

-- ===================== REQ-005: time of a collection =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.save_sql('home_a', 'grillabend', null, jsonb_build_array(tests.patch_op('grillabend', '{"total_minutes": 90}'))),
  'AC-016 recipes_kind_fields: a collection has a time');
select is((select total_minutes from public.recipes where id = tests.fx('grillabend')), 90,
  'AC-016 recipes_kind_fields: the time is stored');
select throws_ok(
  tests.save_sql('home_a', 'grillabend', null, jsonb_build_array(tests.patch_op('grillabend', '{"cuisine": "Grill"}'))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'Risiken recipes_kind_fields: a collection still has no cuisine');
select throws_ok(
  tests.save_sql('home_a', 'grillabend', null, jsonb_build_array(tests.patch_op('grillabend', '{"course": "main"}'))),
  '23514', 'new row for relation "recipes" violates check constraint "recipes_kind_fields"',
  'Risiken recipes_kind_fields: a collection still has no course');

select tests.authenticate_as(tests.fx('ben'));
select is((select count(*)::int from public.recipes where id = tests.fx('grillabend')), 0,
  'AC-017 recipes: a member of another household cannot read the time of „Grillabend“');
select is(tests.affected(format('update public.recipes set total_minutes = 5 where id = %L', tests.fx('grillabend'))), 0,
  'AC-017 recipes: a member of another household cannot change the time of „Grillabend“');

select * from finish();
rollback;
