-- Spec 0020 — Vorbereitung by the latest start (REQ-006, REQ-007; critical path: scheduler).
-- The rules exist twice (ADR-0014): packages/core/src/prep.ts and here, held equal by the cases of
-- prep.test.ts in supabase/tests/daily_summary_prep.test.sql.
--
-- * private.slot_start_time: the Kochbeginn of a Tageszeit (Entscheidung 8).
-- * private.prep_items: the Vorbereitungen to start on a day at a time.
-- * private.daily_summary_body: only its part "Vorbereitung" changes ("Für morgen" goes, now
--   "Vorbereiten: …"); the rest is unchanged from plan_entry_fields (spec 0021).

-- The Kochbeginn of a Tageszeit by its name (core slotStartTime): Vormittag 8, Mittag 11, Abend 17,
-- renamed or own ones 8 Uhr.
create function private.slot_start_time(p_slot_name text)
returns time
language sql
immutable
set search_path = ''
as $$
  select case btrim(coalesce(p_slot_name, ''))
           when 'Vormittag' then time '08:00'
           when 'Mittag' then time '11:00'
           when 'Abend' then time '17:00'
           else time '08:00'
         end
$$;

-- "23 Uhr", "8:30 Uhr" (core hourLabel).
create function private.hour_label(p_at time)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when extract(minute from p_at) = 0 then extract(hour from p_at)::int || ' Uhr'
              else extract(hour from p_at)::int || ':' || to_char(p_at, 'MI') || ' Uhr' end
$$;

-- The Vorbereitungen of a household to start on p_day, judged at p_at (core prepLines for today):
-- planned recipes and every recipe of a planned collection with a Vorlauf, never leftovers, free
-- text, restaurants, activities, entries without a day or marked "nicht gemacht". The start is the
-- entry's day + Kochbeginn − hoursBefore; one between 0 and 6 Uhr is the evening before.
-- state: 'due' (start before p_at, entry today or later), 'until' (today at start_at), 'evening'.
-- ord: "Schon fällig" first, then by start, the evening last; equal ones by entry and recipe id.
-- Every join stays within p_household_id (AC-035).
create function private.prep_items(p_household_id uuid, p_day date, p_at time)
returns table (entry_id uuid, recipe_id uuid, lead_text text, state text, start_at time, cook_id uuid,
               eater_ids uuid[], ord bigint)
language sql
stable
set search_path = ''
as $$
  with planned as (
    select e.id, e.household_id, e.date, e.recipe_id, e.cook_id, e.eater_ids, sl.name as slot_name
    from public.meal_plan_entries e
    left join private.meal_slot_positions(p_household_id) sl on sl.slot_id = e.slot_id
    where e.household_id = p_household_id and e.kind = 'recipe' and not e.not_done
      -- A Vorlauf is at most 168 hours: later entries cannot start today.
      and e.date between p_day and p_day + 9
  ), with_lead as (
    select p.*, rc.id as lead_recipe_id, rc.lead_time
    from planned p
    join public.recipes rc on rc.household_id = p.household_id and rc.id = p.recipe_id and rc.kind = 'recipe'
    union all
    select p.*, rc.id, rc.lead_time
    from planned p
    join public.recipes col on col.household_id = p.household_id and col.id = p.recipe_id and col.kind = 'collection'
    join public.collection_recipes cr on cr.household_id = p.household_id and cr.collection_id = col.id
    join public.recipes rc on rc.household_id = p.household_id and rc.id = cr.recipe_id
  ), starts as (
    select w.*, btrim(w.lead_time ->> 'text') as lead_text,
           (w.date + private.slot_start_time(w.slot_name)) - make_interval(hours => (w.lead_time ->> 'hoursBefore')::int)
             as moment
    from with_lead w
    where jsonb_typeof(w.lead_time -> 'hoursBefore') = 'number'
      and coalesce(btrim(w.lead_time ->> 'text'), '') <> ''
  ), days as (
    select s.*,
           case when s.moment::time < time '06:00' then s.moment::date - 1 else s.moment::date end as start_day,
           case when s.moment::time < time '06:00' then null else s.moment::time end as start_at
    from starts s
  ), judged as (
    select d.*,
           case when d.start_day < p_day or (d.start_day = p_day and d.start_at < p_at) then 'due'
                when d.start_day = p_day and d.start_at is null then 'evening'
                when d.start_day = p_day then 'until' end as state
    from days d
  )
  select j.id, j.lead_recipe_id, j.lead_text, j.state, j.start_at, j.cook_id, j.eater_ids,
         row_number() over (order by j.state <> 'due',
                                     case when j.state = 'due' then j.start_day end,
                                     coalesce(j.start_at, time '24:00'),
                                     j.id::text collate "C", j.lead_recipe_id::text collate "C")
  from judged j
  where j.state is not null
$$;

create or replace function private.daily_summary_body(p_household_id uuid, p_profile_id uuid, p_day date, p_parts text[])
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
             when 'activity' then a.name || private.parenthesize(array[e.note, sl.name, private.format_time(e.starts_at)])
             when 'restaurant' then r.name || private.parenthesize(array[e.note, sl.name, private.format_time(e.starts_at)])
             else
               case e.kind
                 when 'leftovers' then 'Reste: ' || coalesce(rc.title, src_rc.title, src.text, 'Reste')
                 when 'text' then e.text
                 else rc.title
               end
               || private.parenthesize(array[e.note, sl.name, case when e.cook_id = p_profile_id then 'du kochst' end])
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

  -- Spec 0020, REQ-007: what to start today by the rule of the Übersicht, "now" being the time of
  -- the person's daily summary (Entscheidung 17); for who cooks, else who eats along, else all.
  select coalesce(array_agg(p.lead_text || ' (' || case p.state
                                                 when 'due' then 'schon fällig'
                                                 when 'evening' then 'heute Abend'
                                                 else 'bis ca. ' || private.hour_label(p.start_at)
                                               end || ')' order by p.ord), '{}')
  into v_prep
  from private.prep_items(
         p_household_id, p_day,
         coalesce((select s.daily_summary_at from public.notification_settings s
                   where s.household_id = p_household_id and s.member_id = p_profile_id), time '07:30')) p
  where 'prep' = any (p_parts)
    and (p.cook_id = p_profile_id
         or (p.cook_id is null and (cardinality(p.eater_ids) = 0 or p_profile_id = any (p.eater_ids))));

  v_segments := v_day || v_chores;
  if cardinality(v_prep) > 0 then
    v_segments := v_segments || ('Vorbereiten: ' || array_to_string(v_prep, ', '));
  end if;
  return private.notification_text(case when cardinality(v_day || v_chores) > 0 then 'Heute: ' else '' end, v_segments);
end
$$;
