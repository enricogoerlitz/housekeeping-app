-- Reisetaschen and Packlisten (spec 0012, task 1): packing_bags, packing_bag_items,
-- packing_list_bags and packing_items. Tenant isolation, the constraints of the plan (names,
-- quantities, "je Tag"), composite references into the own household (AC-010), the insert trigger
-- (open state, "je Tag" quantity, AC-011, AC-014), the recalculation after a change of the
-- duration or of the absence of a bag (AC-037, AC-041), cascades with tombstones (AC-038, AC-009),
-- set null when a member leaves, and sync_pull.
begin;
\ir _helpers.psql
select plan(147);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The quantity of a packing item.
create function tests.qty(p_key text) returns integer language sql stable
as $$ select quantity from public.packing_items where id = tests.fx(p_key) $$;
-- Sets updated_at of a row into the past, bypassing set_timestamps (call as postgres).
create function tests.backdate(p_table text, p_key text) returns void language plpgsql
as $$
begin
  execute format('alter table public.%I disable trigger %I', p_table, p_table || '_set_timestamps');
  execute format('update public.%I set updated_at = %L where id = %L', p_table, '2000-01-01', tests.fx(p_key));
  execute format('alter table public.%I enable trigger %I', p_table, p_table || '_set_timestamps');
end
$$;
create function tests.updated_at(p_table text, p_key text) returns timestamptz language plpgsql
as $$
declare
  v timestamptz;
begin
  execute format('select updated_at from public.%I where id = %L', p_table, tests.fx(p_key)) into v;
  return v;
