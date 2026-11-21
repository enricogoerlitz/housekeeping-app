-- Baseline (ADR-0012) — notifications (spec 0013, ADR-0014): settings per member, push
-- subscriptions per person, the delivery log, the scheduler and its RPCs.
--
-- * public.notification_settings is household-scoped and synced like every table, but only the
--   member herself reads and changes her row (Decision 3). The server creates the row with the
--   defaults when someone becomes a member; it goes with the membership.
-- * private.push_subscriptions (per person) and private.notification_deliveries (server log) are
--   the reviewed exceptions of rule 5: schema private, RLS on, no policies, no grants, not synced,
--   reached only through the security definer RPCs below and the scheduler.
-- * The database plans (ADR-0014): pg_cron runs private.run_notification_tick() every 5 minutes;
--   it finds the due messages in the household's local time, writes each once per device into the
--   log (unique key, at most once) and hands them in bundles of at most 50 to the Edge Function
--   push-send through pg_net, with the shared secret from the Vault. The next tick reads the
--   answers. push-send has no database access.
-- * Secrets and the target URL live only in the Vault (push_send_secret, push_send_url), never
--   here. Without them nothing is planned and nothing is logged (Decision 22).
--
-- The rules "fällig" and "wer ist dran" exist here and in packages/core (dueChores,
-- choreMemberIds); notification_parity.test.sql keeps them in step (Decision 10).

-- ---------------------------------------------------------------------------------------------
-- pg_net, out of reach of the API roles
-- ---------------------------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

-- Supabase's event trigger grants schema net and net.http_get / net.http_post to anon and
-- authenticated, as the owner supabase_admin; this migration runs as postgres and cannot take
-- that back. What keeps a member from sending requests from the database (SSRF, AC-046): the API
-- exposes only the schemas public and graphql_public, and no function it exposes calls net.*
-- except send_test_push, which posts only to the Vault's push_send_url (push_subscriptions.test.sql).

-- ---------------------------------------------------------------------------------------------
-- notification_settings
-- ---------------------------------------------------------------------------------------------

-- One row per member and household (D38). Defaults (D36): only chore and reservation reminders
-- on. daily_summary_parts: 1 to 4 of meals, activities, chores, prep, each at most once.
create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  daily_summary_enabled boolean not null default false,
  daily_summary_at time not null default '07:30'
    constraint notification_settings_daily_summary_at_five_minutes check (private.is_five_minute_time(daily_summary_at)),
  daily_summary_parts text[] not null default '{meals,activities,chores,prep}'
    constraint notification_settings_daily_summary_parts_valid check (
      cardinality(daily_summary_parts) between 1 and 4
      and daily_summary_parts <@ '{meals,activities,chores,prep}'::text[]
      and cardinality(daily_summary_parts) = (case when 'meals' = any (daily_summary_parts) then 1 else 0 end)
                                            + (case when 'activities' = any (daily_summary_parts) then 1 else 0 end)
                                            + (case when 'chores' = any (daily_summary_parts) then 1 else 0 end)
                                            + (case when 'prep' = any (daily_summary_parts) then 1 else 0 end)),
  activities_eve_enabled boolean not null default false,
  activities_eve_at time not null default '19:00'
    constraint notification_settings_activities_eve_at_five_minutes check (private.is_five_minute_time(activities_eve_at)),
  chore_reminders_enabled boolean not null default true,
  reservation_reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_household_id_id_key unique (household_id, id),
  constraint notification_settings_household_id_member_id_key unique (household_id, member_id),
  constraint notification_settings_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, profile_id) on delete cascade
);

create index notification_settings_household_id_updated_at_idx
  on public.notification_settings (household_id, updated_at);

-- Own policies instead of attach_household_policies: the member's own row only. No insert or
-- delete policy and no grant: the server creates the row, the membership takes it away.
alter table public.notification_settings enable row level security;
grant select on public.notification_settings to authenticated;
grant update (daily_summary_enabled, daily_summary_at, daily_summary_parts, activities_eve_enabled, activities_eve_at,
              chore_reminders_enabled, reservation_reminders_enabled)
  on public.notification_settings to authenticated;
create policy notification_settings_select on public.notification_settings for select to authenticated
  using (household_id in (select private.my_household_ids()) and member_id = (select auth.uid()));
create policy notification_settings_update on public.notification_settings for update to authenticated
  using (household_id in (select private.my_household_ids()) and member_id = (select auth.uid()))
  with check (household_id in (select private.my_household_ids()) and member_id = (select auth.uid()));
select private.attach_sync_triggers('public.notification_settings');

-- After insert of a membership (create_household, accept_invitation, seed): the row with the
-- defaults. The defaults live only in the column defaults above.
create function private.create_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (household_id, member_id)
  values (new.household_id, new.profile_id)
  on conflict (household_id, member_id) do nothing;
  return null;
end
$$;

create trigger household_members_create_notification_settings after insert on public.household_members
  for each row execute function private.create_notification_settings();

-- ---------------------------------------------------------------------------------------------
-- private.push_subscriptions, private.notification_deliveries
-- ---------------------------------------------------------------------------------------------

