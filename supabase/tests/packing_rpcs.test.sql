-- Packing (spec 0012, task 2): set_packing_items_packed with the rule table of ADR-0013
-- ("Abhaken gewinnt" via pack_seq), batches in one call (AC-026, AC-030), skipped items
-- (AC-024, AC-040), foreign household and signed out (AC-025), malformed input; apply_changes with
-- a packing list in one call (AC-011, AC-015) and the domain op restore_packing_items (AC-034,
-- AC-035).
begin;
\ir _helpers.psql
select plan(67);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- One change {item_id, packed, seen_pack_seq}.
create function tests.change(p_key text, p_packed boolean, p_seen integer default 0) returns jsonb language sql stable
as $$ select jsonb_build_object('item_id', tests.fx(p_key), 'packed', p_packed, 'seen_pack_seq', p_seen) $$;
-- The SQL text of a set_packing_items_packed call, for throws_ok / lives_ok.
create function tests.pack_sql(p_household text, p_changes jsonb) returns text language sql stable
as $$ select format('select public.set_packing_items_packed(%L, %L)', tests.fx(p_household), p_changes) $$;
create function tests.pack(p_household text, p_changes jsonb) returns jsonb language sql
as $$ select public.set_packing_items_packed(tests.fx(p_household), p_changes) $$;
-- The packed state of an item.
create function tests.state(p_key text) returns jsonb language sql stable
as $$ select jsonb_build_object('packed', packed, 'pack_seq', pack_seq, 'packed_by', packed_by,
                                'packed_at', packed_at)
      from public.packing_items where id = tests.fx(p_key) $$;
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
-- One restore element for an item.
create function tests.restore_item(p_key text, p_list_bag text, p_extra jsonb default '{}') returns jsonb
language sql stable
as $$ select jsonb_build_object('id', tests.fx(p_key), 'list_bag_id', tests.fx(p_list_bag), 'name', 'Badehose',
                                'quantity', 2, 'per_day', null, 'sort', 0, 'packed', false, 'packed_at', null,
                                'packed_by', null, 'pack_seq', 0) || p_extra $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('mallorca'), ('hamburg'), ('b_trip'), ('lb_strand'), ('lb_kultur'), ('lb_technik'), ('lb_hamburg'), ('lb_b'),
  ('open'), ('packed'), ('stale'), ('kopfhoerer'), ('item_b'), ('reisepass'),
  ('new_trip'), ('new_list_bag'), ('r_nadja'), ('r_future'), ('r_open'), ('r_seq'), ('r_day'), ('r_foreign'),
  ('r_bag'), ('lb_removed'), ('k1'), ('k2');
insert into fx (key) select 'k' || n from generate_series(3, 7) n;
insert into fx (key) select 'r' || n from generate_series(1, 30) n;

insert into public.trips (id, household_id, from_on, to_on) values
  (tests.fx('mallorca'), tests.fx('home_a'), '2027-01-01', '2027-01-07'),
  (tests.fx('hamburg'), tests.fx('home_a'), '2027-02-01', '2027-02-02'),
  (tests.fx('b_trip'), tests.fx('home_b'), '2027-02-01', '2027-02-03');
insert into public.trip_members (household_id, trip_id, member_id) values
  (tests.fx('home_a'), tests.fx('mallorca'), tests.fx('enrico')),
  (tests.fx('home_a'), tests.fx('mallorca'), tests.fx('nadja')),
  (tests.fx('home_a'), tests.fx('hamburg'), tests.fx('nadja')),
  (tests.fx('home_b'), tests.fx('b_trip'), tests.fx('ben'));
insert into public.packing_list_bags (id, household_id, trip_id, name, sort) values
  (tests.fx('lb_strand'), tests.fx('home_a'), tests.fx('mallorca'), 'Strand', 0),
  (tests.fx('lb_kultur'), tests.fx('home_a'), tests.fx('mallorca'), 'Kulturbeutel', 1),
  (tests.fx('lb_technik'), tests.fx('home_a'), tests.fx('mallorca'), 'Technik', 2),
  (tests.fx('lb_hamburg'), tests.fx('home_a'), tests.fx('hamburg'), 'Dienstreise', 0),
  (tests.fx('lb_b'), tests.fx('home_b'), tests.fx('b_trip'), 'Strand', 0);