end
$$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('mia', tests.create_user('mia@example.com', 'Mia')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja'), tests.fx('mia')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('mallorca'), ('short_trip'), ('long_trip'), ('mia_trip'), ('b_trip'),
  ('strand'), ('kultur'), ('mia_bag'), ('bag_b'), ('strand_item'), ('kultur_item'),
  ('lb_strand'), ('lb_kultur'), ('lb_mia'), ('lb_mia_copy'), ('lb_move'), ('lb_short'), ('lb_long'), ('lb_b'),
  ('it_tshirts'), ('it_socken'), ('it_badehose'), ('it_p1'), ('it_p2'), ('it_p3'), ('it_o1'), ('it_o2'), ('it_o3'),
  ('it_mia_packed'), ('it_mia'), ('it_move'), ('it_b'),
  ('iso_bag'), ('iso_bag_item'), ('iso_list_bag'), ('iso_item'),
  ('new_tshirts'), ('new_fixed'), ('new_short'), ('new_long'), ('new_open'),
  ('huge_trip'), ('lb_huge'), ('new_huge');

-- ===================== Fixtures (as postgres) =====================
insert into public.absences (id, household_id, member_id, from_on, to_on) values
  (tests.fx('mallorca'), tests.fx('home_a'), null, '2027-01-01', '2027-01-07'),
  (tests.fx('short_trip'), tests.fx('home_a'), tests.fx('enrico'), '2027-01-01', '2027-01-04'),
  (tests.fx('long_trip'), tests.fx('home_a'), tests.fx('nadja'), '2027-01-01', '2027-12-31'),
  (tests.fx('mia_trip'), tests.fx('home_a'), tests.fx('mia'), '2027-03-01', '2027-03-02'),
  (tests.fx('b_trip'), tests.fx('home_b'), tests.fx('ben'), '2027-02-01', '2027-02-03');
insert into public.packing_bags (id, household_id, name, member_id, sort) values
  (tests.fx('strand'), tests.fx('home_a'), 'Strand', null, 0),
  (tests.fx('kultur'), tests.fx('home_a'), 'Kulturbeutel', tests.fx('nadja'), 1),
  (tests.fx('mia_bag'), tests.fx('home_a'), 'Mias Tasche', tests.fx('mia'), 2),
  (tests.fx('bag_b'), tests.fx('home_b'), 'Strand', null, 0);
insert into public.packing_bag_items (id, household_id, bag_id, name, quantity, per_day, sort) values
  (tests.fx('strand_item'), tests.fx('home_a'), tests.fx('strand'), 'Badehose', 2, false, 0),
  (tests.fx('kultur_item'), tests.fx('home_a'), tests.fx('kultur'), 'Zahnbürste', null, false, 0);
insert into public.packing_list_bags (id, household_id, absence_id, bag_id, name, member_id, sort) values
  (tests.fx('lb_strand'), tests.fx('home_a'), tests.fx('mallorca'), tests.fx('strand'), 'Strand', null, 0),
  (tests.fx('lb_kultur'), tests.fx('home_a'), tests.fx('mallorca'), tests.fx('kultur'), 'Kulturbeutel', tests.fx('nadja'), 1),
  (tests.fx('lb_mia'), tests.fx('home_a'), tests.fx('mia_trip'), tests.fx('mia_bag'), 'Mias Tasche', tests.fx('mia'), 0),
  (tests.fx('lb_mia_copy'), tests.fx('home_a'), tests.fx('mallorca'), null, 'Mias Tasche', tests.fx('mia'), 2),
  (tests.fx('lb_move'), tests.fx('home_a'), tests.fx('mallorca'), null, 'Technik', null, 3),
  (tests.fx('lb_short'), tests.fx('home_a'), tests.fx('short_trip'), null, 'Strand', null, 0),
  (tests.fx('lb_long'), tests.fx('home_a'), tests.fx('long_trip'), null, 'Strand', null, 0),
  (tests.fx('lb_b'), tests.fx('home_b'), tests.fx('b_trip'), tests.fx('bag_b'), 'Strand', null, 0);
-- "Strand" of "Urlaub Mallorca": 9 packing items, 4 of them packed (AC-009, AC-037).
insert into public.packing_items
  (id, household_id, list_bag_id, name, quantity, per_day, packed, packed_at, packed_by, pack_seq, sort) values
  (tests.fx('it_tshirts'), tests.fx('home_a'), tests.fx('lb_strand'), 'T-Shirts', 1, 1, false, null, null, 0, 0),
  (tests.fx('it_socken'), tests.fx('home_a'), tests.fx('lb_strand'), 'Socken', 1, 1, true, now(), tests.fx('nadja'), 1, 1),
  (tests.fx('it_badehose'), tests.fx('home_a'), tests.fx('lb_strand'), 'Badehose', 2, null, false, null, null, 0, 2),
  (tests.fx('it_p1'), tests.fx('home_a'), tests.fx('lb_strand'), 'Sonnencreme', null, null, true, now(), tests.fx('enrico'), 1, 3),
  (tests.fx('it_p2'), tests.fx('home_a'), tests.fx('lb_strand'), 'Strandtuch', null, null, true, now(), tests.fx('enrico'), 1, 4),
  (tests.fx('it_p3'), tests.fx('home_a'), tests.fx('lb_strand'), 'Sonnenbrille', null, null, true, now(), tests.fx('enrico'), 1, 5),
  (tests.fx('it_o1'), tests.fx('home_a'), tests.fx('lb_strand'), 'Schnorchel', null, null, false, null, null, 0, 6),
  (tests.fx('it_o2'), tests.fx('home_a'), tests.fx('lb_strand'), 'Flip-Flops', null, null, false, null, null, 0, 7),
  (tests.fx('it_o3'), tests.fx('home_a'), tests.fx('lb_strand'), 'Buch', null, null, false, null, null, 0, 8),
  (tests.fx('it_mia_packed'), tests.fx('home_a'), tests.fx('lb_kultur'), 'Haarbürste', null, null, true, now(), tests.fx('mia'), 1, 0),
  (tests.fx('it_mia'), tests.fx('home_a'), tests.fx('lb_mia'), 'Kopfhörer', null, null, false, null, null, 0, 0),
  (tests.fx('it_move'), tests.fx('home_a'), tests.fx('lb_move'), 'Ladekabel', 2, 2, false, null, null, 0, 0),
  (tests.fx('it_b'), tests.fx('home_b'), tests.fx('lb_b'), 'Handtuch', 1, 1, false, null, null, 0, 0);

select is(
  (select array_agg(quantity order by sort) from public.packing_items where list_bag_id = tests.fx('lb_strand')),
  array[7, 7, 2, null, null, null, null, null, null],
  'AC-011 packing_items: the insert trigger computes "je Tag" from the absence (7 days), also for the seed');

-- ===================== Tenant isolation (AC-010) =====================
select * from tests.tenant_isolation('packing_bags',
  jsonb_build_object('id', tests.fx('iso_bag'), 'household_id', tests.fx('home_a'), 'name', 'Wandern',
                     'member_id', tests.fx('nadja'), 'sort', 5),
  jsonb_build_object('name', 'Wandern lang', 'member_id', null, 'sort', 6),
  tests.fx('enrico'), tests.fx('ben'));
select * from tests.tenant_isolation('packing_bag_items',
  jsonb_build_object('id', tests.fx('iso_bag_item'), 'household_id', tests.fx('home_a'), 'bag_id', tests.fx('strand'),
                     'name', 'Sonnencreme', 'quantity', 1, 'per_day', false, 'sort', 3),
  jsonb_build_object('name', 'Sonnenmilch', 'quantity', 2, 'per_day', true, 'sort', 4),
  tests.fx('enrico'), tests.fx('ben'));
select * from tests.tenant_isolation('packing_list_bags',
  jsonb_build_object('id', tests.fx('iso_list_bag'), 'household_id', tests.fx('home_a'), 'absence_id', tests.fx('mallorca'),
                     'bag_id', null, 'name', 'Extra', 'member_id', tests.fx('nadja'), 'sort', 9),
  jsonb_build_object('absence_id', tests.fx('short_trip'), 'bag_id', tests.fx('kultur'), 'sort', 10),
  tests.fx('enrico'), tests.fx('ben'));
select * from tests.tenant_isolation('packing_items',
  jsonb_build_object('id', tests.fx('iso_item'), 'household_id', tests.fx('home_a'), 'list_bag_id', tests.fx('lb_kultur'),
                     'name', 'Kopfhörer', 'quantity', 1, 'per_day', null, 'sort', 20),
  jsonb_build_object('name', 'Kopfhörer 2'),
  tests.fx('enrico'), tests.fx('ben'), true, false);

-- ===================== updated_at is server-set =====================
select tests.backdate('packing_bags', 'kultur');
select tests.backdate('packing_bag_items', 'kultur_item');
select tests.backdate('packing_list_bags', 'lb_kultur');
select tests.authenticate_as(tests.fx('enrico'));
update public.packing_bags set sort = 7 where id = tests.fx('kultur');
update public.packing_bag_items set quantity = 1 where id = tests.fx('kultur_item');
update public.packing_list_bags set sort = 4 where id = tests.fx('lb_kultur');
select tests.clear_authentication();
select is(tests.updated_at('packing_bags', 'kultur'), now(), 'T1 packing_bags: an update sets updated_at');
select is(tests.updated_at('packing_bag_items', 'kultur_item'), now(), 'T1 packing_bag_items: an update sets updated_at');
select is(tests.updated_at('packing_list_bags', 'lb_kultur'), now(), 'T1 packing_list_bags: an update sets updated_at');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(format($$ update public.packing_bags set updated_at = '2000-01-01' where id = %L $$, tests.fx('kultur')),
  '42501', null, 'T1 packing_bags: a member cannot write updated_at');

-- ===================== Names (AC-007) =====================
select throws_ok(
  format($$ insert into public.packing_bags (household_id, name) values (%L, 'strand') $$, tests.fx('home_a')),
  '23505', null, 'AC-007 packing_bags: "strand" next to "Strand" is a duplicate');
select lives_ok(
  format($$ insert into public.packing_bags (household_id, name) values (%L, 'Kultur') $$, tests.fx('home_a')),
  'AC-007 packing_bags: a different name is fine');
select throws_ok(
  format($$ insert into public.packing_bags (household_id, name) values (%L, '') $$, tests.fx('home_a')),
  '23514', null, 'AC-007 packing_bags: an empty name is rejected');
select throws_ok(
  format($$ insert into public.packing_bags (household_id, name) values (%L, %L) $$, tests.fx('home_a'), repeat('x', 61)),
  '23514', null, 'T1 packing_bags: a name of 61 characters is rejected');
select lives_ok(
  format($$ insert into public.packing_bags (household_id, name) values (%L, %L) $$, tests.fx('home_a'), repeat('y', 60)),
  'T1 packing_bags: a name of 60 characters is fine');
select throws_ok(
  format($$ insert into public.packing_bags (household_id, name) values (%L, ' Wintersport') $$, tests.fx('home_a')),
  '23514', null, 'T1 packing_bags: spaces at the edge are rejected');
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name) values (%L, %L, '') $$,
         tests.fx('home_a'), tests.fx('strand')),
  '23514', null, 'T1 packing_bag_items: an empty name is rejected');
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name) values (%L, %L, %L) $$,
         tests.fx('home_a'), tests.fx('strand'), repeat('x', 121)),
  '23514', null, 'T1 packing_bag_items: a name of 121 characters is rejected');
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name) values (%L, %L, 'Socken ') $$,
         tests.fx('home_a'), tests.fx('strand')),
  '23514', null, 'T1 packing_bag_items: spaces at the edge are rejected');
