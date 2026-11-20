-- apply_changes (spec 0003, T5): the generic write path. One call = one transaction; tables and
-- columns from an allowlist only; one household per call; limits. Includes the attack suite of
-- the threat model in plan.md (name injection, forbidden columns and tables, foreign household,
-- foreign parent, mass deletion, rollback = AC-020).
begin;
\ir _helpers.psql
select plan(91);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- Calls apply_changes for the household with the given ops (as the current role).
create function tests.apply(p_household text, p_ops jsonb) returns jsonb language sql
as $$ select public.apply_changes(tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply(text, jsonb) to anon, authenticated;

-- The SQL text of an apply_changes call, for throws_ok / lives_ok.
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply_sql(text, jsonb) to anon, authenticated;

-- p_entries add entries for new articles, each with p_contributions contributions.
create function tests.add_entries(p_entries integer, p_contributions integer) returns jsonb language sql volatile
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_item_id', gen_random_uuid(), 'client_article_id', gen_random_uuid(),
    'article_name', 'Artikel ' || e, 'name_key', 'artikel-' || e || '-' || gen_random_uuid(),
    'contributions', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'count', 1))
                      from generate_series(1, p_contributions)))), '[]')
  from generate_series(1, p_entries) e
$$;
grant execute on function tests.add_entries(integer, integer) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben')),
  ('mia', tests.create_user('mia@example.com', 'Mia'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja'), tests.fx('mia')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben'), tests.fx('mia')]));
insert into fx (key) values
  ('recipe_a'), ('recipe_b'), ('area_a'), ('area_b'), ('list_a'), ('list_b'), ('milch'), ('item_milch'), ('c_milch'),
  ('new_recipe'), ('new_area'), ('new_article'), ('zucker_item'), ('zucker_article'), ('zucker_c'),
  ('tee'), ('item_b'), ('c_b'), ('slot_a'), ('new_activity'), ('new_entry'), ('bad_activity');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot_a'), 'name', 'Vormittag', 'sort', 0))
where id = tests.fx('home_a');
insert into public.recipes (id, household_id, title) values
  (tests.fx('recipe_a'), tests.fx('home_a'), 'Dal'),
  (tests.fx('recipe_b'), tests.fx('home_b'), 'Pasta');
insert into public.areas (id, household_id, name) values
  (tests.fx('area_a'), tests.fx('home_a'), 'Obst'),
  (tests.fx('area_b'), tests.fx('home_b'), 'Obst B');
insert into public.shopping_lists (id, household_id, name) values
  (tests.fx('list_a'), tests.fx('home_a'), 'Standardliste'),
  (tests.fx('list_b'), tests.fx('home_b'), 'Liste B');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch'),
  (tests.fx('tee'), tests.fx('home_b'), 'Tee', 'tee');
insert into public.shopping_items (id, household_id, list_id, article_id) values
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('milch')),
  (tests.fx('item_b'), tests.fx('home_b'), tests.fx('list_b'), tests.fx('tee'));
insert into public.shopping_contributions (id, household_id, item_id) values
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch')),
  (tests.fx('c_b'), tests.fx('home_b'), tests.fx('item_b'));

-- ===================== The normal path =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'recipes',
                       'row', jsonb_build_object('id', tests.fx('new_recipe'), 'title', 'Linsen-Dal', 'servings', 4,
                                                 'tags', jsonb_build_array('schnell'), 'ingredients', '[]'::jsonb)))),
  '{"applied": 1, "results": []}'::jsonb,
  'AC-013 apply_changes: an insert returns the number of applied ops');
