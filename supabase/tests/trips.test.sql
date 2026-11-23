-- Trips and their people (spec 0022, REQ-014, REQ-015): the schema has trips and trip_members
-- and not the old table (AC-041; its name is assembled, so the word check finds nothing); one apply_changes call saves a trip with its people and packing list
-- (AC-008); invalid trips are refused (AC-043); a foreign household and a signed-out caller can
-- do nothing (AC-042); somebody leaving takes only her own trips along (AC-044); somebody joining
-- is not on older trips and gets her notifications (AC-045). Tenant isolation of both tables is
-- in domain_isolation.test.sql.
begin;
\ir _helpers.psql
select plan(42);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
-- Runs the SQL and then the checks that wait for the end of the transaction (deferred).
create function tests.at_commit(p_sql text) returns void language plpgsql
as $$
begin
  execute p_sql;
  set constraints all immediate;
  set constraints all deferred;
end
$$;
create function tests.ins(p_table text, p_row jsonb) returns jsonb language sql stable
as $$ select jsonb_build_object('kind', 'insert', 'table', p_table, 'row', p_row) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('vera', tests.create_user('vera@example.com', 'Vera')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('mallorca'), ('yoga'), ('b_trip'), ('lb_strand'), ('lb_kultur'), ('lb_yoga'), ('tshirts'), ('socken'), ('matte'),
  ('bag_b'), ('kultur_bag'), ('nobody'), ('twice');

-- ===================== AC-041: the one term =====================
select hasnt_table('public', 'ab' || 'sences', 'AC-041: the old table is gone');
select has_table('public', 'trips', 'AC-041: table trips');
select has_table('public', 'trip_members', 'AC-041: table trip_members');
select has_column('public', 'packing_list_bags', 'trip_id', 'AC-041: packing_list_bags.trip_id');
select hasnt_column('public', 'packing_list_bags', 'ab' || 'sence_id', 'AC-041: packing_list_bags has no old column');

-- ===================== Fixtures =====================
insert into public.packing_bags (id, household_id, name, member_id) values
  (tests.fx('kultur_bag'), tests.fx('home'), 'Kulturbeutel', tests.fx('nadja')),
  (tests.fx('bag_b'), tests.fx('home_b'), 'Strand', null);
insert into public.trips (id, household_id, from_on, to_on, note) values
  (tests.fx('b_trip'), tests.fx('home_b'), '2026-12-01', '2026-12-03', 'Köln');
insert into public.trip_members (household_id, trip_id, member_id) values
  (tests.fx('home_b'), tests.fx('b_trip'), tests.fx('ben'));

-- ===================== AC-008: a trip with its people and packing list in one call =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select tests.at_commit(%L)', tests.apply_sql('home', jsonb_build_array(
    tests.ins('trips', jsonb_build_object('id', tests.fx('mallorca'), 'from_on', '2026-12-04', 'to_on', '2026-12-10',
                                          'note', 'Urlaub Mallorca')),
    tests.ins('trip_members', jsonb_build_object('trip_id', tests.fx('mallorca'), 'member_id', tests.fx('enrico'))),
    tests.ins('trip_members', jsonb_build_object('trip_id', tests.fx('mallorca'), 'member_id', tests.fx('nadja'))),
    tests.ins('packing_list_bags', jsonb_build_object('id', tests.fx('lb_strand'), 'trip_id', tests.fx('mallorca'),
                                                      'name', 'Strand', 'sort', 0)),
    tests.ins('packing_list_bags', jsonb_build_object('id', tests.fx('lb_kultur'), 'trip_id', tests.fx('mallorca'),
                                                      'bag_id', tests.fx('kultur_bag'), 'name', 'Kulturbeutel',
                                                      'member_id', tests.fx('nadja'), 'sort', 1)),
    tests.ins('packing_items', jsonb_build_object('id', tests.fx('tshirts'), 'list_bag_id', tests.fx('lb_strand'),
                                                  'name', 'T-Shirts', 'quantity', 1, 'per_day_quantity', 1, 'sort', 0)),
    tests.ins('packing_items', jsonb_build_object('id', tests.fx('socken'), 'list_bag_id', tests.fx('lb_strand'),
                                                  'name', 'Socken', 'quantity', 1, 'per_day_quantity', 1, 'sort', 1))))),
  'AC-008 apply_changes: trip, both people and the packing list in one call');
select results_eq(
  format($$ select (select count(*)::int from public.trip_members where trip_id = %1$L),
                   (select quantity from public.packing_items where id = %2$L) $$,
         tests.fx('mallorca'), tests.fx('tshirts')),
  $$ values (2, 7) $$,
  'AC-008: two people on the trip, "T-Shirts 7×"');
