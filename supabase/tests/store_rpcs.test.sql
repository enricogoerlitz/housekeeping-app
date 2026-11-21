-- Store and list RPCs (spec 0003, T4): checking with "checking wins" (check_seq), "not here",
-- adding contributions with name resolution and merge, assigning an area, clearing checked items
-- and removing contributions. The shopping list is the items of a household (ADR-0012), so the
-- RPCs take the household id; households stay independent of each other. Rule table: docs/architecture/sync.md ("Abhaken: offline").
begin;
\ir _helpers.psql
select plan(89);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- One add_shopping_contributions entry with manual contributions.
create function tests.entry(
  p_client_item uuid, p_client_article uuid, p_name text, p_key text, p_contribution_ids uuid[]
) returns jsonb language sql stable
as $$
  select jsonb_build_object(
    'client_item_id', p_client_item, 'client_article_id', p_client_article,
    'article_name', p_name, 'name_key', p_key,
    'contributions', (
      select jsonb_agg(jsonb_build_object('id', c, 'source', jsonb_build_object('kind', 'manual'),
                                          'count', null, 'qty', null, 'unit', null, 'note', null))
      from unnest(p_contribution_ids) c))
$$;
grant execute on function tests.entry(uuid, uuid, text, text, uuid[]) to anon, authenticated;

-- Item state as one comparable row.
create function tests.item_state(p_item uuid)
returns table (checked boolean, checked_by uuid, check_seq int, not_available boolean)
language sql stable
as $$ select i.checked, i.checked_by, i.check_seq, i.not_available from public.shopping_items i where i.id = p_item $$;
grant execute on function tests.item_state(uuid) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values
  ('milch'), ('butter'), ('eier'), ('zwiebeln'), ('salz'), ('kaese'), ('area_kuehl'), ('area_b'), ('article_b'), ('zwiebeln_b'),
  ('item_milch'), ('item_butter'), ('item_eier'), ('item_salz'), ('item_milch_old'), ('item_b'),
  ('c_milch'), ('c_butter'), ('c_milch_old'), ('c_b');

insert into public.areas (id, household_id, name) values
  (tests.fx('area_kuehl'), tests.fx('home_a'), 'Kühlregal'),
  (tests.fx('area_b'), tests.fx('home_b'), 'Regal B');
insert into public.articles (id, household_id, name, name_key, synonym_keys) values
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch', '{}'),
  (tests.fx('butter'), tests.fx('home_a'), 'Butter', 'butter', '{}'),
  (tests.fx('eier'), tests.fx('home_a'), 'Eier', 'eier', '{}'),
  (tests.fx('salz'), tests.fx('home_a'), 'Salz', 'salz', '{}'),
  (tests.fx('kaese'), tests.fx('home_a'), 'Käse', 'kase', '{}'),
  (tests.fx('zwiebeln'), tests.fx('home_a'), 'Frühlingszwiebeln', 'fruhlingszwiebeln', '{lauchzwiebeln}'),
  (tests.fx('article_b'), tests.fx('home_b'), 'Milch', 'milch', '{}'),
  (tests.fx('zwiebeln_b'), tests.fx('home_b'), 'Frühlingszwiebeln', 'fruhlingszwiebeln', '{lauchzwiebeln}');
-- Fixture state (postgres stands in for the RPCs): Milch open, Butter checked by Nadja (seq 1),
-- Eier open, Salz open without contributions.
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, checked_by, check_seq) values
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('milch'), false, null, null, 0),
  (tests.fx('item_butter'), tests.fx('home_a'), tests.fx('butter'), true, now(), tests.fx('nadja'), 1),
  (tests.fx('item_eier'), tests.fx('home_a'), tests.fx('eier'), false, null, null, 0),
  (tests.fx('item_salz'), tests.fx('home_a'), tests.fx('salz'), false, null, null, 0),
  (tests.fx('item_b'), tests.fx('home_b'), tests.fx('article_b'), false, null, null, 0);
insert into public.shopping_contributions (id, household_id, item_id) values
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch')),
  (tests.fx('c_butter'), tests.fx('home_a'), tests.fx('item_butter')),
  (tests.fx('c_b'), tests.fx('home_b'), tests.fx('item_b'));

