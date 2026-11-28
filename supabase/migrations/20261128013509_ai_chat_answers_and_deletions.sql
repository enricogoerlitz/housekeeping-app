-- Spec 0067 "Housekeeping-Agent", step C (REQ-015, decision 13). Critical path: concurrency of
-- the agent, deletion of chats. Additive only.
--
-- * private.ai_chat_answers: one answer per chat at a time (AC-024). The edge function ai-agent
--   takes the chat's lease before an answer (begin_ai_chat_answer) and gives it back after
--   (end_ai_chat_answer); a second send in the same chat waits, the app asks ai_chat_answering.
--   The lease runs out after 150 s (an answer stops after 120 s), so a crashed function never
--   locks a chat for good. Not synced, no grants: a lock is the server's, not household data.
-- * private.ai_chat_deletions: every deleted ai_chats row with its conversation and answers (a
--   trigger). The function clears the entries it deleted in Foundry itself; entries of a chat
--   deleted any other way (delete_ai_chat called directly, a household deleted outside the app)
--   stay until the function's next delete or purge of that household cleans them up. Closes the
--   accepted risk of spec 0066 ("delete_ai_chat directly").
-- * delete_household: refuses with ai_chats_remaining while the log holds the household's chats.

-- ---------------------------------------------------------------------------------------------
-- private.ai_chat_answers
-- ---------------------------------------------------------------------------------------------

create table private.ai_chat_answers (
  chat_id uuid primary key references public.ai_chats (id) on delete cascade,
  token uuid not null,
  until timestamptz not null
);

alter table private.ai_chat_answers enable row level security;
revoke all on private.ai_chat_answers from public, anon, authenticated;

