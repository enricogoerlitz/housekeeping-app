-- Baseline (ADR-0012) — Reisetaschen and Packlisten (spec 0012).
--
-- * packing_bags: the household's Reisetaschen (templates), optional "für" a member.
-- * packing_bag_items: the Packstücke of a Reisetasche, with a fixed or a "je Tag" quantity.
-- * packing_list_bags: one row per bag attached to an absence (Tasche der Packliste): origin
--   bag (cleared when the template is deleted), name and member as a copy, order.
-- * packing_items: the Packstücke of a Packliste. quantity is computed by the server for
--   "je Tag" items (per_day × days of the absence, at most 9999), on insert and when the duration
--   changes or the bag moves to another absence; packed items keep their quantity (AC-037).
-- * The packed state (packed, packed_at, packed_by, pack_seq) has no client grant: it changes only
--   through set_packing_items_packed ("Abhaken gewinnt" via pack_seq, ADR-0013) and comes back
--   with "Rückgängig" through the domain op restore_packing_items of apply_changes. A trigger
--   forces a direct insert by the API role to the open state as a second line of defence.
-- * Deleting an absence deletes its packing list; deleting a packing bag leaves packing lists
--   untouched; removing a bag from the packing list deletes its packing items. Every cascaded row
--   leaves a tombstone (record_deletion).
-- Depends on absences and household_members only; lies before apply_changes and sync_pull.

-- ---------------------------------------------------------------------------------------------
-- packing_bags
-- ---------------------------------------------------------------------------------------------

-- The name is unique per household, case-insensitively ("strand" next to "Strand", AC-007).
-- member_id null = for everybody; cleared when the person leaves the household.
create table public.packing_bags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint packing_bags_name_valid check (char_length(name) between 1 and 60 and name = btrim(name)),
  member_id uuid,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_bags_household_id_id_key unique (household_id, id),
  constraint packing_bags_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete set null (member_id)
);

create unique index packing_bags_household_id_name_idx on public.packing_bags (household_id, lower(name));
create index packing_bags_household_id_updated_at_idx on public.packing_bags (household_id, updated_at);
create index packing_bags_household_id_member_id_idx on public.packing_bags (household_id, member_id);

grant select, delete on public.packing_bags to authenticated;
grant insert (id, household_id, name, member_id, sort) on public.packing_bags to authenticated;
grant update (name, member_id, sort) on public.packing_bags to authenticated;
select private.attach_household_policies('public.packing_bags');
select private.attach_sync_triggers('public.packing_bags');

-- ---------------------------------------------------------------------------------------------
-- packing_bag_items
-- ---------------------------------------------------------------------------------------------

-- quantity null = no quantity ("Sonnenbrille"); per_day = the quantity is per day of the absence.
create table public.packing_bag_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  bag_id uuid not null,
  name text not null
    constraint packing_bag_items_name_valid check (char_length(name) between 1 and 120 and name = btrim(name)),
  quantity smallint
    constraint packing_bag_items_quantity_valid check (quantity between 1 and 99),
  per_day boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_bag_items_household_id_id_key unique (household_id, id),
  constraint packing_bag_items_per_day_quantity check (not per_day or quantity is not null),
  constraint packing_bag_items_bag_fkey foreign key (household_id, bag_id)
    references public.packing_bags (household_id, id) on delete cascade
);

create index packing_bag_items_household_id_updated_at_idx on public.packing_bag_items (household_id, updated_at);
create index packing_bag_items_household_id_bag_id_idx on public.packing_bag_items (household_id, bag_id);

grant select, delete on public.packing_bag_items to authenticated;
grant insert (id, household_id, bag_id, name, quantity, per_day, sort) on public.packing_bag_items to authenticated;
grant update (name, quantity, per_day, sort) on public.packing_bag_items to authenticated;
select private.attach_household_policies('public.packing_bag_items');
select private.attach_sync_triggers('public.packing_bag_items');

-- ---------------------------------------------------------------------------------------------
-- packing_list_bags
-- ---------------------------------------------------------------------------------------------

