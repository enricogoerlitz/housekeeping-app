-- One shopping list per household (spec 0006, REQ-001): the migration merges every further list
-- into the household's list (AC-001…AC-003, AC-007), the store queue of an older device still
-- lands on the one list afterwards (AC-004), no second list can be created (AC-005) and a new
-- household gets exactly one (AC-006).
--
-- The constraint already exists when this file runs, so the multi-list fixture is built after
-- dropping it inside the test transaction; re-adding it at the end proves the merged state
-- satisfies it. Everything is rolled back.
begin;
\ir _helpers.psql
select plan(44);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select, insert on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- Everything the merge may touch, as one comparable set (for the second run).
create temp table snapshot (round int, tbl text, id uuid, state jsonb) on commit drop;
create function tests.take_snapshot(p_round int) returns void language sql
as $$
  insert into snapshot
  select p_round, 'shopping_lists', l.id, to_jsonb(l) from public.shopping_lists l
  union all select p_round, 'shopping_items', i.id, to_jsonb(i) from public.shopping_items i
  union all select p_round, 'shopping_contributions', c.id, to_jsonb(c) from public.shopping_contributions c
  union all select p_round, 'households', h.id, to_jsonb(h) from public.households h
  union all select p_round, 'deleted_records', d.id, to_jsonb(d) from public.deleted_records d;
