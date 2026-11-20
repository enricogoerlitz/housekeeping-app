-- Spec 0003, T7 — AI quota: ai_usage and consume_ai_quota.
--
-- Every edge function charges the caller's daily quota before a paid AI call (plan.md, decision
-- "KI-Kontingent": 200 requests and 20 speech tokens per member and day; AC-030). The day is the
-- calendar day in Europe/Berlin. ai_usage is per person, not per household: RLS on, no grants,
-- not synced (exception in the schema linter). Only consume_ai_quota writes it.

create table public.ai_usage (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  requests integer not null default 0
    constraint ai_usage_requests_valid check (requests between 0 and 200),
  speech_tokens integer not null default 0
    constraint ai_usage_speech_tokens_valid check (speech_tokens between 0 and 20),
  primary key (profile_id, day)
);

alter table public.ai_usage enable row level security;
-- No policy and no grant: the API roles cannot touch the table.

-- Charges p_amount of p_kind ('request' | 'speech') to the caller's counter for today (Berlin).
-- Returns true when allowed and counted, false when it would exceed the limit; a refused call
-- counts nothing. The conditional update is atomic: concurrent calls cannot overshoot.
create function private.consume_ai_quota(p_kind text, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/Berlin')::date;
  v_limit integer := case p_kind when 'request' then 200 when 'speech' then 20 end;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_limit is null then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_amount > v_limit then
    return false;
  end if;

  insert into public.ai_usage (profile_id, day) values (v_uid, v_day) on conflict do nothing;

  if p_kind = 'request' then
    update public.ai_usage u set requests = u.requests + p_amount
    where u.profile_id = v_uid and u.day = v_day and u.requests + p_amount <= v_limit;
  else
    update public.ai_usage u set speech_tokens = u.speech_tokens + p_amount
    where u.profile_id = v_uid and u.day = v_day and u.speech_tokens + p_amount <= v_limit;
  end if;
  return found;
end
$$;

grant execute on function private.consume_ai_quota(text, integer) to authenticated;

-- Parameter names kind/amount match the edge functions' call
-- (supabase/functions/_shared/quota.ts: rpc('consume_ai_quota', { kind, amount })).
create function public.consume_ai_quota(kind text, amount integer)
returns boolean
language sql
set search_path = ''
as $$ select private.consume_ai_quota($1, $2) $$;

grant execute on function public.consume_ai_quota(text, integer) to authenticated;