-- ===================== set_shopping_item_checked: the rule table =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_checked(tests.fx('item_milch'), true, 0),
  jsonb_build_object('item_id', tests.fx('item_milch'), 'checked', true, 'check_seq', 1),
  'AC-021 set_shopping_item_checked: not checked + check → checked, check_seq 1');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_milch')),
  format($$ values (true, %L::uuid, 1, false) $$, tests.fx('enrico')),
  'T4 set_shopping_item_checked: checked_by is the caller');
select ok(
  (select checked_at is not null from public.shopping_items where id = tests.fx('item_milch')),
  'T4 set_shopping_item_checked: checked_at is set');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  (select checked from public.shopping_items where id = tests.fx('item_milch')), true,
  'AC-021 set_shopping_item_checked: the other member reads the item as checked');

select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_checked(tests.fx('item_milch'), true, 0),
  jsonb_build_object('item_id', tests.fx('item_milch'), 'checked', true, 'check_seq', 1),
  'T4 set_shopping_item_checked: checked + check → stays checked, check_seq unchanged');
select is(
  public.set_shopping_item_checked(tests.fx('item_milch'), false, 1),
  jsonb_build_object('item_id', tests.fx('item_milch'), 'checked', false, 'check_seq', 2),
  'T4 set_shopping_item_checked: checked + uncheck with the seen check_seq → not checked, check_seq 2');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_milch')),
  $$ values (false, null::uuid, 2, false) $$,
  'T4 set_shopping_item_checked: unchecking clears checked_by');
select ok(
  (select checked_at is null from public.shopping_items where id = tests.fx('item_milch')),
  'T4 set_shopping_item_checked: unchecking clears checked_at');
select is(
  public.set_shopping_item_checked(tests.fx('item_milch'), false, 2),
  jsonb_build_object('item_id', tests.fx('item_milch'), 'checked', false, 'check_seq', 2),
  'T4 set_shopping_item_checked: not checked + uncheck → no change');

-- AC-022: Enrico saw Butter checked (seq 1) and unchecks offline; meanwhile Nadja unchecked and
-- checked it again (seq 3). Checking wins.
select tests.authenticate_as(tests.fx('nadja'));
select public.set_shopping_item_checked(tests.fx('item_butter'), false, 1);
select public.set_shopping_item_checked(tests.fx('item_butter'), true, 2);
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_checked(tests.fx('item_butter'), false, 1),
  jsonb_build_object('item_id', tests.fx('item_butter'), 'checked', true, 'check_seq', 3),
  'AC-022 set_shopping_item_checked: checked by someone else meanwhile + uncheck → stays checked');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_butter')),
  format($$ values (true, %L::uuid, 3, false) $$, tests.fx('nadja')),
  'AC-022 set_shopping_item_checked: the item keeps Nadja''s check');

-- AC-025: the item was deleted meanwhile.
select tests.clear_authentication();
insert into fx (key) values ('gone');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_checked(tests.fx('gone'), true, 0), null,
  'AC-025 set_shopping_item_checked: a deleted item → null, no error (check)');
select is(
  public.set_shopping_item_checked(tests.fx('gone'), false, 1), null,
  'AC-025 set_shopping_item_checked: a deleted item → null, no error (uncheck)');

-- Unchecking while another open item of the same article exists: merge into the open item.
select tests.clear_authentication();
insert into public.shopping_items (id, household_id, article_id, checked, checked_at, checked_by, check_seq)
values (tests.fx('item_milch_old'), tests.fx('home_a'), tests.fx('milch'), true, now(), tests.fx('nadja'), 4);
insert into public.shopping_contributions (id, household_id, item_id)
values (tests.fx('c_milch_old'), tests.fx('home_a'), tests.fx('item_milch_old'));
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_checked(tests.fx('item_milch_old'), false, 4),
  jsonb_build_object('item_id', tests.fx('item_milch'), 'checked', false, 'check_seq', 2),
  'T4 set_shopping_item_checked: unchecking next to an open item returns the open item');
select results_eq(
  format($$ select id from public.shopping_contributions where item_id = %L order by id $$, tests.fx('item_milch')),
  format($$ select unnest(array[%L, %L]::uuid[]) order by 1 $$, tests.fx('c_milch'), tests.fx('c_milch_old')),
  'T4 set_shopping_item_checked: the contributions are merged into the open item');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_milch_old')), 0,
  'T4 set_shopping_item_checked: the unchecked duplicate is deleted');

-- Foreign household and anon.
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.set_shopping_item_checked(tests.fx('item_eier'), true, 0), null,
  'AC-011 set_shopping_item_checked: an item of another household is not found (null)');