$$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben')),
  ('carla', tests.create_user('carla@example.com', 'Carla'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_w', tests.create_household('WG Köln', array[tests.fx('ben')])),
  ('home_c', tests.create_household('C', array[tests.fx('carla')]));
insert into fx (key) values
  ('store_rewe'), ('store_dm'), ('list_std'), ('list_drog'), ('list_w'), ('list_c1'), ('list_c2'), ('list_c3'),
  ('milch'), ('duschgel'), ('zahnpasta'), ('wattepads'), ('duschgel_w'), ('brot_w'), ('tee_w'), ('brot_c'),
  ('item_milch'), ('item_dusch_std'), ('item_dusch_drog'), ('item_zahn'), ('item_watte'),
  ('item_dusch_w'), ('item_brot_w'), ('item_tee_w'), ('item_c1'), ('item_c2'), ('item_c3'),
  ('c_milch'), ('c_dusch_std'), ('c_dusch_drog'), ('c_zahn'), ('c_watte'), ('c_w1'), ('c_w2'), ('c_w3'),
  ('c_c1'), ('c_c2'), ('c_c3'),
  ('rasierer'), ('item_rasierer'), ('c_rasierer'), ('c_dusch_queue');

-- ---------- Fixture: the state before the migration (as postgres) ----------
alter table public.shopping_lists drop constraint shopping_lists_household_id_key;

insert into public.stores (id, household_id, name) values
  (tests.fx('store_rewe'), tests.fx('home_a'), 'Rewe Südstadt'),
  (tests.fx('store_dm'), tests.fx('home_a'), 'dm');
insert into public.shopping_lists (id, household_id, name, is_default, store_id) values
  (tests.fx('list_std'), tests.fx('home_a'), 'Standardliste', true, null),
  (tests.fx('list_drog'), tests.fx('home_a'), 'Drogerie', false, tests.fx('store_dm')),
  (tests.fx('list_w'), tests.fx('home_w'), 'Standardliste', true, null),
  -- Household C has no default_list_id: the list marked is_default is the target.
  (tests.fx('list_c1'), tests.fx('home_c'), 'Eins', false, null),
  (tests.fx('list_c2'), tests.fx('home_c'), 'Zwei', true, null),
  (tests.fx('list_c3'), tests.fx('home_c'), 'Drei', false, null);
update public.households set default_list_id = tests.fx('list_std'), default_store_id = tests.fx('store_rewe')
where id = tests.fx('home_a');
update public.households set default_list_id = tests.fx('list_w') where id = tests.fx('home_w');

insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch'),
  (tests.fx('duschgel'), tests.fx('home_a'), 'Duschgel', 'duschgel'),
  (tests.fx('zahnpasta'), tests.fx('home_a'), 'Zahnpasta', 'zahnpasta'),
  (tests.fx('wattepads'), tests.fx('home_a'), 'Wattepads', 'wattepads'),
  (tests.fx('duschgel_w'), tests.fx('home_w'), 'Duschgel', 'duschgel'),
  (tests.fx('brot_w'), tests.fx('home_w'), 'Brot', 'brot'),
  (tests.fx('tee_w'), tests.fx('home_w'), 'Tee', 'tee'),
  (tests.fx('brot_c'), tests.fx('home_c'), 'Brot', 'brot');

insert into public.shopping_items (id, household_id, list_id, article_id, checked, checked_at, checked_by, check_seq) values
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('list_std'), tests.fx('milch'), false, null, null, 0),
  (tests.fx('item_dusch_std'), tests.fx('home_a'), tests.fx('list_std'), tests.fx('duschgel'), false, null, null, 0),
  (tests.fx('item_dusch_drog'), tests.fx('home_a'), tests.fx('list_drog'), tests.fx('duschgel'), false, null, null, 0),
  (tests.fx('item_zahn'), tests.fx('home_a'), tests.fx('list_drog'), tests.fx('zahnpasta'), false, null, null, 0),
  (tests.fx('item_watte'), tests.fx('home_a'), tests.fx('list_drog'), tests.fx('wattepads'), true, now(), tests.fx('nadja'), 1),
  (tests.fx('item_dusch_w'), tests.fx('home_w'), tests.fx('list_w'), tests.fx('duschgel_w'), false, null, null, 0),
  (tests.fx('item_brot_w'), tests.fx('home_w'), tests.fx('list_w'), tests.fx('brot_w'), false, null, null, 0),
  (tests.fx('item_tee_w'), tests.fx('home_w'), tests.fx('list_w'), tests.fx('tee_w'), false, null, null, 0),
  (tests.fx('item_c1'), tests.fx('home_c'), tests.fx('list_c1'), tests.fx('brot_c'), false, null, null, 0),
  (tests.fx('item_c2'), tests.fx('home_c'), tests.fx('list_c2'), tests.fx('brot_c'), false, null, null, 0),
  (tests.fx('item_c3'), tests.fx('home_c'), tests.fx('list_c3'), tests.fx('brot_c'), false, null, null, 0);
insert into public.shopping_contributions (id, household_id, item_id, source, count, note) values
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_dusch_std'), tests.fx('home_a'), tests.fx('item_dusch_std'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_dusch_drog'), tests.fx('home_a'), tests.fx('item_dusch_drog'), '{"kind": "manual"}', 1, 'sensitiv'),
  (tests.fx('c_zahn'), tests.fx('home_a'), tests.fx('item_zahn'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_watte'), tests.fx('home_a'), tests.fx('item_watte'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_w1'), tests.fx('home_w'), tests.fx('item_dusch_w'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_w2'), tests.fx('home_w'), tests.fx('item_brot_w'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_w3'), tests.fx('home_w'), tests.fx('item_tee_w'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_c1'), tests.fx('home_c'), tests.fx('item_c1'), '{"kind": "manual"}', 1, null),
  (tests.fx('c_c2'), tests.fx('home_c'), tests.fx('item_c2'), '{"kind": "manual"}', 2, null),
  (tests.fx('c_c3'), tests.fx('home_c'), tests.fx('item_c3'), '{"kind": "manual"}', 3, null);

select tests.take_snapshot(0);
delete from public.deleted_records;

-- ===================== The merge =====================
select lives_ok($$ select private.merge_shopping_lists() $$, 'AC-001 merge_shopping_lists: runs');

select results_eq(
  format($$ select id from public.shopping_lists where household_id = %L $$, tests.fx('home_a')),
  format($$ values (%L::uuid) $$, tests.fx('list_std')),
  'AC-001 merge: "Enrico & Nadja" has exactly one list, the former default list');
select results_eq(
  format($$ select i.id, i.checked, (select sum(c.count)::int from public.shopping_contributions c where c.item_id = i.id)
            from public.shopping_items i where i.list_id = %L order by i.id $$, tests.fx('list_std')),
  format($$ select * from (values (%L::uuid, false, 1), (%L::uuid, false, 2), (%L::uuid, false, 1)) v order by 1 $$,
         tests.fx('item_milch'), tests.fx('item_dusch_std'), tests.fx('item_zahn')),
  'AC-001 merge: Milch, Zahnpasta and Duschgel are open on the list, Duschgel as one item with 2×');
select results_eq(
  format($$ select id, count, note from public.shopping_contributions where item_id = %L order by note nulls first $$,
         tests.fx('item_dusch_std')),
  format($$ values (%L::uuid, 1, null::text), (%L::uuid, 1, 'sensitiv') $$,
         tests.fx('c_dusch_std'), tests.fx('c_dusch_drog')),
  'AC-001 merge: Duschgel keeps both contributions, each stored on its own with its note');
select is(
  (select count(*)::int from public.shopping_items where id in (tests.fx('item_watte'), tests.fx('item_dusch_drog')))
    + (select count(*)::int from public.shopping_contributions where id = tests.fx('c_watte'))
    + (select count(*)::int from public.shopping_lists where id = tests.fx('list_drog')),
  0,
  'AC-001 merge: Wattepads (checked), the emptied Duschgel item and the list "Drogerie" are gone');
select is(
  (select item_id from public.shopping_contributions where id = tests.fx('c_zahn')), tests.fx('item_zahn'),
  'AC-002 merge: Zahnpasta keeps its id and its contribution');
select is(
  (select list_id from public.shopping_items where id = tests.fx('item_zahn')), tests.fx('list_std'),
  'AC-002 merge: the moved item points to the one list');
select bag_eq(
  $$ select table_name, record_id from public.deleted_records $$,
  format($$ values ('shopping_lists', %L), ('shopping_items', %L), ('shopping_items', %L),
                   ('shopping_contributions', %L), ('shopping_lists', %L), ('shopping_lists', %L),
                   ('shopping_items', %L), ('shopping_items', %L) $$,
         tests.fx('list_drog'), tests.fx('item_dusch_drog'), tests.fx('item_watte'), tests.fx('c_watte'),
         tests.fx('list_c1'), tests.fx('list_c3'), tests.fx('item_c1'), tests.fx('item_c3')),
  'AC-001 merge: every deleted row leaves a tombstone, moved rows leave none');
select is(
  (select count(*)::int from public.deleted_records d
   join public.households h on h.id = d.household_id
   where d.record_id in (tests.fx('list_drog')::text, tests.fx('item_watte')::text) and h.id = tests.fx('home_a')),
  2,
  'AC-001 merge: the tombstones belong to the household of the deleted rows');

-- AC-007: the store of a list does not move anywhere; the default store stays.
select results_eq(
  format($$ select l.store_id, h.default_store_id from public.shopping_lists l join public.households h on h.id = l.household_id
            where l.id = %L $$, tests.fx('list_std')),
  format($$ values (null::uuid, %L::uuid) $$, tests.fx('store_rewe')),
  'AC-007 merge: the store of "Drogerie" is not carried over, the default store stays');

-- AC-003: a household with one list is untouched, nothing crosses households.
select set_eq(
  format($$ select tbl, id, state from snapshot where round = 0 and (state ->> 'household_id' = %1$L or id = %1$L) $$,
         tests.fx('home_w')),
  format($$ select 'shopping_lists', l.id, to_jsonb(l) from public.shopping_lists l where l.household_id = %1$L
            union all select 'shopping_items', i.id, to_jsonb(i) from public.shopping_items i where i.household_id = %1$L
            union all select 'shopping_contributions', c.id, to_jsonb(c) from public.shopping_contributions c where c.household_id = %1$L
            union all select 'households', h.id, to_jsonb(h) from public.households h where h.id = %1$L $$,
         tests.fx('home_w')),
  'AC-003 merge: list, items and contributions of "WG Köln" are unchanged');
select is(
  (select count(*)::int from public.shopping_items i join public.shopping_lists l on l.id = i.list_id
   where l.household_id <> i.household_id)
    + (select count(*)::int from public.shopping_contributions c join public.shopping_items i on i.id = c.item_id
       where c.household_id <> i.household_id),
  0,
  'AC-003 merge: no item or contribution ends up in another household');
select results_eq(
  format($$ select i.id, i.article_id from public.shopping_items i where i.household_id = %L order by i.id $$, tests.fx('home_w')),
  format($$ select * from (values (%L::uuid, %L::uuid), (%L::uuid, %L::uuid), (%L::uuid, %L::uuid)) v order by 1 $$,
         tests.fx('item_dusch_w'), tests.fx('duschgel_w'), tests.fx('item_brot_w'), tests.fx('brot_w'),
         tests.fx('item_tee_w'), tests.fx('tee_w')),
  'AC-003 merge: the Duschgel of "WG Köln" was not merged with the one of "Enrico & Nadja"');

-- Without default_list_id the list marked is_default is the target; three lists become one.
select results_eq(
  format($$ select l.id, h.default_list_id from public.shopping_lists l join public.households h on h.id = l.household_id
            where l.household_id = %L $$, tests.fx('home_c')),
  format($$ values (%L::uuid, %L::uuid) $$, tests.fx('list_c2'), tests.fx('list_c2')),
  'AC-001 merge: without default_list_id the default list is kept and becomes default_list_id');
select results_eq(
  format($$ select i.id, (select array_agg(c.id order by c.count) from public.shopping_contributions c where c.item_id = i.id)
            from public.shopping_items i where i.household_id = %L $$, tests.fx('home_c')),
  format($$ values (%L::uuid, array[%L::uuid, %L::uuid, %L::uuid]) $$,
         tests.fx('item_c2'), tests.fx('c_c1'), tests.fx('c_c2'), tests.fx('c_c3')),
  'AC-001 merge: the same article open in three lists becomes one item with every contribution');

-- Second run: nothing changes (idempotent).
select tests.take_snapshot(1);
select lives_ok($$ select private.merge_shopping_lists() $$, 'AC-003 merge_shopping_lists: runs a second time');
select tests.take_snapshot(2);
select set_eq(
  $$ select tbl, id, state from snapshot where round = 2 $$,
  $$ select tbl, id, state from snapshot where round = 1 $$,
  'AC-003 merge: a second run changes nothing, not even updated_at or the tombstones');

select lives_ok(
  $$ alter table public.shopping_lists add constraint shopping_lists_household_id_key unique (household_id) $$,
  'AC-001 merge: afterwards every household has at most one list (the constraint holds again)');

-- ===================== AC-004: the store queue of an older device =====================
-- Nadja's device still knows "Drogerie" and its items; her queued actions replay after the merge.
select tests.authenticate_as(tests.fx('nadja'));
select is(
  public.set_shopping_item_checked(tests.fx('item_zahn'), true, 0) ->> 'checked', 'true',
  'AC-004 queue: checking a moved item works, it has the same id');
select is(
  (select checked from public.shopping_items where id = tests.fx('item_zahn') and list_id = tests.fx('list_std')), true,
  'AC-004 queue: the moved item is checked on the one list');
select is(
  public.set_shopping_item_checked(tests.fx('item_watte'), false, 1), null,
  'AC-004 queue: unchecking a deleted checked item is dropped without an error');
select is(
  public.set_shopping_item_checked(tests.fx('item_dusch_drog'), true, 0), null,
  'AC-004 queue: checking an item that was merged away is dropped without an error');
select is(
  public.set_shopping_item_not_available(tests.fx('item_dusch_drog'), true), null,
  'AC-004 queue: "nicht da" on an item that was merged away is dropped without an error');
select is(
  public.add_shopping_contributions(tests.fx('list_drog'), jsonb_build_array(jsonb_build_object(
    'client_item_id', tests.fx('item_rasierer'), 'client_article_id', tests.fx('rasierer'),
    'article_name', 'Rasierer', 'name_key', 'rasierer',
    'contributions', jsonb_build_array(jsonb_build_object('id', tests.fx('c_rasierer'), 'source', '{"kind": "manual"}'::jsonb, 'count', 1))))),
  jsonb_build_array(jsonb_build_object(
    'client_item_id', tests.fx('item_rasierer'), 'item_id', tests.fx('item_rasierer'),
    'client_article_id', tests.fx('rasierer'), 'article_id', tests.fx('rasierer'))),
  'AC-004 queue: adding to the merged list "Drogerie" is accepted');
select results_eq(
  format($$ select list_id, checked from public.shopping_items where id = %L $$, tests.fx('item_rasierer')),
  format($$ values (%L::uuid, false) $$, tests.fx('list_std')),
  'AC-004 queue: "Rasierer" is open on the one list');
select is(
  (public.add_shopping_contributions(tests.fx('list_drog'), jsonb_build_array(jsonb_build_object(
    'client_item_id', gen_random_uuid(), 'client_article_id', gen_random_uuid(),
    'article_name', 'Duschgel', 'name_key', 'duschgel',
    'contributions', jsonb_build_array(jsonb_build_object('id', tests.fx('c_dusch_queue'), 'source', '{"kind": "manual"}'::jsonb, 'count', 1)))))
   -> 0 ->> 'item_id')::uuid,
  tests.fx('item_dusch_std'),
  'AC-004 queue: adding an article that is open on the one list joins that item');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, '[]') $$, tests.fx('list_drog')),
  'P0002', 'list_not_found', 'AC-004 queue: a merged list of another household is not found');
