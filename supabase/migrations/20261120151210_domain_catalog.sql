-- Spec 0003, T3a — catalog: areas, articles, stores, shopping lists.
--
-- * Shared helpers for every household-scoped domain table (this and the following T3
--   migrations): sync triggers, the four membership policies, the member check.
-- * The households' default list / default store get their composite foreign keys.
-- * create_household now also creates the starter areas and articles and the default list.
--
-- Conventions of every domain table (see the T1 foundation and `docs/architecture/sync.md`):
-- id (client may supply it), household_id with `on delete cascade` from households,
-- server-set created_at / updated_at, unique (household_id, id) as the target of composite
-- foreign keys, index (household_id, updated_at) for the delta sync, RLS with one policy per
-- operation, explicit column-level grants to authenticated (never id, household_id, created_at,
-- updated_at in an update grant), nothing for anon.

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

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

-- Raises `invalid_member` (23503, like a foreign key) unless every id is a member of the
-- household. Security invoker on purpose: under RLS a caller sees only the memberships of her own
-- households, so the check cannot be used to probe another household's members. Called by the
-- member-check triggers of tables whose person references are arrays or JSON (single columns use
-- composite foreign keys to household_members instead).
create function private.assert_members(p_household_id uuid, p_profile_ids uuid[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(p_profile_ids) as p (id)
    where p.id is null
       or not exists (
         select 1 from public.household_members m
         where m.household_id = p_household_id and m.profile_id = p.id
       )
  ) then
    raise exception 'invalid_member' using errcode = '23503';
  end if;
end
$$;

grant execute on function private.assert_members(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- areas
-- ---------------------------------------------------------------------------------------------

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint areas_name_valid check (btrim(name) <> '' and char_length(name) <= 80),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_household_id_id_key unique (household_id, id)
);

create index areas_household_id_updated_at_idx on public.areas (household_id, updated_at);

grant select, delete on public.areas to authenticated;
grant insert (id, household_id, name, sort) on public.areas to authenticated;
grant update (name, sort) on public.areas to authenticated;
select private.attach_household_policies('public.areas');
select private.attach_sync_triggers('public.areas');

-- ---------------------------------------------------------------------------------------------
-- articles
-- ---------------------------------------------------------------------------------------------

-- name_key / synonym_keys are computed by the client with core `normalizeText`, so name
-- resolution is implemented once (sync.md, "Nachtrag Spec 0003").
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint articles_name_valid check (btrim(name) <> '' and char_length(name) <= 120),
  name_key text not null
    constraint articles_name_key_valid check (name_key <> '' and char_length(name_key) <= 120),
  synonyms text[] not null default '{}'
    constraint articles_synonyms_size check (
      cardinality(synonyms) <= 30 and char_length(array_to_string(synonyms, '')) <= 2000),
  synonym_keys text[] not null default '{}'
    constraint articles_synonym_keys_size check (
      cardinality(synonym_keys) <= 30 and char_length(array_to_string(synonym_keys, '')) <= 2000),
  area_id uuid,
  diet text not null default 'unknown'
    constraint articles_diet_valid check (diet in ('vegan', 'vegetarian', 'fish', 'meat', 'unknown')),
  is_pantry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_household_id_id_key unique (household_id, id),
  constraint articles_household_id_name_key_key unique (household_id, name_key),
  -- Deleting an area keeps its articles; they lose the area.
  constraint articles_area_fkey foreign key (household_id, area_id)
    references public.areas (household_id, id) on delete set null (area_id)
);

create index articles_household_id_updated_at_idx on public.articles (household_id, updated_at);
create index articles_household_id_area_id_idx on public.articles (household_id, area_id);

grant select, delete on public.articles to authenticated;
grant insert (id, household_id, name, name_key, synonyms, synonym_keys, area_id, diet, is_pantry)
  on public.articles to authenticated;
grant update (name, name_key, synonyms, synonym_keys, area_id, diet, is_pantry)
  on public.articles to authenticated;
select private.attach_household_policies('public.articles');
select private.attach_sync_triggers('public.articles');

-- ---------------------------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------------------------

-- area_order / hidden_area_ids hold area ids without a foreign key (arrays cannot have one);
-- an id of a deleted area is ignored by the client (core orders unknown areas last).
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint stores_name_valid check (btrim(name) <> '' and char_length(name) <= 80),
  area_order uuid[] not null default '{}'
    constraint stores_area_order_size check (cardinality(area_order) <= 100),
  hidden_area_ids uuid[] not null default '{}'
    constraint stores_hidden_area_ids_size check (cardinality(hidden_area_ids) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_household_id_id_key unique (household_id, id)
);

create index stores_household_id_updated_at_idx on public.stores (household_id, updated_at);

grant select, delete on public.stores to authenticated;
grant insert (id, household_id, name, area_order, hidden_area_ids) on public.stores to authenticated;
grant update (name, area_order, hidden_area_ids) on public.stores to authenticated;
select private.attach_household_policies('public.stores');
select private.attach_sync_triggers('public.stores');

