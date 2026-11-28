-- Spec 0066 "KI-Agent" (critical path: new synced table, RLS, deleting a household). Additive only.
--
-- * ai_chats: the references of the household's research chats. The content lives only in the
--   Foundry conversation (ADR-0018); this table is the only index from a household to its
--   conversations, because the Foundry key can list every conversation of the project. Members
--   read their household's rows (synced, history offline); they are written only by the edge
--   function ai-agent, as the caller, through create_ai_chat, record_ai_chat_turn and
--   delete_ai_chat. A conversation is referenced by one row at most (unique).
-- * sync_pull: the new table.
-- * delete_household: refused with ai_chats_remaining while a chat is left, so the app deletes the
--   conversations in Foundry first (REQ-010), like the photos with media_remaining.

-- ---------------------------------------------------------------------------------------------
-- ai_chats
-- ---------------------------------------------------------------------------------------------

create table public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  conversation_id text not null
    constraint ai_chats_conversation_id_valid check (conversation_id ~ '^conv_[A-Za-z0-9_-]{1,200}$'),
  title text not null
    constraint ai_chats_title_length check (char_length(title) between 1 and 80),
    constraint ai_chats_title_no_control check (title !~ '[[:cntrl:]]'),
  place_label text
    constraint ai_chats_place_label_length check (char_length(place_label) between 1 and 120),
    constraint ai_chats_place_label_no_control check (place_label !~ '[[:cntrl:]]'),
  created_by uuid,
  -- Every answer (resp_…): they survive the deletion of the conversation and are deleted one by one.
  response_ids text[] not null default '{}'
    constraint ai_chats_response_ids_valid check (
      cardinality(response_ids) <= 100
      and array_to_string(response_ids, ',') ~ '^(resp_[A-Za-z0-9_-]{1,200}(,resp_[A-Za-z0-9_-]{1,200})*)?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_chats_household_id_id_key unique (household_id, id),
  constraint ai_chats_conversation_id_key unique (conversation_id),
  constraint ai_chats_created_by_fkey foreign key (household_id, created_by)
    references public.household_members (household_id, profile_id) on delete set null (created_by)
);

create index ai_chats_household_id_updated_at_idx on public.ai_chats (household_id, updated_at);
create index ai_chats_household_id_created_by_idx on public.ai_chats (household_id, created_by);

grant select on public.ai_chats to authenticated;
select private.attach_household_policies('public.ai_chats');
select private.attach_sync_triggers('public.ai_chats');

-- ---------------------------------------------------------------------------------------------
-- The writes of ai-agent (as the caller). Security definer: members have no write grant.
-- ---------------------------------------------------------------------------------------------

