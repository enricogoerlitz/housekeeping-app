-- Foundation (spec 0003, T1): default privileges, the shared sync triggers, the tombstone log,
-- its retention job and the Realtime authorisation. The triggers are exercised on a scratch
-- table built exactly like a domain table, so this file does not depend on later tables.
begin;
\ir _helpers.psql
select plan(40);

-- ---------- Fixtures ----------
create temp table fx (key text primary key, id uuid) on commit drop;
grant select on fx to anon, authenticated;
insert into fx values
  ('anna', tests.create_user('anna@example.com', 'Anna')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx values
  ('home_a', tests.create_household('A', array[(select id from fx where key = 'anna')])),
  ('home_b', tests.create_household('B', array[(select id from fx where key = 'ben')]));

-- ---------- Default privileges: new objects are not exposed without an explicit grant ----------
create table public.scratch_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create sequence public.scratch_seq;
create function public.scratch_fn() returns int language sql set search_path = '' as $$ select 1 $$;
create function private.scratch_private_fn() returns int language sql set search_path = '' as $$ select 1 $$;

select ok(
  not has_table_privilege('anon', 'public.scratch_items', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.scratch_items', 'select,insert,update,delete'),
  'T1: a new table in public is not granted to anon or authenticated by default'
);
select ok(
  not has_sequence_privilege('anon', 'public.scratch_seq', 'usage,select,update')
  and not has_sequence_privilege('authenticated', 'public.scratch_seq', 'usage,select,update'),
  'T1: a new sequence in public is not granted to anon or authenticated by default'
);
select ok(
  not has_function_privilege('anon', 'public.scratch_fn()', 'execute')
  and not has_function_privilege('authenticated', 'public.scratch_fn()', 'execute'),
  'T1: a new function in public is not executable by anon, authenticated or PUBLIC by default'
);
select ok(
  not has_function_privilege('authenticated', 'private.scratch_private_fn()', 'execute'),
  'T1: a new function in private is not executable by authenticated by default'
);

-- Make the scratch table a proper household-scoped table.
grant select, insert (id, household_id, name), update (name), delete on public.scratch_items to authenticated;
alter table public.scratch_items enable row level security;
create policy scratch_select on public.scratch_items for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy scratch_insert on public.scratch_items for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy scratch_update on public.scratch_items for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy scratch_delete on public.scratch_items for delete to authenticated
  using (household_id in (select private.my_household_ids()));
create trigger scratch_items_set_timestamps before insert or update on public.scratch_items
  for each row execute function private.set_timestamps();
create trigger scratch_items_record_deletion after delete on public.scratch_items
  for each row execute function private.record_deletion();
create trigger scratch_items_notify_insert after insert on public.scratch_items
  referencing new table as new_rows
  for each statement execute function private.notify_household();
create trigger scratch_items_notify_update after update on public.scratch_items
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.notify_household();
create trigger scratch_items_notify_delete after delete on public.scratch_items
  referencing old table as old_rows
  for each statement execute function private.notify_household();

-- ---------- my_household_ids ----------
select tests.authenticate_as((select id from fx where key = 'anna'));
select results_eq(
  'select private.my_household_ids()',
  $$ select id from fx where key = 'home_a' $$,
  'T1: my_household_ids returns exactly the households of the caller'
);
select tests.authenticate_as_anon();
select throws_ok(
  'select private.my_household_ids()',
  '42501',
  null,
  'T1: anon cannot execute my_household_ids'
);
select tests.clear_authentication();

-- ---------- set_timestamps ----------
insert into public.scratch_items (id, household_id, name, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', (select id from fx where key = 'home_a'), 'Milch',
        '2000-01-01', '2000-01-01');
select is(
  (select array[created_at, updated_at] from public.scratch_items where name = 'Milch'),
  array[now(), now()],
  'T1: set_timestamps sets created_at and updated_at on insert, ignoring supplied values'
);

alter table public.scratch_items disable trigger scratch_items_set_timestamps;
update public.scratch_items set created_at = '2000-01-01', updated_at = '2000-01-01' where name = 'Milch';
alter table public.scratch_items enable trigger scratch_items_set_timestamps;

select tests.authenticate_as((select id from fx where key = 'anna'));
update public.scratch_items set name = 'Hafermilch' where name = 'Milch';
select tests.clear_authentication();
select is(
  (select array[created_at, updated_at] from public.scratch_items where name = 'Hafermilch'),
  array['2000-01-01'::timestamptz, now()],
  'T1: set_timestamps bumps updated_at on update and keeps created_at'
);

update public.scratch_items set created_at = '1999-01-01' where name = 'Hafermilch';
select is(
  (select created_at from public.scratch_items where name = 'Hafermilch'),
  '2000-01-01'::timestamptz,
  'T1: created_at cannot be changed, not even by the owner'
);

select throws_ok(
  $$ update public.scratch_items set household_id = (select id from fx where key = 'home_b')
     where name = 'Hafermilch' $$,
  'P0001',
  'household_id_immutable',
  'T1: set_timestamps rejects moving a row to another household, even for the owner'
);

select tests.authenticate_as((select id from fx where key = 'anna'));
select throws_ok(
  $$ update public.scratch_items set updated_at = '2000-01-01' where name = 'Hafermilch' $$,
  '42501',
  null,
  'T1: a member cannot write updated_at (no column grant)'
);
select tests.clear_authentication();

-- ---------- notify_household ----------
create temp table msg_mark as select coalesce(max(inserted_at), '-infinity') as at from realtime.messages;

insert into public.scratch_items (household_id, name)
select h.id, n
from fx h, unnest(array['Brot', 'Eier']) as n
where h.key in ('home_a', 'home_b');

select results_eq(
  $$ select topic, event, private, payload ->> 'table'
     from realtime.messages
     where inserted_at > (select at from msg_mark) and topic like 'household:%'
     order by topic $$,
  $$ select 'household:' || id, 'changed', true, 'scratch_items'
     from fx where key in ('home_a', 'home_b') order by 'household:' || id $$,
  'T1: one insert statement sends exactly one signal per affected household'
);

select is(
  (select count(*)::int from realtime.messages
   where inserted_at > (select at from msg_mark)
     and payload - 'table' - 'id' <> '{}'::jsonb),
  0,
  'T1: the signal carries only the table name, no row data'
);

delete from realtime.messages where inserted_at > (select at from msg_mark);
update public.scratch_items set name = name || '!' where name in ('Brot', 'Eier');
select is(
  (select count(*)::int from realtime.messages
   where inserted_at > (select at from msg_mark) and topic like 'household:%'),
  2,
  'T1: one update statement over four rows in two households sends two signals'
);

delete from realtime.messages where inserted_at > (select at from msg_mark);
delete from public.scratch_items where household_id = (select id from fx where key = 'home_b');
select results_eq(
  $$ select topic from realtime.messages
     where inserted_at > (select at from msg_mark) and topic like 'household:%' $$,
  $$ select 'household:' || id from fx where key = 'home_b' $$,
  'T1: a delete statement signals only the household it touched'
);

-- ---------- record_deletion and deleted_records ----------
select results_eq(
  $$ select table_name, count(*)::int from public.deleted_records
     where household_id = (select id from fx where key = 'home_b') group by table_name $$,
  $$ values ('scratch_items', 2) $$,
  'T1: record_deletion writes one tombstone per deleted row'
);

select tests.authenticate_as((select id from fx where key = 'anna'));
delete from public.scratch_items where id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$ select household_id, table_name, record_id, deleted_at from public.deleted_records $$,
  $$ select (select id from fx where key = 'home_a'), 'scratch_items',
            '11111111-1111-4111-8111-111111111111', now() $$,
  'T1: a member sees the tombstones of her household only (id as record_id, deleted_at = now())'
);
select throws_ok(
  $$ insert into public.deleted_records (household_id, table_name, record_id)
     values ((select id from fx where key = 'home_a'), 'scratch_items', 'x') $$,
  '42501', null,
  'T1: a member cannot insert tombstones'
);
select throws_ok(
  $$ update public.deleted_records set record_id = 'x' $$,
  '42501', null,
  'T1: a member cannot update tombstones'
);
select throws_ok(
  $$ delete from public.deleted_records $$,
  '42501', null,
  'T1: a member cannot delete tombstones'
);

select tests.authenticate_as((select id from fx where key = 'ben'));
select is(
  (select count(*)::int from public.deleted_records
   where household_id = (select id from fx where key = 'home_a')),
  0,
  'T1: a member of another household sees none of these tombstones'
);
select is(
  (select count(*)::int from public.scratch_items
   where household_id = (select id from fx where key = 'home_a')),
  0,
  'T1: my_household_ids policies hide foreign rows'
);

select tests.authenticate_as_anon();
select throws_ok(
  'select * from public.deleted_records',
  '42501', null,
  'T1: anon cannot read deleted_records'
);
select tests.clear_authentication();

-- Composite keys: record_deletion takes the key columns as trigger arguments.
create table public.scratch_pairs (
  household_id uuid not null,
  left_id uuid not null,
  right_id uuid not null,
  primary key (household_id, left_id, right_id)
);
create trigger scratch_pairs_record_deletion after delete on public.scratch_pairs
  for each row execute function private.record_deletion('left_id', 'right_id');
insert into public.scratch_pairs values
  ((select id from fx where key = 'home_a'), '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333');
delete from public.scratch_pairs;
select is(
  (select record_id from public.deleted_records where table_name = 'scratch_pairs'),
  '22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333',
  'T1: record_deletion joins composite key columns with ":" in argument order'
);

-- ---------- Retention ----------
insert into public.deleted_records (household_id, table_name, record_id, deleted_at) values
  ((select id from fx where key = 'home_a'), 'scratch_items', 'old', now() - interval '31 days'),
  ((select id from fx where key = 'home_a'), 'scratch_items', 'young', now() - interval '29 days');
select private.purge_deleted_records();
select results_eq(
  $$ select record_id from public.deleted_records where record_id in ('old', 'young') $$,
  $$ values ('young') $$,
  'T1: purge_deleted_records removes tombstones older than 30 days and keeps younger ones'
);
select results_eq(
  $$ select schedule, command from cron.job where jobname = 'purge-deleted-records' $$,
  $$ values ('15 3 * * *', 'select private.purge_deleted_records()') $$,
  'T1: pg_cron runs the purge daily'
);
select ok(
  not has_function_privilege('authenticated', 'private.purge_deleted_records()', 'execute'),
  'T1: authenticated cannot run the purge'
);

-- ---------- Realtime topic parsing ----------
select is(
  private.household_id_from_topic('household:' || (select id from fx where key = 'home_a')),
  (select id from fx where key = 'home_a'),
  'T1: household_id_from_topic parses household:<uuid>'
);
select is(
  private.household_id_from_topic('household:not-a-uuid'),
  null,
  'T1: household_id_from_topic returns null for a malformed id instead of failing'
);
select is(
  private.household_id_from_topic('other:' || (select id from fx where key = 'home_a')),
  null,
  'T1: household_id_from_topic returns null for another prefix'
);
select is(
  private.household_id_from_topic('household:' || (select id from fx where key = 'home_a') || 'x'),
  null,
  'T1: household_id_from_topic rejects trailing characters'
);

-- ---------- Realtime authorisation (private channels) ----------
select realtime.send('{"table":"x"}', 'changed', 'household:' || (select id from fx where key = 'home_a'), true);
select realtime.send('{"table":"x"}', 'changed', 'household:not-a-uuid', true);

select tests.authenticate_as((select id from fx where key = 'anna'));
select set_config('realtime.topic', 'household:' || (select id from fx where key = 'home_a'), true);
select ok(
  (select count(*) from realtime.messages
   where topic = 'household:' || (select id from fx where key = 'home_a')) > 0,
  'T1: a member can receive broadcasts on her household topic'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private)
     values ('household:' || (select id from fx where key = 'home_a'), 'broadcast', '{}', 'changed', true) $$,
  '42501', null,
  'T1: a member cannot send broadcasts on her household topic'
);
select set_config('realtime.topic', 'household:not-a-uuid', true);
select is(
  (select count(*)::int from realtime.messages where topic = 'household:not-a-uuid'),
  0,
  'T1: a malformed topic is denied without an error'
);