select throws_ok(
  format($$ insert into public.packing_list_bags (household_id, absence_id, name) values (%L, %L, '') $$,
         tests.fx('home_a'), tests.fx('short_trip')),
  '23514', null, 'T1 packing_list_bags: an empty name is rejected');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name) values (%L, %L, '') $$,
         tests.fx('home_a'), tests.fx('lb_kultur')),
  '23514', null, 'T1 packing_items: an empty name is rejected');

-- ===================== Quantities =====================
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name, quantity) values (%L, %L, 'Socken', 0) $$,
         tests.fx('home_a'), tests.fx('strand')),
  '23514', null, 'T1 packing_bag_items: quantity 0 is rejected');
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name, quantity) values (%L, %L, 'Socken', 100) $$,
         tests.fx('home_a'), tests.fx('strand')),
  '23514', null, 'T1 packing_bag_items: quantity 100 is rejected');
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name, per_day) values (%L, %L, 'Socken', true) $$,
         tests.fx('home_a'), tests.fx('strand')),
  '23514', null, 'T1 packing_bag_items: "je Tag" without a quantity is rejected');
select lives_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name, quantity, per_day)
            values (%L, %L, 'Socken', 99, true) $$, tests.fx('home_a'), tests.fx('strand')),
  'T1 packing_bag_items: 99 per day is fine');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, quantity) values (%L, %L, 'Socken', 0) $$,
         tests.fx('home_a'), tests.fx('lb_kultur')),
  '23514', null, 'T1 packing_items: quantity 0 is rejected');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, quantity) values (%L, %L, 'Socken', 10000) $$,
         tests.fx('home_a'), tests.fx('lb_kultur')),
  '23514', null, 'T1 packing_items: quantity 10000 is rejected');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, quantity, per_day)
            values (%L, %L, 'Socken', 1, 100) $$, tests.fx('home_a'), tests.fx('lb_kultur')),
  '23514', null, 'T1 packing_items: 100 per day is rejected');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, quantity, per_day)
            values (%L, %L, 'Socken', 1, 0) $$, tests.fx('home_a'), tests.fx('lb_kultur')),
  '23514', null, 'T1 packing_items: 0 per day is rejected');

