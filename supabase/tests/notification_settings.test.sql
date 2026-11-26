-- Notification settings and the new time columns (spec 0013, Task 1): one row per member, created
-- by the server (AC-011), readable only by the member herself (AC-012, AC-013), synced, gone with
-- the membership (AC-036). Since spec 0053 the row holds only the acknowledged notices (spec 0051),
-- written only through acknowledge_notices: no column is patchable. chores.due_time (AC-022),
-- the time of a restaurant entry (spec 0021, starts_at), households.timezone.
begin;
\ir _helpers.psql
select plan(45);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply_sql(text, jsonb) to anon, authenticated;

create function tests.settings_id(p_member text) returns uuid language sql stable security definer
set search_path = ''
as $$
  select s.id from public.notification_settings s
  where s.household_id = tests.fx('home') and s.member_id = tests.fx(p_member)
$$;
grant execute on function tests.settings_id(text) to anon, authenticated;

create temp table pulled (who text primary key, r jsonb) on commit drop;
grant select, insert on pulled to authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values ('slot'), ('lasagne'), ('trattoria'), ('e_lasagne'), ('e_trattoria'), ('muell'), ('bad');

update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('slot'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('home');
insert into public.recipes (id, household_id, title) values (tests.fx('lasagne'), tests.fx('home'), 'Lasagne');
insert into public.restaurants (id, household_id, name)
values (tests.fx('trattoria'), tests.fx('home'), 'Trattoria Da Enzo');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, restaurant_id) values
  (tests.fx('e_lasagne'), tests.fx('home'), '2026-11-21', tests.fx('slot'), 'recipe', tests.fx('lasagne'), null),
  (tests.fx('e_trattoria'), tests.fx('home'), '2026-11-21', tests.fx('slot'), 'restaurant', null, tests.fx('trattoria'));
insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on) values
  (tests.fx('bad'), tests.fx('home'), 'Bad putzen', '{"type": "weekly", "every": 1, "weekdays": [5]}',
   jsonb_build_object('type', 'fixed', 'memberId', tests.fx('enrico')), '2026-11-20');

-- ===================== AC-011: one row per member with the defaults =====================
select is(
  (select count(*)::int from public.notification_settings where household_id = tests.fx('home')), 2,
  'AC-011 notification_settings: every member gets exactly one row');
select columns_are('public', 'notification_settings',
  array['id', 'household_id', 'member_id', 'acknowledged_notices', 'created_at', 'updated_at'],
  'Spec 0053, AC-003 notification_settings: only the acknowledged notices are left, no push settings');
select tests.clear_authentication();
insert into fx (key, id) values ('vera', tests.create_user('vera@example.com', 'Vera'));
insert into public.household_members (household_id, profile_id) values (tests.fx('home_b'), tests.fx('vera'));
select is(
  (select count(*)::int from public.notification_settings
   where household_id = tests.fx('home_b') and member_id = tests.fx('vera')), 1,
  'AC-011 notification_settings: a member who joins later gets her row too');

-- ===================== AC-012: the member changes her own row =====================
alter table public.notification_settings disable trigger notification_settings_set_timestamps;
update public.notification_settings set updated_at = '2026-01-01T00:00:00Z' where id = tests.settings_id('enrico');
alter table public.notification_settings enable trigger notification_settings_set_timestamps;

select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ update public.notification_settings set daily_summary_enabled = true where id = %L $$,
         tests.settings_id('enrico')),
  '42703', null, 'Spec 0053, AC-004 notification_settings: the old push setting is gone');
select throws_ok(
  format($$ update public.notification_settings set acknowledged_notices = '{}' where id = %L $$,
         tests.settings_id('enrico')),
  '42501', null, 'Spec 0053, AC-004 notification_settings: Enrico changes no column of his row directly');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'notification_settings', 'id', tests.settings_id('enrico'),
    'changes', jsonb_build_object('daily_summary_enabled', true)))),
  '22023', 'invalid_change', 'Spec 0053, AC-004 apply_changes: the old push settings are not patchable');
