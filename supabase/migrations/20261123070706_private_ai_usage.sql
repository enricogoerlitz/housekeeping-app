-- Spec 0031, REQ-015 (D-04) — the AI quota counters are per person, not per household: like the
-- other per-person tables (ADR-0014) the table moves to the schema private (RLS on, no policies,
-- no grants, not synced). The rows, the limits and the atomic conditional update of
-- consume_ai_quota stay as they are; only the schema of the table changes (AC-038, AC-039).

alter table public.ai_usage set schema private;
revoke all on private.ai_usage from public, anon, authenticated;

-- Unchanged from 20261121062401_ai_usage, on private.ai_usage.
create or replace function private.consume_ai_quota(p_kind text, p_amount integer)
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

  insert into private.ai_usage (profile_id, day) values (v_uid, v_day) on conflict do nothing;

  if p_kind = 'request' then
    update private.ai_usage u set requests = u.requests + p_amount
    where u.profile_id = v_uid and u.day = v_day and u.requests + p_amount <= v_limit;
  else
    update private.ai_usage u set speech_tokens = u.speech_tokens + p_amount
    where u.profile_id = v_uid and u.day = v_day and u.speech_tokens + p_amount <= v_limit;
  end if;
  return found;
end
$$;

create or replace function private.purge_ai_usage()
returns void
language sql
set search_path = ''
as $$
  delete from private.ai_usage where day < (now() at time zone 'Europe/Berlin')::date - 90;
$$;