select results_eq(
  format($$ select household_id, title, servings, tags from public.recipes where id = %L $$, tests.fx('new_recipe')),
  format($$ values (%L::uuid, 'Linsen-Dal', 4, array['schnell']) $$, tests.fx('home_a')),
  'AC-013 apply_changes: the row is inserted into the call''s household, values typed from JSON');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'areas',
                       'row', jsonb_build_object('id', tests.fx('new_area'), 'household_id', tests.fx('home_a'), 'name', 'Brot')),
    jsonb_build_object('kind', 'insert', 'table', 'articles',
                       'row', jsonb_build_object('id', tests.fx('new_article'), 'name', 'Baguette', 'name_key', 'baguette',
                                                 'area_id', tests.fx('new_area'), 'synonyms', jsonb_build_array('Stangenbrot'),
                                                 'synonym_keys', jsonb_build_array('stangenbrot'))),
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('new_recipe'),
                       'changes', jsonb_build_object('title', 'Roter Linsen-Dal', 'servings', 2)))),
  'T5 apply_changes: several ops, a household_id equal to the call''s, a reference inserted in the same call');
select results_eq(
  format($$ select r.title, r.servings, a.area_id from public.recipes r, public.articles a where r.id = %L and a.id = %L $$,
         tests.fx('new_recipe'), tests.fx('new_article')),
  format($$ values ('Roter Linsen-Dal', 2, %L::uuid) $$, tests.fx('new_area')),
  'T5 apply_changes: the patch changed only the given columns, the article references the new area');
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'recipes', 'id', tests.fx('new_recipe')),
    jsonb_build_object('kind', 'delete', 'table', 'recipes', 'id', tests.fx('new_recipe')))),
  '{"applied": 2, "results": []}'::jsonb,
  'AC-015 apply_changes: delete removes the row; deleting a missing row is harmless');
select is(
  (select count(*)::int from public.deleted_records where record_id = tests.fx('new_recipe')::text), 1,
  'AC-015 apply_changes: the delete leaves one tombstone');
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'households', 'id', tests.fx('home_a'),
                       'changes', jsonb_build_object('name', 'Enrico & Nadja', 'default_list_id', tests.fx('list_a'))))),
  '{"applied": 1, "results": []}'::jsonb,
  'T5 apply_changes: the own household can be patched (name, default list)');
select results_eq(
  format($$ select name, default_list_id from public.households where id = %L $$, tests.fx('home_a')),
  format($$ values ('Enrico & Nadja', %L::uuid) $$, tests.fx('list_a')),
  'T5 apply_changes: household patch stored');
select is(
  tests.apply('home_a', '[]'::jsonb), '{"applied": 0, "results": []}'::jsonb,
  'T5 apply_changes: an empty batch is a no-op');

-- ===================== Domain ops =====================
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'add_contributions', 'list_id', tests.fx('list_a'), 'entries', jsonb_build_array(
      jsonb_build_object('client_item_id', tests.fx('zucker_item'), 'client_article_id', tests.fx('zucker_article'),
                         'article_name', 'Zucker', 'name_key', 'zucker',
                         'contributions', jsonb_build_array(jsonb_build_object('id', tests.fx('zucker_c'), 'qty', 500, 'unit', 'g'))))))),
  jsonb_build_object('applied', 1, 'results', jsonb_build_array(jsonb_build_array(jsonb_build_object(
    'client_item_id', tests.fx('zucker_item'), 'item_id', tests.fx('zucker_item'),
    'client_article_id', tests.fx('zucker_article'), 'article_id', tests.fx('zucker_article'))))),
  'T5 apply_changes: add_contributions runs the same logic as add_shopping_contributions and returns its mapping');
select results_eq(
  format($$ select qty, unit from public.shopping_contributions where id = %L $$, tests.fx('zucker_c')),
  $$ values (500::numeric, 'g') $$,
  'T5 apply_changes: add_contributions stored the contribution');
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'remove_contributions', 'ids', jsonb_build_array(tests.fx('zucker_c'))))),
  '{"applied": 1, "results": [1]}'::jsonb,
  'T5 apply_changes: remove_contributions returns the number removed');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('zucker_item')), 0,
  'T5 apply_changes: remove_contributions deleted the emptied item');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'add_contributions', 'list_id', tests.fx('list_b'), 'entries', '[]'::jsonb))),
  'P0002', 'list_not_found', 'AC-011 apply_changes: add_contributions to a list of another household is not found');