-- ---------------------------------------------------------------------------------------------
-- shopping_lists
-- ---------------------------------------------------------------------------------------------

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
    constraint shopping_lists_name_valid check (btrim(name) <> '' and char_length(name) <= 80),
  is_default boolean not null default false,
  store_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_lists_household_id_id_key unique (household_id, id),
  -- Deleting a store keeps its lists; they lose the store.
  constraint shopping_lists_store_fkey foreign key (household_id, store_id)
    references public.stores (household_id, id) on delete set null (store_id)
);

create index shopping_lists_household_id_updated_at_idx on public.shopping_lists (household_id, updated_at);
create index shopping_lists_household_id_store_id_idx on public.shopping_lists (household_id, store_id);
-- At most one default list per household.
create unique index shopping_lists_one_default_idx on public.shopping_lists (household_id) where is_default;

grant select, delete on public.shopping_lists to authenticated;
grant insert (id, household_id, name, is_default, store_id) on public.shopping_lists to authenticated;
grant update (name, is_default, store_id) on public.shopping_lists to authenticated;
select private.attach_household_policies('public.shopping_lists');
select private.attach_sync_triggers('public.shopping_lists');

-- ---------------------------------------------------------------------------------------------
-- households: default list and store
-- ---------------------------------------------------------------------------------------------

-- Composite keys keep both inside the household. The default list cannot be deleted while it is
-- the default (no action); a deleted default store is cleared. Deferrable, so a future RPC can
-- swap rows inside one transaction; checked per statement by default. The households primary
-- key serves the lookups of both keys.
alter table public.households
  add constraint households_default_list_fkey foreign key (id, default_list_id)
    references public.shopping_lists (household_id, id) deferrable initially immediate,
  add constraint households_default_store_fkey foreign key (id, default_store_id)
    references public.stores (household_id, id) on delete set null (default_store_id)
    deferrable initially immediate;

-- ---------------------------------------------------------------------------------------------
-- create_household: starter content
-- ---------------------------------------------------------------------------------------------

-- Replaces the T2 version (same format and limits): validates the starter, then creates the
-- starter areas (sort = position), the starter articles (area by the area's key, keys as sent by
-- the client) and the default list "Standardliste" as households.default_list_id. Any invalid
-- value — unknown area key, duplicate key or name_key, a value a table check rejects — is
-- reported as invalid_starter and nothing is created.
create or replace function private.apply_starter(p_household_id uuid, p_starter jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_list_id uuid;
begin
  if p_starter is null
     or jsonb_typeof(p_starter) <> 'object'
     or jsonb_typeof(p_starter -> 'areas') is distinct from 'array'
     or jsonb_typeof(p_starter -> 'articles') is distinct from 'array' then
    raise exception 'invalid_starter' using errcode = '22023';
  end if;
  if jsonb_array_length(p_starter -> 'areas') > 50
     or jsonb_array_length(p_starter -> 'articles') > 2000
     or octet_length(p_starter::text) > 524288 then
    raise exception 'invalid_starter' using errcode = '22023';
  end if;
  if jsonb_path_exists(p_starter, '$.areas[*] ? (!(@.key.type() == "string" && @.name.type() == "string"))')
     or jsonb_path_exists(p_starter, '$.articles[*] ? (!(@.name.type() == "string" && @.name_key.type() == "string"))')
     or (select count(*) <> count(distinct a ->> 'key') from jsonb_array_elements(p_starter -> 'areas') a)
     or exists (
       select 1 from jsonb_array_elements(p_starter -> 'articles') x
       where x ->> 'area' is not null
         and not exists (
           select 1 from jsonb_array_elements(p_starter -> 'areas') a where a ->> 'key' = x ->> 'area'
         )
     ) then
    raise exception 'invalid_starter' using errcode = '22023';
  end if;

  begin
    with starter_areas as materialized (
      select gen_random_uuid() as id, a.value ->> 'key' as key, a.value ->> 'name' as name,
             (a.ord - 1)::integer as sort
      from jsonb_array_elements(p_starter -> 'areas') with ordinality as a (value, ord)
    ), inserted_areas as (
      insert into public.areas (id, household_id, name, sort)
      select s.id, p_household_id, s.name, s.sort from starter_areas s
    )
    insert into public.articles (household_id, name, name_key, synonyms, synonym_keys, area_id, diet, is_pantry)
    select p_household_id,
           x ->> 'name',
           x ->> 'name_key',
           array(select jsonb_array_elements_text(coalesce(x -> 'synonyms', '[]'))),
           array(select jsonb_array_elements_text(coalesce(x -> 'synonym_keys', '[]'))),
           s.id,
           coalesce(x ->> 'diet', 'unknown'),
           coalesce((x ->> 'is_pantry')::boolean, false)
    from jsonb_array_elements(p_starter -> 'articles') x
    left join starter_areas s on s.key = x ->> 'area';
  exception
    when check_violation or unique_violation or not_null_violation or foreign_key_violation
      or invalid_parameter_value or invalid_text_representation then
      raise exception 'invalid_starter' using errcode = '22023';
  end;

  insert into public.shopping_lists (household_id, name, is_default)
  values (p_household_id, 'Standardliste', true)
  returning id into v_list_id;

  update public.households set default_list_id = v_list_id where id = p_household_id;
end
$$;
