-- restore_cleared_items (spec 0003, undo of "Erledigt leeren"): puts the items that
-- clear_checked_items returned back on their list, checked, with their contributions.
begin;
\ir _helpers.psql
select plan(24);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The result of clear_checked_items, kept for the restore calls.
create temp table cleared (round int primary key, items jsonb not null) on commit drop;
grant select, insert on cleared to anon, authenticated;
create function tests.cleared(p_round int) returns jsonb language sql stable
as $$ select items from cleared where round = p_round $$;
grant execute on function tests.cleared(int) to anon, authenticated;

-- Item state as one comparable row.
create function tests.item_state(p_item uuid)
returns table (list_id uuid, checked boolean, checked_by uuid, check_seq int, not_available boolean)
language sql stable
as $$ select i.list_id, i.checked, i.checked_by, i.check_seq, i.not_available from public.shopping_items i where i.id = p_item $$;
grant execute on function tests.item_state(uuid) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values
  ('list_a'), ('list_b'), ('brot'), ('milch'), ('butter'),
  ('item_brot'), ('item_milch'), ('item_butter'), ('c_brot1'), ('c_brot2'), ('c_milch');

insert into public.shopping_lists (id, household_id, name) values
  (tests.fx('list_a'), tests.fx('home_a'), 'Standardliste'),
  (tests.fx('list_b'), tests.fx('home_b'), 'Liste B');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('brot'), tests.fx('home_a'), 'Brot', 'brot'),
  (tests.fx('milch'), tests.fx('home_a'), 'Milch', 'milch'),
  (tests.fx('butter'), tests.fx('home_a'), 'Butter', 'butter');
insert into public.shopping_items (id, household_id, list_id, article_id, checked, checked_at, checked_by, check_seq, not_available) values
  (tests.fx('item_brot'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('brot'), true, '2026-11-20T10:00:00Z', tests.fx('nadja'), 3, true),
  (tests.fx('item_milch'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('milch'), true, '2026-11-20T10:05:00Z', tests.fx('enrico'), 1, false),
  (tests.fx('item_butter'), tests.fx('home_a'), tests.fx('list_a'), tests.fx('butter'), false, null, null, 0, false);
insert into public.shopping_contributions (id, household_id, item_id, source, qty, unit, note) values
  (tests.fx('c_brot1'), tests.fx('home_a'), tests.fx('item_brot'), '{"kind": "manual"}', null, null, 'Vollkorn'),
  (tests.fx('c_brot2'), tests.fx('home_a'), tests.fx('item_brot'),
   jsonb_build_object('kind', 'recipe', 'recipeId', gen_random_uuid(), 'label', 'Dal'), 500, 'g', null),
  (tests.fx('c_milch'), tests.fx('home_a'), tests.fx('item_milch'), '{"kind": "manual"}', 2, 'l', null);

-- ===================== Round trip =====================
select tests.authenticate_as(tests.fx('enrico'));
insert into cleared values (1, public.clear_checked_items(tests.fx('list_a')));
select is(
  public.restore_cleared_items(tests.fx('list_a'), tests.cleared(1)), 2,
  'T4 restore_cleared_items: returns the number of restored items');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_brot')),
  format($$ values (%L::uuid, true, %L::uuid, 3, true) $$, tests.fx('list_a'), tests.fx('nadja')),
  'T4 restore_cleared_items: the item is back checked, with checked_by, check_seq and "not here"');
select results_eq(
  format('select * from tests.item_state(%L)', tests.fx('item_milch')),
  format($$ values (%L::uuid, true, %L::uuid, 1, false) $$, tests.fx('list_a'), tests.fx('enrico')),
  'T4 restore_cleared_items: every cleared item is back checked');
select is(
  (select checked_at from public.shopping_items where id = tests.fx('item_brot')), '2026-11-20T10:00:00Z'::timestamptz,
  'T4 restore_cleared_items: checked_at is kept');
select results_eq(
  format($$ select id, item_id, source ->> 'kind', qty, unit, note from public.shopping_contributions
            where item_id in (%L, %L) order by id $$, tests.fx('item_brot'), tests.fx('item_milch')),
  (select format($$ select id, item_id, source ->> 'kind', qty, unit, note from jsonb_populate_recordset(null::public.shopping_contributions, %L) order by id $$,
                 jsonb_agg(c)) from jsonb_array_elements(tests.cleared(1)) e, jsonb_array_elements(e -> 'contributions') c),
  'T4 restore_cleared_items: the contributions are back with their ids and values');
select is(
  (select count(*)::int from public.shopping_items where list_id = tests.fx('list_a')), 3,
  'T4 restore_cleared_items: the open item was not touched');

-- Idempotent: the queue or the user repeats the call.
select is(
  public.restore_cleared_items(tests.fx('list_a'), tests.cleared(1)), 0,
  'T4 restore_cleared_items: a second call restores nothing');
select is(
  (select count(*)::int from public.shopping_contributions where item_id in (tests.fx('item_brot'), tests.fx('item_milch'))), 3,
  'T4 restore_cleared_items: a second call adds no contributions');

-- Nadja left the household between clearing and undo: her check is kept, without her.
insert into cleared values (2, public.clear_checked_items(tests.fx('list_a')));
select tests.clear_authentication();
delete from public.household_members where household_id = tests.fx('home_a') and profile_id = tests.fx('nadja');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  public.restore_cleared_items(tests.fx('list_a'), tests.cleared(2)), 2,
  'T4 restore_cleared_items: restores after a member was removed');
