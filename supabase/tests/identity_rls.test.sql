-- Tenant isolation of the identity tables (spec 0003, T2, AC-011): profiles, households,
-- household_members, household_invitations. A member of another household, an invited person and
-- a signed-out caller can read or change nothing they should not; nobody writes memberships or
-- invitations directly.
begin;
\ir _helpers.psql
select plan(43);

create temp table fx (key text primary key, id uuid) on commit drop;
grant select on fx to anon, authenticated;
insert into fx values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('carla', tests.create_user('carla@example.com', 'Carla')),
  ('ben', tests.create_user('ben@example.com', 'Ben')),
  ('dora', tests.create_user('dora@example.com', 'Dora'));
insert into fx values
  ('home_a', tests.create_household('A', array[(select id from fx where key = 'anna'), (select id from fx where key = 'carla')])),
  ('home_b', tests.create_household('B', array[(select id from fx where key = 'ben')]));
insert into public.household_invitations (household_id, email, invited_by) values
  ((select id from fx where key = 'home_a'), 'dora@example.com', (select id from fx where key = 'anna')),
  ((select id from fx where key = 'home_b'), 'erik@example.com', (select id from fx where key = 'ben'));

-- ===================== profiles =====================
select tests.authenticate_as((select id from fx where key = 'anna'));
select results_eq(
  'select name from public.profiles order by name',
  $$ values ('Anna'), ('Carla') $$,
  'AC-011 profiles: a member sees her own profile and those of her co-members only'
);
select throws_ok(
  $$ update public.profiles set name = 'Hacked' where id = (select id from fx where key = 'carla') $$,
  '42501', null,
  'AC-012 (spec 0027) profiles: nobody updates a profile directly, only through update_profile'
);
select throws_ok(
  $$ update public.profiles set name = 'Anna B.' where id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'AC-012 (spec 0027) profiles: not even her own'
);
select throws_ok(
  $$ update public.profiles set email = 'ben@example.com' where id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'T2 profiles: the email cannot be spoofed (no column grant)'
);
select throws_ok(
  $$ update public.profiles set id = gen_random_uuid() where id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'T2 profiles: the id cannot be changed'
);
select throws_ok(
  $$ update public.profiles set created_at = now() where id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'T2 profiles: created_at cannot be written'
);
select throws_ok(
  $$ update public.profiles set color = '#3E6C8E' where id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'T2 profiles: the colour cannot be written directly'
);
select throws_ok(
  $$ insert into public.profiles (id, name, email, color) values (gen_random_uuid(), 'X', 'x@example.com', '#000000') $$,
  '42501', null,
  'T2 profiles: nobody inserts profiles directly'
);
select throws_ok(
  $$ delete from public.profiles where id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'T2 profiles: nobody deletes profiles directly'
);

select tests.clear_authentication();
select results_eq(
  $$ select name from public.profiles where id in (select id from fx where key in ('ben', 'carla')) order by name $$,
  $$ values ('Ben'), ('Carla') $$,
  'AC-011 profiles: a member cannot change another person''s profile, foreign or co-member'
);

select tests.authenticate_as((select id from fx where key = 'dora'));
select results_eq(
  'select name from public.profiles',
  $$ values ('Dora') $$,
  'AC-011 profiles: an invited person who is not a member sees only her own profile'
);

-- ===================== households =====================
select tests.authenticate_as((select id from fx where key = 'anna'));
select results_eq(
  'select name from public.households',
  $$ values ('A') $$,
  'AC-011 households: a member sees only her households'
);
update public.households set name = 'Hacked' where id = (select id from fx where key = 'home_b');
update public.households
set name = 'Anna & Carla',
    meal_slots = '[{"id": "8c1f2a4e-1111-4b4b-9c9c-000000000001", "name": "Frühstück", "sort": 0}]'
where id = (select id from fx where key = 'home_a');
select results_eq(
  $$ select name, meal_slots -> 0 ->> 'name' from public.households $$,
  $$ values ('Anna & Carla', 'Frühstück') $$,
  'T2 households: a member renames her household and edits its meal slots'
);
select throws_ok(
  $$ update public.households set meal_slots = '[{"name": "ohne id", "sort": 0}]'
     where id = (select id from fx where key = 'home_a') $$,
  '23514', null,
  'T2 households: meal slots without a uuid id are rejected'
);
select throws_ok(
  $$ update public.households set meal_slots = '{"id": "x"}'
     where id = (select id from fx where key = 'home_a') $$,
  '23514', null,
  'T2 households: meal slots must be an array'
);
select throws_ok(
  $$ update public.households set id = gen_random_uuid() where id = (select id from fx where key = 'home_a') $$,
  '42501', null,
  'T2 households: the id cannot be changed'
);
select throws_ok(
  $$ insert into public.households (name) values ('Neu') $$,
  '42501', null,
  'T2 households: households are created only through create_household'
);
select throws_ok(
  $$ delete from public.households where id = (select id from fx where key = 'home_a') $$,
  '42501', null,
  'T2 households: households cannot be deleted through the API'
);

select tests.authenticate_as((select id from fx where key = 'dora'));
select results_eq(
  'select id, name from public.households',
  $$ select id, 'Anna & Carla' from fx where key = 'home_a' $$,
  'T2 households: an invited person sees the name of the inviting household, nothing else'
);
update public.households set name = 'Hacked' where id = (select id from fx where key = 'home_a');

