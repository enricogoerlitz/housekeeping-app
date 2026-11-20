-- Spec 0003 — security re-check: what one call adds, one call removes.
--
-- add_shopping_contributions caps the contributions of one call at 1000 (sum over the entries;
-- still ≤ 200 entries and 1…100 contributions per entry), and remove_contributions accepts up to
-- 1000 ids, so the undo of any accepted addition (a pantry check over many dishes can exceed 200
-- contributions) is a single call. Inside apply_changes the domain op keeps its limits (≤ 20
-- deletes, ≤ 500 contributions, migration 20261120182725).

-- Unchanged except the contribution cap next to the entry limit.
create or replace function private.add_shopping_contributions(p_list_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_entry jsonb;
  v_contributions jsonb;
  v_contribution_ids uuid[];
  v_client_item_id uuid;
  v_client_article_id uuid;
  v_name_key text;
  v_article_id uuid;
  v_item_id uuid;
  v_result jsonb := '[]';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select l.household_id into v_household_id
  from public.shopping_lists l
  where l.id = p_list_id and l.household_id in (select private.my_household_ids());
  if v_household_id is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'invalid_entries' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 200
     or (select count(*)
         from jsonb_array_elements(p_entries) e
         cross join lateral jsonb_array_elements(case when jsonb_typeof(e -> 'contributions') = 'array'
                                                      then e -> 'contributions' else '[]' end) c) > 1000 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_entry in select e.value from jsonb_array_elements(p_entries) e loop
    v_contributions := v_entry -> 'contributions';
    if jsonb_typeof(v_entry) <> 'object'
       or jsonb_typeof(v_entry -> 'client_item_id') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'client_article_id') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'article_name') is distinct from 'string'
       or jsonb_typeof(v_entry -> 'name_key') is distinct from 'string'
       or jsonb_typeof(v_contributions) is distinct from 'array'
       or jsonb_array_length(v_contributions) not between 1 and 100
       or jsonb_path_exists(v_contributions, '$[*] ? (!(@.id.type() == "string"))') then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    begin
      v_client_item_id := (v_entry ->> 'client_item_id')::uuid;
      v_client_article_id := (v_entry ->> 'client_article_id')::uuid;
      v_contribution_ids := array(select (c ->> 'id')::uuid from jsonb_array_elements(v_contributions) c);
    exception when invalid_text_representation then
      raise exception 'invalid_entries' using errcode = '22023';
    end;
    v_name_key := v_entry ->> 'name_key';

    -- 1. A repeat of an entry that was already applied.
    if exists (
      select 1 from public.shopping_contributions c
      where c.id = any (v_contribution_ids) and c.household_id <> v_household_id
    ) then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    select c.item_id, i.article_id into v_item_id, v_article_id
    from public.shopping_contributions c
    join public.shopping_items i on i.household_id = c.household_id and i.id = c.item_id
    where c.id = any (v_contribution_ids)
    limit 1;

    if v_item_id is null then
      -- 2. The article.
      select a.id into v_article_id
      from public.articles a
      where a.household_id = v_household_id and a.name_key = v_name_key;
      if v_article_id is null then
        select a.id into v_article_id
        from public.articles a
        where a.household_id = v_household_id and v_name_key = any (a.synonym_keys)
        order by a.created_at, a.id
        limit 1;
      end if;
      if v_article_id is null then
        insert into public.articles (id, household_id, name, name_key)
        values (
          case when exists (select 1 from public.articles a where a.id = v_client_article_id)
               then gen_random_uuid() else v_client_article_id end,
          v_household_id, btrim(v_entry ->> 'article_name'), v_name_key)
        on conflict (household_id, name_key) do nothing
        returning id into v_article_id;
        if v_article_id is null then
          -- Created by a concurrent transaction that has committed meanwhile.
          select a.id into v_article_id
          from public.articles a
          where a.household_id = v_household_id and a.name_key = v_name_key;
        end if;
      end if;

      -- 3. The item.
      perform private.lock_list_article(p_list_id, v_article_id);
      select i.id into v_item_id
      from public.shopping_items i
      where i.list_id = p_list_id and i.article_id = v_article_id and not i.checked
      for update;
      if v_item_id is null then
        select i.id into v_item_id
        from public.shopping_items i
        where i.list_id = p_list_id and i.article_id = v_article_id and i.checked
        order by i.checked_at desc nulls last, i.id
        limit 1
        for update;
        if v_item_id is not null then
          delete from public.shopping_contributions c
          where c.household_id = v_household_id and c.item_id = v_item_id;
          update public.shopping_items i
          set checked = false, checked_at = null, checked_by = null, not_available = false,
              check_seq = i.check_seq + 1
          where i.id = v_item_id;
        else
          insert into public.shopping_items (id, household_id, list_id, article_id)
          values (
            case when exists (select 1 from public.shopping_items i where i.id = v_client_item_id)
                 then gen_random_uuid() else v_client_item_id end,
            v_household_id, p_list_id, v_article_id)
          returning id into v_item_id;
        end if;
      end if;
    end if;

    insert into public.shopping_contributions (id, household_id, item_id, source, count, qty, unit, note)
    select (c ->> 'id')::uuid,
           v_household_id,
           v_item_id,
           coalesce(nullif(c -> 'source', 'null'::jsonb), '{"kind": "manual"}'::jsonb),
           (c ->> 'count')::integer,
           (c ->> 'qty')::numeric,
           c ->> 'unit',
           c ->> 'note'
    from jsonb_array_elements(v_contributions) c
    on conflict do nothing;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'client_item_id', v_client_item_id, 'item_id', v_item_id,
      'client_article_id', v_client_article_id, 'article_id', v_article_id));
    v_item_id := null;
    v_article_id := null;
  end loop;

  return v_result;
end
$$;

-- Unchanged except the id limit (200 → 1000).
create or replace function private.remove_contributions(p_ids uuid[], p_household_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_item_ids uuid[];
begin
  if cardinality(p_ids) > 1000 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  with removed as (
    delete from public.shopping_contributions c
    where c.id = any (p_ids) and (p_household_id is null or c.household_id = p_household_id)
    returning c.item_id
  )
  select count(*)::integer, array_agg(distinct r.item_id) into v_count, v_item_ids from removed r;

  delete from public.shopping_items i
  where i.id = any (v_item_ids)
    and not exists (
      select 1 from public.shopping_contributions c
      where c.household_id = i.household_id and c.item_id = i.id
    );

  return v_count;
end
$$;
