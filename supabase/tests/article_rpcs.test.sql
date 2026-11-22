-- Articles of the catalog (spec 0007, T1): the new columns default_shopping_rule and needs_review,
-- unique names and synonyms per household (E6), deleting only unused articles through
-- delete_article (E4; AC-033, AC-034) and merging two articles with merge_articles (E8; AC-036,
-- AC-038, AC-039, AC-041, Offene Frage 11). Negative cases: another household, signed out,
-- invalid input, a merge that fails at its last step and changes nothing.
begin;
\ir _helpers.psql
select plan(64);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- One ingredient of the article in the shape of core RecipeIngredient.
create function tests.ing(p_id text, p_article uuid, p_extra jsonb default '{}') returns jsonb language sql stable
as $$ select jsonb_build_object('id', p_id, 'articleId', p_article::text, 'shoppingRule', 'count') || p_extra $$;
grant execute on function tests.ing(text, uuid, jsonb) to anon, authenticated;

-- An article row as one comparable record (for "nothing changed").
create function tests.article_state(p_id uuid)
returns table (name text, name_key text, synonyms text[], synonym_keys text[], area_id uuid, diet text,
               is_pantry boolean, default_shopping_rule text, needs_review boolean)
language sql stable
as $$
  select a.name, a.name_key, a.synonyms, a.synonym_keys, a.area_id, a.diet, a.is_pantry, a.default_shopping_rule,
         a.needs_review
  from public.articles a where a.id = p_id
$$;
grant execute on function tests.article_state(uuid) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('konserven'), ('kokosmilch'), ('milchkokos'), ('drachenfrucht'), ('milch'), ('butter'), ('linsen'),
  ('tomaten'), ('tomate_x'), ('kokosnuss'), ('area_b'),
  ('curry'), ('mango_curry'), ('dal'), ('suppe'),
  ('item_milchkokos'), ('item_kokosmilch'), ('item_milch'), ('item_butter'), ('item_tomate_x'),
  ('c_milchkokos'), ('c_kokosmilch'), ('c_milch'), ('c_butter'), ('c_tomate_x'), ('new_article'), ('unknown');

insert into public.areas (id, household_id, name) values
  (tests.fx('konserven'), tests.fx('home_a'), 'Konserven & Saucen'),
  (tests.fx('area_b'), tests.fx('home_b'), 'Keller');
insert into public.articles
  (id, household_id, name, name_key, synonyms, synonym_keys, area_id, diet, is_pantry, default_shopping_rule, needs_review)
values
  (tests.fx('kokosmilch'), tests.fx('home_a'), 'Kokosmilch', 'kokosmilch', '{}', '{}', null, 'vegan', false, null, true),
  (tests.fx('milchkokos'), tests.fx('home_a'), 'Milchkokos', 'milchkokos', '{Kokosdrink}', '{kokosdrink}',
   tests.fx('konserven'), 'unknown', true, 'recipeAmount', true),
  (tests.fx('drachenfrucht'), tests.fx('home_a'), 'Drachenfrucht', 'drachenfrucht', '{}', '{}', null, 'unknown', false, null, false),
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch', '{}', '{}', null, 'vegetarian', false, null, false),
  (tests.fx('butter'), tests.fx('home_a'), 'Butter', 'butter', '{}', '{}', null, 'vegetarian', false, null, false),
  (tests.fx('linsen'), tests.fx('home_a'), 'Rote Linsen', 'rote linsen', '{}', '{}', null, 'vegan', true, null, false),
  (tests.fx('tomaten'), tests.fx('home_a'), 'Tomaten', 'tomaten',
   array(select 'Tomatensorte ' || i from generate_series(1, 29) i),
   array(select 'tomatensorte ' || i from generate_series(1, 29) i), null, 'vegan', false, null, false),
  (tests.fx('tomate_x'), tests.fx('home_a'), 'Strauchtomate', 'strauchtomate', '{Rispentomate}', '{rispentomate}',
   null, 'vegan', false, null, true),
  (tests.fx('kokosnuss'), tests.fx('home_b'), 'Kokosnuss', 'kokosnuss', '{}', '{}', tests.fx('area_b'), 'vegan', false, null, false);