-- ===================== AC-020: all or nothing =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'add_contributions', 'list_id', tests.fx('list_a'), 'entries', jsonb_build_array(
      jsonb_build_object('client_item_id', gen_random_uuid(), 'client_article_id', gen_random_uuid(),
                         'article_name', 'Mehl', 'name_key', 'mehl',
                         'contributions', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()))))),
    jsonb_build_object('kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Backen')),
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'),
                       'changes', jsonb_build_object('servings', 0)),
    jsonb_build_object('kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Konserven')),
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'),
                       'changes', jsonb_build_object('title', 'Geändert')))),
  '23514', null, 'AC-020 apply_changes: op 3 of 5 fails');
select is(
  (select count(*)::int from public.articles where name_key = 'mehl')
    + (select count(*)::int from public.areas where name in ('Backen', 'Konserven'))
    + (select count(*)::int from public.recipes where title = 'Geändert'), 0,
  'AC-020 apply_changes: nothing of the failed batch remains (also not the list entry)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Tiefkühl')),
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', gen_random_uuid(),
                       'changes', jsonb_build_object('title', 'x')))),
  'P0002', 'row_not_found', 'AC-019 apply_changes: a patch that hits no row is an error');
select is(
  (select count(*)::int from public.areas where name = 'Tiefkühl'), 0,
  'AC-019 apply_changes: … and rolls back the batch');

-- ===================== Attack suite: names =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'recipes; drop table public.areas; --', 'id', tests.fx('recipe_a')))),
  '22023', 'invalid_change', 'T5 attack: SQL in the table name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', '"recipes"', 'id', tests.fx('recipe_a')))),
  '22023', 'invalid_change', 'T5 attack: a quoted table name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'public.recipes', 'id', tests.fx('recipe_a')))),
  '22023', 'invalid_change', 'T5 attack: a schema-qualified table name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'Recipes', 'id', tests.fx('recipe_a')))),
  '22023', 'invalid_change', 'T5 attack: a differently cased table name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'),
    'changes', jsonb_build_object('title = ''x'', household_id = household_id --', 'y')))),
  '22023', 'invalid_change', 'T5 attack: SQL in a column name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'),
    'changes', jsonb_build_object('"title"', 'y')))),
  '22023', 'invalid_change', 'T5 attack: a quoted column name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'areas',
    'row', jsonb_build_object('name', 'x', 'sort) select 1,1,1 --', 1)))),
  '22023', 'invalid_change', 'T5 attack: SQL in an inserted column name is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'), 'changes', '{}'::jsonb))),
  '22023', 'invalid_change', 'T5 attack: a patch without changes is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'truncate', 'table', 'recipes'))),
  '22023', 'invalid_change', 'T5 attack: an unknown op kind is rejected');
select throws_ok(
  tests.apply_sql('home_a', '{"kind": "delete"}'::jsonb),
  '22023', 'invalid_change', 'T5 attack: ops must be an array');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'delete', 'id', tests.fx('recipe_a')))),
  '22023', 'invalid_change', 'T5 attack: an op without a table is rejected');
select tests.clear_authentication();
select has_table('public', 'areas', 'T5 attack: public.areas still exists');
select is(
  (select title from public.recipes where id = tests.fx('recipe_a')), 'Dal',
  'T5 attack: the target recipe is unchanged');

