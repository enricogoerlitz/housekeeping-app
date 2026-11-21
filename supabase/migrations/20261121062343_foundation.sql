-- Baseline (ADR-0012) — database foundation.
--
-- * Nothing new is exposed to the API roles by default: every grant must be explicit, like on
--   the hosted project. This includes functions, which Postgres makes executable by PUBLIC.
-- * Schema `private` holds helpers and privileged code; PostgREST does not expose it.
-- * Shared triggers every synced table uses: server-set timestamps, tombstones for deletions and
--   a Realtime signal per household (`docs/architecture/sync.md`), and the helpers that attach
--   them and the four membership policies to a household-scoped table.
-- * The tombstone log `deleted_records` with a 30-day retention job.
--
-- Policies that need household membership (deleted_records, realtime.messages) follow in the
-- identity migration, right after `household_members` and `private.my_household_ids()` exist.
-- Until then deleted_records is deny-all (RLS on, no policy).

-- ---------------------------------------------------------------------------------------------
-- Default privileges
-- ---------------------------------------------------------------------------------------------

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- EXECUTE for PUBLIC is a global default; it can only be revoked globally (not per schema).
alter default privileges for role postgres revoke execute on functions from public;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Schema private
-- ---------------------------------------------------------------------------------------------

create schema private;
revoke all on schema private from public;
-- RLS policies call a few helpers in private as the querying user; each one is granted explicitly.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------------------------

-- Before insert or update, for each row. The server owns created_at and updated_at (the delta
-- sync depends on updated_at), and a row can never move to another household.
create function private.set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    if to_jsonb(new) ? 'household_id'
       and (to_jsonb(new) -> 'household_id') is distinct from (to_jsonb(old) -> 'household_id') then
      raise exception 'household_id_immutable' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

-- After delete, for each row: writes a tombstone so devices drop the row on the next delta sync.
-- record_id is the value of the `id` column; tables with a composite key pass their key columns
-- (without household_id) as trigger arguments, joined with ':' in argument order.
create function private.record_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(old);
  v_record_id text;
begin
  if tg_nargs = 0 then
    v_record_id := v_row ->> 'id';
  else
    select string_agg(v_row ->> col, ':' order by ord)
    into v_record_id
    from unnest(tg_argv) with ordinality as k (col, ord);
  end if;

  insert into public.deleted_records (household_id, table_name, record_id)
  values ((v_row ->> 'household_id')::uuid, tg_table_name, v_record_id);
  return null;
end
$$;

-- After insert, update or delete, for each statement (with transition tables new_rows/old_rows).
-- Sends one Realtime broadcast per affected household on the private topic household:<id>.
-- The payload is only {table}: Realtime is a signal to run the delta sync, never data.
-- Argument: the column holding the household id (default household_id; `households` passes id).
create function private.notify_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text := coalesce(tg_argv[0], 'household_id');
  v_household_ids uuid[];
  v_household_id uuid;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct (to_jsonb(r) ->> v_column)::uuid) into v_household_ids from new_rows r;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct x.household_id) into v_household_ids
    from (
      select (to_jsonb(r) ->> v_column)::uuid as household_id from new_rows r
      union all
      select (to_jsonb(r) ->> v_column)::uuid from old_rows r
    ) x;
  else
    select array_agg(distinct (to_jsonb(r) ->> v_column)::uuid) into v_household_ids from old_rows r;
  end if;

  foreach v_household_id in array coalesce(v_household_ids, '{}') loop
    perform realtime.send(
      jsonb_build_object('table', tg_table_name),
      'changed',
      'household:' || v_household_id,
      true
    );
  end loop;
  return null;
end
$$;