insert into public.recipes (id, household_id, title, ingredients) values
  (tests.fx('curry'), tests.fx('home_a'), 'Curry', jsonb_build_array(
    tests.ing('i1', tests.fx('milchkokos'), jsonb_build_object(
      'amount', jsonb_build_object('qty', 200, 'unit', 'ml'), 'shoppingRule', 'recipeAmount',
      'shoppingNote', 'Bio', 'variantId', 'v-tofu', 'group', 'Soße', 'prepNote', 'gut schütteln')),
    tests.ing('i2', tests.fx('kokosmilch'), jsonb_build_object('amount', jsonb_build_object('qty', 400, 'unit', 'ml'))))),
  (tests.fx('mango_curry'), tests.fx('home_a'), 'Mango-Curry', jsonb_build_array(tests.ing('i1', tests.fx('kokosmilch')))),
  (tests.fx('dal'), tests.fx('home_a'), 'Linsen-Dal', jsonb_build_array(tests.ing('i1', tests.fx('linsen')))),
  (tests.fx('suppe'), tests.fx('home_a'), 'Tomatensuppe', jsonb_build_array(tests.ing('i1', tests.fx('tomate_x'))));

-- Milchkokos open ("von Hand: 1×", Zusatz "Bio"); Kokosmilch open from
-- Mango-Curry; Milch open; Butter only checked; Strauchtomate open.
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, checked_by, check_seq) values
  (tests.fx('item_milchkokos'), tests.fx('home_a'), tests.fx('milchkokos'), false, null, null, 0),
  (tests.fx('item_kokosmilch'), tests.fx('home_a'), tests.fx('kokosmilch'), false, null, null, 0),
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('milch'), false, null, null, 0),
  (tests.fx('item_butter'), tests.fx('home_a'), tests.fx('butter'), true, now(), tests.fx('enrico'), 1),
  (tests.fx('item_tomate_x'), tests.fx('home_a'), tests.fx('tomate_x'), false, null, null, 0);
insert into public.shopping_contributions (id, household_id, item_id, source, count, note) values
  (tests.fx('c_milchkokos'), tests.fx('home_a'), tests.fx('item_milchkokos'), '{"kind": "manual"}', 1, 'Bio'),
  (tests.fx('c_kokosmilch'), tests.fx('home_a'), tests.fx('item_kokosmilch'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('mango_curry'), 'label', 'Mango-Curry (Sa)'), 1, null),
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_butter'), tests.fx('home_a'), tests.fx('item_butter'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_tomate_x'), tests.fx('home_a'), tests.fx('item_tomate_x'), '{"kind": "manual"}', 1, null);

-- ===================== New columns =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'articles', 'row', jsonb_build_object(
      'id', tests.fx('new_article'), 'name', 'Mehl', 'name_key', 'mehl',
      'default_shopping_rule', 'recipeAmount', 'needs_review', true)))),
  'AC-005 apply_changes: an article is inserted with default_shopping_rule and needs_review');
select results_eq(
  format('select default_shopping_rule, needs_review from public.articles where id = %L', tests.fx('new_article')),
  $$ values ('recipeAmount'::text, true) $$,
  'AC-005 articles: default_shopping_rule and needs_review are stored');
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'articles', 'id', tests.fx('new_article'),
                       'changes', jsonb_build_object('default_shopping_rule', 'skip', 'needs_review', false)))),
  'AC-005 AC-029 apply_changes: default_shopping_rule and needs_review can be patched');
select results_eq(
  format('select default_shopping_rule, needs_review from public.articles where id = %L', tests.fx('new_article')),
  $$ values ('skip'::text, false) $$,
  'AC-029 articles: the patch is stored ("Neu aus Rezepten" left)');
select throws_ok(
  format($$ update public.articles set default_shopping_rule = 'often' where id = %L $$, tests.fx('new_article')),
  '23514', null,
  'AC-005 articles: default_shopping_rule must be count, recipeAmount or skip');
select is(
  (select needs_review from public.articles where id = tests.fx('drachenfrucht')), false,
  'AC-002 articles: needs_review is false unless set');

-- ===================== Unique names and synonyms (E6, AC-030, AC-031) =====================
select throws_ok(
  format($$ insert into public.articles (household_id, name, name_key, synonyms, synonym_keys)
            values (%L, 'Kokos', 'kokos', '{Kokosmilch}', '{kokosmilch}') $$, tests.fx('home_a')),
  '23505', 'name_taken',
  'AC-031 articles: a synonym equal to the name of another article is rejected');