select tests.authenticate_as((select id from fx where key = 'ben'));
select results_eq(
  'select name from public.households',
  $$ values ('B') $$,
  'AC-011 households: a member of another household does not see it'
);
update public.households set name = 'Hacked' where id = (select id from fx where key = 'home_a');
select tests.clear_authentication();
select results_eq(
  $$ select name from public.households
     where id in (select id from fx where key in ('home_a', 'home_b')) order by name $$,
  $$ values ('Anna & Carla'), ('B') $$,
  'AC-011 households: neither a foreign member nor an invited person can rename a household'
);

-- ===================== household_members =====================
select tests.authenticate_as((select id from fx where key = 'anna'));
select results_eq(
  'select profile_id from public.household_members order by profile_id',
  $$ select id from fx where key in ('anna', 'carla') order by id $$,
  'AC-011 household_members: a member sees the memberships of her households only'
);
select throws_ok(
  $$ insert into public.household_members (household_id, profile_id)
     values ((select id from fx where key = 'home_b'), (select id from fx where key = 'anna')) $$,
  '42501', null,
  'AC-011 household_members: nobody can join a foreign household directly'
);
select throws_ok(
  $$ insert into public.household_members (household_id, profile_id)
     values ((select id from fx where key = 'home_a'), (select id from fx where key = 'dora')) $$,
  '42501', null,
  'T2 household_members: not even a member can add someone directly'
);
select throws_ok(
  $$ update public.household_members set household_id = (select id from fx where key = 'home_b')
     where profile_id = (select id from fx where key = 'anna') $$,
  '42501', null,
  'AC-011 household_members: a membership cannot be moved to another household'
);
select throws_ok(
  $$ delete from public.household_members where profile_id = (select id from fx where key = 'carla') $$,
  '42501', null,
  'T2 household_members: memberships are removed only through remove_member'
);

select tests.authenticate_as((select id from fx where key = 'dora'));
select is(
  (select count(*)::int from public.household_members),
  0,
  'T2 household_members: an invited person sees no memberships'
);

-- ===================== household_invitations =====================
select tests.authenticate_as((select id from fx where key = 'anna'));
select results_eq(
  'select email from public.household_invitations',
  $$ values ('dora@example.com') $$,
  'AC-011 household_invitations: a member sees the invitations of her households only'
);
select throws_ok(
  $$ insert into public.household_invitations (household_id, email, invited_by)
     values ((select id from fx where key = 'home_a'), 'x@example.com', (select id from fx where key = 'ben')) $$,
  '42501', null,
  'T2 household_invitations: invitations are created only through invite_member (invited_by cannot be spoofed)'
);
select throws_ok(
  $$ insert into public.household_invitations (household_id, email)
     values ((select id from fx where key = 'home_b'), 'x@example.com') $$,
  '42501', null,
  'AC-011 household_invitations: nobody invites into a foreign household directly'
);
select throws_ok(
  $$ update public.household_invitations set email = 'x@example.com' $$,
  '42501', null,
  'T2 household_invitations: invitations cannot be changed by a direct update'
);
select throws_ok(
  $$ delete from public.household_invitations $$,
  '42501', null,
  'T2 household_invitations: invitations cannot be deleted directly'
);

select tests.authenticate_as((select id from fx where key = 'dora'));
select results_eq(
  'select household_id, email from public.household_invitations',
  $$ select id, 'dora@example.com' from fx where key = 'home_a' $$,
  'T2 household_invitations: an invited person sees the invitations for her own address'
);

select tests.authenticate_as((select id from fx where key = 'ben'));
select results_eq(
  'select email from public.household_invitations',
  $$ values ('erik@example.com') $$,
  'AC-011 household_invitations: a member of another household does not see them'
);

-- ===================== deleted_records of the identity tables =====================
select tests.clear_authentication();
delete from public.household_invitations where email = 'erik@example.com';
select tests.authenticate_as((select id from fx where key = 'anna'));
select is(
  (select count(*)::int from public.deleted_records),
  0,
  'AC-011 deleted_records: tombstones of a foreign household stay invisible'
);
select tests.authenticate_as((select id from fx where key = 'ben'));
select results_eq(
  'select table_name from public.deleted_records',
  $$ values ('household_invitations') $$,
  'T2 deleted_records: a deleted invitation leaves a tombstone for its household'
);

-- ===================== anon =====================
select tests.authenticate_as_anon();
select throws_ok('select * from public.profiles', '42501', null, 'AC-005 profiles: anon reads nothing');
select throws_ok('select * from public.households', '42501', null, 'AC-005 households: anon reads nothing');
select throws_ok('select * from public.household_members', '42501', null, 'AC-005 household_members: anon reads nothing');
select throws_ok('select * from public.household_invitations', '42501', null, 'AC-005 household_invitations: anon reads nothing');
select throws_ok(
  $$ update public.households set name = 'x' $$,
  '42501', null,
  'AC-005 households: anon changes nothing'
);
select throws_ok(
  $$ insert into public.household_members (household_id, profile_id)
     values ((select id from fx where key = 'home_a'), (select id from fx where key = 'ben')) $$,
  '42501', null,
  'AC-005 household_members: anon inserts nothing'
);
select throws_ok(
  $$ update public.profiles set name = 'x' $$,
  '42501', null,
  'AC-005 profiles: anon changes nothing'
);
select tests.clear_authentication();

select * from finish();
rollback;