select tests.authenticate_as(tests.fx('enrico'));
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_eier')),
  $$ values (false, null::uuid, 0, false) $$,
  'AC-011 set_shopping_item_checked: the other household''s call changed nothing');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.set_shopping_item_checked(%L, true, 0)', tests.fx('item_eier')),
  '42501', null, 'AC-005 set_shopping_item_checked: anon cannot call it');

-- ===================== set_shopping_item_not_available =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_not_available(tests.fx('item_eier'), true),
  jsonb_build_object('item_id', tests.fx('item_eier'), 'not_available', true),
  'T4 set_shopping_item_not_available: marks the item as not here');
select is(
  (select not_available from public.shopping_items where id = tests.fx('item_eier')), true,
  'T4 set_shopping_item_not_available: stored');
select is(
  public.set_shopping_item_not_available(tests.fx('item_eier'), false),
  jsonb_build_object('item_id', tests.fx('item_eier'), 'not_available', false),
  'T4 set_shopping_item_not_available: can be taken back');
select is(
  public.set_shopping_item_not_available(tests.fx('gone'), true), null,
  'AC-025 set_shopping_item_not_available: a deleted item → null, no error');
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.set_shopping_item_not_available(tests.fx('item_eier'), true), null,
  'AC-011 set_shopping_item_not_available: an item of another household is not found (null)');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select not_available from public.shopping_items where id = tests.fx('item_eier')), false,
  'AC-011 set_shopping_item_not_available: the other household''s call changed nothing');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.set_shopping_item_not_available(%L, true)', tests.fx('item_eier')),
  '42501', null, 'AC-005 set_shopping_item_not_available: anon cannot call it');

-- ===================== add_shopping_contributions =====================
select tests.clear_authentication();
insert into fx (key) values
  ('brot_item_e'), ('brot_article_e'), ('brot_c_e'), ('brot_item_n'), ('brot_article_n'), ('brot_c_n'),
  ('x_item'), ('x_article'), ('x_c'), ('z_item'), ('z_article'), ('z_c'), ('butter_item'), ('butter_c'),
  ('taken_item'), ('taken_c');

-- AC-023: Enrico (offline, sent later) and Nadja both add "Brot", which is not in the catalogue.
select tests.authenticate_as(tests.fx('nadja'));
select is(
  public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
    tests.entry(tests.fx('brot_item_n'), tests.fx('brot_article_n'), 'Brot', 'brot', array[tests.fx('brot_c_n')]))),
  jsonb_build_array(jsonb_build_object(
    'client_item_id', tests.fx('brot_item_n'), 'item_id', tests.fx('brot_item_n'),
    'client_article_id', tests.fx('brot_article_n'), 'article_id', tests.fx('brot_article_n'))),
  'AC-023 add_shopping_contributions: a new name creates the article and the item with the client ids');
select results_eq(
  format($$ select name, name_key, diet, area_id from public.articles where id = %L $$, tests.fx('brot_article_n')),
  $$ values ('Brot', 'brot', 'unknown', null::uuid) $$,
  'T4 add_shopping_contributions: the new article has diet unknown and no area');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
    tests.entry(tests.fx('brot_item_e'), tests.fx('brot_article_e'), 'Brot', 'brot', array[tests.fx('brot_c_e')]))),
  jsonb_build_array(jsonb_build_object(
    'client_item_id', tests.fx('brot_item_e'), 'item_id', tests.fx('brot_item_n'),
    'client_article_id', tests.fx('brot_article_e'), 'article_id', tests.fx('brot_article_n'))),
  'AC-023 add_shopping_contributions: the second "Brot" maps to the existing article and item');
select is(
  (select count(*)::int from public.shopping_items i join public.articles a on a.id = i.article_id
   where i.household_id = tests.fx('home_a') and a.name_key = 'brot'), 1,
  'AC-023 add_shopping_contributions: "Brot" is on the list once');
select results_eq(
  format($$ select id from public.shopping_contributions where item_id = %L order by id $$, tests.fx('brot_item_n')),
  format($$ select unnest(array[%L, %L]::uuid[]) order by 1 $$, tests.fx('brot_c_e'), tests.fx('brot_c_n')),
  'AC-023 add_shopping_contributions: the item has both contributions');