-- ===================== References into another household (AC-010) =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ insert into public.packing_list_bags (household_id, absence_id, name) values (%L, %L, 'Fremd') $$,
         tests.fx('home_b'), tests.fx('mallorca')),
  '23503', null, 'AC-010 packing_list_bags: an absence of another household is rejected');
select throws_ok(
  format($$ insert into public.packing_list_bags (household_id, absence_id, bag_id, name) values (%L, %L, %L, 'Fremd') $$,
         tests.fx('home_b'), tests.fx('b_trip'), tests.fx('strand')),
  '23503', null, 'AC-010 packing_list_bags: a packing bag of another household is rejected');
select throws_ok(
  format($$ insert into public.packing_list_bags (household_id, absence_id, name, member_id) values (%L, %L, 'Fremd', %L) $$,
         tests.fx('home_b'), tests.fx('b_trip'), tests.fx('nadja')),
  '23503', null, 'AC-010 packing_list_bags: a member of another household is rejected');
select throws_ok(
  format($$ insert into public.packing_bags (household_id, name, member_id) values (%L, 'Fremd', %L) $$,
         tests.fx('home_b'), tests.fx('enrico')),
  '23503', null, 'AC-010 packing_bags: a member of another household is rejected');
select throws_ok(
  format($$ insert into public.packing_bag_items (household_id, bag_id, name) values (%L, %L, 'Fremd') $$,
         tests.fx('home_b'), tests.fx('strand')),
  '23503', null, 'AC-010 packing_bag_items: a packing bag of another household is rejected');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, quantity, per_day)
            values (%L, %L, 'Fremd', 1, 1) $$, tests.fx('home_b'), tests.fx('lb_strand')),
  '23503', null, 'AC-010 packing_items: a bag of a packing list of another household is rejected');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('update public.packing_list_bags set absence_id = %L where id = %L', tests.fx('b_trip'), tests.fx('lb_move')),
  '23503', null, 'AC-010 packing_list_bags: a bag cannot be moved to an absence of another household');