select throws_ok(
  format($$ insert into public.articles (household_id, name, name_key) values (%L, 'Kokosdrink', 'kokosdrink') $$,
         tests.fx('home_a')),
  '23505', 'name_taken',
  'AC-030 articles: a name equal to a synonym of another article is rejected');
select throws_ok(
  format($$ update public.articles set synonyms = '{Kokos-Drink}', synonym_keys = '{kokosdrink}' where id = %L $$,
         tests.fx('drachenfrucht')),
  '23505', 'name_taken',
  'AC-031 articles: a synonym equal to a synonym of another article is rejected');
select throws_ok(
  format($$ update public.articles set name = 'kokosmilch', name_key = 'kokosmilch' where id = %L $$, tests.fx('milchkokos')),
  '23505', null,
  'AC-030 articles: renaming to the name of another article is rejected');
select throws_ok(
  format($$ update public.articles set synonyms = '{Drachenfrucht}', synonym_keys = '{drachenfrucht}' where id = %L $$,
         tests.fx('drachenfrucht')),
  '23514', null,
  'E6 articles: an article''s own name cannot be one of its synonyms');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'articles', 'row', jsonb_build_object(
      'name', 'Möhren', 'name_key', 'moehren', 'synonyms', jsonb_build_array('Milch'),
      'synonym_keys', jsonb_build_array('milch'))))),
  '23505', 'name_taken',
  'AC-031 apply_changes: a synonym equal to another article''s name is rejected');
select lives_ok(
  format($$ update public.articles set name = 'Milchkokos', synonyms = '{Kokosdrink}', synonym_keys = '{kokosdrink}',
            diet = 'unknown' where id = %L $$, tests.fx('milchkokos')),
  'E6 articles: saving an article with its own name and synonyms is fine');
select results_eq(
  format('select * from tests.article_state(%L)', tests.fx('milchkokos')),
  format($$ values ('Milchkokos'::text, 'milchkokos'::text, '{Kokosdrink}'::text[], '{kokosdrink}'::text[], %L::uuid,
                    'unknown'::text, true, 'recipeAmount'::text, true) $$, tests.fx('konserven')),
  'E6 articles: Milchkokos is unchanged by the refused changes');
select tests.authenticate_as(tests.fx('ben'));
select lives_ok(
  format($$ insert into public.articles (household_id, name, name_key, synonyms, synonym_keys)
            values (%L, 'Kokosmilch', 'kokosmilch', '{Milchkokos, Kokosdrink}', '{milchkokos, kokosdrink}') $$,
         tests.fx('home_b')),
  'E6 articles: another household may use the same name and synonyms');

-- ===================== delete_article (E4, AC-033, AC-034) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (public.delete_article(tests.fx('drachenfrucht')) ->> 'name'), 'Drachenfrucht',
  'AC-033 delete_article: an unused article is deleted and returned for "Rückgängig"');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.articles where id = tests.fx('drachenfrucht')), 0,
  'AC-033 delete_article: the article is gone');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  (select count(*)::int from public.deleted_records
   where table_name = 'articles' and record_id = tests.fx('drachenfrucht')::text), 1,
  'AC-033 delete_article: the deletion reaches Nadja as a tombstone');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'articles', 'row', jsonb_build_object(
      'id', tests.fx('drachenfrucht'), 'name', 'Drachenfrucht', 'name_key', 'drachenfrucht')))),
  'AC-033 apply_changes: "Rückgängig" inserts the deleted article again');
select throws_ok(
  format('select public.delete_article(%L)', tests.fx('linsen')),
  'P0001', 'article_in_use',
  'AC-034 delete_article: an article used in a recipe is not deleted');
select throws_ok(
  format('select public.delete_article(%L)', tests.fx('milch')),
  'P0001', 'article_in_use',
  'AC-034 delete_article: an article open on the list is not deleted');
select is(
  public.delete_article(tests.fx('butter')) ->> 'name', 'Butter',
  'AC-047 delete_article: an article only checked on the list is deleted with its item (spec 0025)');
select throws_ok(
  format('select public.delete_article(%L)', tests.fx('kokosnuss')),
  'P0002', 'article_not_found',
  'AC-034 delete_article: an article of another household is not found');
select throws_ok(
  format('select public.delete_article(%L)', tests.fx('unknown')),
  'P0002', 'article_not_found',
  'AC-034 delete_article: an unknown article is not found');
select throws_ok(
  format('delete from public.articles where id = %L', tests.fx('drachenfrucht')),
  '42501', null,
  'E4 articles: a member cannot delete an article directly');
