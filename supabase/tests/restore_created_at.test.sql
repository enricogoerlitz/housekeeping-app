-- Spec 0031, REQ-013 — one way to keep created_at on a restore: set_timestamps with the
-- transaction setting housekeeping.keep_created_at, which counts only for the function owner
-- (postgres). restore_recipe, restore_restaurant and restore_activity use it; the old
-- *_stamp_restored triggers and private.restore_created_at are gone. Covers AC-035, AC-036 and
-- the negative tests of the risk table (a client setting the GUC itself).
begin;
\ir _helpers.psql
select plan(14);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values ('halloumi'), ('enzo'), ('eislaufen'), ('new_recipe'), ('stamped');

insert into public.recipes (id, household_id, title) values (tests.fx('halloumi'), tests.fx('home_a'), 'Halloumi-Pfanne');
insert into public.restaurants (id, household_id, name) values (tests.fx('enzo'), tests.fx('home_a'), 'Trattoria Da Enzo');
insert into public.activities (id, household_id, name, name_key)
values (tests.fx('eislaufen'), tests.fx('home_a'), 'Eislaufen', 'eislaufen');

-- All three were created yesterday.
alter table public.recipes disable trigger recipes_set_timestamps;
alter table public.restaurants disable trigger restaurants_set_timestamps;
alter table public.activities disable trigger activities_set_timestamps;
update public.recipes set created_at = now() - interval '1 day' where id = tests.fx('halloumi');
update public.restaurants set created_at = now() - interval '1 day' where id = tests.fx('enzo');
update public.activities set created_at = now() - interval '1 day' where id = tests.fx('eislaufen');
alter table public.recipes enable trigger recipes_set_timestamps;
alter table public.restaurants enable trigger restaurants_set_timestamps;
alter table public.activities enable trigger activities_set_timestamps;

-- A scratch table with the shared timestamp trigger and a full insert grant, so a member can name
-- created_at at all (the real tables never grant it).
create table tests.stamped (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stamped_set_timestamps before insert or update on tests.stamped
  for each row execute function private.set_timestamps();
grant insert, select on tests.stamped to authenticated;

-- ===================== Only one way is left =====================
select hasnt_function('private', 'recipes_stamp_restored', array[]::text[],
  'REQ-013: private.recipes_stamp_restored is gone');
select hasnt_function('private', 'stamp_restored', array[]::text[], 'REQ-013: private.stamp_restored is gone');
select hasnt_trigger('public', 'recipes', 'recipes_stamp_restored', 'REQ-013: the trigger recipes_stamp_restored is gone');
select hasnt_trigger('public', 'restaurants', 'restaurants_stamp_restored',
  'REQ-013: the trigger restaurants_stamp_restored is gone');
select hasnt_trigger('public', 'activities', 'activities_stamp_restored',
  'REQ-013: the trigger activities_stamp_restored is gone');

-- ===================== AC-035: "Rückgängig" keeps created_at =====================
select tests.authenticate_as(tests.fx('enrico'));
select public.delete_recipe(tests.fx('halloumi'), current_date);
select public.restore_recipe(tests.fx('halloumi'));
select public.delete_restaurant(tests.fx('enzo'), current_date);
select public.restore_restaurant(tests.fx('enzo'));
select public.delete_activity(tests.fx('eislaufen'), current_date);
select public.restore_activity(tests.fx('eislaufen'));
select isnt(current_setting('housekeeping.keep_created_at', true), 'on',
  'REQ-013: after the restores the setting is off again for the rest of the transaction');
select tests.clear_authentication();
select is((select created_at from public.recipes where id = tests.fx('halloumi')), now() - interval '1 day',
  'AC-035 restore_recipe: the recipe of yesterday has its old created_at');
select is((select created_at from public.restaurants where id = tests.fx('enzo')), now() - interval '1 day',
  'AC-035 restore_restaurant: the restaurant has its old created_at');
select is((select created_at from public.activities where id = tests.fx('eislaufen')), now() - interval '1 day',
  'AC-035 restore_activity: the activity has its old created_at');

-- ===================== AC-036: a client cannot keep created_at =====================
select tests.authenticate_as(tests.fx('enrico'));
select set_config('housekeeping.keep_created_at', 'on', true);
select throws_ok(
  format($$ select public.apply_changes(%L, %L) $$, tests.fx('home_a'), jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('id', tests.fx('new_recipe'), 'title', 'Neu', 'created_at', '2026-01-15'))))),
  '22023', 'invalid_change', 'AC-036 apply_changes: created_at cannot be sent, also with the setting on');
select throws_ok(
  format($$ insert into public.recipes (id, household_id, title, created_at) values (%L, %L, 'Neu', '2026-01-15') $$,
         tests.fx('new_recipe'), tests.fx('home_a')),
  '42501', null, 'AC-036 PostgREST: created_at of a recipe is not insertable');
insert into tests.stamped (id, created_at) values (tests.fx('stamped'), '2026-01-15');
select tests.clear_authentication();
select is((select created_at from tests.stamped where id = tests.fx('stamped')), now(),
  'AC-036 set_timestamps: authenticated with keep_created_at on still gets the server time');
select set_config('housekeeping.keep_created_at', 'on', true);
insert into tests.stamped (id, created_at) values (gen_random_uuid(), '2026-01-15');
select is((select min(created_at) from tests.stamped), '2026-01-15'::timestamptz,
  'REQ-013 set_timestamps: the function owner keeps the named created_at while the setting is on');
insert into tests.stamped (id, created_at) values (gen_random_uuid(), now() + interval '1 day');
select is((select max(created_at) from tests.stamped), now(),
  'REQ-013 set_timestamps: a kept created_at is never later than now()');
select set_config('housekeeping.keep_created_at', 'off', true);

select * from finish();
rollback;