select is(
  public.set_shopping_item_checked(tests.fx('item_zahn'), false, 1), null,
  'AC-004 queue: a member of another household cannot check a moved item');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.add_shopping_contributions(%L, '[]') $$, tests.fx('list_drog')),
  '42501', null, 'AC-004 queue: anon cannot add to a merged list');

-- ===================== AC-005: no second list =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ insert into public.shopping_lists (household_id, name) values (%L, 'Zweite') $$, tests.fx('home_a')),
  '42501', null, 'AC-005 shopping_lists: a member cannot insert a list directly');
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'shopping_lists', 'row', jsonb_build_object('id', gen_random_uuid(), 'name', 'Zweite')))),
  '22023', 'invalid_change', 'AC-005 apply_changes: inserting a list is rejected');
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'shopping_lists', 'row', '{}'::jsonb))),
  '22023', 'invalid_change', 'AC-005 apply_changes: inserting an empty list row is rejected');
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'shopping_lists', 'id', tests.fx('list_std')))),
  '22023', 'invalid_change', 'AC-005 apply_changes: deleting the list is rejected');
select throws_ok(
  format($$ delete from public.shopping_lists where id = %L $$, tests.fx('list_std')),
  '42501', null, 'AC-005 shopping_lists: a member cannot delete the list directly');