-- The chat of a household the caller is a member of; else chat_not_found (no hint whether it
-- exists elsewhere).
create function private.my_ai_chat(p_chat_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select c.id into v_id from public.ai_chats c
  where c.id = p_chat_id and c.household_id in (select private.my_household_ids());
  if v_id is null then
    raise exception 'chat_not_found' using errcode = 'P0002';
  end if;
  return v_id;
end
$$;

-- True when the answer may run: no other answer holds the chat, or its lease ran out.
create function private.begin_ai_chat_answer(p_chat_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid := private.my_ai_chat(p_chat_id);
begin
  if p_token is null then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  insert into private.ai_chat_answers (chat_id, token, until)
  values (v_chat, p_token, now() + interval '150 seconds')
  on conflict (chat_id) do update
    set token = excluded.token, until = excluded.until
    where private.ai_chat_answers.until < now();
  return found;
end
$$;

-- Gives the chat back; only the answer that took it (its token) can.
create function private.end_ai_chat_answer(p_chat_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid := private.my_ai_chat(p_chat_id);
begin
  delete from private.ai_chat_answers a where a.chat_id = v_chat and a.token = p_token;
end
$$;

create function private.ai_chat_answering(p_chat_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chat uuid := private.my_ai_chat(p_chat_id);
begin
  return exists (select 1 from private.ai_chat_answers a where a.chat_id = v_chat and a.until >= now());
end
$$;

-- ---------------------------------------------------------------------------------------------
-- private.ai_chat_deletions
-- ---------------------------------------------------------------------------------------------

create table private.ai_chat_deletions (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: an entry outlives a household deleted outside the app (for the operator).
  household_id uuid not null,
  conversation_id text not null,
  response_ids text[] not null default '{}',
  deleted_at timestamptz not null default now()
);

create index ai_chat_deletions_household_id_idx on private.ai_chat_deletions (household_id);

alter table private.ai_chat_deletions enable row level security;
revoke all on private.ai_chat_deletions from public, anon, authenticated;

create function private.log_ai_chat_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.ai_chat_deletions (household_id, conversation_id, response_ids)
  values (old.household_id, old.conversation_id, old.response_ids);
  return old;
end
$$;

revoke all on function private.log_ai_chat_deletion() from public, anon, authenticated;

create trigger ai_chats_log_deletion
after delete on public.ai_chats
for each row execute function private.log_ai_chat_deletion();

create function private.pending_ai_chat_deletions(p_household_id uuid)
returns table (id uuid, conversation_id text, response_ids text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null or p_household_id not in (select private.my_household_ids()) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  return query
    select d.id, d.conversation_id, d.response_ids from private.ai_chat_deletions d
    where d.household_id = p_household_id
    order by d.deleted_at, d.id
    limit 100;
end
$$;

-- The entries the function deleted in Foundry; ids of another household change nothing.
create function private.forget_ai_chat_deletions(p_household_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_household_id is null or p_household_id not in (select private.my_household_ids()) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  delete from private.ai_chat_deletions d
  where d.household_id = p_household_id and d.id = any (coalesce(p_ids, '{}'));
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function private.my_ai_chat(uuid) from public, anon;
revoke all on function private.begin_ai_chat_answer(uuid, uuid) from public, anon;
revoke all on function private.end_ai_chat_answer(uuid, uuid) from public, anon;
revoke all on function private.ai_chat_answering(uuid) from public, anon;
revoke all on function private.pending_ai_chat_deletions(uuid) from public, anon;
revoke all on function private.forget_ai_chat_deletions(uuid, uuid[]) from public, anon;
grant execute on function private.my_ai_chat(uuid) to authenticated;
grant execute on function private.begin_ai_chat_answer(uuid, uuid) to authenticated;
grant execute on function private.end_ai_chat_answer(uuid, uuid) to authenticated;
grant execute on function private.ai_chat_answering(uuid) to authenticated;
grant execute on function private.pending_ai_chat_deletions(uuid) to authenticated;
grant execute on function private.forget_ai_chat_deletions(uuid, uuid[]) to authenticated;

create function public.begin_ai_chat_answer(chat_id uuid, token uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.begin_ai_chat_answer($1, $2) $$;

create function public.end_ai_chat_answer(chat_id uuid, token uuid)
returns void
language sql
set search_path = ''
as $$ select private.end_ai_chat_answer($1, $2) $$;

create function public.ai_chat_answering(chat_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select private.ai_chat_answering($1) $$;

create function public.pending_ai_chat_deletions(household_id uuid)
returns table (id uuid, conversation_id text, response_ids text[])
language sql
stable
set search_path = ''
as $$ select * from private.pending_ai_chat_deletions($1) $$;

create function public.forget_ai_chat_deletions(household_id uuid, ids uuid[])
returns integer
language sql
set search_path = ''
as $$ select private.forget_ai_chat_deletions($1, $2) $$;

revoke all on function public.begin_ai_chat_answer(uuid, uuid) from public, anon;
revoke all on function public.end_ai_chat_answer(uuid, uuid) from public, anon;
revoke all on function public.ai_chat_answering(uuid) from public, anon;
revoke all on function public.pending_ai_chat_deletions(uuid) from public, anon;
revoke all on function public.forget_ai_chat_deletions(uuid, uuid[]) from public, anon;
grant execute on function public.begin_ai_chat_answer(uuid, uuid) to authenticated;
grant execute on function public.end_ai_chat_answer(uuid, uuid) to authenticated;
grant execute on function public.ai_chat_answering(uuid) to authenticated;
grant execute on function public.pending_ai_chat_deletions(uuid) to authenticated;
grant execute on function public.forget_ai_chat_deletions(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_household: the log too (unchanged from 20261127191345 except the log)
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
  -- Spec 0066, REQ-010: the conversations in Foundry are deleted by the app first (ai-agent purge);
  -- spec 0067: also those of chats deleted without them (the log).
  if exists (select 1 from public.ai_chats c where c.household_id = p_household_id)
     or exists (select 1 from private.ai_chat_deletions d where d.household_id = p_household_id) then
    raise exception 'ai_chats_remaining' using errcode = 'P0001';
  end if;

  delete from public.households h where h.id = p_household_id;
  delete from public.deleted_records d where d.household_id = p_household_id;
end
$$;