insert into public.packing_items (id, household_id, list_bag_id, name, packed, packed_at, packed_by, pack_seq) values
  (tests.fx('open'), tests.fx('home_a'), tests.fx('lb_strand'), 'Badehose', false, null, null, 0),
  (tests.fx('packed'), tests.fx('home_a'), tests.fx('lb_strand'), 'Ladekabel', true, '2026-11-20 10:00+00',
   tests.fx('nadja'), 3),
  (tests.fx('stale'), tests.fx('home_a'), tests.fx('lb_strand'), 'Sonnenbrille', true, '2026-11-20 10:00+00',
   tests.fx('nadja'), 5),
  (tests.fx('kopfhoerer'), tests.fx('home_a'), tests.fx('lb_hamburg'), 'Kopfhörer', false, null, null, 0),
  (tests.fx('item_b'), tests.fx('home_b'), tests.fx('lb_b'), 'Handtuch', false, null, null, 0);
-- "Kulturbeutel": 7 open (AC-026). "Technik": 30 packed, pack_seq 1 (AC-030).
insert into public.packing_items (id, household_id, list_bag_id, name)
select tests.fx('k' || n), tests.fx('home_a'), tests.fx('lb_kultur'), 'Kultur ' || n from generate_series(1, 7) n;
insert into public.packing_items (id, household_id, list_bag_id, name, packed, packed_at, packed_by, pack_seq)
select tests.fx('r' || n), tests.fx('home_a'), tests.fx('lb_technik'), case when n = 1 then 'Reisepass' else 'Technik ' || n end,
       true, '2026-11-20 10:00+00', tests.fx('enrico'), 1
from generate_series(1, 30) n;

-- ===================== Signed out and foreign household (AC-025) =====================
select tests.authenticate_as_anon();
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true))), '42501', null,
  'AC-025 set_packing_items_packed: anon cannot call it');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true))), '42501', 'not_member',
  'AC-025 set_packing_items_packed: a member of another household gets not_member');
select is(tests.pack('home_b', jsonb_build_array(tests.change('open', true), tests.change('packed', false, 3))), '[]'::jsonb,
  'AC-025 set_packing_items_packed: ids of another household in the own call are skipped, nothing is revealed');
select tests.clear_authentication();
select results_eq(
  format($$ select id, packed, pack_seq from public.packing_items where id in (%L, %L) order by pack_seq $$,
         tests.fx('open'), tests.fx('packed')),
  format($$ values (%L::uuid, false, 0), (%L::uuid, true, 3) $$, tests.fx('open'), tests.fx('packed')),
  'AC-025: the items of "Enrico & Nadja" are unchanged');
select throws_ok(
  format('select private.set_packing_items_packed(%L, %L)', tests.fx('home_a'), jsonb_build_array(tests.change('open', true))),
  '42501', 'not_authenticated', 'T2 set_packing_items_packed: without a user it is not_authenticated');

-- ===================== Malformed input =====================
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format('select public.set_packing_items_packed(null, %L)', jsonb_build_array(tests.change('open', true))),
  '42501', 'not_member', 'T2 set_packing_items_packed: no household is not_member');
select throws_ok(tests.pack_sql('home_a', '{}'), '22023', 'invalid_change',
  'T2 set_packing_items_packed: not an array');
select throws_ok(tests.pack_sql('home_a', '[]'), '22023', 'invalid_change',
  'T2 set_packing_items_packed: an empty array');
select throws_ok(tests.pack_sql('home_a', '[1]'), '22023', 'invalid_change',
  'T2 set_packing_items_packed: an element that is not an object');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true) || '{"name": "x"}')),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: an unknown key');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true) - 'seen_pack_seq')),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: a missing key');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true) || '{"packed": "true"}')),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: packed as text');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true, -1))),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: a negative pack_seq');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true) || '{"seen_pack_seq": 1.5}')),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: a pack_seq that is not an integer');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true) || '{"item_id": "Badehose"}')),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: an item id that is not a uuid');
select throws_ok(tests.pack_sql('home_a', jsonb_build_array(tests.change('open', true), tests.change('open', false))),
  '22023', 'invalid_change', 'T2 set_packing_items_packed: the same item twice');
