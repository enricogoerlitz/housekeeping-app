-- Spec 0020, REQ-006/REQ-007: the Vorbereitung of a day in SQL (private.slot_start_time,
-- private.prep_items) and in the daily summary ("Vorbereiten: …"). The parity cases carry the names
-- of prep.test.ts (ADR-0014: the rules exist twice). Example day: Sunday, 22.11.2026, household
-- "Enrico & Nadja" with Vormittag, Mittag, Abend; the summary comes at 7:30.
begin;
\ir _helpers.psql
select plan(22);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;

-- The prep lines of one entry on a day at a time: "state at start_at", in their order.
create function tests.prep(p_entry text, p_day date default '2026-11-22', p_at time default '08:00')
returns text language sql
as $$
  select string_agg(p.lead_text || ' · ' || p.state || coalesce(' ' || to_char(p.start_at, 'HH24:MI'), ''), ' | '
                    order by p.ord)
  from private.prep_items(tests.fx('home'), p_day, p_at) p
  where p.entry_id = tests.fx(p_entry)
$$;
create function tests.summary(p_who text, p_parts text[] default '{meals,activities,chores,prep}')
returns text language sql
as $$ select private.daily_summary_body(tests.fx('home'), tests.fx(p_who), '2026-11-22', p_parts) $$;
-- Moves entries far away, so a case sees only the entries it names.
create function tests.hide(p_keys text[]) returns void language sql
as $$ update public.meal_plan_entries set date = '2027-03-01' where id in (select tests.fx(k) from unnest(p_keys) k) $$;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('other', tests.create_household('B', array[tests.fx('ben')]));
insert into fx (key) values
  ('s_vor'), ('s_mittag'), ('s_abend'), ('s_other'),
  ('hummus'), ('bulgogi'), ('spiesse'), ('kartoffelsalat'), ('lasagne'), ('grillabend'), ('cr1'), ('cr2'),
  ('fremd_rezept'), ('fremd_sammlung'), ('fremd_cr'),
  ('e_hummus_mo'), ('e_hummus_moabend'), ('e_bulgogi'), ('e_grill'), ('e_hummus_heute'), ('e_hummus_mi'),
  ('e_lasagne'), ('e_reste'), ('e_text'), ('e_fremd');

update public.households
set meal_slots = jsonb_build_array(
  jsonb_build_object('id', tests.fx('s_vor'), 'name', 'Vormittag', 'sort', 0),
  jsonb_build_object('id', tests.fx('s_mittag'), 'name', 'Mittag', 'sort', 1),
  jsonb_build_object('id', tests.fx('s_abend'), 'name', 'Abend', 'sort', 2))
where id = tests.fx('home');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('s_other'), 'name', 'Abend', 'sort', 0))
where id = tests.fx('other');

insert into public.recipes (id, household_id, kind, title, lead_time) values
  (tests.fx('hummus'), tests.fx('home'), 'recipe', 'Hummus', '{"text": "Kichererbsen einweichen", "hoursBefore": 12}'),
  (tests.fx('bulgogi'), tests.fx('home'), 'recipe', 'Bulgogi', '{"text": "Fleisch marinieren", "hoursBefore": 48}'),
  (tests.fx('spiesse'), tests.fx('home'), 'recipe', 'Grillspieße', '{"text": "Spieße marinieren", "hoursBefore": 24}'),
  (tests.fx('kartoffelsalat'), tests.fx('home'), 'recipe', 'Kartoffelsalat', null),
  (tests.fx('lasagne'), tests.fx('home'), 'recipe', 'Lasagne', null),
  (tests.fx('fremd_rezept'), tests.fx('other'), 'recipe', 'Pizza', '{"text": "Teig ansetzen", "hoursBefore": 24}');
-- A collection has none of the recipe fields (recipes_kind_fields).
insert into public.recipes (id, household_id, kind, title, course) values
  (tests.fx('grillabend'), tests.fx('home'), 'collection', 'Grillabend', null),
  (tests.fx('fremd_sammlung'), tests.fx('other'), 'collection', 'Pizzaabend', null);
insert into public.collection_recipes (id, household_id, collection_id, recipe_id, sort) values
  (tests.fx('cr1'), tests.fx('home'), tests.fx('grillabend'), tests.fx('spiesse'), 0),
  (tests.fx('cr2'), tests.fx('home'), tests.fx('grillabend'), tests.fx('kartoffelsalat'), 1),
  (tests.fx('fremd_cr'), tests.fx('other'), tests.fx('fremd_sammlung'), tests.fx('fremd_rezept'), 0);

insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, text, eater_ids, cook_id) values
  (tests.fx('e_hummus_mo'), tests.fx('home'), '2026-11-23', tests.fx('s_mittag'), 'recipe', tests.fx('hummus'), null,
   '{}', tests.fx('enrico')),
  (tests.fx('e_hummus_moabend'), tests.fx('home'), '2026-11-23', tests.fx('s_abend'), 'recipe', tests.fx('hummus'), null,
   '{}', tests.fx('nadja')),
  (tests.fx('e_bulgogi'), tests.fx('home'), '2026-11-24', tests.fx('s_abend'), 'recipe', tests.fx('bulgogi'), null,
   '{}', tests.fx('enrico')),
  (tests.fx('e_grill'), tests.fx('home'), '2026-11-23', tests.fx('s_abend'), 'recipe', tests.fx('grillabend'), null,
   array[tests.fx('enrico'), tests.fx('nadja')], tests.fx('nadja')),
  (tests.fx('e_hummus_heute'), tests.fx('home'), '2026-11-22', tests.fx('s_abend'), 'recipe', tests.fx('hummus'), null,
   '{}', tests.fx('nadja')),
  (tests.fx('e_hummus_mi'), tests.fx('home'), '2026-11-25', tests.fx('s_mittag'), 'recipe', tests.fx('hummus'), null,
   '{}', null),
  (tests.fx('e_lasagne'), tests.fx('home'), '2026-11-22', tests.fx('s_abend'), 'recipe', tests.fx('lasagne'), null,
   array[tests.fx('enrico')], tests.fx('enrico')),
  (tests.fx('e_text'), tests.fx('home'), '2026-11-23', tests.fx('s_mittag'), 'text', null, 'Hummus', '{}', null),
  (tests.fx('e_fremd'), tests.fx('other'), '2026-11-23', tests.fx('s_other'), 'recipe', tests.fx('fremd_sammlung'), null,
   '{}', null);
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, leftovers_of_entry_id) values
  (tests.fx('e_reste'), tests.fx('home'), '2026-11-23', tests.fx('s_mittag'), 'leftovers', tests.fx('hummus'),
   tests.fx('e_hummus_heute'));

-- ===================== slotStartTime parity (prep.test.ts) =====================
select is(
  array[private.slot_start_time('Vormittag'), private.slot_start_time('Mittag'), private.slot_start_time(' Abend '),
        private.slot_start_time('Frühstück'), private.slot_start_time(null)],
  array['08:00', '11:00', '17:00', '08:00', '08:00']::time[],
  'slotStartTime parity: Vormittag 8, Mittag 11, Abend 17, otherwise 8 Uhr');

-- ===================== prepLines parity, today (prep.test.ts) =====================
select is(tests.prep('e_hummus_mo'), 'Kichererbsen einweichen · until 23:00',
  'AC-027 prepLines parity: Hummus Mo Mittag today "bis ca. 23 Uhr"');
select is(tests.prep('e_hummus_moabend'), 'Kichererbsen einweichen · evening',
  'AC-027 prepLines parity: Mo Abend "Heute Abend"');
select is(tests.prep('e_hummus_moabend', '2026-11-23'), 'Kichererbsen einweichen · due',
  'AC-031 prepLines parity: when Monday is today, the missed start of Sunday evening is "Schon fällig"');
select is(tests.prep('e_bulgogi'), 'Fleisch marinieren · until 17:00',
  'AC-028 prepLines parity: Bulgogi Di Abend today "bis ca. 17 Uhr"');
select is(tests.prep('e_grill'), 'Spieße marinieren · until 17:00',
  'AC-029 prepLines parity: a collection names each of its recipes with a lead time');
select is(tests.prep('e_hummus_mi'), null,
  'AC-030 prepLines parity: Hummus Mi Mittag is no line today');
select is(tests.prep('e_hummus_heute', '2026-11-22', '10:00'), 'Kichererbsen einweichen · due',
  'AC-031 prepLines parity: planned at 10 Uhr for tonight, "Schon fällig"');
select is(tests.prep('e_bulgogi', '2026-11-22', '17:30'), 'Fleisch marinieren · due 17:00',
  'AC-031 prepLines parity: a time of today that has passed is "Schon fällig" too');
select is(
  (select array_agg(p.state || coalesce(' ' || to_char(p.start_at, 'HH24:MI'), '') order by p.ord)
   from private.prep_items(tests.fx('home'), '2026-11-22', '08:00') p),
  array['due', 'until 17:00', 'until 17:00', 'until 23:00', 'evening'],
  'order prepLines parity: "Schon fällig", then by start, "Heute Abend" last');