select throws_ok(
  format($$ insert into public.packing_list_bags (household_id, absence_id, bag_id, name) values (%L, %L, %L, 'Strand') $$,
         tests.fx('home_a'), tests.fx('mallorca'), tests.fx('strand')),
  '23505', null, 'T1 packing_list_bags: the same packing bag twice at the same absence is rejected');
select lives_ok(
  format($$ insert into public.packing_list_bags (household_id, absence_id, bag_id, name) values (%L, %L, null, 'Strand') $$,
         tests.fx('home_a'), tests.fx('mallorca')),
  'T1 packing_list_bags: bags without origin may repeat');

-- ===================== Packed columns belong to the server =====================
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, packed) values (%L, %L, 'X', true) $$,
         tests.fx('home_a'), tests.fx('lb_kultur')),
  '42501', null, 'T1 packing_items: a member cannot insert an item as packed');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, packed_at) values (%L, %L, 'X', now()) $$,
         tests.fx('home_a'), tests.fx('lb_kultur')),
  '42501', null, 'T1 packing_items: a member cannot insert packed_at');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, packed_by) values (%L, %L, 'X', %L) $$,
         tests.fx('home_a'), tests.fx('lb_kultur'), tests.fx('enrico')),
  '42501', null, 'T1 packing_items: a member cannot insert packed_by');
select throws_ok(
  format($$ insert into public.packing_items (household_id, list_bag_id, name, pack_seq) values (%L, %L, 'X', 5) $$,
         tests.fx('home_a'), tests.fx('lb_kultur')),
  '42501', null, 'T1 packing_items: a member cannot insert pack_seq');
select throws_ok(
  format('update public.packing_items set packed = true where id = %L', tests.fx('it_tshirts')),
  '42501', null, 'T1 packing_items: a member cannot pack by a direct update');
select throws_ok(
  format('update public.packing_items set pack_seq = 5 where id = %L', tests.fx('it_socken')),
  '42501', null, 'T1 packing_items: a member cannot change pack_seq by a direct update');
select throws_ok(
  format('update public.packing_items set quantity = 3 where id = %L', tests.fx('it_badehose')),
  '42501', null, 'T1 packing_items: a member cannot change the quantity of a packing item');

-- ===================== Insert trigger: "je Tag" and open state (AC-011, AC-014) =====================
insert into public.packing_items (id, household_id, list_bag_id, name, quantity, per_day, sort) values
  (tests.fx('new_tshirts'), tests.fx('home_a'), tests.fx('lb_kultur'), 'T-Shirts', 3, 1, 1),
  (tests.fx('new_fixed'), tests.fx('home_a'), tests.fx('lb_kultur'), 'Badehose', 2, null, 2),
  (tests.fx('new_short'), tests.fx('home_a'), tests.fx('lb_short'), 'T-Shirts', 7, 1, 0),
  (tests.fx('new_long'), tests.fx('home_a'), tests.fx('lb_long'), 'T-Shirts', 1, 99, 0);
insert into public.packing_items (id, household_id, list_bag_id, name) values
  (tests.fx('new_open'), tests.fx('home_a'), tests.fx('lb_kultur'), 'Kamm');
