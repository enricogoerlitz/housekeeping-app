-- Spec 0023, Decision 15: deleting a recipe or collection can take the ingredients of the entries
-- that go off the shopping list in the same transaction ("Zutaten auch von der Liste nehmen", the
-- choice of spec 0021 REQ-015). delete_recipe gets p_with_list (default false, so a call without
-- it works as before); the contributions go through spec 0021's replace_entry_contributions and
-- are kept in the deletion snapshot ('list'), so restore_recipe brings them back with
-- restore_cleared_items. Everything else of both functions is unchanged.

drop function public.delete_recipe(uuid, date);
drop function private.delete_recipe(uuid, date);

create function private.delete_recipe(p_recipe_id uuid, p_today date, p_with_list boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := private.my_recipe_household_id(p_recipe_id);
  v_recipe public.recipes;
  v_converted jsonb;
  v_removed_ids uuid[];
  v_removed jsonb;
  v_collection_recipes jsonb;
  v_list jsonb := '[]';
  v_chunk integer;
begin
  if p_today is null or p_today not between current_date - 1 and current_date + 1 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select r.* into v_recipe
  from public.recipes r
  where r.household_id = v_household_id and r.id = p_recipe_id
  for update;
  if not found then
    -- Deleted by someone else while this call waited for the lock.
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.recipe_id = p_recipe_id
  for update;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]')
  into v_collection_recipes
  from (
    select c.* from public.collection_recipes c
    where c.household_id = v_household_id and (c.collection_id = p_recipe_id or c.recipe_id = p_recipe_id)
    for update
  ) c;

  delete from private.recipe_deletions d
  where d.household_id = v_household_id and d.deleted_at <= now() - interval '1 hour';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'recipe_id', e.recipe_id, 'text', e.text, 'variants', e.variants,
           'new_text', case when e.kind = 'leftovers' then 'Reste von ' || v_recipe.title else v_recipe.title end)
           order by e.id), '[]')
  into v_converted
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.recipe_id = p_recipe_id and e.date <= p_today;

  v_removed_ids := array(
    with recursive removed (id) as (
      select e.id from public.meal_plan_entries e
      where e.household_id = v_household_id and e.recipe_id = p_recipe_id and (e.date is null or e.date > p_today)
      union
      select l.id from public.meal_plan_entries l
      join removed r on l.leftovers_of_entry_id = r.id
      where l.household_id = v_household_id and l.kind = 'leftovers' and l.recipe_id is null
    )
    select r.id from removed r);
  -- The leftovers found this way have no recipe_id and are not locked yet: lock them before they
  -- go into the snapshot, so a concurrent change cannot slip in between reading and deleting.
  perform 1 from public.meal_plan_entries e
  where e.household_id = v_household_id and e.id = any (v_removed_ids)
  for update;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]')
  into v_removed
  from public.meal_plan_entries e
  where e.household_id = v_household_id and e.id = any (v_removed_ids);

  -- "Zutaten auch von der Liste nehmen" (spec 0023, Decision 15): the contributions of the entries
  -- that go, on open items, as restore_cleared_items takes them back for "Rückgängig"; then off
  -- the list with spec 0021's replace_entry_contributions (≤ 200 entries per call).
  if coalesce(p_with_list, false) and cardinality(v_removed_ids) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('item', to_jsonb(i), 'contributions', own.rows)
                              order by i.id), '[]')
    into v_list
    from public.shopping_items i
    cross join lateral (
      select jsonb_agg(to_jsonb(c) order by c.id) as rows
      from public.shopping_contributions c
      where c.household_id = i.household_id and c.item_id = i.id
        and c.source ->> 'kind' = 'recipe'
        and lower(c.source ->> 'entryId') = any (array(select x::text from unnest(v_removed_ids) x))
    ) own
    where i.household_id = v_household_id and not i.checked and own.rows is not null;
    for v_chunk in 0 .. (cardinality(v_removed_ids) - 1) / 200 loop
      perform private.replace_entry_contributions(
        v_household_id, to_jsonb(v_removed_ids[v_chunk * 200 + 1 : v_chunk * 200 + 200]), '[]');
    end loop;
  end if;

  insert into private.recipe_deletions as d (household_id, recipe_id, deleted_by, deleted_at, snapshot)
  values (v_household_id, p_recipe_id, auth.uid(), now(), jsonb_build_object(
    'recipe', to_jsonb(v_recipe),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'stars', r.stars)), '[]')
                from public.recipe_ratings r
                where r.household_id = v_household_id and r.recipe_id = p_recipe_id),
    'favorites', (select coalesce(jsonb_agg(f.member_id), '[]')
                  from public.recipe_favorites f
                  where f.household_id = v_household_id and f.recipe_id = p_recipe_id),
    'converted', v_converted,
    'removed', v_removed,
    'collection_recipes', v_collection_recipes,
    'list', v_list))
  on conflict (household_id, recipe_id) do update
    set deleted_by = excluded.deleted_by, deleted_at = excluded.deleted_at, snapshot = excluded.snapshot;

  update public.meal_plan_entries e
  set kind = 'text', recipe_id = null, variants = '[]', text = c.new_text
  from jsonb_to_recordset(v_converted) c (id uuid, new_text text)
  where e.household_id = v_household_id and e.id = c.id;

  delete from public.meal_plan_entries e
  where e.household_id = v_household_id
    and e.id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_removed) x);

  delete from public.recipes r where r.household_id = v_household_id and r.id = p_recipe_id;

  return jsonb_build_object(
    'converted', jsonb_array_length(v_converted),
    'removed', jsonb_array_length(v_removed),
    'collections', (select count(*)::integer from jsonb_array_elements(v_collection_recipes) c
                    where (c ->> 'recipe_id')::uuid = p_recipe_id));
