-- Spec 0027 "Verwalten und Konto": invitations live only while open (withdraw_invitation,
-- accept_invitation deletes), the own profile through update_profile with the fixed palette, the
-- last member deletes the household (delete_household after the app removed its photos,
-- household_media_names), and feedback is changed or deleted only by its author.
--
-- Clean target before v1 (spec README, Welle 2): no compatibility with v2026.11.1.

-- ---------------------------------------------------------------------------------------------
-- Invitations: open only (REQ-001, Decision 1)
-- ---------------------------------------------------------------------------------------------

-- The policies and the hook read accepted_at; they are recreated without it.
drop policy households_select on public.households;
drop policy household_invitations_select on public.household_invitations;
drop index public.household_invitations_open_email_idx;
alter table public.household_invitations drop column accepted_at;
create index household_invitations_email_idx on public.household_invitations (email);

-- households: members read and edit; an invited person reads the household she is invited to
-- (to decide whether to accept). Created only by create_household, deleted only by
-- delete_household (spec 0027, REQ-005).
create policy households_select on public.households for select to authenticated
  using (
    id in (select private.my_household_ids())
    or id in (
      select i.household_id from public.household_invitations i
      where i.email = (select private.my_email())
    )
  );

-- Members read their households' invitations; an invited person reads her own. Every row is open:
-- accepting, declining and withdrawing delete it.
create policy household_invitations_select on public.household_invitations for select to authenticated
  using (
    household_id in (select private.my_household_ids())
    or email = (select private.my_email())
  );

-- Admits a new account only for provider google, an address Google verified and an existing
-- invitation for its (lowercased) email; a withdrawn one is gone (AC-001, AC-005).
create or replace function private.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
  v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
  v_verified jsonb := event -> 'user' -> 'user_metadata' -> 'email_verified';
begin
  if v_provider = 'google'
     and v_verified = 'true'::jsonb
     and v_email is not null
     and exists (select 1 from public.household_invitations i where i.email = v_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'not_invited'));
end
$$;

-- Invites an address into a household the caller belongs to. Inviting the same address again
-- returns the open invitation.
create or replace function private.invite_member(p_household_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_invitation_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = v_uid
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if not private.is_valid_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.household_members m
    join public.profiles p on p.id = m.profile_id
    where m.household_id = p_household_id and p.email = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  insert into public.household_invitations (household_id, email, invited_by)
  values (p_household_id, v_email, v_uid)
  on conflict (household_id, email) do update set invited_by = excluded.invited_by
  returning id into v_invitation_id;

  return v_invitation_id;
end
$$;

-- An existing account accepts an invitation addressed to its email: the invitation is deleted and
-- the account becomes a member, in one transaction. The household row is locked first, like
-- delete_household does, so a household cannot be deleted while someone joins (AC-022); deleting
-- the invitation decides a race with withdrawing it (AC-003).
create or replace function private.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select i.household_id into v_household_id
  from public.household_invitations i
  where i.id = p_invitation_id
    and i.email = (select p.email from public.profiles p where p.id = v_uid);
  if v_household_id is not null then
    perform 1 from public.households h where h.id = v_household_id for update;
  end if;

  delete from public.household_invitations i
  where i.id = p_invitation_id
    and i.email = (select p.email from public.profiles p where p.id = v_uid)
  returning i.household_id into v_household_id;

  if v_household_id is null then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, profile_id)
  values (v_household_id, v_uid)
  on conflict do nothing;

  return v_household_id;
end
$$;

-- An existing account declines (deletes) an invitation addressed to its email.
create or replace function private.decline_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.household_invitations i
  where i.id = p_invitation_id
    and i.email = (select p.email from public.profiles p where p.id = v_uid);

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
end
$$;

-- A member withdraws an invitation of her household (REQ-001). A foreign or unknown id is
-- `invitation_not_found`, so the answer does not tell whether it exists elsewhere (AC-004).
create function private.withdraw_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.household_invitations i
  where i.id = p_invitation_id
    and i.household_id in (
      select m.household_id from public.household_members m where m.profile_id = v_uid
    );

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Profile (REQ-003, Decision 9)
-- ---------------------------------------------------------------------------------------------

-- The eight avatar colours Blau, Beere, Grün, Kupfer, Violett, Petrol, Ocker, Rot; the same list
-- is PROFILE_COLORS in packages/core (both tests pin it).
create function private.profile_palette()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['#3E6C8E', '#A8456B', '#5B7F3A', '#B5652B', '#6A4C93', '#2F7F7A', '#8C6D1F', '#9C3D3D']
$$;