select tests.clear_authentication();
select is(tests.qty('new_tshirts'), 7, 'AC-011 packing_items: 1 per day for 7 days is 7, whatever the device sent');
select is(tests.qty('new_fixed'), 2, 'AC-011 packing_items: a fixed quantity stays');
select is(tests.qty('new_short'), 4, 'AC-014 packing_items: 1 per day for 4 days is 4');
select is(tests.qty('new_long'), 9999, 'T1 packing_items: 99 per day for 365 days is capped at 9999');
select results_eq(
  format($$ select packed, packed_at, packed_by, pack_seq from public.packing_items where id in (%L, %L, %L) $$,
         tests.fx('new_tshirts'), tests.fx('new_fixed'), tests.fx('new_open')),
  $$ values (false, null::timestamptz, null::uuid, 0), (false, null, null, 0), (false, null, null, 0) $$,
  'T1 packing_items: an item inserted by a member starts open');
select is(
  (select quantity from public.packing_items where id = tests.fx('new_open')), null,
  'T1 packing_items: an item without quantity has none');

-- ===================== Security check 0012: absurdly long absence =====================
-- 30 million days × 99 overflows integer; the quantity is computed in bigint and capped.
insert into public.absences (id, household_id, member_id, from_on, to_on) values
  (tests.fx('huge_trip'), tests.fx('home_a'), tests.fx('mia'), '2027-01-01', date '2027-01-01' + 30000000);
insert into public.packing_list_bags (id, household_id, absence_id, bag_id, name, member_id, sort) values
  (tests.fx('lb_huge'), tests.fx('home_a'), tests.fx('huge_trip'), null, 'Strand', null, 0);
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format($$ insert into public.packing_items (id, household_id, list_bag_id, name, quantity, per_day, sort)
            values (%L, %L, %L, 'T-Shirts', 1, 99, 0) $$, tests.fx('new_huge'), tests.fx('home_a'), tests.fx('lb_huge')),
  'Security check 0012 packing_items: 99 per day for 30 million days does not overflow on insert');
select lives_ok(
  format($$ update public.absences set to_on = to_on + 1 where id = %L $$, tests.fx('huge_trip')),
  'Security check 0012 absences: changing the duration of a 30-million-day absence does not overflow');
select tests.clear_authentication();
select is(tests.qty('new_huge'), 9999, 'Security check 0012 packing_items: the quantity of a huge absence is capped at 9999');
delete from public.absences where id = tests.fx('huge_trip');

-- ===================== AC-037: changing the duration =====================
select tests.backdate('packing_items', 'it_tshirts');
select tests.backdate('packing_items', 'it_socken');
select tests.authenticate_as(tests.fx('enrico'));
update public.absences set to_on = '2027-01-05' where id = tests.fx('mallorca');
select tests.clear_authentication();
select is(tests.qty('it_tshirts'), 5, 'AC-037 packing_items: open "T-Shirts 1 je Tag" becomes 5×');
select is(tests.qty('it_socken'), 7, 'AC-037 packing_items: packed "Socken 1 je Tag" stays 7×');
select is(tests.qty('it_badehose'), 2, 'AC-037 packing_items: the fixed "Badehose 2×" stays');
select is(tests.qty('new_tshirts'), 5, 'AC-037 packing_items: every open "je Tag" item of the absence is recalculated');
select is(tests.qty('new_short'), 4, 'AC-037 packing_items: items of other absences are untouched');
select is(tests.updated_at('packing_items', 'it_tshirts'), now(),
  'AC-037 packing_items: a recalculated item gets a new updated_at, so the devices pull it');
select is(tests.updated_at('packing_items', 'it_socken'), '2000-01-01'::timestamptz,
  'AC-037 packing_items: a packed item is not written');
select tests.authenticate_as(tests.fx('enrico'));
update public.absences set from_on = '2027-01-02' where id = tests.fx('mallorca');
select tests.clear_authentication();
select is(tests.qty('it_tshirts'), 4, 'AC-037 packing_items: a later start counts too');
select tests.authenticate_as(tests.fx('enrico'));
update public.absences set note = 'Finca' where id = tests.fx('mallorca');
update public.packing_list_bags set absence_id = tests.fx('short_trip') where id = tests.fx('lb_move');
select tests.clear_authentication();
select is(tests.qty('it_move'), 8, 'T1 packing_list_bags: a bag moved to another absence is recalculated (2 per day, 4 days)');