-- Parses a Realtime topic "household:<uuid>". Returns null for anything else instead of failing,
-- so a malformed topic is simply denied.
create function private.household_id_from_topic(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~* '^household:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 11)::uuid
  end
$$;

grant execute on function private.household_id_from_topic(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers for household-scoped tables
-- ---------------------------------------------------------------------------------------------

-- Times of day that notifications use (spec 0013, Decision 4): whole minutes in 5-minute steps,
-- like the 5-minute tick of the scheduler, so a message comes exactly at the time shown. Used by
-- check constraints of tables members write (settings, chores, meal plan), hence the grant; it
-- reads no data. null passes (the column decides whether a time is required).
create function private.is_five_minute_time(p_time time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_time is null
    or (extract(second from p_time) = 0 and extract(minute from p_time)::integer % 5 = 0)
$$;

grant execute on function private.is_five_minute_time(time) to authenticated;

-- Conventions of every household-scoped table (see `docs/architecture/sync.md`): id (client may
-- supply it), household_id with `on delete cascade` from households, server-set created_at /
-- updated_at, unique (household_id, id) as the target of composite foreign keys, index
-- (household_id, updated_at) for the delta sync, RLS with one policy per operation, explicit
-- column-level grants to authenticated (never id, household_id, created_at, updated_at in an
-- update grant), nothing for anon.

-- Attaches the sync triggers of a household-scoped table: server-set timestamps, a tombstone per
-- deleted row and one Realtime signal per statement and household. p_key_columns names the key
-- columns (without household_id) of a table without an `id` column, for the tombstone's record_id.
-- For migrations only; not granted to the API roles.
create function private.attach_sync_triggers(p_table regclass, p_key_columns text[] default '{}')
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select c.relname from pg_catalog.pg_class c where c.oid = p_table);
  v_key_args text := (select coalesce(string_agg(quote_literal(k), ', '), '') from unnest(p_key_columns) k);
begin
  execute format(
    'create trigger %I before insert or update on %s for each row execute function private.set_timestamps()',
    v_name || '_set_timestamps', p_table);
  execute format(
    'create trigger %I after delete on %s for each row execute function private.record_deletion(%s)',
    v_name || '_record_deletion', p_table, v_key_args);
  execute format(
    'create trigger %I after insert on %s referencing new table as new_rows '
    'for each statement execute function private.notify_household()',
    v_name || '_notify_insert', p_table);
  execute format(
    'create trigger %I after update on %s referencing old table as old_rows new table as new_rows '
    'for each statement execute function private.notify_household()',
    v_name || '_notify_update', p_table);
  execute format(
    'create trigger %I after delete on %s referencing old table as old_rows '
    'for each statement execute function private.notify_household()',
    v_name || '_notify_delete', p_table);
end
$$;

-- Enables RLS and creates the four membership policies of a table that members write directly:
-- every operation is limited to rows of the caller's households, and `with check` keeps inserted
-- and updated rows there. For migrations only; not granted to the API roles.
create function private.attach_household_policies(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select c.relname from pg_catalog.pg_class c where c.oid = p_table);
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy %I on %s for select to authenticated '
    'using (household_id in (select private.my_household_ids()))',
    v_name || '_select', p_table);
  execute format(
    'create policy %I on %s for insert to authenticated '
    'with check (household_id in (select private.my_household_ids()))',
    v_name || '_insert', p_table);
  execute format(
    'create policy %I on %s for update to authenticated '
    'using (household_id in (select private.my_household_ids())) '
    'with check (household_id in (select private.my_household_ids()))',
    v_name || '_update', p_table);
  execute format(
    'create policy %I on %s for delete to authenticated '
    'using (household_id in (select private.my_household_ids()))',
    v_name || '_delete', p_table);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Tombstone log
-- ---------------------------------------------------------------------------------------------

-- Written only by private.record_deletion(). Members read the tombstones of their households
-- (policy in the identity migration). No foreign key to households: it is a log, and tombstones
-- of a deleted household are harmless because nobody can read them any more.
-- replaced_by names the row that took the deleted row's place: merge_articles sets it on the
-- tombstone of a merged shopping item, so a queued store action on the old item reaches the item
-- of the target (spec 0007, E5). Same retention as the tombstone.
create table public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  table_name text not null,
  record_id text not null,
  deleted_at timestamptz not null default now(),
  replaced_by text
);

create index deleted_records_household_id_deleted_at_idx
  on public.deleted_records (household_id, deleted_at);
create index deleted_records_deleted_at_idx on public.deleted_records (deleted_at);
-- The store RPCs look a replaced item up by its id.
create index deleted_records_replaced_record_idx
  on public.deleted_records (household_id, table_name, record_id) where replaced_by is not null;

alter table public.deleted_records enable row level security;
grant select on public.deleted_records to authenticated;

-- Retention: devices whose cursor is older than 30 days do a full load instead (sync.md).
create function private.purge_deleted_records()
returns void
language sql
set search_path = ''
as $$
  delete from public.deleted_records where deleted_at < now() - interval '30 days';
$$;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('purge-deleted-records', '15 3 * * *', 'select private.purge_deleted_records()');