select throws_ok(
  tests.pack_sql('home_a', (select jsonb_agg(jsonb_build_object('item_id', gen_random_uuid(), 'packed', true,
                                                                'seen_pack_seq', 0)) from generate_series(1, 201))),
  '22023', 'too_many_changes', 'T2 set_packing_items_packed: more than 200 changes');
select is(
  tests.pack('home_a', (select jsonb_agg(jsonb_build_object('item_id', gen_random_uuid(), 'packed', true,
                                                            'seen_pack_seq', 0)) from generate_series(1, 200))),
  '[]'::jsonb, 'T2 set_packing_items_packed: 200 changes are allowed');
select tests.clear_authentication();
select is((select count(*)::int from public.packing_items where household_id = tests.fx('home_a') and packed), 32,
  'T2 set_packing_items_packed: the refused calls changed nothing');

-- ===================== Rule table (ADR-0013) =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.pack('home_a', jsonb_build_array(tests.change('open', true))),
  jsonb_build_array(jsonb_build_object('item_id', tests.fx('open'), 'packed', true, 'pack_seq', 1)),
  'AC-020 set_packing_items_packed: open + pack → packed, pack_seq + 1');
select tests.clear_authentication();
select is(tests.state('open'),
  jsonb_build_object('packed', true, 'pack_seq', 1, 'packed_by', tests.fx('enrico'), 'packed_at', now()),
  'AC-020 set_packing_items_packed: packed_by is the caller, packed_at now()');
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.pack('home_a', jsonb_build_array(tests.change('packed', true, 0))),
  jsonb_build_array(jsonb_build_object('item_id', tests.fx('packed'), 'packed', true, 'pack_seq', 3)),
  'ADR-0013 set_packing_items_packed: packed + pack → unchanged');
select tests.clear_authentication();
select is(tests.state('packed') ->> 'packed_by', tests.fx('nadja')::text,
  'ADR-0013 set_packing_items_packed: … and still packed by Nadja');
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.pack('home_a', jsonb_build_array(tests.change('packed', false, 3))),
  jsonb_build_array(jsonb_build_object('item_id', tests.fx('packed'), 'packed', false, 'pack_seq', 4)),
  'AC-021 set_packing_items_packed: packed + unpack with the seen pack_seq → open, pack_seq + 1');
select tests.clear_authentication();
select is(tests.state('packed'), jsonb_build_object('packed', false, 'pack_seq', 4, 'packed_by', null, 'packed_at', null),
  'AC-021 set_packing_items_packed: … packed_at and packed_by are cleared');
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.pack('home_a', jsonb_build_array(tests.change('stale', false, 4))),
  jsonb_build_array(jsonb_build_object('item_id', tests.fx('stale'), 'packed', true, 'pack_seq', 5)),
  'AC-023 set_packing_items_packed: unpack with an old pack_seq → stays packed ("Abhaken gewinnt")');
select is(tests.pack('home_a', jsonb_build_array(tests.change('packed', false, 4))),
  jsonb_build_array(jsonb_build_object('item_id', tests.fx('packed'), 'packed', false, 'pack_seq', 4)),
  'ADR-0013 set_packing_items_packed: open + unpack → unchanged');
select tests.clear_authentication();
select is((tests.state('stale') ->> 'packed_at')::timestamptz, '2026-11-20 10:00+00'::timestamptz,
  'AC-023 set_packing_items_packed: … and keeps when and by whom it was packed');

-- ===================== Batches (AC-026, AC-030) =====================
select tests.authenticate_as(tests.fx('nadja'));
select is(
  jsonb_array_length(tests.pack('home_a', (select jsonb_agg(tests.change('k' || n, true) order by n desc)
                                           from generate_series(1, 7) n))),
  7, 'AC-026 set_packing_items_packed: seven items in one call');
select tests.clear_authentication();
select is((select count(*)::int from public.packing_items where list_bag_id = tests.fx('lb_kultur') and packed
           and packed_by = tests.fx('nadja') and pack_seq = 1), 7,
  'AC-026 set_packing_items_packed: … all seven are packed by Nadja');