-- ===================== Attack suite: forbidden columns =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'),
    'changes', jsonb_build_object('household_id', tests.fx('home_b'))))),
  '22023', 'invalid_change', 'T5 attack: household_id cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'), 'changes', jsonb_build_object('id', gen_random_uuid())))),
  '22023', 'invalid_change', 'T5 attack: id cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'), 'changes', jsonb_build_object('updated_at', '2000-01-01')))),
  '22023', 'invalid_change', 'T5 attack: updated_at cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object('title', 'x', 'created_at', '2000-01-01')))),
  '22023', 'invalid_change', 'T5 attack: created_at cannot be inserted');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes', 'row', jsonb_build_object('title', 'x', 'updated_at', '2999-01-01')))),
  '22023', 'invalid_change', 'T5 attack: updated_at cannot be inserted');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'shopping_items', 'id', tests.fx('item_milch'), 'changes', jsonb_build_object('checked', true)))),
  '22023', 'invalid_change', 'T5 attack: checked cannot be patched (store RPCs only)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'shopping_items', 'id', tests.fx('item_milch'), 'changes', jsonb_build_object('check_seq', 99)))),
  '22023', 'invalid_change', 'T5 attack: check_seq cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'shopping_items',
    'row', jsonb_build_object('list_id', tests.fx('list_a'), 'article_id', tests.fx('milch'), 'checked', true)))),
  '22023', 'invalid_change', 'T5 attack: checked cannot be inserted');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'feedback',
    'row', jsonb_build_object('id', gen_random_uuid(), 'kind', 'idea', 'text', 'x', 'status', 'new', 'author_id', tests.fx('nadja'))))),
  'T5 attack: feedback author_id may be sent on insert …');
select is(
  (select author_id from public.feedback where text = 'x'), tests.fx('enrico'),
  'T5 attack: … but the trigger makes the caller the author');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'feedback', 'id', (select id from public.feedback where text = 'x'),
    'changes', jsonb_build_object('author_id', tests.fx('nadja'))))),
  '22023', 'invalid_change', 'T5 attack: feedback author_id cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'households', 'id', tests.fx('home_a'), 'changes', jsonb_build_object('created_at', '2000-01-01')))),
  '22023', 'invalid_change', 'T5 attack: households.created_at cannot be patched');

-- ===================== Attack suite: tables outside the allowlist =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'household_members', 'row', jsonb_build_object('profile_id', tests.fx('ben'))))),
  '22023', 'invalid_change', 'T5 attack: household_members is not writable');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'household_members', 'id', tests.fx('nadja')))),
  '22023', 'invalid_change', 'T5 attack: household_members cannot be deleted from');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'deleted_records', 'id', gen_random_uuid()))),
  '22023', 'invalid_change', 'T5 attack: deleted_records is not writable');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'ai_usage', 'row', jsonb_build_object('requests', 0)))),
  '22023', 'invalid_change', 'T5 attack: ai_usage is not writable');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipe_ratings',
    'row', jsonb_build_object('recipe_id', tests.fx('recipe_a'), 'member_id', tests.fx('nadja'), 'stars', 1)))),
  '22023', 'invalid_change', 'T5 attack: recipe_ratings is not writable (set_* RPCs only)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'profiles', 'id', tests.fx('nadja'), 'changes', jsonb_build_object('name', 'x')))),
  '22023', 'invalid_change', 'T5 attack: profiles is not writable');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'household_invitations', 'row', jsonb_build_object('email', 'eve@example.com')))),
  '22023', 'invalid_change', 'T5 attack: household_invitations is not writable');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'households', 'row', jsonb_build_object('name', 'Neu')))),
  '22023', 'invalid_change', 'T5 attack: households cannot be inserted');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'households', 'id', tests.fx('home_a')))),
  '22023', 'invalid_change', 'T5 attack: households cannot be deleted');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'households', 'id', tests.fx('home_b'), 'changes', jsonb_build_object('name', 'Meins')))),
  '22023', 'invalid_change', 'T5 attack: another household cannot be patched');