select results_eq(
  format('select checked, checked_by from tests.item_state(%L)', tests.fx('item_brot')),
  $$ values (true, null::uuid) $$,
  'T4 restore_cleared_items: checked_by of a removed member becomes null');

-- ===================== Tampered check fields (security check 0003) =====================
-- The payload comes from the client: check_seq is clamped to 0…999000 (so the restored item can
-- still be checked about 1000 times before the 1000000 constraint), checked_at may not lie in the
-- future, checked_by must be a current member.
insert into cleared values (3, public.clear_checked_items(tests.fx('list_a')));
select is(
  public.restore_cleared_items(tests.fx('list_a'),
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(tests.cleared(3),
      '{0,item,check_seq}', '2147483647'),
      '{0,item,checked_at}', '"2999-01-01T00:00:00Z"'),
      '{0,item,checked_by}', to_jsonb(tests.fx('ben'))),
      '{1,item,check_seq}', '-5')),
  2,
  'T4 restore_cleared_items: tampered items are still restored');
select results_eq(
  format('select check_seq, checked_at <= now(), checked_by from public.shopping_items where id = %L',
         (tests.cleared(3) -> 0 -> 'item' ->> 'id')),
  $$ values (999000, true, null::uuid) $$,
  'T4 restore_cleared_items: an overflowing check_seq is clamped, a future checked_at becomes now, a foreign checked_by is dropped');
select is(
  (select check_seq from public.shopping_items where id = (tests.cleared(3) -> 1 -> 'item' ->> 'id')::uuid), 0,
  'T4 restore_cleared_items: a negative check_seq is clamped to 0');
select is(
  (select checked_at from public.shopping_items where id = (tests.cleared(3) -> 0 -> 'item' ->> 'id')::uuid), now(),
  'T4 restore_cleared_items: a future checked_at is replaced by now()');
select tests.clear_authentication();
select throws_ok(
  format('update public.shopping_items set check_seq = 1000001 where id = %L', tests.fx('item_butter')),
  '23514', null, 'T3 shopping_items: check_seq above 1000000 violates the check constraint');
select lives_ok(
  format('update public.shopping_items set check_seq = 1000000 where id = %L', tests.fx('item_butter')),
  'T3 shopping_items: check_seq 1000000 is allowed');
update public.shopping_items set check_seq = 0 where id = tests.fx('item_butter');
select tests.authenticate_as(tests.fx('enrico'));

-- ===================== Invalid input =====================
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'),
         jsonb_set(tests.cleared(1), '{0,item,list_id}', to_jsonb(tests.fx('list_b')))),
  '22023', 'invalid_entries', 'T4 restore_cleared_items: items of another list are rejected');
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'),
         jsonb_set(tests.cleared(1), '{0,item,household_id}', to_jsonb(tests.fx('home_b')))),
  '22023', 'invalid_entries', 'AC-011 restore_cleared_items: an item with another household id is rejected');
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'),
         jsonb_set(tests.cleared(1), '{0,contributions,0,item_id}', to_jsonb(tests.fx('item_butter')))),
  '22023', 'invalid_entries', 'T4 restore_cleared_items: a contribution must belong to its item');
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'),
         jsonb_set(tests.cleared(1), '{0,item,id}', '"kein-uuid"')),
  '22023', 'invalid_entries', 'T4 restore_cleared_items: a malformed id is rejected');
select throws_ok(
  format($$ select public.restore_cleared_items(%L, '{"item": {}}') $$, tests.fx('list_a')),
  '22023', 'invalid_entries', 'T4 restore_cleared_items: items must be an array');
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'),
         (select jsonb_agg(tests.cleared(1) -> 0) from generate_series(1, 1001))),
  '22023', 'too_many_changes', 'AC-035 restore_cleared_items: more than 1000 items are rejected');

-- ===================== Foreign household, anon =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'), tests.cleared(1)),
  'P0002', 'list_not_found', 'AC-011 restore_cleared_items: a list of another household is not found');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.restore_cleared_items(%L, %L)', tests.fx('list_a'), tests.cleared(1)),
  '42501', null, 'AC-005 restore_cleared_items: anon cannot call it');

select * from finish();
rollback;