-- Nadja re-packs "Reisepass" online meanwhile (unpack, pack again: pack_seq 3).
select tests.authenticate_as(tests.fx('nadja'));
select tests.pack('home_a', jsonb_build_array(tests.change('r1', false, 1)));
select tests.pack('home_a', jsonb_build_array(tests.change('r1', true, 2)));
-- Enrico resets offline with the pack_seq he saw (1).
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select count(*)::int from jsonb_array_elements(
     tests.pack('home_a', (select jsonb_agg(tests.change('r' || n, false, 1)) from generate_series(1, 30) n))) r
   where r ->> 'packed' = 'false'),
  29, 'AC-030 set_packing_items_packed: resetting 30 opens 29');
select tests.clear_authentication();
select results_eq(
  format($$ select name, packed, packed_by from public.packing_items
            where list_bag_id = %L and packed $$, tests.fx('lb_technik')),
  format($$ values ('Reisepass', true, %L::uuid) $$, tests.fx('nadja')),
  'AC-030 set_packing_items_packed: "Reisepass", packed again by Nadja meanwhile, stays packed');

-- ===================== Gone meanwhile (AC-024, AC-040) =====================
select tests.authenticate_as(tests.fx('nadja'));
delete from public.packing_items where id = tests.fx('kopfhoerer');
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.pack('home_a', jsonb_build_array(tests.change('kopfhoerer', true))), '[]'::jsonb,
  'AC-024 set_packing_items_packed: a packing item removed meanwhile is skipped without an error');
select tests.authenticate_as(tests.fx('nadja'));
delete from public.trips where id = tests.fx('hamburg');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.pack('home_a', jsonb_build_array(tests.change('kopfhoerer', true), tests.change('open', false, 1))),
  jsonb_build_array(jsonb_build_object('item_id', tests.fx('open'), 'packed', false, 'pack_seq', 2)),
  'AC-040 set_packing_items_packed: items of a deleted trip are skipped, the rest of the call applies');

-- ===================== The function =====================
select tests.clear_authentication();
select ok(
  (select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_catalog.pg_proc p
   where p.oid = 'private.set_packing_items_packed(uuid,jsonb)'::regprocedure),
  'T2 set_packing_items_packed: security definer with an empty search_path');
select ok(
  pg_catalog.pg_get_functiondef('private.set_packing_items_packed(uuid,jsonb)'::regprocedure)
    ~ 'order by i\.id\s+for update',
  'T2 set_packing_items_packed: rows are locked in the order of their id (two calls cannot deadlock)');
select ok(
  has_function_privilege('authenticated', 'public.set_packing_items_packed(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.set_packing_items_packed(uuid,jsonb)', 'execute'),
  'T2 set_packing_items_packed: callable by authenticated only');
select ok(
  not has_function_privilege('authenticated', 'private.recalc_packing_quantities(uuid,uuid)', 'execute'),
  'T1 recalc_packing_quantities: not callable by the API roles');

-- ===================== apply_changes: a packing list in one call (AC-011, AC-015) =====================
create temp table new_list on commit drop as
  select jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'trips', 'row', jsonb_build_object(
      'id', tests.fx('new_trip'), 'from_on', '2027-03-01', 'to_on', '2027-03-07')),
    jsonb_build_object('kind', 'insert', 'table', 'trip_members', 'row', jsonb_build_object(
      'trip_id', tests.fx('new_trip'), 'member_id', tests.fx('enrico'))),
    jsonb_build_object('kind', 'insert', 'table', 'packing_list_bags', 'row', jsonb_build_object(
      'id', tests.fx('new_list_bag'), 'trip_id', tests.fx('new_trip'), 'name', 'Strand', 'sort', 0)))
  || (select jsonb_agg(jsonb_build_object('kind', 'insert', 'table', 'packing_items', 'row', jsonb_build_object(
        'list_bag_id', tests.fx('new_list_bag'), 'name', case when n = 1 then 'T-Shirts' else 'Packstück ' || n end,
        'quantity', 1, 'per_day', case when n = 1 then 1 end, 'sort', n)) order by n)
      from generate_series(1, 21) n) as ops;
grant select on new_list to authenticated;
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  tests.apply_sql('home_a', (select ops from new_list) || jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'packing_items', 'row', jsonb_build_object(
      'list_bag_id', tests.fx('new_list_bag'), 'name', '', 'sort', 22)))),
  '23514', null, 'AC-015 apply_changes: an invalid packing item at the end fails the call');