-- ===================== Attack suite: households =====================
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Fremd')))),
  '42501', 'not_member', 'AC-011 apply_changes: a call for a household the caller is not a member of is denied');
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'recipes', 'id', tests.fx('recipe_b')))),
  '42501', 'not_member', 'AC-011 apply_changes: a foreign household''s row cannot be deleted');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Fremd', 'household_id', tests.fx('home_b'))))),
  '22023', 'invalid_change', 'AC-011 apply_changes: a row with another household_id than the call''s is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'articles',
    'row', jsonb_build_object('name', 'Apfel', 'name_key', 'apfel', 'area_id', tests.fx('area_b'))))),
  '23503', null, 'AC-011 apply_changes: a reference to a parent row of another household is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'shopping_items', 'id', tests.fx('item_milch'),
    'changes', jsonb_build_object('list_id', tests.fx('list_b'))))),
  '23503', null, 'AC-011 apply_changes: a row cannot be moved under a parent of another household');

-- Mia belongs to A and B: one call stays in one household.
select tests.authenticate_as(tests.fx('mia'));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_b'), 'changes', jsonb_build_object('title', 'Gemischt')))),
  'P0002', 'row_not_found', 'T5 apply_changes: a member of A and B cannot patch a B row in a call for A');
select is(
  tests.apply('home_a', jsonb_build_array(jsonb_build_object('kind', 'delete', 'table', 'recipes', 'id', tests.fx('recipe_b')))),
  '{"applied": 1, "results": []}'::jsonb,
  'T5 apply_changes: a delete of a B row in a call for A hits nothing');
select is(
  (select count(*)::int from public.recipes where id = tests.fx('recipe_b')), 1,
  'T5 apply_changes: … and the B row still exists');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'B', 'household_id', tests.fx('home_b'))))),
  '22023', 'invalid_change', 'T5 apply_changes: a member of A and B cannot insert into B in a call for A');
select is(
  tests.apply('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'remove_contributions', 'ids', jsonb_build_array(tests.fx('c_milch'), tests.fx('c_b'))))) -> 'results' -> 0,
  '1'::jsonb,
  'T5 apply_changes: remove_contributions removes only ids of the call''s household');
select is(
  (select count(*)::int from public.shopping_contributions where id = tests.fx('c_b')), 1,
  'T5 apply_changes: … the B contribution still exists');

-- ===================== Activities and photos (spec 0004) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'activities',
                       'row', jsonb_build_object('id', tests.fx('new_activity'), 'name', 'Klettern im Wald',
                                                 'name_key', 'klettern im wald', 'created_by', tests.fx('nadja'),
                                                 'tags', jsonb_build_array('draußen'))),
    jsonb_build_object('kind', 'insert', 'table', 'meal_plan_entries',
                       'row', jsonb_build_object('id', tests.fx('new_entry'), 'date', '2026-11-21',
                                                 'slot_id', tests.fx('slot_a'), 'kind', 'activity',
                                                 'activity_id', tests.fx('new_activity'), 'note', 'Hohenschönhausen')))),
  '{"applied": 2, "results": []}'::jsonb,
  'AC-021 apply_changes: one call creates an activity and plans it');
select results_eq(
  format($$ select a.name, a.created_by, e.kind, e.note
            from public.activities a join public.meal_plan_entries e on e.activity_id = a.id where a.id = %L $$,
         tests.fx('new_activity')),
  format($$ values ('Klettern im Wald', %L::uuid, 'activity', 'Hohenschönhausen') $$, tests.fx('enrico')),
  'AC-021 apply_changes: … created_by is the caller and the entry carries the note');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'activities', 'id', tests.fx('new_activity'),
                       'changes', jsonb_build_object(
                         'name', 'Klettern', 'name_key', 'klettern', 'description', 'Mit Seil',
                         'photo_path', tests.fx('home_a') || '/activities/' || tests.fx('new_activity') || '/a.jpg',
                         'place_name', 'Kletterwald', 'address', 'Am Wald 1, Berlin', 'lat', 52.4, 'lng', 13.2,
                         'maps_url', 'https://maps.app.goo.gl/k', 'tags', jsonb_build_array('sport'))),
    jsonb_build_object('kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx('new_entry'),
                       'changes', jsonb_build_object('note', 'Wuhletal')),
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('recipe_a'),
                       'changes', jsonb_build_object(
                         'photo_path', tests.fx('home_a') || '/recipes/' || tests.fx('recipe_a') || '/r.jpg')))),
  'REQ-003 apply_changes: activity columns, the entry note and a recipe photo_path are patchable');