select is(
  (select count(*)::int from private.prep_items(tests.fx('home'), '2026-11-22', '08:00') p
   where p.entry_id in (tests.fx('e_lasagne'), tests.fx('e_reste'), tests.fx('e_text'))
      or p.recipe_id = tests.fx('kartoffelsalat')),
  0, 'AC-032 prepLines parity: no lead time, leftovers and free text give no line');

-- ===================== The daily summary (REQ-007) =====================
select tests.hide(array['e_hummus_moabend', 'e_hummus_heute']);
select is(tests.summary('enrico'),
  'Heute: Lasagne (Abend, du kochst) · Vorbereiten: Fleisch marinieren (bis ca. 17 Uhr), Kichererbsen einweichen (bis ca. 23 Uhr)',
  'AC-033: Enrico at 7:30, he cooks Lasagne, Hummus and Bulgogi');
select is(tests.summary('nadja'), 'Vorbereiten: Spieße marinieren (bis ca. 17 Uhr)',
  'AC-034: Nadja cooks "Grillabend" and gets its Vorbereitung …');
select ok(tests.summary('enrico') not like '%Spieße%',
  'AC-034: … Enrico, who only eats along, does not');
select is(tests.summary('enrico', '{prep}'),
  'Vorbereiten: Fleisch marinieren (bis ca. 17 Uhr), Kichererbsen einweichen (bis ca. 23 Uhr)',
  'REQ-007: only the part "Vorbereitung"');

update public.meal_plan_entries set date = '2026-11-22', cook_id = tests.fx('enrico')
where id = tests.fx('e_hummus_heute');
select is(tests.summary('enrico', '{prep}'),
  'Vorbereiten: Kichererbsen einweichen (schon fällig), Fleisch marinieren (bis ca. 17 Uhr), Kichererbsen einweichen (bis ca. 23 Uhr)',
  'AC-031/REQ-007: a missed start reads "schon fällig", first');
update public.notification_settings set daily_summary_at = '18:00'
where household_id = tests.fx('home') and member_id = tests.fx('enrico');
select is(tests.summary('enrico', '{prep}'),
  'Vorbereiten: Kichererbsen einweichen (schon fällig), Fleisch marinieren (schon fällig), Kichererbsen einweichen (bis ca. 23 Uhr)',
  'Entscheidung 17: "jetzt" is the time of the daily summary');

select tests.hide(array['e_hummus_mo', 'e_bulgogi', 'e_grill', 'e_hummus_heute', 'e_lasagne']);
select is(tests.summary('enrico', '{prep}'), null,
  'AC-035: only "Vorbereitung" and nothing to start today (Hummus Wednesday): no message');
select is(
  (select count(*)::int from private.prep_items(tests.fx('home'), '2026-11-22', '08:00') p
   where p.recipe_id = tests.fx('fremd_rezept') or p.entry_id = tests.fx('e_fremd')),
  0, 'AC-035: a Vorbereitung of a foreign household (its collection) is never one of ours');
select ok(
  coalesce(private.daily_summary_body(tests.fx('home'), tests.fx('enrico'), '2026-11-22', '{meals,activities,chores,prep}'), '')
    not like '%Teig%',
  'AC-035: … and appears in no message of Enrico''s');

-- A Vorlauf the editor would never write (1–168 whole hours, recipe-editor.ts) is no line and
-- never breaks the scheduler's tick for every household (/security-check, 22.11.2026).
update public.recipes set lead_time = '{"text": "Kaputt", "hoursBefore": 1.5}' where id = tests.fx('hummus');
update public.recipes set lead_time = '{"text": "Riesig", "hoursBefore": 2000000000}' where id = tests.fx('bulgogi');
update public.recipes set lead_time = '{"text": "Exponent", "hoursBefore": 1e12}' where id = tests.fx('spiesse');
update public.meal_plan_entries set date = '2026-11-23' where id in (tests.fx('e_hummus_mo'), tests.fx('e_bulgogi'), tests.fx('e_grill'));
select lives_ok($$ select * from private.prep_items(tests.fx('home'), '2026-11-22', '08:00') $$,
  'security: an invalid hoursBefore does not break prep_items');
select is(
  (select count(*)::int from private.prep_items(tests.fx('home'), '2026-11-22', '08:00')), 0,
  'security: … and gives no line');

select * from finish();
rollback;