-- A new chat of a household the caller is a member of; created_by is the caller.
create function private.create_ai_chat(
  p_household_id uuid, p_conversation_id text, p_title text, p_place_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null or p_household_id not in (select private.my_household_ids()) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  insert into public.ai_chats (household_id, conversation_id, title, place_label, created_by)
  values (p_household_id, p_conversation_id, p_title, nullif(p_place_label, ''), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- One answer of the chat: its id once; the title of its cards replaces the first words of the
-- first message only while the chat has no other answer (spec 0066, AC-024).
create function private.record_ai_chat_turn(p_chat_id uuid, p_response_id text, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat public.ai_chats;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select c.* into v_chat from public.ai_chats c
  where c.id = p_chat_id and c.household_id in (select private.my_household_ids())
  for update;
  if v_chat.id is null then
    raise exception 'chat_not_found' using errcode = 'P0002';
  end if;
  update public.ai_chats c
  set response_ids = case when p_response_id = any (c.response_ids) then c.response_ids
                          else c.response_ids || p_response_id end,
      title = case when nullif(p_title, '') is not null
                    and cardinality(array_remove(c.response_ids, p_response_id)) = 0
                   then p_title else c.title end
  where c.id = v_chat.id;
end
$$;

create function private.delete_ai_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.ai_chats c
  where c.id = p_chat_id and c.household_id in (select private.my_household_ids());
  if not found then
    raise exception 'chat_not_found' using errcode = 'P0002';
  end if;
end
$$;

revoke all on function private.create_ai_chat(uuid, text, text, text) from public, anon;
revoke all on function private.record_ai_chat_turn(uuid, text, text) from public, anon;
revoke all on function private.delete_ai_chat(uuid) from public, anon;
grant execute on function private.create_ai_chat(uuid, text, text, text) to authenticated;
grant execute on function private.record_ai_chat_turn(uuid, text, text) to authenticated;
grant execute on function private.delete_ai_chat(uuid) to authenticated;

create function public.create_ai_chat(
  household_id uuid, conversation_id text, title text, place_label text)
returns uuid
language sql
set search_path = ''
as $$ select private.create_ai_chat($1, $2, $3, $4) $$;

create function public.record_ai_chat_turn(chat_id uuid, response_id text, title text)
returns void
language sql
set search_path = ''
as $$ select private.record_ai_chat_turn($1, $2, $3) $$;

create function public.delete_ai_chat(chat_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.delete_ai_chat($1) $$;

revoke all on function public.create_ai_chat(uuid, text, text, text) from public, anon;
revoke all on function public.record_ai_chat_turn(uuid, text, text) from public, anon;
revoke all on function public.delete_ai_chat(uuid) from public, anon;
grant execute on function public.create_ai_chat(uuid, text, text, text) to authenticated;
grant execute on function public.record_ai_chat_turn(uuid, text, text) to authenticated;
grant execute on function public.delete_ai_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_household: chats first (unchanged from 20261126144439 except ai_chats_remaining)
-- ---------------------------------------------------------------------------------------------

create or replace function private.delete_household(p_household_id uuid)
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
    where o.bucket_id in ('household-media', 'household-videos')
      and o.name like p_household_id::text || '/%'
  ) then
    raise exception 'media_remaining' using errcode = 'P0001';
  end if;
  -- Spec 0066, REQ-010: the conversations in Foundry are deleted by the app first (ai-agent purge).
  if exists (select 1 from public.ai_chats c where c.household_id = p_household_id) then
    raise exception 'ai_chats_remaining' using errcode = 'P0001';
  end if;

  delete from public.households h where h.id = p_household_id;
  delete from public.deleted_records d where d.household_id = p_household_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- sync_pull: ai_chats (otherwise unchanged from 20261127130000)
-- ---------------------------------------------------------------------------------------------

create or replace function public.sync_pull(p_request jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  -- The synced household tables (db-handoff T6, spec 0004; packing tables spec 0012; collection_recipes
  -- spec 0009; notification_settings spec 0013, where RLS returns only the caller's own row; trips and
  -- trip_members spec 0022; activity_kinds, activity_series, activity_series_exceptions spec 0041;
  -- recurring_items spec 0060; ai_chats spec 0066).
  -- Small tables are listed separately below.
  c_tables constant text[] := array[
    'areas', 'articles', 'stores',
    'recipes', 'recipe_favorites', 'recipe_ratings', 'collection_recipes',
    'restaurants', 'restaurant_favorites', 'restaurant_ratings',
    'activities', 'activity_favorites', 'activity_ratings',
    'activity_kinds', 'activity_series', 'activity_series_exceptions',
    'trips', 'trip_members', 'feedback', 'feedback_votes',
    'packing_bags', 'packing_bag_items', 'packing_list_bags', 'packing_items',
    'chores', 'chore_events', 'meal_plan_entries', 'notification_settings',
    'recurring_items', 'shopping_items', 'shopping_contributions', 'ai_chats'];

  v_household_id uuid;
  v_request jsonb;
  v_full boolean;
  v_since jsonb;
  v_table text;
  v_table_rows jsonb;
  v_rows jsonb;
  v_tombstones jsonb;
  v_households jsonb := '{}';
begin
  if jsonb_typeof(p_request) is distinct from 'object'
     or jsonb_typeof(p_request -> 'households') is distinct from 'object' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  for v_household_id, v_request in
    select h.id, r.value
    from jsonb_each(p_request -> 'households') r
    join private.my_household_ids() h (id) on h.id::text = lower(r.key)
  loop
    v_full := v_request ->> 'full' is distinct from 'false';
    v_since := case when not v_full and jsonb_typeof(v_request -> 'since') = 'object'
                    then v_request -> 'since' else '{}'::jsonb end;

    v_rows := '{}';
    foreach v_table in array c_tables loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t '
        'where t.household_id = $1 and ($2::timestamptz is null or t.updated_at > $2)',
        v_table)
      into v_table_rows
      using v_household_id, (v_since ->> v_table)::timestamptz;
      v_rows := v_rows || jsonb_build_object(v_table, v_table_rows);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('table', d.table_name, 'id', d.record_id, 'deletedAt', d.deleted_at)
                              order by d.deleted_at), '[]'::jsonb)
    into v_tombstones
    from public.deleted_records d
    where d.household_id = v_household_id
      and d.table_name = any (c_tables)
      and (not v_since ? d.table_name or d.deleted_at > (v_since ->> d.table_name)::timestamptz);

    v_households := v_households || jsonb_build_object(v_household_id::text, jsonb_build_object(
      'full', v_full, 'rows', v_rows, 'tombstones', v_tombstones));
  end loop;

  return jsonb_build_object(
    'serverTime', now(),
    'small', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.profiles p),
      'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) from public.households h),
      'household_members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.household_id, m.profile_id), '[]'::jsonb)
                            from public.household_members m),
      'household_invitations', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
                                from public.household_invitations i)),
    'households', v_households);
end
$$;
