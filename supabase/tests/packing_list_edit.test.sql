-- Editing Packstücke of a packing list and adopting changes of a Reisetasche (spec 0022, REQ-009,
-- REQ-012): name, quantity and "je Tag" are updated directly, "je Tag" is computed by the server
-- and a packed Packstück stays packed (AC-028, AC-030); the packed state stays with the server
-- (AC-043); the origin in the Reisetasche is kept and cleared with it; adopt_bag_changes touches
-- only open Packstücke of the one bag, also when somebody packs meanwhile (AC-036 to AC-038); a
-- foreign household and a signed-out caller can do nothing (AC-042).
begin;
\ir _helpers.psql
select plan(29);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
create function tests.adopt(p_household text, p_change jsonb) returns jsonb language sql
as $$ select public.apply_changes(tests.fx(p_household),
                                  jsonb_build_array(jsonb_build_object('kind', 'adopt_bag_changes', 'change', p_change)))
             -> 'results' -> 0 $$;
create function tests.item(p_key text) returns jsonb language sql stable
as $$ select to_jsonb(i) - 'household_id' - 'created_at' - 'updated_at' from public.packing_items i where i.id = tests.fx(p_key) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values
  ('mallorca'), ('strand'), ('bi_badehose'), ('bi_socken'), ('bi_sonnencreme'), ('bi_b'), ('bag_b'),
  ('lb_strand'), ('lb_other'), ('badehose'), ('schnorchel'), ('socken'), ('kartenspiel'), ('neu');

-- ===================== Fixtures (as postgres) =====================
-- "Urlaub Mallorca" 7 days; "Strand" with Badehose 2× (open), Schnorchel (open, removed from the
-- Reisetasche: bag_item_id null), Socken 1 je Tag (packed), Kartenspiel by hand.
insert into public.trips (id, household_id, from_on, to_on, note) values
  (tests.fx('mallorca'), tests.fx('home'), '2026-12-04', '2026-12-10', 'Urlaub Mallorca');
insert into public.trip_members (household_id, trip_id, member_id) values
  (tests.fx('home'), tests.fx('mallorca'), tests.fx('enrico'));
insert into public.packing_bags (id, household_id, name) values
  (tests.fx('strand'), tests.fx('home'), 'Strand'), (tests.fx('bag_b'), tests.fx('home_b'), 'Strand');
insert into public.packing_bag_items (id, household_id, bag_id, name, quantity, per_day, sort) values
  (tests.fx('bi_badehose'), tests.fx('home'), tests.fx('strand'), 'Badehose', 3, false, 0),
  (tests.fx('bi_socken'), tests.fx('home'), tests.fx('strand'), 'Socken', 2, true, 1),
  (tests.fx('bi_sonnencreme'), tests.fx('home'), tests.fx('strand'), 'Sonnencreme', null, false, 2),
  (tests.fx('bi_b'), tests.fx('home_b'), tests.fx('bag_b'), 'Fremd', null, false, 0);
insert into public.packing_list_bags (id, household_id, trip_id, bag_id, name, sort) values
  (tests.fx('lb_strand'), tests.fx('home'), tests.fx('mallorca'), tests.fx('strand'), 'Strand', 0),
  (tests.fx('lb_other'), tests.fx('home'), tests.fx('mallorca'), null, 'Technik', 1);
insert into public.packing_items
  (id, household_id, list_bag_id, name, quantity, per_day, packed, packed_at, packed_by, pack_seq, sort, bag_item_id, from_bag) values
  (tests.fx('badehose'), tests.fx('home'), tests.fx('lb_strand'), 'Badehose', 2, null, false, null, null, 0, 0, tests.fx('bi_badehose'), true),
  (tests.fx('schnorchel'), tests.fx('home'), tests.fx('lb_strand'), 'Schnorchel', null, null, false, null, null, 0, 1, null, true),
  (tests.fx('socken'), tests.fx('home'), tests.fx('lb_strand'), 'Socken', 7, 1, true, now(), tests.fx('nadja'), 1, 2, tests.fx('bi_socken'), true),
  (tests.fx('kartenspiel'), tests.fx('home'), tests.fx('lb_strand'), 'Kartenspiel', null, null, false, null, null, 0, 3, null, false);
set constraints all immediate;
set constraints all deferred;