select throws_ok(
  format('select public.apply_changes(%L, %L)', tests.fx('home_a'), jsonb_build_array(
    jsonb_build_object('kind', 'delete', 'table', 'articles', 'id', tests.fx('drachenfrucht')))),
  '22023', 'invalid_change',
  'E4 apply_changes: articles cannot be deleted through apply_changes');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.delete_article(%L)', tests.fx('drachenfrucht')),
  '42501', null,
  'AC-034 delete_article: anon cannot call it');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.articles
   where id in (tests.fx('linsen'), tests.fx('milch'), tests.fx('kokosnuss'), tests.fx('drachenfrucht'))),
  4,
  'AC-034 delete_article: every refused article still exists');

-- ===================== merge_articles: refused (AC-041, invalid input) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('milchkokos'), tests.fx('kokosnuss')),
  'P0002', 'article_not_found',
  'AC-041 merge_articles: the target of another household is not found');
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('kokosnuss'), tests.fx('milchkokos')),
  'P0002', 'article_not_found',
  'AC-041 merge_articles: the source of another household is not found');
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('milchkokos'), tests.fx('unknown')),
  'P0002', 'article_not_found',
  'AC-041 merge_articles: an unknown target is not found');
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('milchkokos'), tests.fx('milchkokos')),
  '22023', 'invalid_value',
  'AC-041 merge_articles: an article cannot be merged with itself');
select throws_ok(
  format('select public.merge_articles(%L, null)', tests.fx('milchkokos')),
  '22023', 'invalid_value',
  'AC-041 merge_articles: a missing target is invalid');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('milchkokos'), tests.fx('kokosmilch')),
  'P0002', 'article_not_found',
  'AC-041 merge_articles: a member of another household finds neither article');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('milchkokos'), tests.fx('kokosmilch')),
  '42501', null,
  'AC-041 merge_articles: anon cannot call it');
select tests.clear_authentication();
select results_eq(
  format('select * from tests.article_state(%L)', tests.fx('milchkokos')),
  format($$ values ('Milchkokos'::text, 'milchkokos'::text, '{Kokosdrink}'::text[], '{kokosdrink}'::text[], %L::uuid,
                    'unknown'::text, true, 'recipeAmount'::text, true) $$, tests.fx('konserven')),
  'AC-041 merge_articles: Milchkokos is unchanged');
select results_eq(
  format('select * from tests.article_state(%L)', tests.fx('kokosnuss')),
  format($$ values ('Kokosnuss'::text, 'kokosnuss'::text, '{}'::text[], '{}'::text[], %L::uuid,
                    'vegan'::text, false, null::text, false) $$, tests.fx('area_b')),
  'AC-041 merge_articles: Kokosnuss of WG Köln is unchanged');

-- ===================== merge_articles: more than 30 synonyms (Offene Frage 11) =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('tomate_x'), tests.fx('tomaten')),
  '22023', 'too_many_synonyms',
  'E8 merge_articles: 31 synonyms on the target are refused');
select tests.clear_authentication();
select ok(
  exists (select 1 from public.articles where id = tests.fx('tomate_x')),
  'E8 merge_articles: after the refusal the source still exists');
select is(
  (select ingredients -> 0 ->> 'articleId' from public.recipes where id = tests.fx('suppe')), tests.fx('tomate_x')::text,
  'E8 merge_articles: after the refusal the recipe still points at the source');
select is(
  (select article_id from public.shopping_items where id = tests.fx('item_tomate_x')), tests.fx('tomate_x'),
  'E8 merge_articles: after the refusal the item still belongs to the source');
select is(
  (select cardinality(synonyms) from public.articles where id = tests.fx('tomaten')), 29,
  'E8 merge_articles: after the refusal the target keeps its 29 synonyms');

-- ===================== merge_articles: more than 2000 characters in all synonyms ==================
-- articles_synonyms_size and articles_synonym_keys_size would fail with 23514; the merge refuses
-- with too_many_synonyms like for 31 synonyms (security-check hint, T8).
select tests.clear_authentication();
insert into fx (key) values ('lang_ziel'), ('lang_quelle'), ('umlaut_ziel');
insert into public.articles (id, household_id, name, name_key, synonyms, synonym_keys) values
  (tests.fx('lang_ziel'), tests.fx('home_a'), 'Langer Name', 'langer name',
   array[repeat('a', 995), repeat('b', 995)], array[repeat('a', 995), repeat('b', 995)]),
  (tests.fx('lang_quelle'), tests.fx('home_a'), 'Kurzname Bio', 'kurzname bio', '{}', '{}'),
  (tests.fx('umlaut_ziel'), tests.fx('home_a'), 'Umlaute', 'umlaute',
   array[repeat('ä', 995)], array[repeat('ae', 995)]);
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('lang_quelle'), tests.fx('lang_ziel')),
  '22023', 'too_many_synonyms',
  'E8 merge_articles: more than 2000 characters in all synonyms are refused as too_many_synonyms');
