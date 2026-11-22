-- Spec 0025 "Einkauf" — the list schema. Clean target of review wave 2 (no compatibility with
-- v2026.11.1, docs/specs/README.md "Welle 2"):
--
-- * One item per article and household (S-03, Decision 9): unique (household_id, article_id)
--   instead of "one open item". Adding a checked article reopens its item with the new amount;
--   restoring and merging join the existing item. The branch "uncheck next to a second open item"
--   of set_shopping_item_checked is gone.
-- * checked_on_list (L-12, Decision 6): a check made on "Liste" (swipe right, "Als erledigt
--   markieren") is the store action "abhaken" with p_on_list = true; "kauft gerade ein" ignores
--   such checks. Written only by the store RPCs, like the other check columns.
-- * set_manual_amount and remove_item_contributions (L-01, Decision 3): "Von Hand" replaces all
--   manual contributions of an item by one, ✕ removes single origins; both return what the undo
--   needs (restore_cleared_items).
-- * restore_cleared_items keeps created_at (≤ now()), so "Rückgängig" puts an item back at its
--   place (L-08): set_timestamps keeps an earlier created_at while the restore runs.
-- * delete_article deletes checked items of the article with it; only an open item blocks (M-02).
-- * create_store copies walking order and hidden areas of another store (M-05).
-- * A deleted area leaves area_order and hidden_area_ids of every store (trigger).
-- * The never built source "recurring" is gone.

-- ---------------------------------------------------------------------------------------------
-- set_timestamps: an earlier created_at survives a restore
-- ---------------------------------------------------------------------------------------------

-- As before, with one exception: while a restore function runs (transaction setting
-- housekeeping.keep_created_at = 'on', set only by security definer functions) an insert by the
-- function owner keeps the created_at it names, at most now(). The API roles can never keep one.
create or replace function private.set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_at is null
       or new.created_at > now()
       or current_user in ('authenticated', 'anon')
       or coalesce(current_setting('housekeeping.keep_created_at', true), '') <> 'on' then
      new.created_at := now();
    end if;
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

-- ---------------------------------------------------------------------------------------------
-- shopping_items: one item per article, checked_on_list
-- ---------------------------------------------------------------------------------------------

drop index public.shopping_items_open_article_idx;
drop index public.shopping_items_household_id_article_id_idx;
alter table public.shopping_items
  add constraint shopping_items_household_id_article_id_key unique (household_id, article_id),
  add column checked_on_list boolean not null default false;

-- Before insert: an item inserted directly by the API role starts open, unseen and available.
create or replace function private.shopping_items_insert_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.checked := false;
    new.checked_at := null;
    new.checked_by := null;
    new.check_seq := 0;
    new.not_available := false;
    new.checked_on_list := false;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- shopping_contributions: no "recurring"
-- ---------------------------------------------------------------------------------------------

alter table public.shopping_contributions
  drop constraint shopping_contributions_source_valid,
  add constraint shopping_contributions_source_valid check (
    jsonb_typeof(source) = 'object'
    and case coalesce(source ->> 'kind', '')
      when 'manual' then true
      when 'recipe' then coalesce(jsonb_typeof(source -> 'recipeId') = 'string'
                                  and jsonb_typeof(source -> 'label') = 'string', false)
      else false
    end
    and octet_length(source::text) <= 1000);

-- ---------------------------------------------------------------------------------------------
-- set_shopping_item_checked: p_on_list
-- ---------------------------------------------------------------------------------------------

drop function public.set_shopping_item_checked(uuid, boolean, integer);
drop function private.set_shopping_item_checked(uuid, boolean, integer);

-- Rule table (sync.md):
--   not checked + check                         → checked (check_seq + 1, checked_by = caller,
--                                                 checked_on_list = p_on_list)
--   checked     + check                         → unchanged
--   checked     + uncheck, check_seq = seen     → not checked (check_seq + 1, checked_on_list false)
--   checked     + uncheck, check_seq ≠ seen     → stays checked ("checking wins")
--   not checked + uncheck                       → unchanged
--   item gone or in another household           → null
--   item merged away (merge_articles)           → applied to the item that replaced it; an uncheck
--                                                 is unchanged (the seen check_seq is the old item's)
-- p_on_list: the check was made on "Liste", not in "Einkaufen" (spec 0025, REQ-006); a queue entry
-- of an older app sends none and counts as a check in the store.
create function private.set_shopping_item_checked(
  p_item_id uuid, p_checked boolean, p_seen_check_seq integer, p_on_list boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.shopping_items;
  v_item_id uuid;
  v_replaced boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_checked is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select r.item_id, r.replaced into v_item_id, v_replaced from private.resolve_store_item(p_item_id) r;
  select i.* into v_item from public.shopping_items i where i.id = v_item_id;
  if not found then
    return null;
  end if;

  perform private.lock_household_article(v_item.household_id, v_item.article_id);
  select i.* into v_item from public.shopping_items i where i.id = v_item_id for update;
  if not found then
    return null;
  end if;

  if p_checked then
    if not v_item.checked then
      update public.shopping_items i
      set checked = true, checked_at = now(), checked_by = v_uid, check_seq = i.check_seq + 1,
          checked_on_list = coalesce(p_on_list, false)
      where i.id = v_item_id
      returning i.* into v_item;
    end if;
  elsif v_item.checked and v_item.check_seq = p_seen_check_seq and not v_replaced then
    update public.shopping_items i
    set checked = false, checked_at = null, checked_by = null, check_seq = i.check_seq + 1,
        checked_on_list = false
    where i.id = v_item_id
    returning i.* into v_item;
  end if;

  return jsonb_build_object('item_id', v_item.id, 'checked', v_item.checked, 'check_seq', v_item.check_seq);
end
$$;

create function public.set_shopping_item_checked(
  p_item_id uuid, p_checked boolean, p_seen_check_seq integer, p_on_list boolean default false)
returns jsonb
language sql
set search_path = ''
as $$ select private.set_shopping_item_checked($1, $2, $3, $4) $$;

grant execute on function private.set_shopping_item_checked(uuid, boolean, integer, boolean) to authenticated;
grant execute on function public.set_shopping_item_checked(uuid, boolean, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- add_shopping_contributions: the one item of the article
-- ---------------------------------------------------------------------------------------------

-- Puts contributions on the household's shopping list. Entries (≤ 200, each with 1–100
-- contributions, ≤ 1000 contributions in all):
--   [{"client_item_id": uuid, "client_article_id": uuid, "article_name": text, "name_key": text,
--     "contributions": [{"id": uuid, "source": jsonb, "count", "qty", "unit", "note"}]}]
-- Per entry, in order:
-- 1. A repeat (a contribution id already exists): the entry is already applied; missing
--    contributions of it go to the same item, nothing is reopened.
-- 2. The article: by name_key, else by name_key in synonym_keys, else a new article with the
--    client's id (diet unknown, no area). Keys are computed by the client (core normalizeText).
-- 3. The item of the article, under a lock per (household, article): an open one gets the
--    contributions; a checked one is reopened with only the new ones (check, "nicht da" and its
--    bought contributions cleared; core addContribution); without one a new item with the
--    client's id.
-- A client id already used by another row is replaced by a fresh one; the result maps it.
-- Returns [{"client_item_id", "item_id", "client_article_id", "article_id"}] in entry order.
create or replace function private.add_shopping_contributions(p_household_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := p_household_id;
  v_entry jsonb;
  v_contributions jsonb;
  v_contribution_ids uuid[];
  v_client_item_id uuid;
  v_client_article_id uuid;
  v_name_key text;
  v_article_id uuid;
  v_item_id uuid;
  v_checked boolean;
  v_result jsonb := '[]';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
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
      perform private.lock_household_article(v_household_id, v_article_id);
      select i.id, i.checked into v_item_id, v_checked
      from public.shopping_items i
      where i.household_id = v_household_id and i.article_id = v_article_id
      for update;
      if v_item_id is not null and v_checked then
        delete from public.shopping_contributions c
        where c.household_id = v_household_id and c.item_id = v_item_id;
        update public.shopping_items i
        set checked = false, checked_at = null, checked_by = null, not_available = false,
            checked_on_list = false, check_seq = i.check_seq + 1
        where i.id = v_item_id;
      elsif v_item_id is null then
        insert into public.shopping_items (id, household_id, article_id)
        values (
          case when exists (select 1 from public.shopping_items i where i.id = v_client_item_id)
               then gen_random_uuid() else v_client_item_id end,
          v_household_id, v_article_id)
        returning id into v_item_id;
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
    v_checked := null;
  end loop;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- restore_cleared_items: the place on the list, one item per article
-- ---------------------------------------------------------------------------------------------

-- Undo of clear_checked_items, clear_shopping_list, adjust_item_count, set_manual_amount and
-- remove_item_contributions. p_items is exactly what they returned:
-- [{"item": {row}, "contributions": [{row}]}]. Every item must belong to p_household_id, every
-- contribution to its item; otherwise invalid_entries and nothing is restored. ≤ 1000 items and
-- ≤ 5000 contributions (too_many_changes, private.assert_restorable_size).
-- The check state of the entry decides (missing = checked). Per entry, under the lock per
-- (household, article):
-- * no item of the article: the item comes back with its id, created_at (≤ now(), so it stands
--   at its earlier place) and check state — checked_at ≤ now(), check_seq clamped to 0…999000,
--   checked_by only while that person is still a member;
-- * an item of the article exists (someone added it meanwhile, or only some contributions were
--   removed): an open entry joins it, and reopens it when it is checked under another id (a new
--   need, like adding); a checked entry is not restored next to it, the item of today wins.
-- Contributions keep their ids and created_at (≤ now()) and use on conflict do nothing, so a
-- repeated call restores nothing twice. Returns how many entries brought back an item or at
-- least one contribution.
create or replace function private.restore_cleared_items(p_household_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := p_household_id;
  v_entry jsonb;
  v_item public.shopping_items;
  v_contributions public.shopping_contributions[];
  v_checked boolean;
  v_existing public.shopping_items;
  v_target_id uuid;
  v_inserted integer;
  v_added integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_entries' using errcode = '22023';
  end if;
  perform private.assert_restorable_size(p_items);
  perform pg_catalog.set_config('housekeeping.keep_created_at', 'on', true);

  for v_entry in select e.value from jsonb_array_elements(p_items) e loop
    if jsonb_typeof(v_entry) is distinct from 'object'
       or jsonb_typeof(v_entry -> 'item') is distinct from 'object'
       or jsonb_typeof(coalesce(v_entry -> 'contributions', '[]')) is distinct from 'array'
       or jsonb_path_exists(coalesce(v_entry -> 'contributions', '[]'), '$[*] ? (@.type() != "object")') then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    begin
      v_item := jsonb_populate_record(null::public.shopping_items, v_entry -> 'item');
      v_contributions := array(
        select jsonb_populate_record(null::public.shopping_contributions, c)
        from jsonb_array_elements(coalesce(v_entry -> 'contributions', '[]')) c);
    exception when data_exception then
      raise exception 'invalid_entries' using errcode = '22023';
    end;
    if v_item.id is null
       or v_item.article_id is null
       or v_item.household_id is distinct from v_household_id
       or exists (
         select 1 from unnest(v_contributions) c
         where c.id is null or c.item_id is distinct from v_item.id or c.household_id is distinct from v_household_id
       ) then
      raise exception 'invalid_entries' using errcode = '22023';
    end if;
    v_checked := coalesce(v_item.checked, true);
    v_target_id := null;
    v_inserted := 0;

    perform private.lock_household_article(v_household_id, v_item.article_id);
    select i.* into v_existing
    from public.shopping_items i
    where i.household_id = v_household_id and i.article_id = v_item.article_id
    for update;

    if v_existing.id is null then
      insert into public.shopping_items
        (id, household_id, article_id, checked, checked_at, checked_by, check_seq, not_available,
         checked_on_list, created_at)
      values (
        v_item.id, v_household_id, v_item.article_id, v_checked,
        case when v_checked then least(coalesce(v_item.checked_at, now()), now()) end,
        case when v_checked then
          (select m.profile_id from public.household_members m
           where m.household_id = v_household_id and m.profile_id = v_item.checked_by) end,
        least(greatest(coalesce(v_item.check_seq, 0), 0), 999000),
        coalesce(v_item.not_available, false),
        v_checked and coalesce(v_item.checked_on_list, false),
        least(coalesce(v_item.created_at, now()), now()))
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      -- Only onto the item of this household (skipped if its id is taken elsewhere).
      select i.id into v_target_id
      from public.shopping_items i
      where i.household_id = v_household_id and i.id = v_item.id;
    elsif not v_checked or v_existing.id = v_item.id then
      if not v_checked and v_existing.checked and v_existing.id <> v_item.id then
        delete from public.shopping_contributions c
        where c.household_id = v_household_id and c.item_id = v_existing.id;
        update public.shopping_items i
        set checked = false, checked_at = null, checked_by = null, not_available = false,
            checked_on_list = false, check_seq = i.check_seq + 1
        where i.id = v_existing.id;
      end if;
      v_target_id := v_existing.id;
    end if;

    insert into public.shopping_contributions
      (id, household_id, item_id, source, count, qty, unit, note, created_at)
    select c.id, v_household_id, v_target_id, coalesce(c.source, '{"kind": "manual"}'::jsonb),
           c.count, c.qty, c.unit, c.note, least(coalesce(c.created_at, now()), now())
    from unnest(v_contributions) c
    where v_target_id is not null
    on conflict do nothing;
    get diagnostics v_added = row_count;

    if v_inserted > 0 or v_added > 0 then
      v_count := v_count + 1;
    end if;
    v_existing := null;
  end loop;

  perform pg_catalog.set_config('housekeeping.keep_created_at', 'off', true);
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- delete_article: checked items go with it
-- ---------------------------------------------------------------------------------------------

-- Deletes an article that no recipe uses and that is not open on the list (spec 0025, M-02); a
-- checked item of it is deleted with it (it was bought). Members have no delete grant on
-- articles, so this is the only way. The row is locked `for update` before the check; the
-- ingredient trigger reads articles `for key share` and an item's foreign key does the same, so a
-- recipe or item using the article either commits first (and the check sees it) or fails
-- afterwards. Returns the deleted row, for "Rückgängig" (inserting it again through
-- apply_changes); the checked item does not come back (AC-047).
-- Errors: not_authenticated (42501), article_not_found (P0002, also for another household's
-- article), article_in_use (P0001).
create or replace function private.delete_article(p_article_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_article public.articles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select a.* into v_article
  from public.articles a
  where a.id = p_article_id and a.household_id in (select private.my_household_ids())
  for update;
  if not found then
    raise exception 'article_not_found' using errcode = 'P0002';
  end if;

  perform private.lock_household_article(v_article.household_id, v_article.id);
  if exists (
       select 1 from public.recipes r
       where r.household_id = v_article.household_id
         and r.ingredients @> jsonb_build_array(jsonb_build_object('articleId', v_article.id::text)))
     or exists (
       select 1 from public.shopping_items i
       where i.household_id = v_article.household_id and i.article_id = v_article.id and not i.checked) then
    raise exception 'article_in_use' using errcode = 'P0001';
  end if;

  delete from public.shopping_items i
  where i.household_id = v_article.household_id and i.article_id = v_article.id;
  delete from public.articles a where a.id = v_article.id;
  return to_jsonb(v_article);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- merge_articles: one item per article
-- ---------------------------------------------------------------------------------------------

-- "Zusammenführen" (spec 0007, REQ-007, E8): article p_source_id is merged into p_target_id of the
-- same household, in one transaction, in this order:
-- 1. every ingredient of the source in the household's recipes points at the target (two rows in
--    one recipe stay two rows, AC-039);
-- 2. the item of the source (at most one, spec 0025): without an item of the target it belongs to
--    the target. With one, the target's item stays: an open source item brings its contributions
--    (and reopens a checked target item, a new need like adding); a checked one brings nothing
--    (it was bought). The source's item is deleted and its tombstone names the target's item
--    (deleted_records.replaced_by, AC-040);
-- 3. empty values of the target are filled from the source: area, diet "unknown", default
--    shopping rule; Vorrat stays as on the target; needs_review is cleared;
-- 4. the source is deleted (tombstone);
-- 5. name and synonyms of the source become synonyms of the target, duplicate keys are dropped;
--    more than 30 synonyms, or more than 2000 characters in them or in their keys →
--    too_many_synonyms and nothing changes (Offene Frage 11).
-- Both articles are serialised with the store actions (lock per household and article, in a fixed
-- order); then the recipes of the source and the two articles are locked `for update`, in that
-- order. Returns {"recipes": n, "items": m}: the recipes rewritten and the items of the source
-- moved (merged or reassigned, 0 or 1).
-- Errors: not_authenticated (42501), invalid_value (22023, missing or equal ids),
-- article_not_found (P0002, also when one of them is in another household), too_many_synonyms
-- (22023).
create or replace function private.merge_articles(p_source_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_source public.articles;
  v_target public.articles;
  v_source_item public.shopping_items;
  v_target_item public.shopping_items;
  v_recipes integer;
  v_items integer := 0;
  v_synonyms text[];
  v_synonym_keys text[];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select a.household_id into v_household_id
  from public.articles a
  where a.id = p_source_id and a.household_id in (select private.my_household_ids());
  if v_household_id is null
     or not exists (select 1 from public.articles a where a.id = p_target_id and a.household_id = v_household_id) then
    raise exception 'article_not_found' using errcode = 'P0002';
  end if;

  perform private.lock_household_article(v_household_id, least(p_source_id, p_target_id));
  perform private.lock_household_article(v_household_id, greatest(p_source_id, p_target_id));
  -- The recipes of the source before the articles: an ingredient change locks its recipe row and
  -- then reads the articles `for key share` (recipes_check_ingredients). Taking the locks in the
  -- same order means one waits for the other instead of a deadlock (40P01).
  perform 1 from public.recipes r
  where r.household_id = v_household_id
    and r.ingredients @> jsonb_build_array(jsonb_build_object('articleId', p_source_id::text))
  order by r.id
  for update;
  perform 1 from public.articles a where a.id in (p_source_id, p_target_id) order by a.id for update;
  select a.* into v_source from public.articles a where a.id = p_source_id and a.household_id = v_household_id;
  select a.* into v_target from public.articles a where a.id = p_target_id and a.household_id = v_household_id;
  if v_source.id is null or v_target.id is null then
    raise exception 'article_not_found' using errcode = 'P0002';
  end if;

  -- 1. Recipes.
  update public.recipes r
  set ingredients = (
    select jsonb_agg(case when x.e ->> 'articleId' = p_source_id::text
                          then jsonb_set(x.e, '{articleId}', to_jsonb(p_target_id::text))
                          else x.e end
                     order by x.ord)
    from jsonb_array_elements(r.ingredients) with ordinality as x (e, ord))
  where r.household_id = v_household_id
    and r.ingredients @> jsonb_build_array(jsonb_build_object('articleId', p_source_id::text));
  get diagnostics v_recipes = row_count;

  -- 2. The item of the source.
  select i.* into v_source_item
  from public.shopping_items i
  where i.household_id = v_household_id and i.article_id = p_source_id
  for update;
  select i.* into v_target_item
  from public.shopping_items i
  where i.household_id = v_household_id and i.article_id = p_target_id
  for update;
  if v_source_item.id is not null and v_target_item.id is null then
    update public.shopping_items i set article_id = p_target_id where i.id = v_source_item.id;
    v_items := 1;
  elsif v_source_item.id is not null then
    if not v_source_item.checked then
      if v_target_item.checked then
        delete from public.shopping_contributions c
        where c.household_id = v_household_id and c.item_id = v_target_item.id;
        update public.shopping_items i
        set checked = false, checked_at = null, checked_by = null, not_available = false,
            checked_on_list = false, check_seq = i.check_seq + 1
        where i.id = v_target_item.id;
      end if;
      update public.shopping_contributions c
      set item_id = v_target_item.id
      where c.household_id = v_household_id and c.item_id = v_source_item.id;
    end if;
    delete from public.shopping_items i where i.id = v_source_item.id;
    update public.deleted_records d
    set replaced_by = v_target_item.id::text
    where d.household_id = v_household_id and d.table_name = 'shopping_items'
      and d.record_id = v_source_item.id::text and d.replaced_by is null;
    v_items := 1;
  end if;

  -- 3. Empty values of the target.
  update public.articles a
  set area_id = coalesce(a.area_id, v_source.area_id),
      diet = case when a.diet = 'unknown' then v_source.diet else a.diet end,
      default_shopping_rule = coalesce(a.default_shopping_rule, v_source.default_shopping_rule),
      needs_review = false
  where a.id = p_target_id;

  -- 4. The source.
  delete from public.articles a where a.id = p_source_id;

  -- 5. Names of the source as synonyms of the target, in order, without duplicate keys.
  select coalesce(array_agg(n.synonym order by n.ord), '{}'), coalesce(array_agg(n.key order by n.ord), '{}')
  into v_synonyms, v_synonym_keys
  from (
    select distinct on (c.key) c.synonym, c.key, c.ord
    from (
      select t.synonym, t.key, t.ord
      from unnest(v_target.synonyms, v_target.synonym_keys) with ordinality as t (synonym, key, ord)
      union all
      select v_source.name, v_source.name_key, 1000
      union all
      select s.synonym, s.key, 1000 + s.ord
      from unnest(v_source.synonyms, v_source.synonym_keys) with ordinality as s (synonym, key, ord)
    ) c
    where c.key is not null and c.synonym is not null and c.key <> v_target.name_key
    order by c.key, c.ord
  ) n;
  -- The limits of articles_synonyms_size and articles_synonym_keys_size, named like the count.
  if cardinality(v_synonyms) > 30
     or char_length(array_to_string(v_synonyms, '')) > 2000
     or char_length(array_to_string(v_synonym_keys, '')) > 2000 then
    raise exception 'too_many_synonyms' using errcode = '22023';
  end if;
  update public.articles a
  set synonyms = v_synonyms, synonym_keys = v_synonym_keys
  where a.id = p_target_id;

  return jsonb_build_object('recipes', v_recipes, 'items', v_items);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- set_manual_amount
-- ---------------------------------------------------------------------------------------------

-- "Von Hand" in "Posten bearbeiten" (spec 0025, REQ-003): all manual contributions of the item
-- become one with this amount — a count (1–10000) or a quantity (> 0, ≤ 1000000) with an optional
-- unit (≤ 20 characters); nothing = no manual contribution. The earliest manual contribution
-- keeps its id, place and Zusatz; the other manual ones go; recipe origins stay. Without any
-- contribution left the item is removed. Returns
--   {"item_id", "removed": false}
--   {"item_id", "removed": true, "item", "contributions"}  as before, for restore_cleared_items
--   null                                                   item gone or not visible (AC-013)
-- invalid_value (22023): count and quantity together, 0 or out of range, a unit without quantity.
-- Security invoker: RLS decides.
create function public.set_manual_amount(p_item_id uuid, p_count integer, p_qty numeric, p_unit text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item public.shopping_items;
  v_unit text := nullif(btrim(p_unit), '');
  v_before jsonb;
  v_manual_id uuid;
begin
  if (p_count is not null and p_qty is not null)
     or (p_count is not null and p_count not between 1 and 10000)
     or (p_qty is not null and not (p_qty > 0 and p_qty <= 1000000))
     or (v_unit is not null and (p_qty is null or char_length(v_unit) > 20)) then
    raise exception 'invalid_value' using errcode = '22023';
  end if;

  select i.* into v_item from public.shopping_items i where i.id = p_item_id for update;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb) into v_before
  from public.shopping_contributions c
  where c.household_id = v_item.household_id and c.item_id = v_item.id;
  select c.id into v_manual_id
  from public.shopping_contributions c
  where c.household_id = v_item.household_id and c.item_id = v_item.id and c.source ->> 'kind' = 'manual'
  order by c.created_at, c.id
  limit 1;

  if p_count is null and p_qty is null then
    v_manual_id := null;
  elsif v_manual_id is null then
    insert into public.shopping_contributions (household_id, item_id, source, count, qty, unit)
    values (v_item.household_id, v_item.id, '{"kind": "manual"}', p_count, p_qty, v_unit)
    returning id into v_manual_id;
  else
    update public.shopping_contributions c
    set count = p_count, qty = p_qty, unit = v_unit
    where c.id = v_manual_id;
  end if;
  delete from public.shopping_contributions c
  where c.household_id = v_item.household_id and c.item_id = v_item.id
    and c.source ->> 'kind' = 'manual' and c.id is distinct from v_manual_id;

  if not exists (
    select 1 from public.shopping_contributions c
    where c.household_id = v_item.household_id and c.item_id = v_item.id
  ) then
    delete from public.shopping_items i where i.id = v_item.id;
    return jsonb_build_object('item_id', v_item.id, 'removed', true,
                              'item', to_jsonb(v_item), 'contributions', v_before);
  end if;
  return jsonb_build_object('item_id', v_item.id, 'removed', false);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- remove_item_contributions
-- ---------------------------------------------------------------------------------------------

-- ✕ at an origin in "Posten bearbeiten" and removing a whole item (swipe, "Entfernen"; spec 0025,
-- REQ-003, REQ-005): deletes the given contributions of this item (1–1000 ids; ids of other items
-- are ignored); without any contribution left the item is removed. Returns
-- [{"item": {row}, "contributions": [the removed rows]}] for restore_cleared_items, which puts
-- them back at their place; [] when none of the ids belonged to the item; null when the item is
-- gone or not visible (AC-013). Security invoker: RLS decides.
create function public.remove_item_contributions(p_item_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item public.shopping_items;
  v_removed jsonb;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  select i.* into v_item from public.shopping_items i where i.id = p_item_id for update;
  if not found then
    return null;
  end if;

  with removed as (
    delete from public.shopping_contributions c
    where c.household_id = v_item.household_id and c.item_id = v_item.id and c.id = any (p_ids)
    returning c.*
  )
  select jsonb_agg(to_jsonb(r) order by r.created_at, r.id) into v_removed from removed r;
  if v_removed is null then
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1 from public.shopping_contributions c
    where c.household_id = v_item.household_id and c.item_id = v_item.id
  ) then
    delete from public.shopping_items i where i.id = v_item.id;
  end if;
  return jsonb_build_array(jsonb_build_object('item', to_jsonb(v_item), 'contributions', v_removed));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- create_store
-- ---------------------------------------------------------------------------------------------

-- "+ Neuer Markt" (spec 0025, REQ-015): a store of the household with the client's id (null = a
-- new one) and the name (stores_name_valid). With p_copy_from the walking order and the hidden
-- areas of that store of the same household are copied once ("Reihenfolge übernehmen von …",
-- AC-050); without it both are empty ("Wie die Bereiche", AC-051). Returns the new row.
-- Errors: not_member (42501), store_not_found (P0002, also for another household's store).
-- Security invoker: RLS decides.
create function public.create_store(p_household_id uuid, p_store_id uuid, p_name text, p_copy_from uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_source public.stores;
  v_store public.stores;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_copy_from is not null then
    select s.* into v_source
    from public.stores s
    where s.id = p_copy_from and s.household_id = p_household_id;
    if not found then
      raise exception 'store_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.stores (id, household_id, name, area_order, hidden_area_ids)
  values (coalesce(p_store_id, gen_random_uuid()), p_household_id, btrim(p_name),
          coalesce(v_source.area_order, '{}'), coalesce(v_source.hidden_area_ids, '{}'))
  returning * into v_store;
  return to_jsonb(v_store);
end
$$;

grant execute on function public.set_manual_amount(uuid, integer, numeric, text) to authenticated;
grant execute on function public.remove_item_contributions(uuid, uuid[]) to authenticated;
grant execute on function public.create_store(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- areas: a deleted area leaves the stores
-- ---------------------------------------------------------------------------------------------

-- After delete, for each row: the id leaves area_order and hidden_area_ids of the household's
-- stores, so no store keeps an id that no longer exists. Security invoker: members may update
-- both columns.
create function private.areas_leave_stores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.stores s
  set area_order = pg_catalog.array_remove(s.area_order, old.id),
      hidden_area_ids = pg_catalog.array_remove(s.hidden_area_ids, old.id)
  where s.household_id = old.household_id
    and (old.id = any (s.area_order) or old.id = any (s.hidden_area_ids));
  return null;
end
$$;

create trigger areas_leave_stores after delete on public.areas
  for each row execute function private.areas_leave_stores();
