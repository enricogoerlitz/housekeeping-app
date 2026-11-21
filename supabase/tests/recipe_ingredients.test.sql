-- Recipe ingredients point at articles of the recipe's household (spec 0007, T1; AC-006, AC-019
-- on the server). The trigger recipes_check_ingredients checks every ingredient — directly, through
-- apply_changes and for every role — and rejects the whole change with ingredient_article_invalid
-- (23503): no articleId, not a canonical (lower-case) UUID, an article that does not exist or
-- belongs to another household, a prepNote that is not text or longer than 200 characters.
begin;
\ir _helpers.psql
select plan(26);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- One ingredient of the article, in the shape of core RecipeIngredient, plus p_extra.
create function tests.ing(p_article uuid, p_extra jsonb default '{}') returns jsonb language sql stable
as $$
  select jsonb_build_object('id', 'i-' || left(p_article::text, 8), 'articleId', p_article::text,
                            'amount', jsonb_build_object('qty', 400, 'unit', 'ml'), 'shoppingRule', 'recipeAmount')
         || p_extra
$$;
grant execute on function tests.ing(uuid, jsonb) to anon, authenticated;

-- The SQL text of a direct update of the recipe's ingredients.
create function tests.set_ingredients_sql(p_recipe text, p_ingredients jsonb) returns text language sql stable
as $$ select format('update public.recipes set ingredients = %L where id = %L', p_ingredients, tests.fx(p_recipe)) $$;
grant execute on function tests.set_ingredients_sql(text, jsonb) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('kokosmilch'), ('zwiebeln'), ('milchkokos_b'), ('mango_curry'), ('curry_b'), ('new_recipe'), ('unknown');

insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('kokosmilch'), tests.fx('home_a'), 'Kokosmilch', 'kokosmilch'),
  (tests.fx('zwiebeln'), tests.fx('home_a'), 'Zwiebeln', 'zwiebeln'),
  (tests.fx('milchkokos_b'), tests.fx('home_b'), 'Milchkokos', 'milchkokos');
insert into public.recipes (id, household_id, title, ingredients) values
  (tests.fx('mango_curry'), tests.fx('home_a'), 'Mango-Curry', jsonb_build_array(tests.ing(tests.fx('kokosmilch')))),
  (tests.fx('curry_b'), tests.fx('home_b'), 'Curry', jsonb_build_array(tests.ing(tests.fx('milchkokos_b'))));

-- The ingredients of Mango-Curry as stored by the fixture; every refused change must leave them.
create temp table original (ingredients jsonb) on commit drop;
grant select on original to anon, authenticated;
insert into original select ingredients from public.recipes where id = tests.fx('mango_curry');

-- ===================== Valid ingredients =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(
    tests.ing(tests.fx('kokosmilch'), '{"shoppingNote": "Bio", "group": "Soße", "variantId": "v1"}'),
    tests.ing(tests.fx('zwiebeln'), '{"prepNote": "fein gehackt", "name": "Zwiebeln"}'),
    tests.ing(tests.fx('zwiebeln'), jsonb_build_object('prepNote', repeat('x', 200))))),
  'AC-006 recipes: ingredients with an article of the household, a prepNote of 200 characters and other keys are stored');
select is(
  (select jsonb_array_length(ingredients) from public.recipes where id = tests.fx('mango_curry')), 3,
  'AC-006 recipes: all three ingredients are stored');
select lives_ok(
  tests.set_ingredients_sql('mango_curry', '[]'::jsonb),
  'AC-006 recipes: a recipe without ingredients is valid');
select lives_ok(
  tests.set_ingredients_sql('mango_curry', (select ingredients from original)),
  'AC-006 recipes: the original ingredients are stored again');

-- ===================== Invalid ingredients, directly =====================
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('kokosmilch')) - 'articleId')),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: an ingredient without articleId is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('kokosmilch'), '{"articleId": null}'))),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: an ingredient with articleId null is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('unknown')))),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: an ingredient pointing at an article that does not exist is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(
    tests.ing(tests.fx('kokosmilch')), tests.ing(tests.fx('milchkokos_b')))),
  '23503', 'ingredient_article_invalid',
  'AC-006 AC-019 recipes: an ingredient pointing at an article of another household is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('kokosmilch'), '{"articleId": "Kokosmilch"}'))),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: an articleId that is not a UUID is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(
    tests.ing(tests.fx('kokosmilch'), jsonb_build_object('articleId', upper(tests.fx('kokosmilch')::text))))),
  '23503', 'ingredient_article_invalid',
  'T1 recipes: an articleId must be the canonical lower-case UUID');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(
    tests.ing(tests.fx('zwiebeln'), jsonb_build_object('prepNote', repeat('x', 201))))),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: a prepNote longer than 200 characters is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('zwiebeln'), '{"prepNote": 5}'))),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: a prepNote that is not text is rejected');
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.fx('kokosmilch')::text)),
  '23503', 'ingredient_article_invalid',
  'AC-006 recipes: an ingredient that is not an object is rejected');
