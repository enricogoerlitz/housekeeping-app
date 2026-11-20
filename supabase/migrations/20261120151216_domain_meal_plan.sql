-- Spec 0003, T3e — meal plan entries.
--
-- * date null = "vorgemerkt" (planned without a day).
-- * slot_id is the id of one of the household's meal_slots (JSON in households, so a trigger
--   checks it instead of a foreign key).
-- * kind decides which reference is required. recipe_id / restaurant_id use `on delete
--   restrict`: a planned or cooked meal must not silently vanish or lose what it was, and a
--   cleared reference would violate the kind check anyway. Deleting a recipe or restaurant that
--   is in the plan therefore needs the entries removed or changed first, in the same RPC.
-- * leftovers_of_entry_id is cleared when the source entry is deleted; leftovers keep their
--   recipe_id (the client copies it from the source), so they stay valid.
-- * cook_id is cleared when the person is removed; eater_ids are checked by trigger.

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date date,
  slot_id uuid not null,
  kind text not null
    constraint meal_plan_entries_kind_known check (kind in ('recipe', 'text', 'leftovers', 'restaurant')),
  recipe_id uuid,
  restaurant_id uuid,
  text text
    constraint meal_plan_entries_text_length check (char_length(text) <= 500),
  leftovers_of_entry_id uuid,
  eater_ids uuid[] not null default '{}'
    constraint meal_plan_entries_eater_ids_size check (cardinality(eater_ids) <= 50),
  guests integer not null default 0
    constraint meal_plan_entries_guests_valid check (guests between 0 and 100),
  portions integer not null default 0
    constraint meal_plan_entries_portions_valid check (portions between 0 and 1000),
  variants jsonb not null default '[]'
    constraint meal_plan_entries_variants_valid check (
      jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 20
      and octet_length(variants::text) <= 4000),
  cook_id uuid,
  sort integer not null default 0,
  not_cooked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_plan_entries_household_id_id_key unique (household_id, id),
  constraint meal_plan_entries_kind_complete check (
    case kind
      when 'recipe' then recipe_id is not null
      when 'restaurant' then restaurant_id is not null
      when 'text' then text is not null and btrim(text) <> ''
      when 'leftovers' then recipe_id is not null or leftovers_of_entry_id is not null
      else false
    end),
  constraint meal_plan_entries_recipe_fkey foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete restrict,
  constraint meal_plan_entries_restaurant_fkey foreign key (household_id, restaurant_id)
    references public.restaurants (household_id, id) on delete restrict,
  constraint meal_plan_entries_leftovers_fkey foreign key (household_id, leftovers_of_entry_id)
    references public.meal_plan_entries (household_id, id) on delete set null (leftovers_of_entry_id),
  constraint meal_plan_entries_cook_fkey foreign key (household_id, cook_id)
    references public.household_members (household_id, profile_id) on delete set null (cook_id)
);

create index meal_plan_entries_household_id_updated_at_idx on public.meal_plan_entries (household_id, updated_at);
create index meal_plan_entries_household_id_recipe_id_idx on public.meal_plan_entries (household_id, recipe_id);
create index meal_plan_entries_household_id_restaurant_id_idx on public.meal_plan_entries (household_id, restaurant_id);
create index meal_plan_entries_household_id_leftovers_idx
  on public.meal_plan_entries (household_id, leftovers_of_entry_id);
create index meal_plan_entries_household_id_cook_id_idx on public.meal_plan_entries (household_id, cook_id);

-- Before insert or update: a new or changed slot_id must be one of the household's meal slots;
-- people newly added to eater_ids must be members. Unchanged values are not re-checked, so a
-- removed slot or member does not block other edits of old entries. Security invoker: reads the
-- household and its members under the caller's RLS.
create function private.meal_plan_entries_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.slot_id is distinct from old.slot_id then
    if not exists (
      select 1
      from public.households h, jsonb_array_elements(h.meal_slots) s
      where h.id = new.household_id and (s ->> 'id')::uuid = new.slot_id
    ) then
      raise exception 'invalid_slot' using errcode = '23503';
    end if;
  end if;

  perform private.assert_members(
    new.household_id,
    array(
      select unnest(new.eater_ids)
      except
      select unnest(case when tg_op = 'UPDATE' then old.eater_ids else '{}'::uuid[] end)
    )
  );
  return new;
end
$$;

create trigger meal_plan_entries_check_refs before insert or update of slot_id, eater_ids
  on public.meal_plan_entries
  for each row execute function private.meal_plan_entries_check_refs();

grant select, delete on public.meal_plan_entries to authenticated;
grant insert (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, text, leftovers_of_entry_id,
              eater_ids, guests, portions, variants, cook_id, sort, not_cooked)
  on public.meal_plan_entries to authenticated;
grant update (date, slot_id, kind, recipe_id, restaurant_id, text, leftovers_of_entry_id,
              eater_ids, guests, portions, variants, cook_id, sort, not_cooked)
  on public.meal_plan_entries to authenticated;
select private.attach_household_policies('public.meal_plan_entries');
select private.attach_sync_triggers('public.meal_plan_entries');