select results_eq(
  format($$ select a.name, a.photo_path, e.note, r.photo_path
            from public.activities a, public.meal_plan_entries e, public.recipes r
            where a.id = %L and e.id = %L and r.id = %L $$,
         tests.fx('new_activity'), tests.fx('new_entry'), tests.fx('recipe_a')),
  format($$ values ('Klettern', %L, 'Wuhletal', %L) $$,
         tests.fx('home_a') || '/activities/' || tests.fx('new_activity') || '/a.jpg',
         tests.fx('home_a') || '/recipes/' || tests.fx('recipe_a') || '/r.jpg'),
  'AC-009/AC-017 apply_changes: … and stored');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'activities',
                       'row', jsonb_build_object('id', tests.fx('bad_activity'), 'name', '', 'name_key', 'leer')),
    jsonb_build_object('kind', 'insert', 'table', 'meal_plan_entries',
                       'row', jsonb_build_object('slot_id', tests.fx('slot_a'), 'kind', 'activity',
                                                 'activity_id', tests.fx('bad_activity'))))),
  '23514', null, 'AC-023 apply_changes: a new activity without a name is rejected …');
select is(
  (select count(*)::int from public.meal_plan_entries where activity_id = tests.fx('bad_activity'))
    + (select count(*)::int from public.activities where id = tests.fx('bad_activity')), 0,
  'AC-023 apply_changes: … and nothing is created or planned');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'activities', 'id', tests.fx('new_activity'),
    'changes', jsonb_build_object('created_by', tests.fx('nadja'))))),
  '22023', 'invalid_change', 'T5 attack: activities.created_by cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'activities', 'id', tests.fx('new_activity'),
    'changes', jsonb_build_object('household_id', tests.fx('home_b'))))),
  '22023', 'invalid_change', 'T5 attack: activities.household_id cannot be patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'activity_favorites',
    'row', jsonb_build_object('activity_id', tests.fx('new_activity'), 'member_id', tests.fx('nadja'))))),
  '22023', 'invalid_change', 'T5 attack: activity_favorites is not writable (set_* RPCs only)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'activity_ratings',
    'row', jsonb_build_object('activity_id', tests.fx('new_activity'), 'member_id', tests.fx('nadja'), 'stars', 5)))),
  '22023', 'invalid_change', 'T5 attack: activity_ratings is not writable (set_* RPCs only)');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'activities', 'id', tests.fx('new_activity')))),
  '23503', null, 'REQ-005 apply_changes: a planned activity cannot be deleted on its own');
select is(
  tests.apply('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'meal_plan_entries', 'id', tests.fx('new_entry')),
    jsonb_build_object('kind', 'delete', 'table', 'activities', 'id', tests.fx('new_activity')))),
  '{"applied": 2, "results": []}'::jsonb,
  'REQ-002 apply_changes: its entries and the activity are deleted in one call');

-- ===================== Limits =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  tests.apply_sql('home_a', (select jsonb_agg(jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', gen_random_uuid()))
                             from generate_series(1, 21))),
  '22023', 'too_many_changes', 'T5 apply_changes: more than 20 deletes are rejected');
select lives_ok(
  tests.apply_sql('home_a', (select jsonb_agg(jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', gen_random_uuid()))
                             from generate_series(1, 20))),
  'T5 apply_changes: 20 deletes are allowed');
-- Ids inside remove_contributions count as deletes and as ops (security check 0003).
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'remove_contributions',
    'ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 21))))),
  '22023', 'too_many_changes', 'T5 apply_changes: one remove_contributions op with 21 ids is rejected');