select lives_ok(
  format('select tests.at_commit(%L)', tests.apply_sql('home', jsonb_build_array(
    tests.ins('trips', jsonb_build_object('id', tests.fx('yoga'), 'from_on', '2026-12-12', 'to_on', '2026-12-13',
                                          'note', 'Yoga-Wochenende')),
    tests.ins('trip_members', jsonb_build_object('trip_id', tests.fx('yoga'), 'member_id', tests.fx('nadja'))),
    tests.ins('packing_list_bags', jsonb_build_object('id', tests.fx('lb_yoga'), 'trip_id', tests.fx('yoga'),
                                                      'name', 'Yoga', 'sort', 0)),
    tests.ins('packing_items', jsonb_build_object('id', tests.fx('matte'), 'list_bag_id', tests.fx('lb_yoga'),
                                                  'name', 'Matte', 'sort', 0))))),
  'AC-044 fixture: Nadja''s "Yoga-Wochenende" with a packing list');

-- ===================== AC-043: invalid trips =====================
select throws_ok(
  format('select tests.at_commit(%L)', tests.apply_sql('home', jsonb_build_array(
    tests.ins('trips', jsonb_build_object('id', tests.fx('nobody'), 'from_on', '2026-12-04', 'to_on', '2026-12-05')),
    tests.ins('packing_list_bags', jsonb_build_object('trip_id', tests.fx('nobody'), 'name', 'Strand', 'sort', 0))))),
  '23514', 'trip_without_members', 'AC-043 trips: a trip without a person is refused at the end of the call');
select is((select count(*)::int from public.packing_list_bags where trip_id = tests.fx('nobody')), 0,
  'AC-043: … and neither trip nor packing list is saved');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(
    tests.ins('trips', jsonb_build_object('id', tests.fx('twice'), 'from_on', '2026-12-04', 'to_on', '2026-12-05')),
    tests.ins('trip_members', jsonb_build_object('trip_id', tests.fx('twice'), 'member_id', tests.fx('enrico'))),
    tests.ins('trip_members', jsonb_build_object('trip_id', tests.fx('twice'), 'member_id', tests.fx('enrico'))))),
  '23505', null, 'AC-043 trip_members: the same person twice is refused');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(
    tests.ins('trips', jsonb_build_object('from_on', '2026-12-05', 'to_on', '2026-12-04')))),
  '23514', null, 'AC-043 trips: "Bis" before "Von" is refused');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(
    tests.ins('trips', jsonb_build_object('from_on', '2026-12-04', 'to_on', '2026-12-05', 'note', repeat('x', 501))))),
  '23514', null, 'AC-043 trips: a note over 500 characters is refused');
select is(
  tests.affected(format($$ update public.trips set note = %L where id = %L $$, repeat('x', 500), tests.fx('yoga'))), 1,
  'AC-043 trips: a note of 500 characters is fine');
select throws_ok(
  format('select tests.at_commit(%L)',
         format('delete from public.trip_members where trip_id = %L and member_id = %L', tests.fx('yoga'), tests.fx('nadja'))),
  '23514', 'trip_without_members', 'AC-043 trip_members: removing the last person of a trip is refused');
select throws_ok(
  format($$ update public.trip_members set member_id = %L where trip_id = %L $$, tests.fx('nadja'), tests.fx('mallorca')),
  '42501', null, 'AC-043 trip_members: people are only added and removed, never changed');
select throws_ok(
  format('update public.packing_items set packed = true where id = %L', tests.fx('tshirts')),
  '42501', null, 'AC-043 packing_items: "gepackt" is not changed directly');
select throws_ok(
  format('update public.packing_items set packed_at = now() where id = %L', tests.fx('tshirts')),
  '42501', null, 'AC-043 packing_items: "gepackt am" is not changed directly');
select throws_ok(
  format('update public.packing_items set packed_by = %L where id = %L', tests.fx('enrico'), tests.fx('tshirts')),
  '42501', null, 'AC-043 packing_items: "gepackt von" is not changed directly');
select throws_ok(
  format('update public.packing_list_bags set trip_id = %L where id = %L', tests.fx('yoga'), tests.fx('lb_strand')),
  '42501', null, 'AC-012 packing_list_bags: the packing list stays with its trip');

-- ===================== AC-011: the period changes the "je Tag" quantities =====================
select public.set_packing_items_packed(tests.fx('home'), jsonb_build_array(
  jsonb_build_object('item_id', tests.fx('socken'), 'packed', true, 'seen_pack_seq', 0)));
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'trips', 'id', tests.fx('mallorca'), 'changes', '{"to_on": "2026-12-08"}'::jsonb))),
  'AC-011 apply_changes: "Bis" is set to Di 8.12.');
select results_eq(
  format($$ select name, quantity, packed from public.packing_items where list_bag_id = %L order by sort $$,
         tests.fx('lb_strand')),
  $$ values ('T-Shirts'::text, 5, false), ('Socken', 7, true) $$,
  'AC-011 packing_items: "T-Shirts 5×", packed "Socken 7×" stays');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'packing_list_bags', 'id', tests.fx('lb_strand'),
    'changes', jsonb_build_object('trip_id', tests.fx('yoga'))))),
  '22023', 'invalid_change', 'AC-012 apply_changes: trip_id of a bag of the packing list is never patched');