select is((select count(*)::int from public.trips where id = tests.fx('new_trip')), 0,
  'AC-015 apply_changes: … and nothing of it is saved');
select lives_ok(tests.apply_sql('home_a', (select ops from new_list)),
  'AC-011 apply_changes: trip, person, bag of the packing list and 21 packing items in one call');
select results_eq(
  format($$ select count(*)::int, max(quantity) filter (where name = 'T-Shirts') from public.packing_items
            where list_bag_id = %L $$, tests.fx('new_list_bag')),
  $$ values (21, 7) $$,
  'AC-011 apply_changes: 21 packing items, "T-Shirts" 7×');

-- ===================== apply_changes: packed state stays with the server =====================
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'packing_items', 'row', jsonb_build_object(
      'list_bag_id', tests.fx('lb_strand'), 'name', 'X', 'packed', true)))),
  '22023', 'invalid_change', 'T2 apply_changes: an insert with packed is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'packing_items', 'id', tests.fx('open'), 'changes', jsonb_build_object('pack_seq', 5)))),
  '22023', 'invalid_change', 'T2 apply_changes: the packed state of packing items is never patched');

-- ===================== restore_packing_items (AC-034, AC-035) =====================
-- Nadja removed "Strand" with two packed items; "Rückgängig" inserts the bag and restores them.
select tests.clear_authentication();
insert into public.packing_list_bags (id, household_id, trip_id, name, sort)
values (tests.fx('lb_removed'), tests.fx('home_a'), tests.fx('mallorca'), 'Wandern', 5);
update public.packing_items set list_bag_id = tests.fx('lb_removed') where id in (tests.fx('stale'), tests.fx('k1'));
create temp table removed_rows on commit drop as
  select to_jsonb(i) - 'household_id' - 'created_at' - 'updated_at' as doc from public.packing_items i
  where i.id in (tests.fx('stale'), tests.fx('k1'));
grant select on removed_rows to authenticated;
select tests.authenticate_as(tests.fx('nadja'));
select public.apply_changes(tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
  'kind', 'delete', 'table', 'packing_list_bags', 'id', tests.fx('lb_removed'))));
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(
    jsonb_build_object('kind', 'insert', 'table', 'packing_list_bags', 'row', jsonb_build_object(
      'id', tests.fx('lb_removed'), 'trip_id', tests.fx('mallorca'), 'name', 'Wandern', 'sort', 5)),
    jsonb_build_object('kind', 'restore_packing_items', 'items', (select jsonb_agg(doc) from removed_rows)))),
  'AC-034 apply_changes: the bag and its packing items come back in one call');
select tests.clear_authentication();
select is(
  (select jsonb_agg(to_jsonb(i) - 'household_id' - 'created_at' - 'updated_at' order by i.id) from public.packing_items i
   where i.id in (tests.fx('stale'), tests.fx('k1'))),
  (select jsonb_agg(doc order by (doc ->> 'id')::uuid) from removed_rows),
  'AC-034 restore_packing_items: both are packed again, by Nadja, at the same time, with the same pack_seq');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_nadja', 'lb_strand', jsonb_build_object('packed', true, 'packed_at', '2026-11-19 08:00+00',
                                                                    'packed_by', tests.fx('nadja'), 'pack_seq', 7)),
    tests.restore_item('r_future', 'lb_strand', jsonb_build_object('packed', true, 'packed_at', '2099-01-01 00:00+00',
                                                                     'packed_by', tests.fx('nadja'), 'pack_seq', 1)),
    tests.restore_item('r_open', 'lb_strand', jsonb_build_object('packed', false, 'packed_at', '2026-11-19 08:00+00',
                                                                   'packed_by', tests.fx('nadja'), 'pack_seq', 2)),
    tests.restore_item('r_seq', 'lb_strand', jsonb_build_object('packed', true, 'pack_seq', 5000000)),
    tests.restore_item('r_day', 'lb_strand', jsonb_build_object('quantity', 1, 'per_day', 2)))))),
  'AC-035 apply_changes: restore_packing_items restores removed packing items');
select tests.clear_authentication();
select is(tests.state('r_nadja'),
  jsonb_build_object('packed', true, 'pack_seq', 7, 'packed_by', tests.fx('nadja'), 'packed_at', '2026-11-19 08:00+00'::timestamptz),
  'AC-035 restore_packing_items: "gepackt von Nadja, um …" comes back');