select lives_ok(
  format($$ select public.acknowledge_notices(%L, array[%L]) $$, tests.fx('home'),
         'chore:' || tests.fx('bad') || ':' || to_char((now() at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD')),
  'Spec 0053, AC-005 acknowledge_notices: Enrico acknowledges a notice');
select is(
  (select updated_at from public.notification_settings where id = tests.settings_id('enrico')), now(),
  'Spec 0053, AC-005 notification_settings: the server sets updated_at, so it reaches his other devices');

-- ===================== AC-013: nobody else reads or changes it =====================
select tests.authenticate_as(tests.fx('nadja'));
select is(
  tests.affected(format('select 1 from public.notification_settings where id = %L', tests.settings_id('enrico'))), 0,
  'AC-013 notification_settings: Nadja does not see Enrico''s row');
select throws_ok(
  format($$ update public.notification_settings set acknowledged_notices = '{}' where id = %L $$,
         tests.settings_id('enrico')),
  '42501', null, 'AC-013 notification_settings: Nadja cannot change Enrico''s row');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'notification_settings', 'id', tests.settings_id('enrico'),
    'changes', jsonb_build_object('acknowledged_notices', '{}'::text[])))),
  '22023', 'invalid_change', 'AC-013 apply_changes: Nadja cannot patch Enrico''s row');
insert into pulled select 'nadja', public.sync_pull(jsonb_build_object('households',
  jsonb_build_object(tests.fx('home'), '{"full": true}'::jsonb)));
select is(
  (select array_agg(e ->> 'member_id') from pulled,
          jsonb_array_elements(r -> 'households' -> tests.fx('home')::text -> 'rows' -> 'notification_settings') e
   where who = 'nadja'),
  array[tests.fx('nadja')::text],
  'AC-013 sync_pull: Nadja pulls only her own settings row');

select tests.authenticate_as(tests.fx('enrico'));
insert into pulled select 'enrico', public.sync_pull(jsonb_build_object('households',
  jsonb_build_object(tests.fx('home'), '{"full": true}'::jsonb)));
select is(
  (select array_agg(e ->> 'member_id') from pulled,
          jsonb_array_elements(r -> 'households' -> tests.fx('home')::text -> 'rows' -> 'notification_settings') e
   where who = 'enrico'),
  array[tests.fx('enrico')::text],
  'AC-012 sync_pull: Enrico pulls his own settings row');

select tests.authenticate_as(tests.fx('ben'));
select is(
  tests.affected(format('select 1 from public.notification_settings where household_id = %L', tests.fx('home'))), 0,
  'AC-013 notification_settings: a member of another household reads no rows');
select throws_ok(
  format($$ update public.notification_settings set acknowledged_notices = '{}' where household_id = %L $$,
         tests.fx('home')),
  '42501', null, 'AC-013 notification_settings: a member of another household updates nothing');

select tests.authenticate_as_anon();
select throws_ok('select * from public.notification_settings', '42501', null,
  'AC-043 notification_settings: anon cannot read settings');
select throws_ok(
  format($$ update public.notification_settings set acknowledged_notices = '{}' where id = %L $$,
         tests.settings_id('enrico')),
  '42501', null, 'AC-043 notification_settings: anon cannot update settings');

-- No insert, no delete, no moving the row.
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ insert into public.notification_settings (household_id, member_id) values (%L, %L) $$,
         tests.fx('home'), tests.fx('enrico')),
  '42501', null, 'Decision 3 notification_settings: a member cannot insert a row');
select throws_ok(
  format('delete from public.notification_settings where id = %L', tests.settings_id('enrico')),
  '42501', null, 'Decision 3 notification_settings: a member cannot delete her row');
select throws_ok(
  format('update public.notification_settings set household_id = %L where id = %L', tests.fx('home_b'),
         tests.settings_id('enrico')),
  '42501', null, 'AC-013 notification_settings: the row cannot move to another household');
select throws_ok(
  format('update public.notification_settings set member_id = %L where id = %L', tests.fx('nadja'),
         tests.settings_id('enrico')),
  '42501', null, 'AC-013 notification_settings: the row cannot move to another person');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'notification_settings',
    'row', jsonb_build_object('id', gen_random_uuid(), 'member_id', tests.fx('enrico'))))),
  '22023', 'invalid_change', 'Decision 3 apply_changes: notification_settings cannot be inserted');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'delete', 'table', 'notification_settings', 'id', tests.settings_id('enrico')))),
  '22023', 'invalid_change', 'Decision 3 apply_changes: notification_settings cannot be deleted');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'notification_settings', 'id', tests.settings_id('enrico'),
    'changes', jsonb_build_object('member_id', tests.fx('nadja'))))),
  '22023', 'invalid_change', 'AC-013 apply_changes: member_id is not patchable');

-- ===================== chores.due_time (AC-022) =====================
select lives_ok(
  format($$ insert into public.chores (id, household_id, title, recurrence, assignment, next_due_on, due_time)
            values (%L, %L, 'Müll rausbringen', '{"type": "weekly", "every": 1, "weekdays": [7]}',
                    '{"type": "anyone"}', '2026-11-22', '19:00') $$, tests.fx('muell'), tests.fx('home')),
  'AC-022 chores: a chore is created with the time 19:00');