-- Idempotent repeat (the response was lost, the queue sends the same entry again).
select is(
  public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
    tests.entry(tests.fx('brot_item_e'), tests.fx('brot_article_e'), 'Brot', 'brot', array[tests.fx('brot_c_e')]))),
  jsonb_build_array(jsonb_build_object(
    'client_item_id', tests.fx('brot_item_e'), 'item_id', tests.fx('brot_item_n'),
    'client_article_id', tests.fx('brot_article_e'), 'article_id', tests.fx('brot_article_n'))),
  'AC-023 add_shopping_contributions: repeating the same contribution id returns the same mapping');
select is(
  (select count(*)::int from public.shopping_contributions where item_id = tests.fx('brot_item_n')), 2,
  'AC-023 add_shopping_contributions: repeating the same contribution id adds nothing');

-- Idempotent even after the item was checked meanwhile: a repeat must not reopen it.
select public.set_shopping_item_checked(tests.fx('brot_item_n'), true, 0);
select public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
  tests.entry(tests.fx('brot_item_e'), tests.fx('brot_article_e'), 'Brot', 'brot', array[tests.fx('brot_c_e')])));
select is(
  (select checked from public.shopping_items where id = tests.fx('brot_item_n')), true,
  'T4 add_shopping_contributions: a repeated contribution does not reopen a checked item');

-- Name resolution: name_key, then synonym_keys — in household B, which has its own catalogue.
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.add_shopping_contributions(tests.fx('home_b'), jsonb_build_array(
    tests.entry(tests.fx('x_item'), tests.fx('x_article'), 'Milch', 'milch', array[tests.fx('x_c')]))) -> 0 ->> 'article_id',
  tests.fx('article_b')::text,
  'T4 add_shopping_contributions: a name resolves to the article with that name_key in the call''s household');
select is(
  public.add_shopping_contributions(tests.fx('home_b'), jsonb_build_array(
    tests.entry(tests.fx('z_item'), tests.fx('z_article'), 'Lauchzwiebeln', 'lauchzwiebeln', array[tests.fx('z_c')]))) -> 0 ->> 'article_id',
  tests.fx('zwiebeln_b')::text,
  'T4 add_shopping_contributions: a synonym resolves to the article whose synonym_keys contain it');
select is(
  (select count(*)::int from public.articles where id in (tests.fx('x_article'), tests.fx('z_article'))), 0,
  'T4 add_shopping_contributions: no article is created when the name resolves');

-- Reopen: Butter is checked (seq 3) and has no open item; adding reopens it with only the new need.
select tests.authenticate_as(tests.fx('nadja'));
select public.set_shopping_item_not_available(tests.fx('item_butter'), true);
select is(
  public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
    tests.entry(tests.fx('butter_item'), gen_random_uuid(), 'Butter', 'butter', array[tests.fx('butter_c')]))) -> 0 ->> 'item_id',
  tests.fx('item_butter')::text,
  'T4 add_shopping_contributions: adding to a checked item reopens it');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_butter')),
  $$ values (false, null::uuid, 4, false) $$,
  'T4 add_shopping_contributions: reopening clears the check and "not here" and bumps check_seq');
select results_eq(
  format($$ select id from public.shopping_contributions where item_id = %L $$, tests.fx('item_butter')),
  format($$ values (%L::uuid) $$, tests.fx('butter_c')),
  'T4 add_shopping_contributions: reopening replaces the bought contributions with the new one');

-- A client item id that already exists elsewhere is not reused.
select tests.authenticate_as(tests.fx('enrico'));
select isnt(
  public.add_shopping_contributions(tests.fx('home_a'), jsonb_build_array(
    tests.entry(tests.fx('item_b'), gen_random_uuid(), 'Käse', 'kase', array[tests.fx('taken_c')]))) -> 0 ->> 'item_id',
  tests.fx('item_b')::text,
  'T4 add_shopping_contributions: a client item id taken by another household gets a fresh id');
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, %L) $$, tests.fx('home_a'),
         jsonb_build_array(tests.entry(gen_random_uuid(), gen_random_uuid(), 'Quark', 'quark', array[tests.fx('c_b')]))),
  '22023', 'invalid_entries',
  'T4 add_shopping_contributions: a contribution id of another household is rejected');
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, '{"x": 1}') $$, tests.fx('home_a')),
  '22023', 'invalid_entries', 'T4 add_shopping_contributions: entries must be an array');
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, %L) $$, tests.fx('home_a'),
         jsonb_build_array(tests.entry(gen_random_uuid(), gen_random_uuid(), 'Quark', 'quark', array[]::uuid[]))),
  '22023', 'invalid_entries', 'T4 add_shopping_contributions: an entry needs at least one contribution');