select throws_ok(
  format($$ insert into public.recipes (id, household_id, title, ingredients) values (%L, %L, 'Curry', %L) $$,
         tests.fx('new_recipe'), tests.fx('home_a'), jsonb_build_array(tests.ing(tests.fx('milchkokos_b')))),
  '23503', 'ingredient_article_invalid',
  'AC-019 recipes: a new recipe with an article of another household is rejected');
select tests.clear_authentication();
select results_eq(
  format($$ select ingredients from public.recipes where id = %L $$, tests.fx('mango_curry')),
  $$ select ingredients from original $$,
  'AC-006 recipes: Mango-Curry is unchanged after every refused change');
select is(
  (select count(*)::int from public.recipes where id = tests.fx('new_recipe')), 0,
  'AC-019 recipes: the refused recipe does not exist');

-- ===================== Through apply_changes =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('mango_curry'),
                       'changes', jsonb_build_object('title', 'Mango-Curry scharf')),
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('mango_curry'),
                       'changes', jsonb_build_object('ingredients', jsonb_build_array(
                         tests.ing(tests.fx('kokosmilch')) - 'articleId'))))),
  '23503', 'ingredient_article_invalid',
  'AC-006 apply_changes: a changeset with an ingredient without article is rejected');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'recipes',
                       'row', jsonb_build_object('id', tests.fx('new_recipe'), 'title', 'Curry',
                                                 'ingredients', jsonb_build_array(tests.ing(tests.fx('milchkokos_b'))))))),
  '23503', 'ingredient_article_invalid',
  'AC-019 apply_changes: a new recipe with an article of another household is rejected');
select results_eq(
  format($$ select title, ingredients from public.recipes where id = %L $$, tests.fx('mango_curry')),
  $$ select 'Mango-Curry'::text, ingredients from original $$,
  'AC-006 apply_changes: the refused changeset changed nothing, also not the title (one transaction)');
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'recipes', 'id', tests.fx('mango_curry'),
                       'changes', jsonb_build_object('ingredients', jsonb_build_array(
                         tests.ing(tests.fx('kokosmilch')),
                         tests.ing(tests.fx('zwiebeln'), '{"prepNote": "fein gehackt"}')))))),
  'AC-006 apply_changes: valid ingredients are stored');
select is(
  (select ingredients -> 1 ->> 'prepNote' from public.recipes where id = tests.fx('mango_curry')), 'fein gehackt',
  'AC-006 apply_changes: the prepNote is stored with the ingredient');

-- ===================== Other household, signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('milchkokos_b'))))), 0,
  'AC-006 recipes: a member of another household changes nothing');
select throws_ok(
  tests.set_ingredients_sql('curry_b', jsonb_build_array(tests.ing(tests.fx('kokosmilch')))),
  '23503', 'ingredient_article_invalid',
  'AC-019 recipes: WG Köln cannot use an article of Enrico & Nadja');
select lives_ok(
  tests.set_ingredients_sql('curry_b', jsonb_build_array(tests.ing(tests.fx('milchkokos_b'), '{"prepNote": "kalt"}'))),
  'AC-019 recipes: WG Köln uses its own article');

select tests.authenticate_as_anon();
select throws_ok(
  tests.set_ingredients_sql('mango_curry', jsonb_build_array(tests.ing(tests.fx('kokosmilch')) - 'articleId')),
  '42501', null,
  'AC-006 recipes: anon cannot change ingredients');

select tests.clear_authentication();
select is(
  (select ingredients -> 0 ->> 'articleId' from public.recipes where id = tests.fx('mango_curry')),
  tests.fx('kokosmilch')::text,
  'AC-006 recipes: Mango-Curry still points at Kokosmilch after the foreign and signed-out attempts');

select * from finish();
rollback;