select throws_ok(
  format($$ update public.chores set due_time = '19:03' where id = %L $$, tests.fx('muell')),
  '23514', null, 'Decision 4 chores: 19:03 is not a 5-minute step');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'chores', 'id', tests.fx('bad'), 'changes', jsonb_build_object('due_time', '10:00')))),
  'AC-022 apply_changes: due_time is patchable');
select is(
  (select due_time from public.chores where id = tests.fx('bad')), '10:00'::time,
  'AC-022 apply_changes: the time is stored');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'chores', 'id', tests.fx('bad'), 'changes', jsonb_build_object('due_time', null)))),
  'AC-025 apply_changes: the time can be removed again');
select is(
  (select due_time from public.chores where id = tests.fx('bad')), null::time,
  'AC-025 apply_changes: the time is gone');
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'chores', 'row', jsonb_build_object(
      'id', gen_random_uuid(), 'title', 'Blumen gießen', 'recurrence', '{"type": "weekly", "every": 1, "weekdays": [5]}'::jsonb,
      'assignment', '{"type": "anyone"}'::jsonb, 'due_time', '18:00')))),
  'AC-022 apply_changes: due_time is an insert column');

-- ===================== Uhrzeit of a restaurant (spec 0021, REQ-013; was the reservation) =====================
select lives_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx('e_trattoria'),
    'changes', jsonb_build_object('starts_at', '19:30')))),
  'AC-037 apply_changes: a restaurant entry gets "Uhrzeit 19:30"');
select throws_ok(
  format($$ update public.meal_plan_entries set starts_at = '19:32' where id = %L $$, tests.fx('e_trattoria')),
  '23514', null, 'AC-036 meal_plan_entries: the time is a 5-minute step');
select throws_ok(
  format($$ update public.meal_plan_entries set starts_at = '19:30' where id = %L $$, tests.fx('e_lasagne')),
  '23514', null, 'AC-036 meal_plan_entries: "Lasagne" cannot get a time through the API');

-- ===================== households.timezone =====================
select is(
  (select timezone from public.households where id = tests.fx('home')), 'Europe/Berlin',
  'Decision 16 households: the time zone defaults to Europe/Berlin');
select throws_ok(
  format($$ update public.households set timezone = 'America/New_York' where id = %L $$, tests.fx('home')),
  '42501', null, 'Decision 16 households: members cannot change the time zone');
select throws_ok(
  tests.apply_sql('home', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'households', 'id', tests.fx('home'),
    'changes', jsonb_build_object('timezone', 'America/New_York')))),
  '22023', 'invalid_change', 'Decision 16 apply_changes: the time zone is not patchable');
select tests.clear_authentication();
select throws_ok(
  format($$ update public.households set timezone = '' where id = %L $$, tests.fx('home')),
  '23514', null, 'Decision 16 households: the time zone has 1 to 64 characters');

-- ===================== AC-036: leaving the household takes the row =====================
select tests.authenticate_as(tests.fx('enrico'));
create temp table nadja_settings on commit drop as select tests.settings_id('nadja') as id;
grant select on nadja_settings to authenticated;
select lives_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('nadja')),
  'AC-036 remove_member: Enrico removes Nadja');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_settings
   where household_id = tests.fx('home') and member_id = tests.fx('nadja')), 0,
  'AC-036 notification_settings: the removed member''s row is gone');
select tests.authenticate_as(tests.fx('enrico'));
select is(
  (select count(*)::int from public.deleted_records d, nadja_settings n
   where d.table_name = 'notification_settings' and d.record_id = n.id::text), 1,
  'AC-036 notification_settings: the remaining member''s devices get the tombstone (only the id)');
select is(
  (select count(*)::int from public.notification_settings where household_id = tests.fx('home')), 1,
  'AC-036 notification_settings: Enrico keeps his own row');

-- Structure: grants and RLS as the plan says.
select tests.clear_authentication();
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.notification_settings'::regclass),
  'Decision 3 notification_settings: row level security is on');
select ok(
  not exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'notification_settings'
                and grantee = 'authenticated' and privilege_type in ('UPDATE', 'INSERT'))
  and not has_table_privilege('anon', 'public.notification_settings', 'select'),
  'Spec 0053, AC-003 notification_settings: authenticated changes no column, nothing for anon');
select is(
  (select array_agg(policyname::text order by policyname) from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'notification_settings'),
  array['notification_settings_select'],
  'Spec 0053, Entscheidung 4 notification_settings: only the select policy is left');

select * from finish();
rollback;
