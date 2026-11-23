-- The shopping list follows a plan entry in the same apply_changes call (spec 0021, REQ-007 and
-- REQ-015): replace_entry_contributions removes the entry's contributions on open items, adds the
-- new ones like add_contributions and drops the open items it emptied. However many contributions
-- that are, it counts as one delete, so a dish with more than 20 ingredients can follow its
-- portions and be removed with its ingredients. Checked items keep theirs (AC-021); a foreign
-- household, a signed-out caller and invalid input change nothing.
begin;
\ir _helpers.psql
select plan(23);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply_sql(text, jsonb) to anon, authenticated;

-- How many contributions of an entry stand on the list (open and checked items).
create function tests.of_entry(p_entry text) returns int language sql stable security definer
as $$ select count(*)::int from public.shopping_contributions c
      where c.source ->> 'entryId' = tests.fx(p_entry)::text $$;
grant execute on function tests.of_entry(text) to anon, authenticated;

create function tests.replace_op(p_entry text, p_entries jsonb default '[]') returns jsonb language sql stable
as $$ select jsonb_build_object('kind', 'replace_entry_contributions',
                                'entry_ids', jsonb_build_array(tests.fx(p_entry)), 'entries', p_entries) $$;
grant execute on function tests.replace_op(text, jsonb) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('jana', tests.create_user('jana@example.com', 'Jana'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('schmidt', tests.create_household('Schmidt', array[tests.fx('jana')]));
insert into fx (key) values ('abend'), ('grill'), ('e_grill'), ('e_other'), ('butter'), ('butter_item'),
  ('butter_c'), ('salz'), ('salz_item'), ('hand_c');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('abend'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home');
insert into public.recipes (id, household_id, title) values (tests.fx('grill'), tests.fx('home'), 'Grillabend');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, eater_ids, portions) values
  (tests.fx('e_grill'), tests.fx('home'), '2026-11-28', tests.fx('abend'), 'recipe', tests.fx('grill'),
   array[tests.fx('enrico')], 2),
  (tests.fx('e_other'), tests.fx('home'), '2026-11-29', tests.fx('abend'), 'recipe', tests.fx('grill'),
   array[tests.fx('enrico')], 2);

-- "Grillabend (Sa)" has 25 ingredients on 25 open items; item 1 also holds a manual contribution,
-- item 2 one of another entry. "Salz" is checked and holds one of the entry; "Butter" is checked
-- with an old manual one.
insert into public.articles (id, household_id, name, name_key)
select gen_random_uuid(), tests.fx('home'), 'Zutat ' || n, 'zutat ' || n from generate_series(1, 25) n;
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('butter'), tests.fx('home'), 'Butter', 'butter'),
  (tests.fx('salz'), tests.fx('home'), 'Salz', 'salz');
insert into public.shopping_items (id, household_id, article_id)
select gen_random_uuid(), tests.fx('home'), a.id from public.articles a
where a.household_id = tests.fx('home') and a.name like 'Zutat %';
insert into public.shopping_items (id, household_id, article_id, checked) values
  (tests.fx('butter_item'), tests.fx('home'), tests.fx('butter'), true),
  (tests.fx('salz_item'), tests.fx('home'), tests.fx('salz'), true);
insert into public.shopping_contributions (household_id, item_id, source, qty, unit)
select tests.fx('home'), i.id,
       jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('grill'), 'entryId', tests.fx('e_grill'),
                          'label', 'Grillabend (Sa)'),
       250, 'g'
from public.shopping_items i join public.articles a on a.id = i.article_id
where a.name like 'Zutat %';
insert into public.shopping_contributions (id, household_id, item_id, source, count)
select tests.fx('hand_c'), tests.fx('home'), i.id, '{"kind": "manual"}', 1
from public.shopping_items i join public.articles a on a.id = i.article_id where a.name = 'Zutat 1';
insert into public.shopping_contributions (household_id, item_id, source, count)
select tests.fx('home'), i.id,
       jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('grill'), 'entryId', tests.fx('e_other'),
                          'label', 'Grillabend (So)'), 2
from public.shopping_items i join public.articles a on a.id = i.article_id where a.name = 'Zutat 2';
insert into public.shopping_contributions (household_id, item_id, source, count) values
  (tests.fx('home'), tests.fx('salz_item'),
   jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('grill'), 'entryId', tests.fx('e_grill'),
                      'label', 'Grillabend (Sa)'), 1);
insert into public.shopping_contributions (id, household_id, item_id, source, count) values
  (tests.fx('butter_c'), tests.fx('home'), tests.fx('butter_item'), '{"kind": "manual"}', 1);

-- The new state of the dish: 500 g of each of the 25 ingredients and "Butter" anew.
create temp table wanted on commit drop as
select a.id as article_id, a.name, a.name_key, i.id as item_id, gen_random_uuid() as contribution_id
from public.articles a left join public.shopping_items i on i.article_id = a.id
where a.household_id = tests.fx('home') and (a.name like 'Zutat %' or a.name = 'Butter');
grant select on wanted to authenticated;
create function tests.wanted_entries() returns jsonb language sql stable
as $$
  select jsonb_agg(jsonb_build_object(
    'client_item_id', w.item_id, 'client_article_id', w.article_id, 'article_name', w.name,
    'name_key', w.name_key, 'contributions', jsonb_build_array(jsonb_build_object(
      'id', w.contribution_id, 'qty', 500, 'unit', 'g',
      'source', jsonb_build_object('kind', 'recipe', 'recipeId', tests.fx('grill'),
                                   'entryId', tests.fx('e_grill'), 'label', 'Grillabend (Sa)')))))
  from wanted w
$$;
grant execute on function tests.wanted_entries() to authenticated;