select throws_ok(
  format('select public.merge_articles(%L, %L)', tests.fx('lang_quelle'), tests.fx('umlaut_ziel')),
  '22023', 'too_many_synonyms',
  'E8 merge_articles: more than 2000 characters in all synonym keys are refused as too_many_synonyms');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.articles where id in (tests.fx('lang_ziel'), tests.fx('lang_quelle'), tests.fx('umlaut_ziel'))),
  3,
  'E8 merge_articles: after the refusals all three articles still exist');

-- ===================== merge_articles: Milchkokos into Kokosmilch (AC-036, AC-038, AC-039) ==========
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.merge_articles(tests.fx('milchkokos'), tests.fx('kokosmilch')),
  '{"recipes": 1, "items": 1}'::jsonb,
  'AC-036 merge_articles: one recipe and the one item of the source moved');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  (select ingredients from public.recipes where id = tests.fx('curry')),
  jsonb_build_array(
    tests.ing('i1', tests.fx('kokosmilch'), jsonb_build_object(
      'amount', jsonb_build_object('qty', 200, 'unit', 'ml'), 'shoppingRule', 'recipeAmount',
      'shoppingNote', 'Bio', 'variantId', 'v-tofu', 'group', 'Soße', 'prepNote', 'gut schütteln')),
    tests.ing('i2', tests.fx('kokosmilch'), jsonb_build_object('amount', jsonb_build_object('qty', 400, 'unit', 'ml')))),
  'AC-036 AC-039 merge_articles: Curry keeps both rows, now on Kokosmilch, with their other values');
select is(
  (select ingredients from public.recipes where id = tests.fx('mango_curry')),
  jsonb_build_array(tests.ing('i1', tests.fx('kokosmilch'))),
  'AC-036 merge_articles: a recipe of the target is untouched');
select results_eq(
  format($$ select i.id from public.shopping_items i where i.article_id = %L and not i.checked $$, tests.fx('kokosmilch')),
  format($$ values (%L::uuid) $$, tests.fx('item_kokosmilch')),
  'AC-036 merge_articles: Kokosmilch is open on the list exactly once');
select results_eq(
  format($$ select c.id, c.note from public.shopping_contributions c where c.item_id = %L order by c.created_at, c.id $$,
         tests.fx('item_kokosmilch')),
  format($$ select * from (values (%L::uuid, 'Bio'::text), (%L::uuid, null::text)) v (id, note) order by 1 $$,
         tests.fx('c_milchkokos'), tests.fx('c_kokosmilch')),
  'AC-036 merge_articles: the open item holds both contributions, the "Bio" Zusatz is kept');
select is(
  (select replaced_by from public.deleted_records
   where table_name = 'shopping_items' and record_id = tests.fx('item_milchkokos')::text),
  tests.fx('item_kokosmilch')::text,
  'AC-040 merge_articles: the tombstone of the merged item names the item of the target');
select is(
  (select count(*)::int from public.shopping_items where article_id = tests.fx('kokosmilch')), 1,
  'S-03 merge_articles: Kokosmilch has exactly one item on the list');
select results_eq(
  format('select * from tests.article_state(%L)', tests.fx('kokosmilch')),
  format($$ values ('Kokosmilch'::text, 'kokosmilch'::text, '{Milchkokos, Kokosdrink}'::text[],
                    '{milchkokos, kokosdrink}'::text[], %L::uuid, 'vegan'::text, false, 'recipeAmount'::text, false) $$,
         tests.fx('konserven')),
  'AC-036 AC-038 merge_articles: synonyms Milchkokos and Kokosdrink; area and rule filled, vegan and no Vorrat kept, reviewed');
select is(
  (select count(*)::int from public.articles where id = tests.fx('milchkokos')), 0,
  'AC-036 merge_articles: the source is gone');