select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, %L) $$, tests.fx('home_a'),
         jsonb_build_array(tests.entry(gen_random_uuid(), gen_random_uuid(), 'Milch', 'milch', array[gen_random_uuid()]))),
  '42501', 'not_member', 'AC-011 add_shopping_contributions: the shopping list of another household is refused (not_member)');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, '[]') $$, tests.fx('home_a')),
  '42501', null, 'AC-005 add_shopping_contributions: anon cannot call it');

-- ===================== assign_article_area =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.assign_article_area(tests.fx('eier'), tests.fx('area_kuehl')),
  jsonb_build_object('article_id', tests.fx('eier'), 'area_id', tests.fx('area_kuehl')),
  'T4 assign_article_area: assigns the area');
select is(
  (select area_id from public.articles where id = tests.fx('eier')), tests.fx('area_kuehl'),
  'T4 assign_article_area: stored');
select is(
  public.assign_article_area(tests.fx('eier'), null),
  jsonb_build_object('article_id', tests.fx('eier'), 'area_id', null),
  'T4 assign_article_area: null removes the area');
select is(
  public.assign_article_area(tests.fx('eier'), tests.fx('area_b')), null,
  'AC-011 assign_article_area: an area of another household is not found (null)');
select is(
  (select area_id from public.articles where id = tests.fx('eier')), null,
  'AC-011 assign_article_area: the foreign area is not assigned');
select is(
  public.assign_article_area(tests.fx('gone'), tests.fx('area_kuehl')), null,
  'AC-025 assign_article_area: a deleted article → null, no error');
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.assign_article_area(tests.fx('eier'), null), null,
  'AC-011 assign_article_area: an article of another household is not found (null)');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.assign_article_area(%L, null)', tests.fx('eier')),
  '42501', null, 'AC-005 assign_article_area: anon cannot call it');

-- ===================== clear_checked_items =====================
-- home_a now: Milch open, Butter open (reopened meanwhile), Eier open, Salz open, Käse open,
-- Brot checked (with two contributions). Household B checks its Milch.
select tests.authenticate_as(tests.fx('ben'));
select public.set_shopping_item_checked(tests.fx('item_b'), true, 0);
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.clear_checked_items(tests.fx('home_a')),
  (select jsonb_build_array(jsonb_build_object(
            'item', to_jsonb(i),
            'contributions', (select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
                              from public.shopping_contributions c where c.item_id = i.id)))
   from public.shopping_items i where i.id = tests.fx('brot_item_n')),
  'T4 clear_checked_items: returns the deleted items with their contributions');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('brot_item_n'))
    + (select count(*)::int from public.shopping_contributions where item_id = tests.fx('brot_item_n')), 0,
  'T4 clear_checked_items: the checked item and its contributions are deleted');
select is(
  (select count(*)::int from public.shopping_items where household_id = tests.fx('home_a')), 5,
  'T4 clear_checked_items: open items stay, including one reopened meanwhile');
select tests.authenticate_as(tests.fx('ben'));
select is(
  (select checked from public.shopping_items where id = tests.fx('item_b')), true,
  'T4 clear_checked_items: checked items of another household stay');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.clear_checked_items(tests.fx('home_a')), '[]'::jsonb,
  'T4 clear_checked_items: nothing checked → empty array');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.clear_checked_items(%L)', tests.fx('home_a')),
  '42501', 'not_member', 'AC-011 clear_checked_items: the shopping list of another household is refused (not_member)');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.clear_checked_items(%L)', tests.fx('home_a')),
  '42501', null, 'AC-005 clear_checked_items: anon cannot call it');

-- ===================== remove_contributions =====================
-- Milch has c_milch and c_milch_old; Salz has no contributions (and must stay).
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.remove_contributions(array[tests.fx('c_milch')]), 0,
  'AC-011 remove_contributions: contributions of another household are not removed');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select count(*)::int from public.shopping_contributions where id = tests.fx('c_milch')), 1,
  'AC-011 remove_contributions: the other household''s call changed nothing');
select is(
  public.remove_contributions(array[tests.fx('c_milch')]), 1,
  'T4 remove_contributions: removes a contribution and returns the count');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_milch')), 1,
  'T4 remove_contributions: an item that still has contributions stays');