-- ===================== Foreign household, signed out, invalid input =====================
select tests.authenticate_as(tests.fx('jana'));
select throws_ok(tests.apply_sql('home', jsonb_build_array(tests.replace_op('e_grill'))), '42501', null,
  'Risiken replace_entry_contributions: another household cannot take the entry''s contributions');
select lives_ok(tests.apply_sql('schmidt', jsonb_build_array(tests.replace_op('e_grill'))),
  'Risiken replace_entry_contributions: in her own household the entry of another one …');
select is(tests.of_entry('e_grill'), 26, '… keeps all its contributions');
select tests.authenticate_as_anon();
select throws_ok(tests.apply_sql('home', jsonb_build_array(tests.replace_op('e_grill'))), '42501', null,
  'Risiken replace_entry_contributions: signed out cannot write');

select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(tests.apply_sql('home', '[{"kind": "replace_entry_contributions", "entry_ids": "x", "entries": []}]'),
  '22023', 'invalid_change', 'REQ-007 replace_entry_contributions: entry_ids must be an array');
select throws_ok(tests.apply_sql('home', '[{"kind": "replace_entry_contributions", "entry_ids": ["kein-uuid"], "entries": []}]'),
  '22023', 'invalid_change', 'REQ-007 replace_entry_contributions: entry ids must be uuids');
select throws_ok(tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'replace_entry_contributions',
    'entry_ids', jsonb_build_array(tests.fx('e_grill')), 'entries', 'x'))),
  '22023', 'invalid_change', 'REQ-007 replace_entry_contributions: entries must be an array');
select throws_ok(tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'replace_entry_contributions',
    'entry_ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 201)), 'entries', '[]'::jsonb))),
  '22023', 'too_many_changes', 'REQ-007 replace_entry_contributions: at most 200 entries per call');
select throws_ok(tests.apply_sql('home', jsonb_build_array(tests.replace_op('e_grill')) ||
    (select jsonb_agg(jsonb_build_object('kind', 'delete', 'table', 'areas', 'id', gen_random_uuid()))
     from generate_series(1, 20))),
  '22023', 'too_many_changes', 'REQ-007 apply_changes: replace_entry_contributions counts as one delete (20 + 1)');
select is(tests.of_entry('e_grill'), 26, 'REQ-007: refused calls changed nothing');

-- ===================== All or nothing (AC-021) =====================
select throws_ok(tests.apply_sql('home', jsonb_build_array(
    tests.replace_op('e_grill', tests.wanted_entries()),
    jsonb_build_object('kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx('e_grill'),
                       'changes', jsonb_build_object('portions', 1001)))),
  '23514', null, 'AC-021 apply_changes: the server refuses the entry …');
select is(tests.of_entry('e_grill'), 26, '… and the list stays as it was');

-- ===================== The list follows the portions (AC-019, more than 20) =====================
select lives_ok(tests.apply_sql('home', jsonb_build_array(
    jsonb_build_object('kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx('e_grill'),
                       'changes', jsonb_build_object('portions', 4)),
    tests.replace_op('e_grill', tests.wanted_entries()))),
  'AC-019 apply_changes: 4 portions and 26 new contributions in one call');
select results_eq(
  format($$ select count(*)::int, min(c.qty), max(c.qty) from public.shopping_contributions c
            join public.shopping_items i on i.id = c.item_id
            where c.source ->> 'entryId' = %L and not i.checked $$, tests.fx('e_grill')),
  $$ values (26, 500::numeric, 500::numeric) $$,
  'AC-019: every open ingredient of the entry has its new amount');
select is(
  (select count(*)::int from public.shopping_contributions c join wanted w on w.contribution_id = c.id
   join public.shopping_items i on i.id = c.item_id where i.id = w.item_id),
  26, 'AC-019: on the same items as before (one item per article)');
select is(
  (select c.qty from public.shopping_contributions c where c.item_id = tests.fx('salz_item')
   and c.source ->> 'entryId' = tests.fx('e_grill')::text), null::numeric,
  'AC-021: the checked "Salz" keeps the entry''s contribution as it was');
select is(
  (select checked from public.shopping_items where id = tests.fx('salz_item')), true,
  'AC-021: … and stays checked');
select results_eq(
  format($$ select checked, (select count(*)::int from public.shopping_contributions c where c.item_id = i.id)
            from public.shopping_items i where i.id = %L $$, tests.fx('butter_item')),
  $$ values (false, 1) $$,
  'REQ-007 (spec 0025, REQ-013): a checked "Butter" is open again with only the new amount');
select is(
  (select count(*)::int from public.shopping_contributions where id = tests.fx('hand_c')), 1,
  'AC-041: the manual contribution on the same item stays');

-- ===================== Removing with the ingredients (AC-040, more than 20) =====================
select lives_ok(tests.apply_sql('home', jsonb_build_array(
    tests.replace_op('e_grill'),
    jsonb_build_object('kind', 'delete', 'table', 'meal_plan_entries', 'id', tests.fx('e_grill')))),
  'AC-040 apply_changes: the entry and its 26 open contributions go in one call');
select is(
  (select count(*)::int from public.shopping_contributions c join public.shopping_items i on i.id = c.item_id
   where c.source ->> 'entryId' = tests.fx('e_grill')::text and not i.checked), 0,
  'AC-040: no open contribution of the entry is left');
select is(
  (select count(*)::int from public.shopping_items i join public.articles a on a.id = i.article_id
   where a.name like 'Zutat %' or a.name = 'Butter'), 2,
  'AC-041: only the items with other contributions stay ("Zutat 1" by hand, "Zutat 2" of Sunday)');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('salz_item')), 1,
  'AC-041: a checked item does not count and stays');

select * from finish();
rollback;
