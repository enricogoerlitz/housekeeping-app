-- Baseline (ADR-0012) — catalog: areas, articles, stores; the households' default store; the
-- starter content of a new household.

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
-- households: default store
-- ---------------------------------------------------------------------------------------------

-- The composite key keeps it inside the household; a deleted default store is cleared.
-- Deferrable, so a future RPC can swap rows inside one transaction; checked per statement by
-- default. The households primary key serves the lookups of the key.
alter table public.households
  add constraint households_default_store_fkey foreign key (id, default_store_id)
    references public.stores (household_id, id) on delete set null (default_store_id)
    deferrable initially immediate;

-- ---------------------------------------------------------------------------------------------
-- Starter content
-- ---------------------------------------------------------------------------------------------

-- Validates the starter content the client sends with create_household and creates it. Format:
--   {"areas":    [{"key": text, "name": text}, …],                       order = sort
--    "articles": [{"name", "name_key", "synonyms", "synonym_keys", "area" (area key), "diet",
--                  "is_pantry"}, …]}
-- Limits: ≤ 50 areas, ≤ 2000 articles, ≤ 512 KiB. Creates the starter areas (sort = position),
-- and the starter articles (area by the area's key, keys as sent by the client); the household's
-- shopping list starts empty and needs no row. Any invalid value — unknown area key, duplicate key
-- or name_key, a value a table check rejects — is reported as invalid_starter and nothing is
-- created.
create function private.apply_starter(p_household_id uuid, p_starter jsonb)
returns void
language plpgsql
set search_path = ''
as $$
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
end
$$;
