-- Spec 0004, REQ-001 — the meal slot "Vormittag".
--
-- * Every household without a slot named Vormittag gets one in front of its slots (AC-003): a
--   new id, sort = smallest existing sort - 1 (0 without slots). The existing slots keep id, name,
--   sort and order, so planned entries (meal_plan_entries.slot_id) stay where they are.
--   Idempotent: a household that has Vormittag is skipped. A household at the limit of 10 slots
--   (households_meal_slots_valid) is skipped instead of failing the migration.
-- * create_household starts new households with Vormittag, Mittag, Abend (AC-001).

-- Adds Vormittag to every household that lacks it; returns the number of households changed.
-- A function so the backfill itself is tested (supabase/tests/meal_slots.test.sql). For
-- migrations only; not granted to the API roles.
create function private.add_vormittag_slot()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.households h
  set meal_slots = jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'name', 'Vormittag',
        'sort', coalesce((select min((s ->> 'sort')::numeric) from jsonb_array_elements(h.meal_slots) s) - 1, 0)))
      || h.meal_slots
  where jsonb_array_length(h.meal_slots) < 10
    and not exists (select 1 from jsonb_array_elements(h.meal_slots) s where s ->> 'name' = 'Vormittag');
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

select private.add_vormittag_slot();

-- Unchanged except the three meal slots.
create or replace function private.create_household(p_name text, p_starter jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.households (name, meal_slots)
  values (v_name, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Vormittag', 'sort', 0),
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Mittag', 'sort', 1),
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Abend', 'sort', 2)
  ))
  returning id into v_household_id;

  insert into public.household_members (household_id, profile_id) values (v_household_id, v_uid);

  perform private.apply_starter(v_household_id, p_starter);
  return v_household_id;
end
$$;