-- A push address of a known push service (Decision 20, AC-044): https, no credentials, no port,
-- a path of URL characters, at most 1024 characters. push-send checks the same list again before
-- every request.
create function private.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_endpoint is not null
    and char_length(p_endpoint) <= 1024
    and p_endpoint ~ ('^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com'
                      || '|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.notify\.windows\.com)'
                      || '/[A-Za-z0-9._~:/?@!$&''()*+,;=%-]*$')
$$;

-- Before update of a private table: the server time. (set_timestamps would also overwrite
-- created_at on insert, which the purge test and the log do not want.)
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- One row per browser push subscription. It belongs to a person, not to a household, and is never
-- synced (ADR-0014). The address belongs to whoever registered it last (Decision 19).
-- p256dh: base64url of an uncompressed P-256 point (65 bytes, starts with 0x04 = "B");
-- auth: base64url of 16 bytes.
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null
    constraint push_subscriptions_endpoint_key unique
    constraint push_subscriptions_endpoint_valid check (private.is_push_endpoint(endpoint)),
  p256dh text not null
    constraint push_subscriptions_p256dh_valid check (p256dh ~ '^B[A-Za-z0-9_-]{86}$'),
  auth text not null
    constraint push_subscriptions_auth_valid check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  device_label text not null
    constraint push_subscriptions_device_label_valid check (
      char_length(device_label) between 1 and 60 and device_label = btrim(device_label)
      and device_label !~ '[[:cntrl:]]'),
  enabled boolean not null default true,
  gone_at timestamptz,
  last_success_at timestamptz,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_profile_id_idx on private.push_subscriptions (profile_id);

alter table private.push_subscriptions enable row level security;
revoke all on private.push_subscriptions from public, anon, authenticated;
create trigger push_subscriptions_touch_updated_at before update on private.push_subscriptions
  for each row execute function private.touch_updated_at();

-- The delivery log: one row per message and device, written before the call (at most once,
-- Decision 7). No content: title and text exist only in the tick and in the call to push-send.
-- dedupe_key (Decision 6): daily:<household>:<profile>:<day>, eve:<household>:<profile>:<day>,
-- chore:<chore>:<day>, reservation:<entry>:<day>:<HH:MM>, test:<uuid>. Kept 30 days.
create table private.notification_deliveries (
  id bigint generated always as identity primary key,
  dedupe_key text not null
    constraint notification_deliveries_dedupe_key_length check (char_length(dedupe_key) between 1 and 200),
  subscription_id uuid not null references private.push_subscriptions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  kind text not null
    constraint notification_deliveries_kind_known check (
      kind in ('daily_summary', 'activities_eve', 'chore_reminder', 'reservation_reminder', 'test')),
  due_at timestamptz not null,
  status text not null default 'pending'
    constraint notification_deliveries_status_known check (status in ('pending', 'sent', 'failed', 'gone')),
  request_id bigint,
  http_status smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_dedupe_key_subscription_id_key unique (dedupe_key, subscription_id)
);

create index notification_deliveries_pending_request_id_idx
  on private.notification_deliveries (request_id) where status = 'pending';
create index notification_deliveries_created_at_idx on private.notification_deliveries (created_at);
create index notification_deliveries_subscription_id_idx on private.notification_deliveries (subscription_id);
create index notification_deliveries_profile_id_created_at_idx
  on private.notification_deliveries (profile_id, created_at);
create index notification_deliveries_household_id_idx on private.notification_deliveries (household_id);

alter table private.notification_deliveries enable row level security;
revoke all on private.notification_deliveries from public, anon, authenticated;
create trigger notification_deliveries_touch_updated_at before update on private.notification_deliveries
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Rules shared with packages/core (Decision 9, 10)
-- ---------------------------------------------------------------------------------------------

-- The person (or the whole household) is away on that day (Decision 8, AC-035).
create function private.is_silent(p_household_id uuid, p_profile_id uuid, p_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.absences a
    where a.household_id = p_household_id
      and (a.member_id is null or a.member_id = p_profile_id)
      and p_day between a.from_on and a.to_on
  )
$$;

-- core isPaused: a chore outside its active months.
create function private.chore_is_paused(p_chore public.chores, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality((p_chore).active_months), 0) > 0
    and not (extract(month from p_day)::smallint = any ((p_chore).active_months))
$$;