select is(
  public.remove_contributions(array[tests.fx('c_milch_old'), tests.fx('c_b')]), 1,
  'T4 remove_contributions: ids of another household are ignored');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_milch')), 0,
  'T4 remove_contributions: an item that became empty is deleted');
select is(
  (select count(*)::int from public.shopping_items where id = tests.fx('item_salz')), 1,
  'T4 remove_contributions: an item that was empty before is not touched');

-- ===================== Call sizes: what one call adds, one call removes =====================
-- 10 new articles with 100 contributions each = 1000 contributions (security re-check 0003).
create temp table bulk on commit drop as
select n, gen_random_uuid() as item_id, gen_random_uuid() as article_id,
       array(select gen_random_uuid() from generate_series(1, 100) where n > 0) as ids -- correlated: fresh ids per row
from generate_series(1, 10) n;
grant select on bulk to authenticated;
select throws_ok(
  format('select public.add_shopping_contributions(%L, %L)', tests.fx('home_a'),
    (select jsonb_agg(tests.entry(item_id, article_id, 'Bulk ' || n, 'bulk ' || n, ids)) from bulk)
    || jsonb_build_array(tests.entry(gen_random_uuid(), gen_random_uuid(), 'Bulk extra', 'bulk extra',
                                     array[gen_random_uuid()]))),
  '22023', 'too_many_changes', 'T4 add_shopping_contributions: more than 1000 contributions in one call are rejected');
select lives_ok(
  format('select public.add_shopping_contributions(%L, %L)', tests.fx('home_a'),
    (select jsonb_agg(tests.entry(item_id, article_id, 'Bulk ' || n, 'bulk ' || n, ids)) from bulk)),
  'T4 add_shopping_contributions: 1000 contributions in one call are allowed');
select throws_ok(
  format('select public.remove_contributions(%L::uuid[])',
    (select array_agg(i) from bulk, unnest(ids) i) || gen_random_uuid()),
  '22023', 'too_many_changes', 'T4 remove_contributions: more than 1000 ids are rejected');
select is(
  public.remove_contributions((select array_agg(i) from bulk, unnest(ids) i)), 1000,
  'T4 remove_contributions: the 1000 contributions of one add call are removed in one call (undo)');
select is(
  (select count(*)::int from public.shopping_items where id in (select item_id from bulk)), 0,
  'T4 remove_contributions: … and the items they emptied are gone');

select tests.authenticate_as_anon();
select throws_ok(
  format('select public.remove_contributions(array[%L]::uuid[])', tests.fx('c_butter')),
  '42501', null, 'AC-005 remove_contributions: anon cannot call it');

-- ===================== Store actions after merging articles (spec 0007, E5, AC-040) =====================
-- Milchkokos, Kokosmilch and Kokosdrink are open on the list. Milchkokos is merged into
-- Kokosmilch, then Kokosmilch into Kokosdrink: the tombstones point item_mk → item_km → item_kd.
-- A queued check or "nicht da" on an old item reaches the item that replaced it; an uncheck does
-- not (its check_seq belongs to the old item).
select tests.clear_authentication();
insert into fx (key) values
  ('mk'), ('km'), ('kd'), ('item_mk'), ('item_km'), ('item_kd'), ('ziel'), ('item_ziel'),
  ('t1'), ('t2'), ('t3'), ('t4'), ('t5'), ('t6'), ('t_foreign');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('mk'), tests.fx('home_a'), 'Milchkokos', 'milchkokos'),
  (tests.fx('km'), tests.fx('home_a'), 'Kokosmilch', 'kokosmilch'),
  (tests.fx('kd'), tests.fx('home_a'), 'Kokosdrink', 'kokosdrink'),
  (tests.fx('ziel'), tests.fx('home_a'), 'Zielartikel', 'zielartikel');
insert into public.shopping_items (id, household_id, article_id) values
  (tests.fx('item_mk'), tests.fx('home_a'), tests.fx('mk')),
  (tests.fx('item_km'), tests.fx('home_a'), tests.fx('km')),
  (tests.fx('item_kd'), tests.fx('home_a'), tests.fx('kd')),
  (tests.fx('item_ziel'), tests.fx('home_a'), tests.fx('ziel'));
insert into public.shopping_contributions (household_id, item_id)
select tests.fx('home_a'), i from unnest(array[tests.fx('item_mk'), tests.fx('item_km'), tests.fx('item_kd')]) i;