create or replace function private.profile_color(p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select (private.profile_palette())[1 + get_byte(uuid_send(p_id), 15) % 8]
$$;

-- Abneigungen: each trimmed and 1–40 characters, no two equal ignoring case.
create function private.dislikes_valid(p_dislikes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(d = btrim(d) and char_length(d) between 1 and 40), true)
    and count(distinct lower(d)) = count(d)
  from unnest(p_dislikes) d
$$;

alter table public.profiles drop constraint profiles_color_hex;
alter table public.profiles add constraint profiles_color_palette
  check (color = any (private.profile_palette()));
alter table public.profiles add constraint profiles_dislikes_valid
  check (private.dislikes_valid(dislikes));

-- Only update_profile writes a profile; the direct update grant and policy go.
drop policy profiles_update on public.profiles;
revoke update on public.profiles from authenticated;

-- The caller changes her own profile; email and id stay (AC-012). Returns nothing; the profile
-- reaches the devices with the next pull.
create function private.update_profile(
  p_name text, p_color text, p_diet_preference text, p_dislikes text[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_color is null or not (p_color = any (private.profile_palette())) then
    raise exception 'invalid_color' using errcode = '22023';
  end if;
  if p_diet_preference is null or p_diet_preference not in ('vegan', 'vegetarian', 'flexible') then
    raise exception 'invalid_diet' using errcode = '22023';
  end if;
  if p_dislikes is null or cardinality(p_dislikes) > 50 or not private.dislikes_valid(p_dislikes) then
    raise exception 'invalid_dislikes' using errcode = '22023';
  end if;

  update public.profiles p
  set name = v_name, color = p_color, diet_preference = p_diet_preference, dislikes = p_dislikes
  where p.id = v_uid;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Deleting a household (REQ-005, Decision 3)
-- ---------------------------------------------------------------------------------------------

-- The names of the household's photos, for the app to delete them before delete_household. As the
-- caller: the storage policies show only her households' objects. Every sub-folder counts.
create function private.household_media_names(p_household_id uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'household-media'
    and o.name like p_household_id::text || '/%'
  order by o.name
$$;

-- The last member deletes the household with every row (cascade), its open invitations,
-- notification settings and delivery log, and the tombstones the cascade wrote. The household
-- row is locked before counting, like accept_invitation, so nobody joins in between (AC-022).
-- Refused with media_remaining while photos are stored: the app deletes them first (AC-023).
create function private.delete_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1 from public.households h where h.id = p_household_id for update;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.profile_id = v_uid
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if (select count(*) from public.household_members m where m.household_id = p_household_id) > 1 then
    raise exception 'not_last_member' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'household-media' and o.name like p_household_id::text || '/%'
  ) then
    raise exception 'media_remaining' using errcode = 'P0001';
  end if;

  delete from public.households h where h.id = p_household_id;
  delete from public.deleted_records d where d.household_id = p_household_id;
end
$$;

grant execute on function private.withdraw_invitation(uuid) to authenticated;
grant execute on function private.update_profile(text, text, text, text[]) to authenticated;
grant execute on function private.household_media_names(uuid) to authenticated;
grant execute on function private.delete_household(uuid) to authenticated;

create function public.withdraw_invitation(invitation_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.withdraw_invitation($1) $$;

create function public.update_profile(name text, color text, diet_preference text, dislikes text[])
returns void
language sql
set search_path = ''
as $$ select private.update_profile($1, $2, $3, $4) $$;

create function public.household_media_names(household_id uuid)
returns setof text
language sql
stable
set search_path = ''
as $$ select private.household_media_names($1) $$;

create function public.delete_household(household_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.delete_household($1) $$;

grant execute on function public.withdraw_invitation(uuid) to authenticated;
grant execute on function public.update_profile(text, text, text, text[]) to authenticated;
grant execute on function public.household_media_names(uuid) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Feedback: only the author changes or deletes, text only while new (REQ-006, Decision 10)
-- ---------------------------------------------------------------------------------------------

-- Status, reason and spec reference are set by the developer directly in the database.
revoke insert, update on public.feedback from authenticated;
grant insert (id, household_id, kind, text, author_id, screen) on public.feedback to authenticated;
grant update (kind, text) on public.feedback to authenticated;

drop policy feedback_update on public.feedback;
drop policy feedback_delete on public.feedback;
create policy feedback_update on public.feedback for update to authenticated
  using (
    household_id in (select private.my_household_ids())
    and author_id = (select auth.uid())
    and status = 'new'
  )
  with check (
    household_id in (select private.my_household_ids())
    and author_id = (select auth.uid())
    and status = 'new'
  );
create policy feedback_delete on public.feedback for delete to authenticated
  using (
    household_id in (select private.my_household_ids())
    and author_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------------------------
-- apply_changes: the feedback allowlist without status, reason and spec_ref (otherwise unchanged)
-- ---------------------------------------------------------------------------------------------

create or replace function public.apply_changes(p_household_id uuid, p_ops jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- table → columns an insert may set, columns a patch may set, whether rows may be deleted.
  -- household_id may be sent on insert but must equal p_household_id; it is always forced.
  -- created_by (activities) and author_id (feedback) are overwritten by their insert triggers.
  -- Feedback: status, reason and spec_ref are the developer's; RLS lets only the author patch
  -- (while new) or delete (spec 0027, REQ-006).
  -- Articles are deleted only by delete_article and merge_articles (spec 0007, E4).
  -- Recipes are deleted only by delete_recipe (spec 0008, E2). The kind of a recipe (recipe or
  -- collection) is set on insert and never patched (spec 0009, E2). A collection_recipes row keeps
  -- its collection and its recipe; only servings, variant and order change (spec 0009, E4).
  -- Chore events are booked and removed only by complete_chore / remove_chore_event (spec 0011).
  -- The packed state of packing items (packed, packed_at, packed_by, pack_seq) is written only by
  -- set_packing_items_packed and restore_packing_items; packing items are never patched (spec 0012).
  -- Notification settings rows are created by the server and only patched, and RLS lets a member
  -- patch only her own row (spec 0013, Decision 3). households.timezone is never written (D16).
  c_allowlist constant jsonb := $json${
    "areas":            {"insert": ["id", "household_id", "name", "sort"],
                         "patch":  ["name", "sort"], "delete": true},
    "articles":         {"insert": ["id", "household_id", "name", "name_key", "synonyms", "synonym_keys",
                                    "area_id", "diet", "is_pantry", "default_shopping_rule", "needs_review"],
                         "patch":  ["name", "name_key", "synonyms", "synonym_keys", "area_id", "diet",
                                    "is_pantry", "default_shopping_rule", "needs_review"], "delete": false},
    "stores":           {"insert": ["id", "household_id", "name", "area_order", "hidden_area_ids"],
                         "patch":  ["name", "area_order", "hidden_area_ids"], "delete": true},
    "recipes":          {"insert": ["id", "household_id", "kind", "title", "photo", "photo_path", "description",
                                    "servings", "total_minutes", "course", "cuisine", "tags", "variants", "ingredients",
                                    "steps", "lead_time", "notes", "last_cooked_on", "cooked_count", "source"],
                         "patch":  ["title", "photo", "photo_path", "description", "servings", "total_minutes", "course",
                                    "cuisine", "tags", "variants", "ingredients", "steps", "lead_time", "notes",
                                    "last_cooked_on", "cooked_count", "source"], "delete": false},
    "collection_recipes": {"insert": ["id", "household_id", "collection_id", "recipe_id", "servings", "variant_id",
                                      "sort"],
                           "patch":  ["servings", "variant_id", "sort"], "delete": true},
    "restaurants":      {"insert": ["id", "household_id", "name", "address", "lat", "lng", "maps_url", "cuisine",
                                    "price_level", "tags", "notes"],
                         "patch":  ["name", "address", "lat", "lng", "maps_url", "cuisine", "price_level", "tags",
                                    "notes"], "delete": true},
    "activities":       {"insert": ["id", "household_id", "name", "name_key", "description", "photo_path", "place_name",
                                    "address", "lat", "lng", "maps_url", "tags", "created_by"],
                         "patch":  ["name", "name_key", "description", "photo_path", "place_name", "address", "lat",
                                    "lng", "maps_url", "tags"], "delete": true},
    "absences":         {"insert": ["id", "household_id", "member_id", "from_on", "to_on", "note"],
                         "patch":  ["member_id", "from_on", "to_on", "note"], "delete": true},
    "packing_bags":     {"insert": ["id", "household_id", "name", "member_id", "sort"],
                         "patch":  ["name", "member_id", "sort"], "delete": true},
    "packing_bag_items": {"insert": ["id", "household_id", "bag_id", "name", "quantity", "per_day", "sort"],
                          "patch":  ["name", "quantity", "per_day", "sort"], "delete": true},
    "packing_list_bags": {"insert": ["id", "household_id", "absence_id", "bag_id", "name", "member_id", "sort"],
                          "patch":  ["absence_id", "bag_id", "sort"], "delete": true},
    "packing_items":    {"insert": ["id", "household_id", "list_bag_id", "name", "quantity", "per_day", "sort"],
                         "patch":  [], "delete": true},
    "feedback":         {"insert": ["id", "household_id", "kind", "text", "author_id", "screen"],
                         "patch":  ["kind", "text"], "delete": true},
    "chores":           {"insert": ["id", "household_id", "title", "room", "recurrence", "assignment", "effort",
                                    "next_due_on", "next_assignee_id", "last_done_on", "active_months", "due_time"],
                         "patch":  ["title", "room", "recurrence", "assignment", "effort", "next_due_on",
                                    "next_assignee_id", "last_done_on", "active_months", "due_time"], "delete": true},
    "chore_events":     {"insert": [],
                         "patch":  ["chore_id", "done_by"], "delete": false},
    "meal_plan_entries": {"insert": ["id", "household_id", "date", "slot_id", "kind", "recipe_id", "restaurant_id",
                                     "activity_id", "text", "note", "leftovers_of_entry_id", "eater_ids", "guests",
                                     "portions", "variants", "cook_id", "sort", "not_cooked", "reserved_at",
                                     "remind_minutes_before", "reminder_day_offset", "reminder_at", "reminder_text"],
                          "patch":  ["date", "slot_id", "kind", "recipe_id", "restaurant_id", "activity_id", "text",
                                     "note", "leftovers_of_entry_id", "eater_ids", "guests", "portions", "variants",
                                     "cook_id", "sort", "not_cooked", "reserved_at", "remind_minutes_before",
                                     "reminder_day_offset", "reminder_at", "reminder_text"],
                          "delete": true},
    "notification_settings": {"insert": [],
                              "patch":  ["daily_summary_enabled", "daily_summary_at", "daily_summary_parts",
                                         "activities_eve_enabled", "activities_eve_at", "chore_reminders_enabled",
                                         "reservation_reminders_enabled", "entry_reminders_enabled"], "delete": false},
    "shopping_items":   {"insert": ["id", "household_id", "article_id"],
                         "patch":  ["article_id"], "delete": true},
    "shopping_contributions": {"insert": ["id", "household_id", "item_id", "source", "count", "qty", "unit", "note"],
                               "patch":  ["item_id", "source", "count", "qty", "unit", "note"], "delete": true},
    "households":       {"insert": [],
                         "patch":  ["name", "meal_slots", "default_store_id"], "delete": false}
  }$json$;
  c_max_ops constant integer := 200;
  c_max_deletes constant integer := 20;
  c_max_contributions constant integer := 500;

  v_op jsonb;
  v_kind text;
  v_table text;
  v_rules jsonb;
  v_row jsonb;
  v_changes jsonb;
  v_id uuid;
  v_columns text;
  v_select text;
  v_set text;
  v_count integer;
  v_ids uuid[];
  v_results jsonb := '[]';
  v_op_count integer;
  v_delete_count integer;
  v_contribution_count integer;
begin
  if p_household_id is null
     or not exists (select 1 from private.my_household_ids() h (id) where h.id = p_household_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  -- A domain op counts as its elements: every id of remove_contributions is a delete and an op,
  -- every entry of add_contributions and every item of restore_packing_items is an op. The
  -- contributions of all entries are capped too.
  -- complete_chore counts as a delete: done of a one-off chore deletes it, which is known only
  -- once the chore is locked.
  select coalesce(sum(case when o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'
                             then greatest(jsonb_array_length(o -> 'ids'), 1)
                           when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                             then greatest(jsonb_array_length(o -> 'entries'), 1)
                           when o ->> 'kind' = 'restore_packing_items' and jsonb_typeof(o -> 'items') = 'array'
                             then greatest(jsonb_array_length(o -> 'items'), 1)
                           else 1 end), 0),
         count(*) filter (where o ->> 'kind' in ('delete', 'complete_chore', 'remove_chore_event'))
           + coalesce(sum(jsonb_array_length(o -> 'ids'))
                        filter (where o ->> 'kind' = 'remove_contributions' and jsonb_typeof(o -> 'ids') = 'array'), 0),
         coalesce(sum(c.contributions), 0)
  into v_op_count, v_delete_count, v_contribution_count
  from jsonb_array_elements(p_ops) o
  cross join lateral (
    select count(*) as contributions
    from jsonb_array_elements(case when o ->> 'kind' = 'add_contributions' and jsonb_typeof(o -> 'entries') = 'array'
                                   then o -> 'entries' else '[]' end) e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e -> 'contributions') = 'array'
                                                 then e -> 'contributions' else '[]' end) x
  ) c;
  if v_op_count > c_max_ops or v_delete_count > c_max_deletes or v_contribution_count > c_max_contributions then
    raise exception 'too_many_changes' using errcode = '22023';
  end if;

  for v_op in select o.value from jsonb_array_elements(p_ops) o loop
    if jsonb_typeof(v_op) is distinct from 'object' then
      raise exception 'invalid_change' using errcode = '22023';
    end if;
    v_kind := v_op ->> 'kind';

    -- Domain ops: the same internal functions as the store/list RPCs; add_contributions puts the
    -- entries on the shopping list of p_household_id.
    if v_kind = 'add_contributions' then
      v_results := v_results || jsonb_build_array(private.add_shopping_contributions(p_household_id, v_op -> 'entries'));
      continue;
    elsif v_kind = 'remove_contributions' then
      if jsonb_typeof(v_op -> 'ids') is distinct from 'array' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_ids := array(select x::uuid from jsonb_array_elements_text(v_op -> 'ids') x);
      v_results := v_results || jsonb_build_array(private.remove_contributions(v_ids, p_household_id));
      continue;
    elsif v_kind = 'complete_chore' then
      v_results := v_results || jsonb_build_array(private.complete_chore(p_household_id, v_op -> 'completion'));
      continue;
    elsif v_kind = 'remove_chore_event' then
      if jsonb_typeof(v_op -> 'id') is distinct from 'string' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_results := v_results || jsonb_build_array(private.remove_chore_event(p_household_id, (v_op ->> 'id')::uuid));
      continue;
    elsif v_kind = 'restore_packing_items' then
      v_results := v_results || jsonb_build_array(private.restore_packing_items(p_household_id, v_op -> 'items'));
      continue;
    end if;

    -- Row ops: the table must be a key of the allowlist (exact match, so no quoting tricks).
    v_table := case when jsonb_typeof(v_op -> 'table') = 'string' then v_op ->> 'table' end;
    v_rules := c_allowlist -> v_table;
    if v_rules is null or v_kind is null or v_kind not in ('insert', 'patch', 'delete') then
      raise exception 'invalid_change' using errcode = '22023';
    end if;

    if v_kind = 'insert' then
      v_row := v_op -> 'row';
      if jsonb_array_length(v_rules -> 'insert') = 0
         or jsonb_typeof(v_row) is distinct from 'object'
         or exists (select 1 from jsonb_object_keys(v_row) k where not (v_rules -> 'insert') ? k)
         or (v_row ? 'household_id' and lower(v_row ->> 'household_id') is distinct from p_household_id::text) then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_row := v_row || jsonb_build_object('household_id', p_household_id);
      select string_agg(format('%I', k), ', '), string_agg(format('r.%I', k), ', ')
      into v_columns, v_select
      from jsonb_object_keys(v_row) k;
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) r',
        v_table, v_columns, v_select, v_table)
      using v_row;

    elsif v_kind = 'patch' then
      v_changes := v_op -> 'changes';
      if jsonb_typeof(v_op -> 'id') is distinct from 'string'
         or jsonb_typeof(v_changes) is distinct from 'object'
         or v_changes = '{}'::jsonb
         or exists (select 1 from jsonb_object_keys(v_changes) k where not (v_rules -> 'patch') ? k) then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      v_id := (v_op ->> 'id')::uuid;
      if v_table = 'households' and v_id <> p_household_id then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      select string_agg(format('%1$I = r.%1$I', k), ', ') into v_set from jsonb_object_keys(v_changes) k;
      execute format(
        'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r '
        'where t.id = $2 and t.%I = $3',
        v_table, v_set, v_table, case when v_table = 'households' then 'id' else 'household_id' end)
      using v_changes, v_id, p_household_id;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'row_not_found' using errcode = 'P0002';
      end if;

    else -- delete; a row that is already gone is fine (undo, or deleted by someone else)
      if not (v_rules -> 'delete')::boolean or jsonb_typeof(v_op -> 'id') is distinct from 'string' then
        raise exception 'invalid_change' using errcode = '22023';
      end if;
      execute format('delete from public.%I t where t.id = $1 and t.household_id = $2', v_table)
      using (v_op ->> 'id')::uuid, p_household_id;
    end if;
  end loop;

  return jsonb_build_object('applied', jsonb_array_length(p_ops), 'results', v_results);
end
$$;