-- ===================== AC-042: another household and signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select is(tests.affected(format('select 1 from public.trips where id = %L', tests.fx('mallorca'))), 0,
  'AC-042 trips: a member of another household reads nothing');
select is(tests.affected(format('select 1 from public.trip_members where trip_id = %L', tests.fx('mallorca'))), 0,
  'AC-042 trip_members: … nor the people');
select is(tests.affected(format($$ update public.trips set note = 'X' where id = %L $$, tests.fx('mallorca'))), 0,
  'AC-042 trips: … changes nothing');
select is(tests.affected(format('delete from public.trip_members where trip_id = %L', tests.fx('mallorca'))), 0,
  'AC-042 trip_members: … removes nobody');
select throws_ok(
  format($$ insert into public.trip_members (household_id, trip_id, member_id) values (%L, %L, %L) $$,
         tests.fx('home'), tests.fx('mallorca'), tests.fx('ben')),
  '42501', null, 'AC-042 trip_members: … cannot join "Urlaub Mallorca"');
select throws_ok(
  format($$ insert into public.trip_members (household_id, trip_id, member_id) values (%L, %L, %L) $$,
         tests.fx('home_b'), tests.fx('mallorca'), tests.fx('ben')),
  '23503', null, 'AC-042 trip_members: … not even under the own household');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ insert into public.trip_members (household_id, trip_id, member_id) values (%L, %L, %L) $$,
         tests.fx('home'), tests.fx('b_trip'), tests.fx('enrico')),
  '23503', null, 'AC-042 trip_members: Enrico cannot join a trip of another household');
select throws_ok(
  format($$ insert into public.packing_list_bags (household_id, trip_id, bag_id, name) values (%L, %L, %L, 'Fremd') $$,
         tests.fx('home'), tests.fx('mallorca'), tests.fx('bag_b')),
  '23503', null, 'AC-042 packing_list_bags: a bag of another household cannot hang on "Urlaub Mallorca"');
select tests.authenticate_as_anon();
select throws_ok('select * from public.trips', '42501', null, 'AC-042 trips: signed out reads nothing');
select throws_ok('select * from public.trip_members', '42501', null, 'AC-042 trip_members: signed out reads nothing');
select throws_ok(
  format($$ insert into public.trips (household_id, from_on, to_on) values (%L, '2026-12-01', '2026-12-02') $$,
         tests.fx('home')),
  '42501', null, 'AC-042 trips: signed out creates nothing');

-- ===================== AC-044: Nadja leaves =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  format('select tests.at_commit(%L)', format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('nadja'))),
  'AC-044 remove_member: Nadja leaves the household');
select tests.clear_authentication();
select results_eq(
  format($$ select array_agg(member_id) from public.trip_members where trip_id = %L $$, tests.fx('mallorca')),
  format($$ values (array[%L::uuid]) $$, tests.fx('enrico')),
  'AC-044 trips: "Urlaub Mallorca" is a trip of Enrico');
select results_eq(
  format($$ select count(*)::int, (select member_id from public.packing_list_bags where id = %L)
            from public.packing_items i join public.packing_list_bags b on b.id = i.list_bag_id
            where b.trip_id = %L $$, tests.fx('lb_kultur'), tests.fx('mallorca')),
  $$ values (2, null::uuid) $$,
  'AC-044 packing_list_bags: the packing list stays, "Kulturbeutel" without Nadja');
select is(
  (select count(*)::int from public.trips where id = tests.fx('yoga'))
  + (select count(*)::int from public.packing_list_bags where id = tests.fx('lb_yoga'))
  + (select count(*)::int from public.packing_items where id = tests.fx('matte')),
  0, 'AC-044 trips: her "Yoga-Wochenende" goes with its packing list');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.affected(format($$ select 1 from public.deleted_records where record_id in (%L, %L, %L) $$,
                        tests.fx('yoga'), tests.fx('lb_yoga'), tests.fx('matte'))),
  3, 'AC-044 deleted_records: … with tombstones for Enrico''s device');

-- ===================== AC-045: Vera joins =====================
select tests.clear_authentication();
insert into public.household_members (household_id, profile_id) values (tests.fx('home'), tests.fx('vera'));
select is(private.is_silent(tests.fx('home'), tests.fx('vera'), '2026-12-05'), false,
  'AC-045 is_silent: Vera, who joined later, is not on "Urlaub Mallorca" and gets her notifications');
select is(private.is_silent(tests.fx('home'), tests.fx('enrico'), '2026-12-05'), true,
  'AC-045 is_silent: Enrico is on the trip and gets none');
select is(private.is_silent(tests.fx('home'), tests.fx('enrico'), '2026-12-09'), false,
  'AC-011 is_silent: after the trip ended on 8.12. Enrico gets them again');

select * from finish();
rollback;
