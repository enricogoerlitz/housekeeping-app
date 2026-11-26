-- contract: Web Push entfällt (Push-Abos, Zustell-Protokoll, Planer, Geräte-RPCs), Spec 0051; min_app_version: 2026.11.3
-- Spec 0051 — Mitteilungen in der App statt Push (ADR-0017 supersedes ADR-0014).
--
-- * Removes Web Push completely: the cron jobs of the notification tick, the Vault entries of the
--   hand-over to push-send, the push RPCs, the scheduler and every SQL twin of the domain rules
--   that only the scheduler used (Decision 11; is_silent stays, chores wait on trips), the push
--   subscriptions and the delivery log (both in schema private, never synced).
-- * Adds the acknowledgements of the in-app notices to the member's own, synced row of
--   notification_settings (Decision 7), written only through acknowledge_notices, which unites
--   atomically and prunes what is older than 14 days (Decision 8).
-- * The old setting columns stay until a later contract migration (Decision 9): the released app
--   2026.11.2 reads them, and apply_changes lists them in its allowlist.
-- * Apps before 2026.11.3 call RPCs that are gone: they stop writing (Decision 10).

-- ---------------------------------------------------------------------------------------------
-- Scheduler and Vault
-- ---------------------------------------------------------------------------------------------

select cron.unschedule(j.jobid)
from cron.job j
where j.jobname in ('notification-tick', 'purge-notification-deliveries');

delete from vault.secrets where name in ('push_send_secret', 'push_send_url');

-- ---------------------------------------------------------------------------------------------
-- Push RPCs, scheduler and the SQL twins of the domain rules
-- ---------------------------------------------------------------------------------------------

drop function public.list_push_subscriptions(text);
drop function public.register_push_subscription(text, text, text, text);
drop function public.remove_push_subscription(uuid);
drop function public.send_test_push(text);
drop function public.set_push_subscription_enabled(text, boolean);
drop function public.unregister_push_subscription(text);

drop function private.run_notification_tick(timestamptz);
drop function private.collect_push_responses(timestamptz);
drop function private.purge_notification_deliveries();
drop function private.push_bundles(jsonb);
drop function private.post_push_bundle(text, text, jsonb);
drop function private.push_message(bigint, private.push_subscriptions, integer, text, text, text, text);
drop function private.push_send_config();
drop function private.list_push_subscriptions(text);
drop function private.register_push_subscription(text, text, text, text);
drop function private.remove_push_subscription(uuid);
drop function private.send_test_push(text);
drop function private.set_push_subscription_enabled(text, boolean);
drop function private.unregister_push_subscription(text);

drop function private.notification_candidates(timestamptz);
drop function private.daily_summary_candidates(timestamptz);
drop function private.daily_summary_body(uuid, uuid, date, text[]);
drop function private.activities_eve_candidates(timestamptz);
drop function private.chore_reminder_candidates(timestamptz);
drop function private.entry_reminder_candidates(timestamptz);
drop function private.entry_reminder_body(text, integer, date, text, time, text);
drop function private.notification_households(timestamptz);
drop function private.notification_text(text, text[]);
drop function private.prep_items(uuid, date, time);
drop function private.plan_entry_title(public.meal_plan_entries);
drop function private.meal_slot_positions(uuid);
drop function private.slot_start_time(text);
drop function private.parenthesize(text[]);
drop function private.format_time(time);
drop function private.hour_label(time);
drop function private.weekday_long(date);
drop function private.weekday_short(date);
drop function private.is_known_timezone(text);
drop function private.try_uuid(text);
drop function private.chore_assignees(public.chores, date);
drop function private.chore_acting_assignee(public.chores, date);
drop function private.chore_due_text(public.chores, date);
drop function private.chore_day_label(date, date);
drop function private.chore_shown_day(public.chores, date);
drop function private.chore_due_state(public.chores, date);
drop function private.chore_flexible_progress(public.chores, date);
drop function private.chore_count_day(public.chores);
drop function private.chore_first_free_day(public.chores, date);
drop function private.chore_can_do_on(public.chores, date);
drop function private.chore_rotation(public.chores);
drop function private.chore_every_days(public.chores);
drop function private.chore_stored_due_on(public.chores);
drop function private.chore_is_paused(public.chores, date);

-- ---------------------------------------------------------------------------------------------
-- Push subscriptions and the delivery log (personal and server data, ADR-0014)
-- ---------------------------------------------------------------------------------------------

drop index public.meal_plan_entries_reminder_send_day_idx;
drop table private.notification_deliveries;
drop table private.push_subscriptions;
drop function private.is_push_endpoint(text);
-- Only the two tables above used it.
drop function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Acknowledgements of the in-app notices
-- ---------------------------------------------------------------------------------------------

-- The day a notice belongs to: the date at the end of its key
-- "<kind>:<id>[:<more>]:<YYYY-MM-DD>"; null for anything that is not such a key (at most 200
-- characters, a real date).
create function private.notice_day(p_key text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_key is null or char_length(p_key) > 200
     or p_key !~ '^[a-z]{1,16}(:[A-Za-z0-9-]{1,64}){1,4}:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return right(p_key, 10)::date;
exception when others then
  return null;
end
$$;

alter table public.notification_settings
  add column acknowledged_notices text[] not null default '{}',
  add constraint notification_settings_acknowledged_notices_size check (cardinality(acknowledged_notices) <= 400);

-- Acknowledges notices of the signed-in member in one of her households: unites with what is
-- there (two devices never lose each other's), drops what belongs to a day more than 14 days ago
-- on the household's clock and keeps the newest 400. No column grant: this is the only way in.
create function private.acknowledge_notices(p_household_id uuid, p_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_key text;
begin
  if p_keys is null or cardinality(p_keys) > 100 then
    raise exception 'invalid_notice' using errcode = '22023';
  end if;
  foreach v_key in array p_keys loop
    if private.notice_day(v_key) is null then
      raise exception 'invalid_notice' using errcode = '22023';
    end if;
  end loop;

  select (pg_catalog.now() at time zone h.timezone)::date into v_today
  from public.households h
  where h.id = p_household_id and h.id in (select private.my_household_ids());
  if v_today is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- No day further ahead than a reminder can lie (366 days, spec 0017): far-future keys would
  -- otherwise push every real acknowledgement out of the newest 400 (security check 26.11.2026).
  if exists (select 1 from unnest(p_keys) k where private.notice_day(k) > v_today + 367) then
    raise exception 'invalid_notice' using errcode = '22023';
  end if;

  update public.notification_settings s
  set acknowledged_notices = array(
    select x.k
    from (select distinct u.k from unnest(s.acknowledged_notices || p_keys) u (k)) x
    where private.notice_day(x.k) >= v_today - 14
    order by private.notice_day(x.k) desc, x.k
    limit 400)
  where s.household_id = p_household_id and s.member_id = (select auth.uid());
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end
$$;

revoke all on function private.notice_day(text) from public;
revoke all on function private.acknowledge_notices(uuid, text[]) from public;
grant execute on function private.acknowledge_notices(uuid, text[]) to authenticated;

create function public.acknowledge_notices(household_id uuid, keys text[])
returns void
language sql
set search_path = ''
as $$ select private.acknowledge_notices($1, $2) $$;

revoke all on function public.acknowledge_notices(uuid, text[]) from public;
grant execute on function public.acknowledge_notices(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Minimum app version (Decision 10)
-- ---------------------------------------------------------------------------------------------

create or replace function public.min_app_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '2026.11.3'::text
$$;