select tests.authenticate_as((select id from fx where key = 'ben'));
select set_config('realtime.topic', 'household:' || (select id from fx where key = 'home_a'), true);
select is(
  (select count(*)::int from realtime.messages
   where topic = 'household:' || (select id from fx where key = 'home_a')),
  0,
  'T1: a member of another household cannot receive that household''s broadcasts'
);

select tests.authenticate_as_anon();
select set_config('realtime.topic', 'household:' || (select id from fx where key = 'home_a'), true);
select is(
  (select count(*)::int from realtime.messages
   where topic = 'household:' || (select id from fx where key = 'home_a')),
  0,
  'T1: anon cannot receive household broadcasts'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private)
     values ('household:' || (select id from fx where key = 'home_a'), 'broadcast', '{}', 'changed', true) $$,
  '42501', null,
  'T1: anon cannot send broadcasts'
);
select tests.clear_authentication();

-- ---------- Schema private ----------
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'T1: anon has no usage on schema private'
);
select ok(
  not has_function_privilege('authenticated', 'private.record_deletion()', 'execute')
  and not has_function_privilege('authenticated', 'private.notify_household()', 'execute')
  and not has_function_privilege('authenticated', 'private.set_timestamps()', 'execute'),
  'T1: the trigger functions cannot be called directly'
);
select ok(
  (select bool_and(prosecdef) from pg_proc
   where oid in ('private.record_deletion()'::regprocedure, 'private.notify_household()'::regprocedure))
  and not (select prosecdef from pg_proc where oid = 'private.set_timestamps()'::regprocedure),
  'T1: record_deletion and notify_household are security definer, set_timestamps is not'
);

select * from finish();
rollback;
