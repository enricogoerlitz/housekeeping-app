-- Meal slot "Vormittag" (spec 0004, REQ-001): every household gets Vormittag in front of its
-- existing slots (AC-003) without touching their ids, order or the entries planned in them; the
-- backfill is idempotent; a new household starts with Vormittag, Mittag, Abend (AC-001).
begin;
\ir _helpers.psql
select plan(16);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
grant insert on fx to authenticated; -- keeps the id of a household created through the RPC
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The slots of a household in array order: name, sort, id.
create function tests.slots(p_household text) returns table (name text, sort numeric, id uuid) language sql stable
as $$
  select s ->> 'name', (s ->> 'sort')::numeric, (s ->> 'id')::uuid
  from public.households h, jsonb_array_elements(h.meal_slots) with ordinality as x (s, ord)
  where h.id = tests.fx(p_household)
  order by x.ord
$$;
grant execute on function tests.slots(text) to anon, authenticated;

-- Slot snapshots for the idempotency check (created here: the API roles cannot create tables).
create temp table slots_after_first_run (household_id uuid primary key, meal_slots jsonb) on commit drop;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('A', array[tests.fx('enrico')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')])),
  ('home_custom', tests.create_household('Custom', array[tests.fx('ben')])),
  ('home_empty', tests.create_household('Leer', array[tests.fx('ben')])),
  ('home_full', tests.create_household('Voll', array[tests.fx('ben')]));
insert into fx (key) values
  ('slot_mittag'), ('slot_abend'), ('slot_b_vormittag'), ('slot_b_abend'), ('slot_fruehstueck'), ('slot_spaet'),
  ('entry_mittag'), ('entry_abend');

-- A: the slots of a household created before spec 0004, with entries in both.
update public.households set meal_slots = jsonb_build_array(
  jsonb_build_object('id', tests.fx('slot_mittag'), 'name', 'Mittag', 'sort', 0),
  jsonb_build_object('id', tests.fx('slot_abend'), 'name', 'Abend', 'sort', 1))
where id = tests.fx('home_a');
-- B already has Vormittag.
update public.households set meal_slots = jsonb_build_array(
  jsonb_build_object('id', tests.fx('slot_b_vormittag'), 'name', 'Vormittag', 'sort', 0),
  jsonb_build_object('id', tests.fx('slot_b_abend'), 'name', 'Abend', 'sort', 1))
where id = tests.fx('home_b');
-- Custom slots with other sort values.
update public.households set meal_slots = jsonb_build_array(
  jsonb_build_object('id', tests.fx('slot_spaet'), 'name', 'Spät', 'sort', 7),
  jsonb_build_object('id', tests.fx('slot_fruehstueck'), 'name', 'Frühstück', 'sort', 5))
where id = tests.fx('home_custom');
-- The maximum of 10 slots (households_meal_slots_valid).
update public.households
set meal_slots = (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', 'Slot ' || n, 'sort', n))
                  from generate_series(1, 10) n)
where id = tests.fx('home_full');

insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, text) values
  (tests.fx('entry_mittag'), tests.fx('home_a'), '2026-11-21', tests.fx('slot_mittag'), 'text', 'Suppe'),
  (tests.fx('entry_abend'), tests.fx('home_a'), '2026-11-21', tests.fx('slot_abend'), 'text', 'Pizza');

-- ===================== Backfill =====================
select ok(private.add_vormittag_slot() >= 3, 'AC-003 add_vormittag_slot: households without Vormittag are changed');

select results_eq(
  $$ select name, sort from tests.slots('home_a') $$,
  $$ values ('Vormittag', -1::numeric), ('Mittag', 0), ('Abend', 1) $$,
  'AC-003 add_vormittag_slot: Vormittag comes first, with a sort below the existing slots');
select results_eq(
  $$ select id from tests.slots('home_a') offset 1 $$,
  $$ select tests.fx('slot_mittag') union all select tests.fx('slot_abend') $$,
  'AC-003 add_vormittag_slot: the existing slots keep their ids');
select ok(
  (select id is not null and id not in (tests.fx('slot_mittag'), tests.fx('slot_abend'))
   from tests.slots('home_a') limit 1),
  'AC-003 add_vormittag_slot: Vormittag gets a new id of its own');
select results_eq(
  $$ select name from tests.slots('home_a') order by sort $$,
  $$ values ('Vormittag'), ('Mittag'), ('Abend') $$,
  'AC-001 add_vormittag_slot: ordered by sort the day reads Vormittag, Mittag, Abend');
select results_eq(
  $$ select e.id, s.name
     from public.meal_plan_entries e
     join tests.slots('home_a') s on s.id = e.slot_id
     where e.household_id = tests.fx('home_a') order by s.sort $$,
  $$ values (tests.fx('entry_mittag'), 'Mittag'), (tests.fx('entry_abend'), 'Abend') $$,
  'AC-003 add_vormittag_slot: the planned entries stay in Mittag and Abend');
select results_eq(
  $$ select name, sort, id from tests.slots('home_b') $$,
  $$ values ('Vormittag', 0::numeric, tests.fx('slot_b_vormittag')), ('Abend', 1, tests.fx('slot_b_abend')) $$,
  'AC-003 add_vormittag_slot: a household that already has Vormittag is left as it is');
select results_eq(
  $$ select name, sort from tests.slots('home_custom') $$,
  $$ values ('Vormittag', 4::numeric), ('Spät', 7), ('Frühstück', 5) $$,
  'AC-003 add_vormittag_slot: custom slots keep their order; Vormittag sorts before the smallest');
select results_eq(
  $$ select name, sort from tests.slots('home_empty') $$,
  $$ values ('Vormittag', 0::numeric) $$,
  'AC-003 add_vormittag_slot: a household without slots gets Vormittag with sort 0');
select is(
  (select count(*)::int from tests.slots('home_full')), 10,
  'AC-003 add_vormittag_slot: a household at the limit of 10 slots is skipped instead of failing');

-- ===================== Idempotent =====================
insert into slots_after_first_run select id, meal_slots from public.households;
select is(private.add_vormittag_slot(), 0, 'AC-003 add_vormittag_slot: running it again changes no household');
select is_empty(
  $$ select h.id from public.households h join slots_after_first_run s on s.household_id = h.id
     where h.meal_slots is distinct from s.meal_slots $$,
  'AC-003 add_vormittag_slot: … and the slots stay exactly as after the first run');

-- ===================== The new slot is usable =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format($$ insert into public.meal_plan_entries (household_id, date, slot_id, kind, text) values (%L, '2026-11-22', %L, 'text', 'Eislaufen') $$,
         tests.fx('home_a'), (select id from tests.slots('home_a') limit 1)),
  'AC-001 meal_plan_entries: a member plans into the new Vormittag slot');
select throws_ok(
  'select private.add_vormittag_slot()', '42501', null,
  'T1 add_vormittag_slot: a member cannot run the backfill');

-- ===================== New households =====================
insert into fx (key, id) values ('home_new', public.create_household('Neu', '{"areas": [], "articles": []}'));
select results_eq(
  $$ select name, sort from tests.slots('home_new') $$,
  $$ values ('Vormittag', 0::numeric), ('Mittag', 1), ('Abend', 2) $$,
  'AC-001 create_household: a new household has Vormittag, Mittag and Abend in this order');
select is(
  (select count(distinct id)::int from tests.slots('home_new')), 3,
  'AC-001 create_household: each slot has its own id');
select tests.clear_authentication();

select * from finish();
rollback;