-- ===================== AC-041: a member of another household =====================
select tests.authenticate_as(tests.fx('ben'));
select is(tests.affected(format($$ update public.absences set to_on = '2027-01-03' where id = %L $$, tests.fx('mallorca'))),
  0, 'AC-041 absences: a member of another household cannot change the duration');
select is(tests.affected(format('delete from public.absences where id = %L', tests.fx('mallorca'))), 0,
  'AC-041 absences: … nor delete the absence');
select tests.clear_authentication();
select results_eq(
  format($$ select to_on, (select quantity from public.packing_items where id = %L) from public.absences where id = %L $$,
         tests.fx('it_tshirts'), tests.fx('mallorca')),
  $$ values ('2027-01-05'::date, 4) $$,
  'AC-041: absence and packing list are unchanged');

-- ===================== AC-009: deleting a packing bag =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.affected(format('delete from public.packing_bags where id = %L', tests.fx('strand'))), 1,
  'AC-009 packing_bags: a member deletes "Strand"');
select tests.clear_authentication();
select is((select bag_id from public.packing_list_bags where id = tests.fx('lb_strand')), null,
  'AC-009 packing_list_bags: the bag of the packing list loses its origin');
select results_eq(
  format($$ select b.name, count(*)::int, (count(*) filter (where i.packed))::int from public.packing_list_bags b
            join public.packing_items i on i.list_bag_id = b.id where b.id = %L group by b.name $$, tests.fx('lb_strand')),
  $$ values ('Strand', 9, 4) $$,
  'AC-009 packing_items: "Strand" stays in the packing list with 4 of 9 packed');
select is((select count(*)::int from public.packing_bag_items where bag_id = tests.fx('strand')), 0,
  'AC-009 packing_bag_items: the items of the packing bag go with it');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  tests.affected(format($$ select 1 from public.deleted_records where table_name = 'packing_bag_items' and record_id = %L $$,
                        tests.fx('strand_item'))),
  1, 'AC-009 packing_bag_items: … with a tombstone for Nadja''s device');
select tests.clear_authentication();

-- ===================== A member leaves the household =====================
delete from public.household_members where household_id = tests.fx('home_a') and profile_id = tests.fx('mia');
select is((select member_id from public.packing_bags where id = tests.fx('mia_bag')), null,
  'T1 packing_bags: "für" is cleared when the person leaves, the bag stays');
select is((select member_id from public.packing_list_bags where id = tests.fx('lb_mia_copy')), null,
  'T1 packing_list_bags: the copied "für" is cleared, the bag stays');
select results_eq(
  format($$ select packed, packed_by from public.packing_items where id = %L $$, tests.fx('it_mia_packed')),
  $$ values (true, null::uuid) $$,
  'T1 packing_items: "gepackt von" is cleared, the item stays packed');
select is(
  (select count(*)::int from public.packing_list_bags where id = tests.fx('lb_mia'))
  + (select count(*)::int from public.packing_items where id = tests.fx('it_mia')),
  0, 'T1 packing_list_bags: her own absence takes its packing list with it');

-- ===================== Removing a bag from the packing list =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(tests.affected(format('delete from public.packing_list_bags where id = %L', tests.fx('lb_short'))), 1,
  'T1 packing_list_bags: a member removes a bag from the packing list');
select tests.clear_authentication();
select is((select count(*)::int from public.packing_items where id = tests.fx('new_short')), 0,
  'T1 packing_items: its packing items go with it');
select is(
  (select count(*)::int from public.deleted_records where table_name = 'packing_items' and record_id = tests.fx('new_short')::text),
  1, 'T1 packing_items: … with a tombstone');

-- ===================== sync_pull =====================
select tests.authenticate_as(tests.fx('enrico'));
create temp table pulled on commit drop as
  select public.sync_pull(jsonb_build_object('households', jsonb_build_object(tests.fx('home_a'), '{"full": true}'::jsonb)))
         -> 'households' -> tests.fx('home_a')::text as r;