select is(
  (select count(*)::int from public.deleted_records where table_name = 'articles' and record_id = tests.fx('milchkokos')::text),
  1,
  'AC-036 merge_articles: the source leaves a tombstone Nadja reads');
select is(
  (select replaced_by from public.deleted_records where table_name = 'articles' and record_id = tests.fx('milchkokos')::text),
  null::text,
  'E5 merge_articles: only item tombstones carry replaced_by');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  $$ update public.deleted_records set replaced_by = 'x' $$,
  '42501', null,
  'E5 deleted_records: members cannot write replaced_by');
select throws_ok(
  format($$ insert into public.articles (household_id, name, name_key) values (%L, 'Milchkokos', 'milchkokos') $$,
         tests.fx('home_a')),
  '23505', 'name_taken',
  'AC-037 articles: the old name is now a synonym of the target and cannot be a new article');

-- ===================== merge_articles: source not open, target open, empty attributes =============
select tests.clear_authentication();
insert into fx (key) values ('hafer'), ('haferdrink'), ('item_hafer_old');
insert into public.articles (id, household_id, name, name_key, synonyms, synonym_keys, diet, default_shopping_rule) values
  (tests.fx('hafer'), tests.fx('home_a'), 'Hafermilch', 'hafermilch', '{Haferdrink Bio, Hafer Drink}',
   '{haferdrink bio, haferdrink bio}', 'unknown', 'count'),
  (tests.fx('haferdrink'), tests.fx('home_a'), 'Haferdrink', 'haferdrink', '{}', '{}', 'unknown', null);
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, check_seq) values
  (tests.fx('item_hafer_old'), tests.fx('home_a'), tests.fx('hafer'), true, now(), 1);
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.merge_articles(tests.fx('hafer'), tests.fx('haferdrink')),
  '{"recipes": 0, "items": 1}'::jsonb,
  'AC-036 merge_articles: an unused source with one checked item');
select results_eq(
  format('select synonyms, synonym_keys, diet, default_shopping_rule from public.articles where id = %L', tests.fx('haferdrink')),
  $$ values ('{Hafermilch, Haferdrink Bio}'::text[], '{hafermilch, haferdrink bio}'::text[], 'unknown'::text, 'count'::text) $$,
  'E8 merge_articles: duplicate synonym keys of the source are dropped; diet unknown stays unknown');

-- ===================== merge_articles next to ingredient changes (lock order) =====================
-- merge_articles locks the recipes of the source before the two articles, in the order an
-- ingredient change takes them (recipe row, then the articles `for key share` in
-- recipes_check_ingredients), so the two cannot deadlock. Concurrency is not reachable from one
-- pgTAP session (tmp/0007/deadlock-repro.sh shows it with two sessions); here both orders run
-- one after the other in one transaction.
select tests.clear_authentication();
insert into fx (key) values ('reis'), ('basmati'), ('risotto');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('reis'), tests.fx('home_a'), 'Reis', 'reis'),
  (tests.fx('basmati'), tests.fx('home_a'), 'Basmati', 'basmati');
insert into public.recipes (id, household_id, title, ingredients) values
  (tests.fx('risotto'), tests.fx('home_a'), 'Risotto', jsonb_build_array(tests.ing('i1', tests.fx('reis'))));
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  format($$ update public.recipes set ingredients = %L where id = %L $$,
         jsonb_build_array(tests.ing('i1', tests.fx('reis')), tests.ing('i2', tests.fx('basmati'))), tests.fx('risotto')),
  'E8 merge_articles: an ingredient change before the merge goes through');
select is(
  public.merge_articles(tests.fx('reis'), tests.fx('basmati')),
  '{"recipes": 1, "items": 0}'::jsonb,
  'E8 merge_articles: the merge after it rewrites that recipe');
select is(
  (select array_agg(e ->> 'articleId' order by ord) from public.recipes r,
     jsonb_array_elements(r.ingredients) with ordinality as x (e, ord) where r.id = tests.fx('risotto')),
  array[tests.fx('basmati')::text, tests.fx('basmati')::text],
  'E8 merge_articles: both rows of the recipe point at the target');
select lives_ok(
  format($$ update public.recipes set ingredients = %L where id = %L $$,
         jsonb_build_array(tests.ing('i1', tests.fx('basmati'))), tests.fx('risotto')),
  'E8 merge_articles: an ingredient change after the merge goes through');

select * from finish();
rollback;