select throws_ok(
  tests.apply_sql('home_a',
    (select jsonb_agg(jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', gen_random_uuid()))
     from generate_series(1, 15))
    || jsonb_build_array(jsonb_build_object('kind', 'remove_contributions',
         'ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 6))))),
  '22023', 'too_many_changes', 'T5 apply_changes: deletes and removed contribution ids add up to the limit');
select lives_ok(
  tests.apply_sql('home_a',
    (select jsonb_agg(jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', gen_random_uuid()))
     from generate_series(1, 15))
    || jsonb_build_array(jsonb_build_object('kind', 'remove_contributions',
         'ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 5))))),
  'T5 apply_changes: 15 deletes plus 5 removed contributions are allowed');
select throws_ok(
  tests.apply_sql('home_a',
    (select jsonb_agg(jsonb_build_object('kind', 'insert', 'table', 'areas',
                                         'row', jsonb_build_object('name', 'Bereich ' || n)))
     from generate_series(1, 190) n)
    || jsonb_build_array(jsonb_build_object('kind', 'remove_contributions',
         'ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 11))))),
  '22023', 'too_many_changes', 'T5 apply_changes: removed contribution ids count toward the 200 ops');
select throws_ok(
  tests.apply_sql('home_a', (select jsonb_agg(jsonb_build_object('kind', 'insert', 'table', 'areas',
                                                                 'row', jsonb_build_object('name', 'Bereich ' || n)))
                             from generate_series(1, 201) n)),
  '22023', 'too_many_changes', 'T5 apply_changes: more than 200 ops are rejected');
select is(
  (select count(*)::int from public.areas where name like 'Bereich %'), 0,
  'T5 apply_changes: … and nothing of them is applied');
-- Entries of add_contributions count as ops, and the contributions of a call are capped
-- (security re-check 0003).
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'add_contributions',
    'list_id', tests.fx('list_a'), 'entries', tests.add_entries(201, 1)))),
  '22023', 'too_many_changes', 'T5 apply_changes: one add_contributions op with 201 entries is rejected');
select throws_ok(
  tests.apply_sql('home_a',
    (select jsonb_agg(jsonb_build_object('kind', 'insert', 'table', 'areas',
                                         'row', jsonb_build_object('name', 'Gang ' || n)))
     from generate_series(1, 150) n)
    || jsonb_build_array(jsonb_build_object('kind', 'add_contributions',
         'list_id', tests.fx('list_a'), 'entries', tests.add_entries(51, 1)))),
  '22023', 'too_many_changes', 'T5 apply_changes: add_contributions entries count toward the 200 ops');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'add_contributions',
    'list_id', tests.fx('list_a'), 'entries', tests.add_entries(200, 1)))),
  'T5 apply_changes: one add_contributions op with 200 entries is allowed');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'add_contributions',
    'list_id', tests.fx('list_a'), 'entries', tests.add_entries(5, 100) || tests.add_entries(1, 1)))),
  '22023', 'too_many_changes', 'T5 apply_changes: more than 500 contributions in one op are rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'add_contributions', 'list_id', tests.fx('list_a'),
                       'entries', tests.add_entries(3, 100)),
    jsonb_build_object('kind', 'add_contributions', 'list_id', tests.fx('list_a'),
                       'entries', tests.add_entries(2, 100) || tests.add_entries(1, 1)))),
  '22023', 'too_many_changes', 'T5 apply_changes: the contributions of all add_contributions ops add up to the cap');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'add_contributions',
    'list_id', tests.fx('list_a'), 'entries', tests.add_entries(5, 100)))),
  'T5 apply_changes: 500 contributions in one call are allowed');

-- ===================== Signed out =====================
select tests.authenticate_as_anon();
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'areas', 'row', jsonb_build_object('name', 'Anon')))),
  '42501', null, 'AC-005 apply_changes: anon cannot call it');

select * from finish();
rollback;