select tests.clear_authentication();
select is(
  (select array_agg(t order by t) from pulled, unnest(array['packing_bags', 'packing_bag_items', 'packing_list_bags',
                                                             'packing_items']) t where (r -> 'rows') ? t),
  array['packing_bag_items', 'packing_bags', 'packing_items', 'packing_list_bags'],
  'T1 sync_pull: the four packing tables are pulled');
select is(
  (select count(*)::int from pulled, jsonb_array_elements(r -> 'rows' -> 'packing_items') e
   where (e ->> 'household_id')::uuid <> tests.fx('home_a')),
  0, 'AC-010 sync_pull: only the own household''s packing items');
select is(
  (select count(*)::int from pulled, jsonb_array_elements(r -> 'rows' -> 'packing_items') e
   where e ->> 'id' = tests.fx('it_socken')::text and e ->> 'packed' = 'true' and e ->> 'pack_seq' = '1'
     and e ->> 'packed_by' = tests.fx('nadja')::text),
  1, 'T1 sync_pull: the packed state reaches the device');
select ok(
  (select count(*) > 0 from pulled, jsonb_array_elements(r -> 'tombstones') t
   where t ->> 'table' = 'packing_items' and t ->> 'id' = tests.fx('new_short')::text),
  'T1 sync_pull: tombstones of packing items reach the device');

-- ===================== AC-038: deleting the absence =====================
create temp table mallorca_rows on commit drop as
  select 'packing_list_bags' as t, id from public.packing_list_bags where absence_id = tests.fx('mallorca')
  union all
  select 'packing_items', i.id from public.packing_items i
  join public.packing_list_bags b on b.id = i.list_bag_id where b.absence_id = tests.fx('mallorca');
select tests.authenticate_as(tests.fx('nadja'));
select is(tests.affected(format('delete from public.absences where id = %L', tests.fx('mallorca'))), 1,
  'AC-038 absences: Nadja deletes "Urlaub Mallorca"');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.packing_list_bags where absence_id = tests.fx('mallorca'))
  + (select count(*)::int from public.packing_items where id in (select id from mallorca_rows)),
  0, 'AC-038 packing_list_bags: the packing list goes with the absence');
select is(
  (select count(*)::int from mallorca_rows m
   where not exists (select 1 from public.deleted_records d where d.table_name = m.t and d.record_id = m.id::text)),
  0, 'AC-038: every bag and item of the packing list leaves a tombstone');
select ok((select count(*) >= 12 from mallorca_rows), 'AC-038: … (the packing list had its bags and items)');
select results_eq(
  format($$ select name from public.packing_bags where household_id = %L order by name $$, tests.fx('home_a')),
  $$ values ('Kultur'), ('Kulturbeutel'), ('Mias Tasche'), ($$ || quote_literal(repeat('y', 60)) || $$) $$,
  'AC-038 packing_bags: the packing bags stay');
select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format($$ select 1 from public.deleted_records where household_id = %L and table_name like 'packing%%' $$,
                        tests.fx('home_a'))),
  0, 'AC-010 deleted_records: a member of another household sees no packing tombstones');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.packing_items where household_id = tests.fx('home_b'))
  + (select count(*)::int from public.packing_list_bags where household_id = tests.fx('home_b'))
  + (select count(*)::int from public.packing_bags where household_id = tests.fx('home_b')),
  3, 'AC-010: household B is untouched');

-- ===================== Structure =====================
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname like 'packing%' and c.relkind = 'r' and c.relrowsecurity),
  array['packing_bag_items', 'packing_bags', 'packing_items', 'packing_list_bags'],
  'T1: the four tables have row level security');
select ok(
  not has_table_privilege('anon', 'public.packing_items', 'select')
  and not has_any_column_privilege('anon', 'public.packing_bags', 'select,insert,update'),
  'T1: nothing for anon');
select ok(
  not has_any_column_privilege('authenticated', 'public.packing_items', 'update'),
  'T1 packing_items: no update grant at all');

select * from finish();
rollback;