-- A bag of the packing list of one absence. bag_id is the Reisetasche it was copied from (each at
-- most once per absence) and is cleared when that bag is deleted; name and member_id are copies.
-- absence_id may change: when editing an absence merges rows, its bags move along (plan,
-- decision 8), and the "je Tag" quantities follow the new duration.
create table public.packing_list_bags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  absence_id uuid not null,
  bag_id uuid,
  name text not null
    constraint packing_list_bags_name_valid check (char_length(name) between 1 and 60 and name = btrim(name)),
  member_id uuid,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_list_bags_household_id_id_key unique (household_id, id),
  constraint packing_list_bags_absence_fkey foreign key (household_id, absence_id)
    references public.absences (household_id, id) on delete cascade,
  constraint packing_list_bags_bag_fkey foreign key (household_id, bag_id)
    references public.packing_bags (household_id, id) on delete set null (bag_id),
  constraint packing_list_bags_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete set null (member_id)
);

create unique index packing_list_bags_household_id_absence_id_bag_id_idx
  on public.packing_list_bags (household_id, absence_id, bag_id) where bag_id is not null;
create index packing_list_bags_household_id_updated_at_idx on public.packing_list_bags (household_id, updated_at);
create index packing_list_bags_household_id_absence_id_idx on public.packing_list_bags (household_id, absence_id);
create index packing_list_bags_household_id_bag_id_idx on public.packing_list_bags (household_id, bag_id);
create index packing_list_bags_household_id_member_id_idx on public.packing_list_bags (household_id, member_id);

grant select, delete on public.packing_list_bags to authenticated;
grant insert (id, household_id, absence_id, bag_id, name, member_id, sort) on public.packing_list_bags to authenticated;
grant update (absence_id, bag_id, sort) on public.packing_list_bags to authenticated;
select private.attach_household_policies('public.packing_list_bags');
select private.attach_sync_triggers('public.packing_list_bags');

-- ---------------------------------------------------------------------------------------------
-- packing_items
-- ---------------------------------------------------------------------------------------------

-- per_day null = a fixed quantity (or none); per_day set = quantity is computed by the server.
-- Members insert and delete packing items; there is no update grant (renaming and changing the
-- quantity in a packing list are non-goals, packing goes through set_packing_items_packed).
create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_bag_id uuid not null,
  name text not null
    constraint packing_items_name_valid check (char_length(name) between 1 and 120 and name = btrim(name)),
  quantity integer
    constraint packing_items_quantity_valid check (quantity between 1 and 9999),
  per_day smallint
    constraint packing_items_per_day_valid check (per_day between 1 and 99),
  packed boolean not null default false,
  packed_at timestamptz,
  packed_by uuid,
  pack_seq integer not null default 0
    -- 1000000 changes of one item are far beyond real use; the RPC raises 23514 past it.
    constraint packing_items_pack_seq_valid check (pack_seq between 0 and 1000000),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_items_household_id_id_key unique (household_id, id),
  constraint packing_items_per_day_quantity check (per_day is null or quantity is not null),
  constraint packing_items_list_bag_fkey foreign key (household_id, list_bag_id)
    references public.packing_list_bags (household_id, id) on delete cascade,
  constraint packing_items_packed_by_fkey foreign key (household_id, packed_by)
    references public.household_members (household_id, profile_id) on delete set null (packed_by)
);

create index packing_items_household_id_updated_at_idx on public.packing_items (household_id, updated_at);
create index packing_items_household_id_list_bag_id_idx on public.packing_items (household_id, list_bag_id);
create index packing_items_household_id_packed_by_idx on public.packing_items (household_id, packed_by);

-- Before insert: an item inserted directly by the API role starts open; a "je Tag" item gets its
-- quantity from the absence of its bag, whatever the device sent. The RPCs (security definer, run
-- as the owner: restore_packing_items) and the seed keep the packed state they write. Security
-- invoker: the bag is read under the caller's RLS; a bag the caller cannot see leaves the row to
-- fail on RLS or the foreign key. "Je Tag" = least(per_day × (to_on − from_on + 1), 9999).
create function private.packing_items_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
begin
  if current_user = 'authenticated' then
    new.packed := false;
    new.packed_at := null;
    new.packed_by := null;
    new.pack_seq := 0;
  end if;
  if new.per_day is not null then
    select a.to_on - a.from_on + 1 into v_days
    from public.packing_list_bags b
    join public.absences a on a.household_id = b.household_id and a.id = b.absence_id
    where b.household_id = new.household_id and b.id = new.list_bag_id;
    if v_days is not null then
      new.quantity := least(new.per_day * v_days, 9999);
    end if;
  end if;
  return new;
