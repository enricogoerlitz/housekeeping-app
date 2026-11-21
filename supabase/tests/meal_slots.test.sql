-- Meal slot "Vormittag" (spec 0004, REQ-001): a new household starts with Vormittag, Mittag,
-- Abend (AC-001), and a member plans into Vormittag. The backfill of existing households (AC-003)
-- was dropped with the migration baseline (ADR-0012): there were no households to backfill.
begin;
\ir _helpers.psql
select plan(4);

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

insert into fx (key, id) values ('enrico', tests.create_user('enrico@example.com', 'Enrico'));

-- ===================== New households =====================
select tests.authenticate_as(tests.fx('enrico'));
insert into fx (key, id) values ('home_new', public.create_household('Neu', '{"areas": [], "articles": []}'));
select results_eq(
  $$ select name, sort from tests.slots('home_new') $$,
  $$ values ('Vormittag', 0::numeric), ('Mittag', 1), ('Abend', 2) $$,
  'AC-001 create_household: a new household has Vormittag, Mittag and Abend in this order');
select is(
  (select count(distinct id)::int from tests.slots('home_new')), 3,
  'AC-001 create_household: each slot has its own id');

-- ===================== The slot is usable =====================
select lives_ok(
  format($$ insert into public.meal_plan_entries (household_id, date, slot_id, kind, text) values (%L, '2026-11-22', %L, 'text', 'Eislaufen') $$,
         tests.fx('home_new'), (select id from tests.slots('home_new') limit 1)),
  'AC-001 meal_plan_entries: a member plans into the Vormittag slot');
select hasnt_function('private', 'add_vormittag_slot', 'ADR-0012: the backfill add_vormittag_slot is gone');
select tests.clear_authentication();

select * from finish();
rollback;
