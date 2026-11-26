-- Spec 0037: the recipe page has one edit mode (REQ-001) and a collection has a time (REQ-005).
--
-- 1. recipes_kind_fields allows total_minutes on a collection (Entscheidung 2). Expand only: every
--    row that satisfied the old check satisfies the new one; nothing else of the check changes.
-- 2. save_recipe_page saves the whole page in one transaction (Entscheidung 1): the changed
--    columns of the recipe, its collection rows, new articles with their default rule and the
--    plan entries of a removed variant, as apply_changes ops (the same allowlist, RLS, grants and
--    triggers). It locks the recipe first and answers whether the row changed since the caller
--    opened the edit mode (p_seen_updated_at), so the page can say so (AC-006); the change is
--    applied either way: last write wins per column. Security invoker.

alter table public.recipes drop constraint recipes_kind_fields;
alter table public.recipes add constraint recipes_kind_fields check (
  case kind
    when 'recipe' then course is not null
    when 'collection' then
      course is null and cuisine is null and tags = '{}' and variants = '[]'
      and steps = '[]' and lead_time is null
      and not jsonb_path_exists(ingredients, '$[*] ? (@.variantId != null)')
    else true
  end);

-- Errors: not_member (42501), row_not_found (P0002) when the recipe is not in the household (or
-- not visible), invalid_change (22023) for an op outside the page (another table, another
-- recipe), plus every error of apply_changes. Answer: {"changed_meanwhile": bool,
-- "updated_at": timestamptz} with the recipe's updated_at after the save.
create function public.save_recipe_page(
  p_household_id uuid,
  p_recipe_id uuid,
  p_seen_updated_at timestamptz,
  p_ops jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
  v_after timestamptz;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  -- Only what the page writes: its recipe, new articles and their rule, its collection rows and
  -- the plan entries a removed variant moves.
  -- Only row ops: domain ops (contributions, chores, packing) are no part of the page.
  if exists (
    select 1 from jsonb_array_elements(p_ops) o
    where jsonb_typeof(o) is distinct from 'object'
       or jsonb_typeof(o -> 'table') is distinct from 'string'
       or (o ->> 'kind') is null
       or (o ->> 'kind') not in ('insert', 'patch', 'delete')
       or (o ->> 'table') not in ('recipes', 'articles', 'collection_recipes', 'meal_plan_entries')
       or ((o ->> 'table') = 'articles' and (o ->> 'kind') = 'delete')
       or ((o ->> 'table') = 'recipes'
           and ((o ->> 'kind') is distinct from 'patch' or (o ->> 'id') is distinct from p_recipe_id::text))
  ) then
    raise exception 'invalid_change' using errcode = '22023';
  end if;

  select r.updated_at into v_updated_at
  from public.recipes r
  where r.id = p_recipe_id and r.household_id = p_household_id
  for update;
  if not found then
    raise exception 'row_not_found' using errcode = 'P0002';
  end if;

  perform public.apply_changes(p_household_id, p_ops);

  select r.updated_at into v_after from public.recipes r where r.id = p_recipe_id;
  return jsonb_build_object(
    'changed_meanwhile', p_seen_updated_at is not null and v_updated_at > p_seen_updated_at,
    'updated_at', v_after);
end
$$;

grant execute on function public.save_recipe_page(uuid, uuid, timestamptz, jsonb) to authenticated;