-- ===================== REQ-009: editing a Packstück =====================
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.affected(format('update public.packing_items set quantity = 1, per_day = 2 where id = %L', tests.fx('socken'))), 1,
  'AC-028 packing_items: a member sets "Socken" to 2 je Tag');
select results_eq(
  format('select quantity, per_day::int, packed, pack_seq from public.packing_items where id = %L', tests.fx('socken')),
  $$ values (14, 2, true, 1) $$,
  'AC-028 packing_items: "Socken 14×", still packed, pack_seq unchanged');
select lives_ok(
  format('update public.packing_items set quantity = null, per_day = 1 where id = %L', tests.fx('kartenspiel')),
  'AC-030 packing_items: "je Tag" without a quantity is computed (no error)');
select is((tests.item('kartenspiel') ->> 'quantity')::int, 7, 'AC-030 packing_items: … 1 je Tag for 7 days is 7');
select lives_ok(
  format('update public.packing_items set quantity = null, per_day = null where id = %L', tests.fx('kartenspiel')),
  'REQ-009 packing_items: the quantity can be emptied');
select throws_ok(
  format($$ update public.packing_items set name = '' where id = %L $$, tests.fx('badehose')),
  '23514', null, 'AC-030 packing_items: an empty name is refused');
select throws_ok(
  format('update public.packing_items set quantity = 100, per_day = 100 where id = %L', tests.fx('badehose')),
  '23514', null, 'REQ-009 packing_items: 100 je Tag is refused');
select throws_ok(
  format('update public.packing_items set packed = false where id = %L', tests.fx('socken')),
  '42501', null, 'AC-043 packing_items: "gepackt" is still not written directly');
select throws_ok(
  format('update public.packing_items set pack_seq = 9 where id = %L', tests.fx('socken')),
  '42501', null, 'AC-043 packing_items: … nor pack_seq');
select throws_ok(
  format('update public.packing_items set list_bag_id = %L where id = %L', tests.fx('lb_other'), tests.fx('badehose')),
  '42501', null, 'REQ-009 packing_items: a Packstück does not move to another bag');
select throws_ok(
  format('update public.packing_items set bag_item_id = %L where id = %L', tests.fx('bi_b'), tests.fx('kartenspiel')),
  '23503', null, 'AC-042 packing_items: a Packstück of a Reisetasche of another household cannot be linked');
select lives_ok(
  format('update public.packing_items set bag_item_id = %L, from_bag = true where id = %L',
         tests.fx('bi_sonnencreme'), tests.fx('kartenspiel')),
  'REQ-009 packing_items: "… auch in der Reisetasche speichern" links a Packstück added by hand');
update public.packing_items set bag_item_id = null, from_bag = false where id = tests.fx('kartenspiel');
select is(
  (select (public.apply_changes(tests.fx('home'), jsonb_build_array(jsonb_build_object(
     'kind', 'patch', 'table', 'packing_items', 'id', tests.fx('badehose'),
     'changes', jsonb_build_object('name', 'Badeshorts')))) ->> 'applied')::int), 1,
  'AC-030 apply_changes: renaming a Packstück is one patch');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'packing_items', 'id', tests.fx('badehose'), 'changes', '{"packed": true}'::jsonb))),
  '22023', 'invalid_change', 'AC-043 apply_changes: "gepackt" is never patched');
update public.packing_items set name = 'Badehose' where id = tests.fx('badehose');
update public.packing_items set quantity = 1, per_day = 1 where id = tests.fx('socken');

-- ===================== AC-042: another household, signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select is(tests.affected(format($$ update public.packing_items set name = 'X' where id = %L $$, tests.fx('badehose'))), 0,
  'AC-042 packing_items: a member of another household changes nothing');
select throws_ok(
  format('select tests.adopt(%L, %L)', 'home', jsonb_build_object('list_bag_id', tests.fx('lb_strand'), 'delete',
         jsonb_build_array(tests.fx('badehose')))),
  '42501', 'not_member', 'AC-042 adopt_bag_changes: not for another household');
select throws_ok(
  tests.apply_sql('home_b', jsonb_build_array(jsonb_build_object('kind', 'adopt_bag_changes', 'change',
    jsonb_build_object('list_bag_id', tests.fx('lb_strand'), 'delete', jsonb_build_array(tests.fx('badehose')))))),
  '22023', 'invalid_change', 'AC-042 adopt_bag_changes: a bag of a packing list of another household is refused');