select lives_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'shopping_lists', 'id', tests.fx('list_std'), 'changes', '{"name": "Einkaufsliste"}'::jsonb))),
  'AC-005 apply_changes: the name of the list can still be patched');
select is(
  (select count(*)::int from public.shopping_lists where household_id = tests.fx('home_a')), 1,
  'AC-005 shopping_lists: a member reads the one list of her household');
select tests.clear_authentication();
select throws_ok(
  format($$ insert into public.shopping_lists (household_id, name) values (%L, 'Zweite') $$, tests.fx('home_a')),
  '23505', null, 'AC-005 shopping_lists: even without the grant check, a second list violates the constraint');
select ok(
  not has_any_column_privilege('authenticated', 'public.shopping_lists', 'insert')
    and not has_table_privilege('authenticated', 'public.shopping_lists', 'delete'),
  'AC-005 shopping_lists: authenticated has no insert and no delete privilege');

-- Isolation of the remaining privileges (select, update).
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format($$ select 1 from public.shopping_lists where household_id = %L $$, tests.fx('home_a'))), 0,
  'AC-005 shopping_lists: a member of another household reads no list');
select is(
  tests.affected(format($$ update public.shopping_lists set name = 'Fremd' where id = %L $$, tests.fx('list_std'))), 0,
  'AC-005 shopping_lists: a member of another household cannot rename the list');
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'shopping_lists', 'id', tests.fx('list_std'), 'changes', '{"name": "Fremd"}'::jsonb))),
  '42501', 'not_member', 'AC-005 apply_changes: a member of another household cannot patch the list');
select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.shopping_lists $$, '42501', null, 'AC-005 shopping_lists: anon cannot read lists');
select tests.clear_authentication();
select is(
  (select name from public.shopping_lists where id = tests.fx('list_std')), 'Einkaufsliste',
  'AC-005 shopping_lists: only the member''s rename took effect');

-- ===================== AC-006: a new household =====================
select tests.authenticate_as(tests.fx('enrico'));
insert into fx (key, id) values ('ferienhaus', public.create_household('Ferienhaus', '{"areas": [], "articles": []}'));
select tests.clear_authentication();
select results_eq(
  format($$ select count(*)::int, bool_and(l.id = h.default_list_id) from public.shopping_lists l
            join public.households h on h.id = l.household_id where l.household_id = %L $$, tests.fx('ferienhaus')),
  $$ values (1, true) $$,
  'AC-006 create_household: the new household has exactly one list, as default_list_id');

select * from finish();
rollback;