-- core dueChores / choreBucket / flexibleProgress: 'overdue', 'today', 'flexible_due' (at least
-- FLEXIBLE_DUE_FROM = 0.8 of the interval passed, or never done) or null (not due, paused,
-- "bei Bedarf").
create function private.chore_due_state(p_chore public.chores, p_day date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when (p_chore).recurrence ->> 'type' = 'asNeeded' then null
    when private.chore_is_paused(p_chore, p_day) then null
    when (p_chore).recurrence ->> 'type' = 'flexible' then
      case
        when (p_chore).last_done_on is null
          or jsonb_typeof((p_chore).recurrence -> 'everyDays') is distinct from 'number'
          or ((p_chore).recurrence ->> 'everyDays')::numeric <= 0 then 'flexible_due'
        when greatest(0, p_day - (p_chore).last_done_on)::numeric
             / ((p_chore).recurrence ->> 'everyDays')::numeric >= 0.8 then 'flexible_due'
      end
    when (p_chore).next_due_on is null then null
    when (p_chore).next_due_on = p_day then 'today'
    when (p_chore).next_due_on < p_day then 'overdue'
  end
$$;

create function private.try_uuid(p_value text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end
$$;

-- Who is reminded of a chore (Decision 9): fixed → the next person, else the fixed member;
-- rotating → the next person, without one everyone in the rotation; anyone and together → empty,
-- meaning all members. Ids that are no (longer) members drop out when joined with the members.
create function private.chore_assignees(p_chore public.chores)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select case (p_chore).assignment ->> 'type'
    when 'fixed' then
      array_remove(array[coalesce((p_chore).next_assignee_id,
                                  private.try_uuid((p_chore).assignment ->> 'memberId'))], null)
    when 'rotating' then
      case when (p_chore).next_assignee_id is not null then array[(p_chore).next_assignee_id]
           else array(select private.try_uuid(e)
                      from jsonb_array_elements_text(
                        case when jsonb_typeof((p_chore).assignment -> 'memberIds') = 'array'
                             then (p_chore).assignment -> 'memberIds' else '[]' end) with ordinality x (e, ord)
                      where private.try_uuid(e) is not null
                      order by ord)
      end
    else '{}'::uuid[]
  end
$$;

-- ---------------------------------------------------------------------------------------------
-- Texts (Decision 11)
-- ---------------------------------------------------------------------------------------------

-- H:MM, e.g. 7:30, 19:00.
create function private.format_time(p_time time)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(p_time, 'FMHH24:MI') $$;

-- " (a, b)" from the non-empty parts, or ''.
create function private.parenthesize(p_parts text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(' (' || nullif(array_to_string(array(select p from unnest(p_parts) p where p <> ''), ', '), '') || ')', '')
$$;

-- prefix + segments joined by " · ", at most 400 characters: what does not fit ends with " · …".
-- null when there is no segment.
create function private.notification_text(p_prefix text, p_segments text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_max constant integer := 400;
  c_more constant text := ' · …';
  v_full text := p_prefix || array_to_string(p_segments, ' · ');
  v_text text;
  v_next text;
  v_segment text;
begin
  if coalesce(cardinality(p_segments), 0) = 0 then
    return null;
  end if;
  if char_length(v_full) <= c_max then
    return v_full;
  end if;
  foreach v_segment in array p_segments loop
    v_next := case when v_text is null then p_prefix || v_segment else v_text || ' · ' || v_segment end;
    exit when char_length(v_next) + char_length(c_more) > c_max;
    v_text := v_next;
  end loop;
  if v_text is null then
    return left(p_prefix || p_segments[1], c_max - char_length(c_more)) || c_more;
  end if;
  return v_text || c_more;
end
$$;

-- A zone Postgres knows. (Looking it up in pg_timezone_names reads the whole zone database,
-- which is too slow for every tick.)
create function private.is_known_timezone(p_timezone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  perform pg_catalog.now() at time zone p_timezone;
  return true;
exception when invalid_parameter_value then
  return false;
end
$$;

-- The households the scheduler looks at, with "today" in local time: only zones Postgres knows,
-- so one invalid value never stops the tick for everyone (Decision 16).
create function private.notification_households(p_now timestamptz)
returns table (household_id uuid, timezone text, today date)
language sql
stable
set search_path = ''
as $$
  select x.id, x.timezone, (p_now at time zone x.timezone)::date
  from (select h.id, h.timezone from public.households h where private.is_known_timezone(h.timezone) offset 0) x
$$;

-- The meal slots of a household in their order (core entriesForDay: by sort, then position).

create function private.meal_slot_positions(p_household_id uuid)
returns table (slot_id uuid, name text, pos bigint)
language sql
stable
set search_path = ''
as $$
  select private.try_uuid(s.value ->> 'id'), s.value ->> 'name',
         row_number() over (order by case when jsonb_typeof(s.value -> 'sort') = 'number'
                                          then (s.value ->> 'sort')::numeric end nulls last, s.ord)
  from public.households h, jsonb_array_elements(h.meal_slots) with ordinality s (value, ord)
  where h.id = p_household_id
$$;

-- The text of a person's daily summary for one day, from the chosen parts (Decision 9, 10, 11):
-- the day's entries in the order of the day (activities for everyone, meals for those who eat
-- along, "du kochst" for the cook), then the due chores of the person (overdue first), then
-- "Für morgen:" with the lead times of tomorrow's recipes she cooks (or eats, without a cook).
-- null when there is nothing (AC-017).
create function private.daily_summary_body(p_household_id uuid, p_profile_id uuid, p_day date, p_parts text[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day text[];
  v_chores text[];
  v_prep text[];
  v_segments text[];
begin
  select coalesce(array_agg(x.segment order by x.pos, x.kind_rank, x.sort, x.id), '{}')
  into v_day
  from (
    select e.id, e.sort, coalesce(sl.pos, 2147483647) as pos,
           case e.kind when 'activity' then 0 when 'restaurant' then 2 else 1 end as kind_rank,
           case e.kind
             when 'activity' then a.name || private.parenthesize(array[e.note, sl.name])
             when 'restaurant' then r.name || private.parenthesize(array[sl.name, private.format_time(e.reserved_at)])
             else
               case e.kind
                 when 'leftovers' then 'Reste: ' || coalesce(rc.title, src_rc.title, src.text, 'Reste')
                 when 'text' then e.text
                 else rc.title
               end
               || private.parenthesize(array[sl.name, case when e.cook_id = p_profile_id then 'du kochst' end])
           end as segment
    from public.meal_plan_entries e
    left join private.meal_slot_positions(p_household_id) sl on sl.slot_id = e.slot_id
    left join public.activities a on a.household_id = e.household_id and a.id = e.activity_id
    left join public.restaurants r on r.household_id = e.household_id and r.id = e.restaurant_id
    left join public.recipes rc on rc.household_id = e.household_id and rc.id = e.recipe_id
    left join public.meal_plan_entries src on src.household_id = e.household_id and src.id = e.leftovers_of_entry_id
    left join public.recipes src_rc on src_rc.household_id = src.household_id and src_rc.id = src.recipe_id
    where e.household_id = p_household_id and e.date = p_day
      and ((e.kind = 'activity' and 'activities' = any (p_parts))
           or (e.kind <> 'activity' and 'meals' = any (p_parts)
               and (cardinality(e.eater_ids) = 0 or p_profile_id = any (e.eater_ids))))
  ) x
  where x.segment is not null;

  select coalesce(array_agg(x.segment order by x.rank, x.title, x.id), '{}')
  into v_chores
  from (
    select c.id, c.title,
           case st.state when 'overdue' then 0 when 'today' then 1 else 2 end as rank,
           c.title || private.parenthesize(array[
             case when c.assignment ->> 'type' in ('fixed', 'rotating') then 'du' end,
             case when c.next_due_on = p_day then private.format_time(c.due_time) end,
             case when st.state = 'overdue' then 'überfällig' end]) as segment
    from public.chores c
    cross join lateral (select private.chore_due_state(c, p_day) as state, private.chore_assignees(c) as assignees) st
    where 'chores' = any (p_parts)
      and c.household_id = p_household_id
      and st.state is not null
      and (cardinality(st.assignees) = 0 or p_profile_id = any (st.assignees))
  ) x;

  select coalesce(array_agg(btrim(rc.lead_time ->> 'text') order by coalesce(sl.pos, 2147483647), e.sort, e.id), '{}')
  into v_prep
  from public.meal_plan_entries e
  join public.recipes rc on rc.household_id = e.household_id and rc.id = e.recipe_id
  left join private.meal_slot_positions(p_household_id) sl on sl.slot_id = e.slot_id
  where 'prep' = any (p_parts)
    and e.household_id = p_household_id and e.date = p_day + 1 and e.kind = 'recipe'
    and coalesce(btrim(rc.lead_time ->> 'text'), '') <> ''
    and (e.cook_id = p_profile_id
         or (e.cook_id is null and (cardinality(e.eater_ids) = 0 or p_profile_id = any (e.eater_ids))));

  v_segments := v_day || v_chores;
  if cardinality(v_prep) > 0 then
    v_segments := v_segments || ('Für morgen: ' || array_to_string(v_prep, ', '));
  end if;
  return private.notification_text(case when cardinality(v_day || v_chores) > 0 then 'Heute: ' else '' end, v_segments);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Candidates (Decision 5: due_at <= p_now and due_at > p_now - 30 minutes)
-- ---------------------------------------------------------------------------------------------
-- Each returns household_id, profile_id, kind, dedupe_key, due_at, expires_at (the TTL at the
-- push service, Decision 13), title, body, url (Decision 12). Recipients are always members of
-- the household (AC-036) with the kind switched on, never silent (AC-035).

create function private.daily_summary_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with due as (
    select h.household_id, h.timezone, s.member_id, s.daily_summary_parts, d.day,
           (d.day + s.daily_summary_at) at time zone h.timezone as due_at
    from private.notification_households(p_now) h
    join public.notification_settings s on s.household_id = h.household_id and s.daily_summary_enabled
    join public.household_members m on m.household_id = s.household_id and m.profile_id = s.member_id
    cross join lateral (values (h.today - 1), (h.today)) d (day)
  )
  select due.household_id, due.member_id, 'daily_summary',
         format('daily:%s:%s:%s', due.household_id, due.member_id, due.day), due.due_at,
         (due.day + 1)::timestamp at time zone due.timezone, 'Housekeeping', b.body,
         '/?haushalt=' || due.household_id
  from due
  cross join lateral (select private.daily_summary_body(due.household_id, due.member_id, due.day, due.daily_summary_parts)
                      as body) b
  where due.due_at <= p_now and due.due_at > p_now - interval '30 minutes'
    and not private.is_silent(due.household_id, due.member_id, due.day)
    and b.body is not null
$$;

-- The evening before (REQ-006): one message with tomorrow's activities for everyone who is away
-- neither today nor tomorrow (Decision 8, AC-020). Linked to the entry when there is exactly one.
create function private.activities_eve_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with due as (
    select h.household_id, h.timezone, s.member_id, d.day,
           (d.day + s.activities_eve_at) at time zone h.timezone as due_at
    from private.notification_households(p_now) h
    join public.notification_settings s on s.household_id = h.household_id and s.activities_eve_enabled
    join public.household_members m on m.household_id = s.household_id and m.profile_id = s.member_id
    cross join lateral (values (h.today - 1), (h.today)) d (day)
  ), tomorrow as (
    select dd.household_id, dd.day, count(*) as n, (array_agg(x.id order by x.pos, x.sort, x.id))[1] as first_id,
           array_agg(x.segment order by x.pos, x.sort, x.id) as segments
    from (select distinct due.household_id, due.day from due
          where due.due_at <= p_now and due.due_at > p_now - interval '30 minutes') dd
    join lateral (
      select e.id, e.sort, coalesce(sl.pos, 2147483647) as pos,
             a.name || coalesce(' (' || nullif(e.note, '') || ')', '') || coalesce(', ' || sl.name, '') as segment
      from public.meal_plan_entries e
      join public.activities a on a.household_id = e.household_id and a.id = e.activity_id
      left join private.meal_slot_positions(dd.household_id) sl on sl.slot_id = e.slot_id
      where e.household_id = dd.household_id and e.date = dd.day + 1 and e.kind = 'activity'
    ) x on true
    group by dd.household_id, dd.day
  )
  select due.household_id, due.member_id, 'activities_eve',
         format('eve:%s:%s:%s', due.household_id, due.member_id, due.day), due.due_at,
         (due.day + 1)::timestamp at time zone due.timezone, 'Housekeeping',
         private.notification_text('Morgen: ', t.segments),
         case when t.n = 1 then format('/kalender?tag=%s&eintrag=%s&haushalt=%s', due.day + 1, t.first_id, due.household_id)
              else format('/kalender?tag=%s&haushalt=%s', due.day + 1, due.household_id) end
  from due
  join tomorrow t on t.household_id = due.household_id and t.day = due.day
  where due.due_at <= p_now and due.due_at > p_now - interval '30 minutes'
    and not private.is_silent(due.household_id, due.member_id, due.day)
    and not private.is_silent(due.household_id, due.member_id, due.day + 1)
$$;

-- A chore with a time on its due date (REQ-007): never "bei Bedarf", never paused; done or
-- skipped moves next_due_on, so the reminder disappears by itself (AC-025). Overdue chores are
-- only in the daily summary (AC-018).
create function private.chore_reminder_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with due as (
    select c.id, c.household_id, c.title, c.due_time, c.assignment ->> 'type' as assignment_type,
           private.chore_assignees(c) as assignees, h.timezone, d.day,
           (d.day + c.due_time) at time zone h.timezone as due_at
    from private.notification_households(p_now) h
    join public.chores c on c.household_id = h.household_id
    cross join lateral (values (h.today - 1), (h.today)) d (day)
    where c.due_time is not null and c.next_due_on = d.day
      and c.recurrence ->> 'type' <> 'asNeeded'
      and not private.chore_is_paused(c, d.day)
  )
  select due.household_id, m.profile_id, 'chore_reminder',
         format('chore:%s:%s', due.id, due.day), due.due_at,
         (due.day + 1)::timestamp at time zone due.timezone, 'Housekeeping',
         left(due.title || ' · ' || private.format_time(due.due_time)
              || case when due.assignment_type in ('fixed', 'rotating') then ' · du bist dran' else '' end, 400),
         format('/haushalt?aufgabe=%s&haushalt=%s', due.id, due.household_id)
  from due
  join public.household_members m on m.household_id = due.household_id
  join public.notification_settings s
    on s.household_id = m.household_id and s.member_id = m.profile_id and s.chore_reminders_enabled
  where due.due_at <= p_now and due.due_at > p_now - interval '30 minutes'
    and (cardinality(due.assignees) = 0 or m.profile_id = any (due.assignees))
    and not private.is_silent(due.household_id, m.profile_id, due.day)
$$;

-- remind_minutes_before ahead of a reservation (REQ-008) for those who eat along; silent on the
-- day it is sent and on the day of the reservation. A moved reservation gets a new key
-- (Offene Frage 7).
create function private.reservation_reminder_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  with entries as (
    select e.id, e.household_id, e.date, e.reserved_at, e.remind_minutes_before, e.eater_ids, h.timezone,
           r.name, (r.address is not null or r.maps_url is not null) as has_place,
           (e.date + e.reserved_at) at time zone h.timezone as reserved_moment
    from private.notification_households(p_now) h
    join public.meal_plan_entries e on e.household_id = h.household_id
    join public.restaurants r on r.household_id = e.household_id and r.id = e.restaurant_id
    where e.kind = 'restaurant' and e.reserved_at is not null and e.date between h.today - 1 and h.today + 1
  ), due as (
    select entries.*, entries.reserved_moment - make_interval(mins => entries.remind_minutes_before) as due_at
    from entries
  )
  select due.household_id, m.profile_id, 'reservation_reminder',
         format('reservation:%s:%s:%s', due.id, due.date, to_char(due.reserved_at, 'HH24:MI')), due.due_at,
         due.reserved_moment, 'Housekeeping',
         left(due.name || ' um ' || private.format_time(due.reserved_at) || ' · '
              || case due.remind_minutes_before when 30 then 'in 30 Minuten' when 60 then 'in 1 Stunde'
                   else 'in ' || (due.remind_minutes_before / 60) || ' Stunden' end
              || case when due.has_place then ' · Route ›' else '' end, 400),
         format('/kalender?tag=%s&eintrag=%s&haushalt=%s', due.date, due.id, due.household_id)
  from due
  join public.household_members m on m.household_id = due.household_id
  join public.notification_settings s
    on s.household_id = m.household_id and s.member_id = m.profile_id and s.reservation_reminders_enabled
  where due.due_at <= p_now and due.due_at > p_now - interval '30 minutes'
    and (cardinality(due.eater_ids) = 0 or m.profile_id = any (due.eater_ids))
    and not private.is_silent(due.household_id, m.profile_id, (due.due_at at time zone due.timezone)::date)
    and not private.is_silent(due.household_id, m.profile_id, due.date)
$$;

-- Everything due at p_now: the place pgTAP checks with a fixed time.
create function private.notification_candidates(p_now timestamptz)
returns table (household_id uuid, profile_id uuid, kind text, dedupe_key text, due_at timestamptz,
               expires_at timestamptz, title text, body text, url text)
language sql
stable
set search_path = ''
as $$
  select * from private.daily_summary_candidates(p_now)
  union all
  select * from private.activities_eve_candidates(p_now)
  union all
  select * from private.chore_reminder_candidates(p_now)
  union all
  select * from private.reservation_reminder_candidates(p_now)
$$;

-- ---------------------------------------------------------------------------------------------
-- Hand-over to push-send (Decision 22, 23)
-- ---------------------------------------------------------------------------------------------

-- The target and the shared secret from the Vault; null when one is missing.
create function private.push_send_config(out url text, out secret text)
language sql
stable
set search_path = ''
as $$
  select max(s.decrypted_secret) filter (where s.name = 'push_send_url'),
         max(s.decrypted_secret) filter (where s.name = 'push_send_secret')
  from vault.decrypted_secrets s
  where s.name in ('push_send_url', 'push_send_secret')
$$;

-- One message for push-send. Contract (supabase/functions/push-send): POST {"messages": [...]},
-- header x-push-secret; each message {id, endpoint, keys: {p256dh, auth}, ttl, urgency,
-- notification: {title, body, url}}; answer {"results": [{id, status}]}.
create function private.push_message(p_id bigint, p_subscription private.push_subscriptions, p_ttl integer,
                                     p_urgency text, p_title text, p_body text, p_url text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_id,
    'endpoint', (p_subscription).endpoint,
    'keys', jsonb_build_object('p256dh', (p_subscription).p256dh, 'auth', (p_subscription).auth),
    'ttl', greatest(60, p_ttl),
    'urgency', p_urgency,
    'notification', jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url))
$$;

-- Queues one call to push-send (sent by pg_net after the commit) and links the log rows to it.
create function private.post_push_bundle(p_url text, p_secret text, p_messages jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_request_id bigint;
begin
  v_request_id := net.http_post(
    url := p_url,
    body := jsonb_build_object('messages', p_messages),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', p_secret),
    timeout_milliseconds := 20000);
  update private.notification_deliveries d
  set request_id = v_request_id
  where d.id in (select (m ->> 'id')::bigint from jsonb_array_elements(p_messages) m);
  return v_request_id;
end
$$;

-- Reads the answers of earlier calls (Decision 23): push-send answers 2xx with
-- {"results": [{id, status}]} where status is the push service's HTTP status, or null / a string
-- when nothing was sent. 2xx → sent (and last_success_at), 404/410 → gone (the subscription is
-- switched off, AC-039), anything else → failed (failure_count + 1). push-send failing as a
-- whole, or no answer after an hour → failed. Never retried (Decision 7).
create function private.collect_push_responses(p_now timestamptz default now())
returns void
language sql
volatile
set search_path = ''
as $$
  with pending as (
    select d.id, d.subscription_id, d.created_at, r.id is not null as answered,
           -- Nested CASE: the content is cast only after it was found valid.
           case when r.status_code between 200 and 299 and not coalesce(r.timed_out, false)
                     and pg_catalog.pg_input_is_valid(r.content, 'jsonb')
                then case when jsonb_typeof(r.content::jsonb -> 'results') = 'array' then r.content::jsonb -> 'results' end
           end as results
    from private.notification_deliveries d
    left join net._http_response r on r.id = d.request_id
    where d.status = 'pending' and d.request_id is not null
  ), decided as (
    select p.id, p.subscription_id, x.result is not null as reported,
           case when jsonb_typeof(x.result -> 'status') = 'number' then (x.result ->> 'status')::numeric end as push_status
    from pending p
    left join lateral (
      select e as result from jsonb_array_elements(p.results) e where e ->> 'id' = p.id::text limit 1
    ) x on true
    where p.answered or p.created_at < p_now - interval '1 hour'
  ), updated as (
    update private.notification_deliveries d
    set status = case when x.push_status between 200 and 299 then 'sent'
                      when x.push_status in (404, 410) then 'gone'
                      else 'failed' end,
        http_status = case when x.push_status between 100 and 599 then x.push_status::smallint end
    from decided x
    where d.id = x.id
    returning d.subscription_id, d.status, x.reported
  )
  update private.push_subscriptions s
  set last_success_at = case when u.sent then p_now else s.last_success_at end,
      gone_at = case when u.gone then coalesce(s.gone_at, p_now) else s.gone_at end,
      failure_count = s.failure_count + u.failed
  from (
    select u.subscription_id, bool_or(u.status = 'sent') as sent, bool_or(u.status = 'gone') as gone,
           (count(*) filter (where u.status = 'failed' and u.reported))::integer as failed
    from updated u
    group by u.subscription_id
  ) u
  where s.id = u.subscription_id
$$;

-- The tick (pg_cron every 5 minutes; p_now only for tests). Returns the number of messages
-- handed to push-send. A second, overlapping tick does nothing (transaction lock).
create function private.run_notification_tick(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_bundle constant integer := 50;
  v_config record;
  v_messages jsonb;
  v_count integer;
  v_bundle jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('housekeeping.notification_tick', 0)) then
    return 0;
  end if;

  perform private.collect_push_responses(p_now);

  select * into v_config from private.push_send_config();
  if v_config.url is null or v_config.secret is null then
    raise warning 'push_not_configured';
    return 0;
  end if;

  with candidates as (
    select * from private.notification_candidates(p_now)
  ), inserted as (
    insert into private.notification_deliveries (dedupe_key, subscription_id, profile_id, household_id, kind, due_at)
    select c.dedupe_key, s.id, c.profile_id, c.household_id, c.kind, c.due_at
    from candidates c
    join private.push_subscriptions s on s.profile_id = c.profile_id and s.enabled and s.gone_at is null
    on conflict (dedupe_key, subscription_id) do nothing
    returning id, subscription_id, profile_id, dedupe_key
  )
  select coalesce(jsonb_agg(private.push_message(
           i.id, s, extract(epoch from c.expires_at - p_now)::integer,
           case when c.kind in ('chore_reminder', 'reservation_reminder') then 'high' else 'normal' end,
           c.title, c.body, c.url) order by i.id), '[]')
  into v_messages
  from inserted i
  join private.push_subscriptions s on s.id = i.subscription_id
  join candidates c on c.dedupe_key = i.dedupe_key and c.profile_id = i.profile_id;

  v_count := jsonb_array_length(v_messages);
  for v_bundle in
    select jsonb_agg(x.m order by x.ord)
    from jsonb_array_elements(v_messages) with ordinality x (m, ord)
    group by (x.ord - 1) / c_bundle
    order by (x.ord - 1) / c_bundle
  loop
    perform private.post_push_bundle(v_config.url, v_config.secret, v_bundle);
  end loop;
  return v_count;
end
$$;

-- Log rows older than 30 days, subscriptions gone for 30 days (pg_cron nightly).
create function private.purge_notification_deliveries()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.notification_deliveries d where d.created_at < now() - interval '30 days';
  delete from private.push_subscriptions s where s.gone_at < now() - interval '30 days';
$$;

select cron.schedule('notification-tick', '*/5 * * * *', 'select private.run_notification_tick()');
select cron.schedule('purge-notification-deliveries', '35 3 * * *', 'select private.purge_notification_deliveries()');

-- ---------------------------------------------------------------------------------------------
-- RPCs for the own devices (REQ-002, REQ-003, REQ-010)
-- ---------------------------------------------------------------------------------------------
-- All: not_authenticated (42501) without a user; only the caller's own subscriptions; never an
-- address or a key in an answer. Logic in private (security definer), thin public wrappers for
-- PostgREST, like the other RPCs.

-- Registers this browser for the caller (upsert by address, Decision 19): on, reachable again.
-- invalid_subscription (22023, AC-044), too_many_devices (22023, more than 10, Decision 20).
create function private.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text := btrim(p_device_label);
  v_owner uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.is_push_endpoint(p_endpoint)
     or coalesce(p_p256dh !~ '^B[A-Za-z0-9_-]{86}$', true)
     or coalesce(p_auth !~ '^[A-Za-z0-9_-]{22}$', true)
     or coalesce(char_length(v_label) not between 1 and 60, true)
     or v_label ~ '[[:cntrl:]]' then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;

  -- One registration of a person at a time, so two at once cannot pass the limit together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('housekeeping.push_subscriptions:' || v_uid, 0));
  select s.profile_id into v_owner from private.push_subscriptions s where s.endpoint = p_endpoint;
  if v_owner is distinct from v_uid
     and (select count(*) from private.push_subscriptions s where s.profile_id = v_uid) >= 10 then
    raise exception 'too_many_devices' using errcode = '22023';
  end if;

  insert into private.push_subscriptions as s (profile_id, endpoint, p256dh, auth, device_label)
  values (v_uid, p_endpoint, p_p256dh, p_auth, v_label)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device_label = excluded.device_label, enabled = true, gone_at = null, failure_count = 0
  returning s.id into v_id;
  return v_id;
end
$$;

-- "Auf diesem Gerät benachrichtigen" on / off (AC-008): the device stays in the list.
-- not_found (P0002) for an address that is not the caller's.
create function private.set_push_subscription_enabled(p_endpoint text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'invalid_change' using errcode = '22023';
  end if;
  update private.push_subscriptions s set enabled = p_enabled
  where s.endpoint = p_endpoint and s.profile_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end
$$;

-- Signing out on this device (AC-042): deletes its subscription; an unknown one is no error.
create function private.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from private.push_subscriptions s where s.endpoint = p_endpoint and s.profile_id = auth.uid();
end
$$;

-- "Entfernen" in "Deine Geräte" (AC-041): true when an own device was deleted; a foreign or
-- unknown id gives false, without telling which (AC-043).
create function private.remove_push_subscription(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from private.push_subscriptions s where s.id = p_id and s.profile_id = auth.uid();
  return found;
end
$$;

-- "Deine Geräte" (online only, never cached, ADR-0014): the caller's devices with status
-- active / off / unreachable; is_current for the address this browser knows. Never the address
-- or a key.
create function private.list_push_subscriptions(p_current_endpoint text)
returns table (id uuid, device_label text, status text, is_current boolean, created_at timestamptz,
               last_success_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query
  select s.id, s.device_label,
         case when s.gone_at is not null then 'unreachable' when not s.enabled then 'off' else 'active' end,
         coalesce(s.endpoint = p_current_endpoint, false), s.created_at, s.last_success_at
  from private.push_subscriptions s
  where s.profile_id = auth.uid()
  order by coalesce(s.endpoint = p_current_endpoint, false) desc, s.created_at, s.id;
end
$$;

-- "Probe senden" (REQ-003): one message to exactly this device, now. not_found (P0002) unless it
-- is the caller's, switched on and reachable (AC-010); push_not_configured (P0001) without the
-- Vault entries; rate_limited (22023) from the fourth probe within 10 minutes (Decision 20).
create function private.send_test_push(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subscription private.push_subscriptions;
  v_config record;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select s.* into v_subscription from private.push_subscriptions s
  where s.endpoint = p_endpoint and s.profile_id = v_uid and s.enabled and s.gone_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_config from private.push_send_config();
  if v_config.url is null or v_config.secret is null then
    raise exception 'push_not_configured' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('housekeeping.send_test_push:' || v_uid, 0));
  if (select count(*) from private.notification_deliveries d
      where d.profile_id = v_uid and d.kind = 'test' and d.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into private.notification_deliveries (dedupe_key, subscription_id, profile_id, household_id, kind, due_at)
  values ('test:' || gen_random_uuid(), v_subscription.id, v_uid, null, 'test', now())
  returning id into v_id;
  perform private.post_push_bundle(v_config.url, v_config.secret, jsonb_build_array(private.push_message(
    v_id, v_subscription, 600, 'high', 'Housekeeping', 'Probe: So sehen deine Benachrichtigungen aus.',
    '/einstellungen/benachrichtigungen')));
end
$$;

grant execute on function private.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function private.set_push_subscription_enabled(text, boolean) to authenticated;
grant execute on function private.unregister_push_subscription(text) to authenticated;
grant execute on function private.remove_push_subscription(uuid) to authenticated;
grant execute on function private.list_push_subscriptions(text) to authenticated;
grant execute on function private.send_test_push(text) to authenticated;

create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device_label text)
returns uuid
language sql
set search_path = ''
as $$ select private.register_push_subscription($1, $2, $3, $4) $$;

create function public.set_push_subscription_enabled(p_endpoint text, p_enabled boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_push_subscription_enabled($1, $2) $$;

create function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
set search_path = ''
as $$ select private.unregister_push_subscription($1) $$;

create function public.remove_push_subscription(p_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.remove_push_subscription($1) $$;

create function public.list_push_subscriptions(p_current_endpoint text default null)
returns table (id uuid, device_label text, status text, is_current boolean, created_at timestamptz,
               last_success_at timestamptz)
language sql
stable
set search_path = ''
as $$ select * from private.list_push_subscriptions($1) $$;

create function public.send_test_push(p_endpoint text)
returns void
language sql
set search_path = ''
as $$ select private.send_test_push($1) $$;

grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.set_push_subscription_enabled(text, boolean) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.remove_push_subscription(uuid) to authenticated;
grant execute on function public.list_push_subscriptions(text) to authenticated;
grant execute on function public.send_test_push(text) to authenticated;