select tests.authenticate_as_anon();
select throws_ok(format($$ update public.packing_items set name = 'X' where id = %L $$, tests.fx('badehose')),
  '42501', null, 'AC-042 packing_items: signed out changes nothing');
select tests.clear_authentication();
select is(tests.item('badehose') ->> 'name', 'Badehose', 'AC-042: "Badehose" is unchanged');

-- ===================== AC-037, AC-038: adopting the changes of "Strand" =====================
select tests.authenticate_as(tests.fx('enrico'));
create temp table adopted on commit drop as
  select tests.adopt('home', jsonb_build_object(
    'list_bag_id', tests.fx('lb_strand'),
    'insert', jsonb_build_array(jsonb_build_object('id', tests.fx('neu'), 'name', 'Sonnencreme', 'sort', 4,
                                                   'bag_item_id', tests.fx('bi_sonnencreme'), 'from_bag', true)),
    'update', jsonb_build_array(
      jsonb_build_object('id', tests.fx('badehose'), 'name', 'Badehose', 'quantity', 3, 'per_day', null),
      jsonb_build_object('id', tests.fx('socken'), 'name', 'Socken', 'quantity', 2, 'per_day', 2)),
    'delete', jsonb_build_array(tests.fx('schnorchel'), tests.fx('socken')))) as r;
select tests.clear_authentication();
select is((select r from adopted), '{"inserted": 1, "updated": 1, "deleted": 1}'::jsonb,
  'AC-037 adopt_bag_changes: one new, one changed, one deleted (the packed one is skipped twice)');
select is((tests.item('badehose') ->> 'quantity')::int, 3, 'AC-037: "Badehose 3×"');
select results_eq(
  format('select quantity, per_day::int, packed from public.packing_items where id = %L', tests.fx('socken')),
  $$ values (7, 1, true) $$,
  'AC-037: "Socken 7×" stays packed and unchanged ("Bleibt, weil gepackt")');
select is(tests.item('schnorchel'), null, 'AC-037: "Schnorchel" is gone');
select results_eq(
  format('select name, packed, from_bag, bag_item_id = %L from public.packing_items where id = %L',
         tests.fx('bi_sonnencreme'), tests.fx('neu')),
  $$ values ('Sonnencreme'::text, false, true, true) $$,
  'AC-036: "Sonnencreme" is open at the end of "Strand", linked to the Reisetasche');
select is(
  (select count(*)::int from public.deleted_records where table_name = 'packing_items' and record_id = tests.fx('schnorchel')::text),
  1, 'AC-037: the delete leaves a tombstone');

-- "Rückgängig" is the inverse adopt: Schnorchel back, Badehose 2×, Sonnencreme gone.
select tests.authenticate_as(tests.fx('enrico'));
select is(
  tests.adopt('home', jsonb_build_object(
    'list_bag_id', tests.fx('lb_strand'),
    'insert', jsonb_build_array(jsonb_build_object('id', tests.fx('schnorchel'), 'name', 'Schnorchel', 'sort', 1, 'from_bag', true)),
    'update', jsonb_build_array(jsonb_build_object('id', tests.fx('badehose'), 'name', 'Badehose', 'quantity', 2, 'per_day', null)),
    'delete', jsonb_build_array(tests.fx('neu')))),
  '{"inserted": 1, "updated": 1, "deleted": 1}'::jsonb,
  'AC-037 adopt_bag_changes: "Rückgängig" restores everything in one call');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object('kind', 'adopt_bag_changes', 'change',
    jsonb_build_object('list_bag_id', tests.fx('lb_strand'), 'update',
      jsonb_build_array(jsonb_build_object('id', tests.fx('badehose'), 'name', 'Badehose', 'packed', true)))))),
  '22023', 'invalid_change', 'AC-043 adopt_bag_changes: "gepackt" cannot be changed through it');
select tests.clear_authentication();

-- ===================== The origin goes with the Reisetasche =====================
delete from public.packing_bag_items where id = tests.fx('bi_badehose');
select results_eq(
  format('select bag_item_id, from_bag from public.packing_items where id = %L', tests.fx('badehose')),
  $$ values (null::uuid, true) $$,
  'REQ-012: deleting the Packstück of the Reisetasche clears bag_item_id; from_bag says "entfernt"');
select is(
  (select count(*)::int from public.packing_items where list_bag_id = tests.fx('lb_strand')), 4,
  'REQ-012: the packing list keeps its Packstücke');

select * from finish();
rollback;