end
$$;

create trigger packing_items_before_insert before insert on public.packing_items
  for each row execute function private.packing_items_before_insert();

grant select, delete on public.packing_items to authenticated;
grant insert (id, household_id, list_bag_id, name, quantity, per_day, sort) on public.packing_items to authenticated;
select private.attach_household_policies('public.packing_items');
select private.attach_sync_triggers('public.packing_items');

-- ---------------------------------------------------------------------------------------------
-- "Je Tag" after a change of the duration (AC-037)
-- ---------------------------------------------------------------------------------------------

-- Recalculates the open "je Tag" packing items of one absence from its current duration; packed
-- items keep their quantity. Only rows whose quantity changes are written (and get a new
-- updated_at). Called only from the triggers below, after an update RLS has already allowed, so
-- it touches only the packing list of that absence in its household. Not granted to the API
-- roles; the trigger functions run it as the owner.
create function private.recalc_packing_quantities(p_household_id uuid, p_absence_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.packing_items i
  set quantity = least(i.per_day * (a.to_on - a.from_on + 1), 9999)
  from public.packing_list_bags b
  join public.absences a on a.household_id = b.household_id and a.id = b.absence_id
  where b.household_id = p_household_id and b.absence_id = p_absence_id
    and i.household_id = b.household_id and i.list_bag_id = b.id
    and i.per_day is not null and not i.packed
    and i.quantity is distinct from least(i.per_day * (a.to_on - a.from_on + 1), 9999);
$$;

revoke execute on function private.recalc_packing_quantities(uuid, uuid) from public, anon, authenticated;

-- After from_on or to_on of an absence changed. Security definer: members have no update grant on
-- packing_items, and a trigger function cannot be called directly.
create function private.absences_recalc_packing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_packing_quantities(new.household_id, new.id);
  return null;
end
$$;

create trigger absences_recalc_packing after update of from_on, to_on on public.absences
  for each row when (old.from_on is distinct from new.from_on or old.to_on is distinct from new.to_on)
  execute function private.absences_recalc_packing();

-- After a bag of a packing list moved to another absence.
create function private.packing_list_bags_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_packing_quantities(new.household_id, new.absence_id);
  return null;
end
$$;

create trigger packing_list_bags_recalc after update of absence_id on public.packing_list_bags
  for each row when (old.absence_id is distinct from new.absence_id)
  execute function private.packing_list_bags_recalc();

-- ---------------------------------------------------------------------------------------------
-- set_packing_items_packed (ADR-0013)
-- ---------------------------------------------------------------------------------------------

-- Packs and unpacks packing items of p_household_id in one transaction: one call per run of
-- packing entries of the store queue ("Alles einpacken", "Für die Rückreise zurücksetzen").
-- p_changes: 1 to 200 objects {item_id, packed, seen_pack_seq}, exactly these keys, packed a
-- boolean, seen_pack_seq an integer 0…1000000, no item twice. Rule table per item (ADR-0013):
--   not packed + pack                       → packed (pack_seq + 1, packed_at now(), packed_by caller)
--   packed     + pack                       → unchanged
--   packed     + unpack, pack_seq = seen    → not packed (pack_seq + 1, packed_at/packed_by cleared)
--   packed     + unpack, pack_seq ≠ seen    → stays packed ("Abhaken gewinnt")
--   not packed + unpack                     → unchanged
--   item gone or in another household       → skipped, no error, not in the result
-- The found items are locked in the order of their id, so two calls on overlapping items cannot
-- deadlock. Returns [{item_id, packed, pack_seq}] of the found items, ordered by id.
-- Errors: not_authenticated / not_member (42501), invalid_change / too_many_changes (22023).
create function private.set_packing_items_packed(p_household_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_change jsonb;
  v_seen numeric;
  v_by_id jsonb;
  v_item public.packing_items;
  v_result jsonb := '[]';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 200 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_change in select c.value from jsonb_array_elements(p_changes) c loop
    if jsonb_typeof(v_change) is distinct from 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_change) k)
            is distinct from array['item_id', 'packed', 'seen_pack_seq']
       or jsonb_typeof(v_change -> 'item_id') is distinct from 'string'
       or (v_change ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_change -> 'packed') is distinct from 'boolean'
       or jsonb_typeof(v_change -> 'seen_pack_seq') is distinct from 'number' then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    v_seen := (v_change ->> 'seen_pack_seq')::numeric;
    if v_seen < 0 or v_seen > 1000000 or v_seen <> trunc(v_seen) then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
  end loop;

  select jsonb_object_agg(lower(c ->> 'item_id'), c) into v_by_id from jsonb_array_elements(p_changes) c;
  if (select count(*) from jsonb_object_keys(v_by_id)) <> jsonb_array_length(p_changes) then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  for v_item in
    select i.* from public.packing_items i
    where i.household_id = p_household_id
      and i.id in (select k::uuid from jsonb_object_keys(v_by_id) k)
    order by i.id
    for update
  loop
    v_change := v_by_id -> v_item.id::text;
    if (v_change -> 'packed')::boolean then
      if not v_item.packed then
        update public.packing_items i
        set packed = true, packed_at = now(), packed_by = v_uid, pack_seq = i.pack_seq + 1
        where i.id = v_item.id
        returning i.* into v_item;
      end if;
    elsif v_item.packed and v_item.pack_seq = (v_change ->> 'seen_pack_seq')::integer then
      update public.packing_items i
      set packed = false, packed_at = null, packed_by = null, pack_seq = i.pack_seq + 1
      where i.id = v_item.id
      returning i.* into v_item;
    end if;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('item_id', v_item.id, 'packed', v_item.packed, 'pack_seq', v_item.pack_seq));
  end loop;

  return v_result;