select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.merge_articles(tests.fx('mk'), tests.fx('km')), '{"recipes": 0, "items": 1}'::jsonb,
  'AC-040 merge_articles: Milchkokos is merged into Kokosmilch');
select is(
  public.merge_articles(tests.fx('km'), tests.fx('kd')), '{"recipes": 0, "items": 1}'::jsonb,
  'AC-040 merge_articles: Kokosmilch is merged into Kokosdrink');

-- Nadja's queue replays the check she made offline on Milchkokos.
select tests.authenticate_as(tests.fx('nadja'));
select is(
  public.set_shopping_item_checked(tests.fx('item_mk'), true, 0),
  jsonb_build_object('item_id', tests.fx('item_kd'), 'checked', true, 'check_seq', 1),
  'AC-040 set_shopping_item_checked: a check on a merged item follows both merges to Kokosdrink');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_kd')),
  format($$ values (true, %L::uuid, 1, false) $$, tests.fx('nadja')),
  'AC-040 set_shopping_item_checked: Kokosdrink is checked by Nadja, for everyone');
select is(
  public.set_shopping_item_checked(tests.fx('item_km'), true, 0),
  jsonb_build_object('item_id', tests.fx('item_kd'), 'checked', true, 'check_seq', 1),
  'AC-040 set_shopping_item_checked: a check over one merge is idempotent on the target');
select is(
  public.set_shopping_item_checked(tests.fx('item_mk'), false, 1),
  jsonb_build_object('item_id', tests.fx('item_kd'), 'checked', true, 'check_seq', 1),
  'E5 set_shopping_item_checked: an uncheck on a merged item has no effect, even with a matching check_seq');
select is(
  public.set_shopping_item_not_available(tests.fx('item_mk'), true),
  jsonb_build_object('item_id', tests.fx('item_kd'), 'not_available', true),
  'AC-040 set_shopping_item_not_available: "nicht da" on a merged item reaches Kokosdrink');

-- Another household never follows the reference.
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.set_shopping_item_checked(tests.fx('item_mk'), false, 1), null,
  'E5 set_shopping_item_checked: a member of another household gets null for a merged item');
select is(
  public.set_shopping_item_not_available(tests.fx('item_mk'), false), null,
  'E5 set_shopping_item_not_available: a member of another household gets null for a merged item');
select tests.clear_authentication();
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_kd')),
  format($$ values (true, %L::uuid, 1, true) $$, tests.fx('nadja')),
  'E5 store RPCs: Kokosdrink is unchanged by the other household');

-- A reference into another household is never followed, and at most 5 references are.
create temp table item_b_before on commit drop as select * from tests.item_state(tests.fx('item_b'));
grant select on item_b_before to authenticated;
insert into public.deleted_records (household_id, table_name, record_id, replaced_by) values
  (tests.fx('home_a'), 'shopping_items', tests.fx('t_foreign')::text, tests.fx('item_b')::text),
  (tests.fx('home_a'), 'shopping_items', tests.fx('t1')::text, tests.fx('t2')::text),
  (tests.fx('home_a'), 'shopping_items', tests.fx('t2')::text, tests.fx('t3')::text),
  (tests.fx('home_a'), 'shopping_items', tests.fx('t3')::text, tests.fx('t4')::text),
  (tests.fx('home_a'), 'shopping_items', tests.fx('t4')::text, tests.fx('t5')::text),
  (tests.fx('home_a'), 'shopping_items', tests.fx('t5')::text, tests.fx('t6')::text),
  (tests.fx('home_a'), 'shopping_items', tests.fx('t6')::text, tests.fx('item_ziel')::text);
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.set_shopping_item_not_available(tests.fx('t_foreign'), true), null,
  'E5 set_shopping_item_not_available: a reference into another household is not followed');
select is(
  public.set_shopping_item_checked(tests.fx('t_foreign'), true, 0), null,
  'E5 set_shopping_item_checked: a reference into another household is not followed');
select is(
  public.set_shopping_item_not_available(tests.fx('t1'), true), null,
  'E5 set_shopping_item_not_available: six references are too many');
select is(
  public.set_shopping_item_not_available(tests.fx('t2'), true),
  jsonb_build_object('item_id', tests.fx('item_ziel'), 'not_available', true),
  'E5 set_shopping_item_not_available: five references are followed');
select tests.clear_authentication();
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_b')),
  'select * from item_b_before',
  'E5 store RPCs: the item of the other household is unchanged');

select * from finish();
rollback;
