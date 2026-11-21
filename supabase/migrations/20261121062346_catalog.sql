-- Baseline (ADR-0012) — catalog: areas, articles, stores; merge_areas; the households' default
-- store; the starter content of a new household.

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
-- Area names are unique per household, regardless of case (spec 0007, AC-052).
create unique index areas_household_id_name_idx on public.areas (household_id, lower(name));

grant select, delete on public.areas to authenticated;
grant insert (id, household_id, name, sort) on public.areas to authenticated;
grant update (name, sort) on public.areas to authenticated;
select private.attach_household_policies('public.areas');
select private.attach_sync_triggers('public.areas');

-- ---------------------------------------------------------------------------------------------
-- articles
-- ---------------------------------------------------------------------------------------------

-- name_key / synonym_keys are computed by the client with core `normalizeText`, so name
-- resolution is implemented once (sync.md, "Nachtrag Spec 0003"). synonym_keys[i] is the key of
-- synonyms[i]. A name or synonym belongs to one article of the household only (trigger below).
-- default_shopping_rule is the rule a new ingredient of the article starts with (null = not set:
-- core picks one, spec 0007 E7); needs_review marks an article created without a person's choice
-- ("Neu aus Rezepten").
-- Members do not delete articles directly: delete_article checks that the article is unused and
-- merge_articles removes the source of a merge (shopping_rpcs migration; spec 0007 E4).
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
  default_shopping_rule text
    constraint articles_default_shopping_rule_valid check (default_shopping_rule in ('count', 'recipeAmount', 'skip')),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_household_id_id_key unique (household_id, id),
  constraint articles_household_id_name_key_key unique (household_id, name_key),
  constraint articles_name_key_not_synonym check (not (name_key = any (synonym_keys))),
  -- Deleting an area keeps its articles; they lose the area.
  constraint articles_area_fkey foreign key (household_id, area_id)
    references public.areas (household_id, id) on delete set null (area_id)
);

create index articles_household_id_updated_at_idx on public.articles (household_id, updated_at);
create index articles_household_id_area_id_idx on public.articles (household_id, area_id);
create index articles_synonym_keys_idx on public.articles using gin (synonym_keys);

grant select on public.articles to authenticated;
grant insert (id, household_id, name, name_key, synonyms, synonym_keys, area_id, diet, is_pantry,
              default_shopping_rule, needs_review)
  on public.articles to authenticated;
grant update (name, name_key, synonyms, synonym_keys, area_id, diet, is_pantry, default_shopping_rule, needs_review)
  on public.articles to authenticated;
-- The delete policy stays (RLS on every operation); without the grant it is never reached by the
-- API roles.
select private.attach_household_policies('public.articles');
select private.attach_sync_triggers('public.articles');

-- Before insert, or update of name_key or synonym_keys, for each row (spec 0007, E6): no name or
-- synonym key of the article may be the name or a synonym key of another article of the household,
-- so a typed word resolves to exactly one article. An equal name key is left to the unique
-- constraint, so `on conflict (household_id, name_key)` keeps working. Serialised per household
-- with a transaction advisory lock, so two devices cannot add the same synonym at once.
-- Security invoker: it reads only rows the caller sees; for another household it finds nothing and
-- RLS refuses the row afterwards.
create function private.articles_keys_unique()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('articles:' || new.household_id::text, 0));
  if exists (
    select 1 from public.articles a
    where a.household_id = new.household_id
      and a.id <> new.id
      and (a.name_key = any (new.synonym_keys) or a.synonym_keys && (new.synonym_keys || new.name_key))
  ) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  return new;
end
$$;

create trigger articles_keys_unique before insert or update of name_key, synonym_keys on public.articles
  for each row execute function private.articles_keys_unique();

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
-- merge_areas
-- ---------------------------------------------------------------------------------------------

-- "Zusammenlegen" (spec 0007, AC-054): the articles of area p_source_id move to p_target_id of the
-- same household, the source leaves the walking order and the hidden areas of every store, and is
-- deleted. The target keeps its place and visibility in every store. Returns how many articles
-- moved. Security invoker: RLS decides, so an area of another household is not found.
-- Errors: not_member (42501, no user), invalid_value (22023, missing or equal ids),
-- area_not_found (P0002).
create function public.merge_areas(p_source_id uuid, p_target_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  -- Both rows locked in a fixed order, so two merges of the same areas cannot interleave.
  perform 1 from public.areas a where a.id in (p_source_id, p_target_id) order by a.id for update;
  select a.household_id into v_household_id from public.areas a where a.id = p_source_id;
  if v_household_id is null
     or not exists (select 1 from public.areas a where a.id = p_target_id and a.household_id = v_household_id) then
    raise exception 'area_not_found' using errcode = 'P0002';
  end if;

  update public.articles a set area_id = p_target_id
  where a.household_id = v_household_id and a.area_id = p_source_id;
  get diagnostics v_count = row_count;

  update public.stores s
  set area_order = pg_catalog.array_remove(s.area_order, p_source_id),
      hidden_area_ids = pg_catalog.array_remove(s.hidden_area_ids, p_source_id)
  where s.household_id = v_household_id
    and (p_source_id = any (s.area_order) or p_source_id = any (s.hidden_area_ids));

  delete from public.areas a where a.id = p_source_id;
  return v_count;
end
$$;

grant execute on function public.merge_areas(uuid, uuid) to authenticated;

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