end
$$;

grant execute on function private.set_packing_items_packed(uuid, jsonb) to authenticated;

create function public.set_packing_items_packed(p_household_id uuid, p_changes jsonb)
returns jsonb
language sql
set search_path = ''
as $$ select private.set_packing_items_packed($1, $2) $$;

grant execute on function public.set_packing_items_packed(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- restore_packing_items (domain op of apply_changes)
-- ---------------------------------------------------------------------------------------------

-- "Rückgängig" after removing packing items or a bag of the packing list (AC-034, AC-035): puts
-- the items back with their packed state, which members cannot write themselves. Called only by
-- apply_changes ({"kind": "restore_packing_items", "items": [...]}), in the same transaction as
-- the insert of the bag. p_items: 1 to 200 objects with the keys id, list_bag_id, name (required)
-- and quantity, per_day, sort, packed, packed_at, packed_by, pack_seq (optional), no other keys.
-- Plain insert into p_household_id: an existing id fails with 23505, a bag or a packed_by outside
-- the household with 23503 (composite foreign keys). The values are bounded like
-- restore_cleared_items: packed_at at most now() (missing: now()), packed_at and packed_by only on
-- a packed item, pack_seq clamped to 0…999000; a "je Tag" quantity is recalculated by the insert
-- trigger. Returns {"restored": n}.
-- Errors: not_authenticated / not_member (42501), invalid_change / too_many_changes (22023), plus
-- whatever a constraint raises.
create function private.restore_packing_items(p_household_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_keys constant text[] := array['id', 'list_bag_id', 'name', 'quantity', 'per_day', 'sort', 'packed', 'packed_at',
                                  'packed_by', 'pack_seq'];
  v_element jsonb;
  v_item public.packing_items;
  v_packed boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_element in select e.value from jsonb_array_elements(p_items) e loop
    if jsonb_typeof(v_element) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_element) k where k <> all (c_keys)) then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    begin
      v_item := jsonb_populate_record(null::public.packing_items, v_element);
    exception when data_exception then
      raise exception 'invalid_change' using errcode = '22023';
    end;
    if v_item.id is null or v_item.list_bag_id is null or v_item.name is null then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    v_packed := coalesce(v_item.packed, false);

    insert into public.packing_items
      (id, household_id, list_bag_id, name, quantity, per_day, sort, packed, packed_at, packed_by, pack_seq)
    values (
      v_item.id, p_household_id, v_item.list_bag_id, v_item.name, v_item.quantity, v_item.per_day,
      coalesce(v_item.sort, 0), v_packed,
      case when v_packed then least(coalesce(v_item.packed_at, now()), now()) end,
      case when v_packed then v_item.packed_by end,
      least(greatest(coalesce(v_item.pack_seq, 0), 0), 999000));
  end loop;

  return jsonb_build_object('restored', jsonb_array_length(p_items));
end
$$;

grant execute on function private.restore_packing_items(uuid, jsonb) to authenticated;