select is((tests.state('r_future') ->> 'packed_at')::timestamptz, now(),
  'T2 restore_packing_items: packed_at in the future becomes now()');
select is(tests.state('r_open'), jsonb_build_object('packed', false, 'pack_seq', 2, 'packed_by', null, 'packed_at', null),
  'T2 restore_packing_items: an open item has no packed_at and no packed_by');
select results_eq(
  format($$ select pack_seq, packed_at, packed_by from public.packing_items where id = %L $$, tests.fx('r_seq')),
  $$ values (999000, now(), null::uuid) $$,
  'T2 restore_packing_items: pack_seq is capped at 999000, a missing packed_at is now()');
select is((select quantity from public.packing_items where id = tests.fx('r_day')), 14,
  'T2 restore_packing_items: "je Tag" is recalculated by the insert trigger');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_foreign', 'lb_strand', jsonb_build_object('packed', true, 'packed_by', tests.fx('ben'))))))),
  '23503', null, 'T2 restore_packing_items: packed_by outside the household is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_foreign', 'lb_b'))))),
  '23503', null, 'AC-010 restore_packing_items: a bag of another household is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_nadja', 'lb_strand'))))),
  '23505', null, 'T2 restore_packing_items: an existing id is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_foreign', 'lb_strand', '{"household_id": null}'))))),
  '22023', 'invalid_change', 'T2 restore_packing_items: an unknown key is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_foreign', 'lb_strand', '{"packed": "ja"}'))))),
  '22023', 'invalid_change', 'T2 restore_packing_items: a malformed value is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items',
    jsonb_build_object('id', tests.fx('r_foreign'))))),
  '22023', 'invalid_change', 'T2 restore_packing_items: items must be an array');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', '[]'::jsonb))),
  '22023', 'invalid_change', 'T2 restore_packing_items: an empty array is rejected');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items', jsonb_build_array(
    tests.restore_item('r_foreign', 'lb_strand') - 'name')))),
  '22023', 'invalid_change', 'T2 restore_packing_items: id, list_bag_id and name are required');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items',
    (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'list_bag_id', tests.fx('lb_strand'), 'name', 'X'))
     from generate_series(1, 201))))),
  '22023', 'too_many_changes', 'T2 restore_packing_items: more than 200 items are rejected');
select throws_ok(
  tests.apply_sql('home_a',
    (select jsonb_agg(jsonb_build_object('kind', 'insert', 'table', 'packing_bags', 'row', jsonb_build_object('name', 'T ' || n)))
     from generate_series(1, 190) n)
    || jsonb_build_array(jsonb_build_object('kind', 'restore_packing_items', 'items',
         (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'list_bag_id', tests.fx('lb_strand'), 'name', 'X'))
          from generate_series(1, 11))))),
  '22023', 'too_many_changes', 'T2 apply_changes: restored items count toward the 200 ops');
select tests.clear_authentication();
select is((select count(*)::int from public.packing_items where id = tests.fx('r_foreign'))
          + (select count(*)::int from public.packing_bags where household_id = tests.fx('home_a')),
  0, 'T2 restore_packing_items: the refused calls restored nothing');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select private.restore_packing_items(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(tests.restore_item('r_foreign', 'lb_strand'))),
  '42501', 'not_member', 'AC-010 restore_packing_items: a member of another household gets not_member');
select tests.authenticate_as_anon();
select throws_ok(
  format('select private.restore_packing_items(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(tests.restore_item('r_foreign', 'lb_strand'))),
  '42501', null, 'T2 restore_packing_items: anon cannot call it');
select tests.clear_authentication();
select throws_ok(
  format('select private.restore_packing_items(%L, %L)', tests.fx('home_a'),
         jsonb_build_array(tests.restore_item('r_foreign', 'lb_strand'))),
  '42501', 'not_authenticated', 'T2 restore_packing_items: without a user it is not_authenticated');
select ok(
  (select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_catalog.pg_proc p
   where p.oid = 'private.restore_packing_items(uuid,jsonb)'::regprocedure),
  'T2 restore_packing_items: security definer with an empty search_path');

select * from finish();
rollback;