end
$$;

create or replace function private.restore_recipe(p_recipe_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deletion private.recipe_deletions;
  v_snapshot jsonb;
  v_household_id uuid;
  v_existing_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select d.* into v_deletion
  from private.recipe_deletions d
  join public.household_members m on m.household_id = d.household_id and m.profile_id = auth.uid()
  where d.recipe_id = p_recipe_id and d.deleted_by = auth.uid() and d.deleted_at > now() - interval '1 hour'
  for update of d;
  if not found then
    raise exception 'recipe_not_restorable' using errcode = 'P0002';
  end if;
  v_snapshot := v_deletion.snapshot;
  v_household_id := v_deletion.household_id;

  -- Recipe ids are unique across households. Back in this household: nothing to do. Taken in
  -- another one (e.g. by a former member who saw the id): refused, never reported as success.
  select r.household_id into v_existing_household_id from public.recipes r where r.id = p_recipe_id;
  if v_existing_household_id = v_household_id then
    return false;
  elsif v_existing_household_id is not null then
    raise exception 'recipe_not_restorable' using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('private.restore_created_at', coalesce(v_snapshot -> 'recipe' ->> 'created_at', ''), true);
  insert into public.recipes (id, household_id, kind, title, photo, photo_path, description, servings, total_minutes,
                              course, cuisine, tags, variants, ingredients, steps, lead_time, notes, last_cooked_on,
                              cooked_count, links)
  select r.id, v_household_id, r.kind, r.title, r.photo, r.photo_path, r.description, r.servings, r.total_minutes,
         r.course, r.cuisine, r.tags, r.variants, r.ingredients, r.steps, r.lead_time, r.notes, r.last_cooked_on,
         r.cooked_count, r.links
  from jsonb_populate_record(null::public.recipes, v_snapshot -> 'recipe') r;
  perform pg_catalog.set_config('private.restore_created_at', '', true);

  insert into public.recipe_ratings (household_id, recipe_id, member_id, stars)
  select v_household_id, p_recipe_id, x.member_id, x.stars
  from jsonb_to_recordset(v_snapshot -> 'ratings') x (member_id uuid, stars numeric)
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = x.member_id);

  insert into public.recipe_favorites (household_id, recipe_id, member_id)
  select v_household_id, p_recipe_id, x.member_id
  from jsonb_array_elements_text(v_snapshot -> 'favorites') f (member_id_text)
  cross join lateral (select f.member_id_text::uuid as member_id) x
  where exists (select 1 from public.household_members m
                where m.household_id = v_household_id and m.profile_id = x.member_id);

  insert into public.collection_recipes (id, household_id, collection_id, recipe_id, servings, variant_id, sort)
  select c.id, v_household_id, c.collection_id, c.recipe_id, c.servings, c.variant_id, c.sort
  from jsonb_populate_recordset(null::public.collection_recipes, v_snapshot -> 'collection_recipes') c
  where exists (select 1 from public.recipes r
                where r.household_id = v_household_id
                  and r.id = case when c.collection_id = p_recipe_id then c.recipe_id else c.collection_id end)
  order by c.collection_id, c.sort, c.id
  -- Only "already contained again" is skipped. A row id taken in the meantime (ids are unique
  -- across households) fails loudly with 23505 instead of silently dropping the row.
  on conflict (household_id, collection_id, recipe_id) do nothing;

  insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, activity_id,
                                        text, note, leftovers_of_entry_id, eater_ids, guests, portions, variants,
                                        cook_id, sort, not_cooked)
  select e.id, v_household_id, e.date, e.slot_id, e.kind, e.recipe_id, e.restaurant_id, e.activity_id,
         e.text, e.note,
         case when e.leftovers_of_entry_id is null
                or exists (select 1 from public.meal_plan_entries s
                           where s.household_id = v_household_id and s.id = e.leftovers_of_entry_id)
                or exists (select 1 from jsonb_array_elements(v_snapshot -> 'removed') s
                           where (s ->> 'id')::uuid = e.leftovers_of_entry_id)
              then e.leftovers_of_entry_id end,
         array(select u.id from unnest(e.eater_ids) with ordinality u (id, ord)
               where exists (select 1 from public.household_members m
                             where m.household_id = v_household_id and m.profile_id = u.id)
               order by u.ord),
         e.guests, e.portions, e.variants,
         case when exists (select 1 from public.household_members m
                           where m.household_id = v_household_id and m.profile_id = e.cook_id)
              then e.cook_id end,
         e.sort, e.not_cooked
  from jsonb_populate_recordset(null::public.meal_plan_entries, v_snapshot -> 'removed') e
  on conflict (id) do nothing;

  update public.meal_plan_entries e
  set kind = c.kind, recipe_id = c.recipe_id, text = c.text, variants = c.variants
  from jsonb_to_recordset(v_snapshot -> 'converted') c (id uuid, kind text, recipe_id uuid, text text, variants jsonb,
                                                        new_text text)
  where e.household_id = v_household_id and e.id = c.id
    and e.kind = 'text' and e.recipe_id is null and e.text = c.new_text;

  -- The ingredients taken off the list with the recipe come back (spec 0023, Decision 15).
  if jsonb_array_length(coalesce(v_snapshot -> 'list', '[]')) > 0 then
    perform private.restore_cleared_items(v_household_id, v_snapshot -> 'list');
  end if;

  delete from private.recipe_deletions d
  where d.household_id = v_household_id and d.recipe_id = p_recipe_id;
  return true;
end
$$;

revoke all on function private.delete_recipe(uuid, date, boolean) from public, anon;
grant execute on function private.delete_recipe(uuid, date, boolean) to authenticated;

create function public.delete_recipe(recipe_id uuid, today date, with_list boolean default false)
returns jsonb
language sql
set search_path = ''
as $$ select private.delete_recipe($1, $2, $3) $$;

revoke all on function public.delete_recipe(uuid, date, boolean) from public, anon;
grant execute on function public.delete_recipe(uuid, date, boolean) to authenticated;
