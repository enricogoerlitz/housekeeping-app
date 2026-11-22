-- The fields of a plan entry after spec 0021 (Task 1): "Uhrzeit (optional)" (starts_at) only on
-- restaurants and activities in 5-minute steps, the Zusatz on every kind without control
-- characters, free text never empty, portions and guests within their bounds, eaters only members
-- of the household. Everything through apply_changes like the window writes it; a foreign
-- household and a signed-out caller cannot. The reservation reminder is gone (AC-039).
begin;
\ir _helpers.psql
select plan(27);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

create function tests.patch_sql(p_entry text, p_changes jsonb, p_household text default 'home') returns text
language sql stable
as $$
  select format('select public.apply_changes(%L, %L)', tests.fx(p_household), jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'meal_plan_entries', 'id', tests.fx(p_entry), 'changes', p_changes)))
$$;
grant execute on function tests.patch_sql(text, jsonb, text) to anon, authenticated;

create function tests.insert_sql(p_row jsonb, p_household text default 'home') returns text language sql stable
as $$
  select format('select public.apply_changes(%L, %L)', tests.fx(p_household), jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'meal_plan_entries', 'row', p_row)))
$$;
grant execute on function tests.insert_sql(jsonb, text) to anon, authenticated;

create function tests.entry(p_entry text) returns public.meal_plan_entries language sql stable security definer
as $$ select e from public.meal_plan_entries e where e.id = tests.fx(p_entry) $$;
grant execute on function tests.entry(text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('jana', tests.create_user('jana@example.com', 'Jana'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('schmidt', tests.create_household('Schmidt', array[tests.fx('jana')]));
insert into fx (key) values ('vor'), ('abend'), ('lasagne'), ('enzo'), ('eis'),
  ('e_lasagne'), ('e_enzo'), ('e_eis'), ('e_oma'), ('e_new');
update public.households
set meal_slots = jsonb_build_array(jsonb_build_object('id', tests.fx('vor'), 'name', 'Vormittag', 'sort', 0),
                                   jsonb_build_object('id', tests.fx('abend'), 'name', 'Abend', 'sort', 1))
where id = tests.fx('home');
insert into public.recipes (id, household_id, title) values (tests.fx('lasagne'), tests.fx('home'), 'Lasagne');
insert into public.restaurants (id, household_id, name) values (tests.fx('enzo'), tests.fx('home'), 'Trattoria Da Enzo');
insert into public.activities (id, household_id, name, name_key) values
  (tests.fx('eis'), tests.fx('home'), 'Eislaufen', 'eislaufen');
insert into public.meal_plan_entries (id, household_id, date, slot_id, kind, recipe_id, restaurant_id, activity_id, text,
                                      eater_ids, portions) values
  (tests.fx('e_lasagne'), tests.fx('home'), '2026-11-28', tests.fx('abend'), 'recipe', tests.fx('lasagne'), null, null,
   null, array[tests.fx('enrico')], 1),
  (tests.fx('e_enzo'), tests.fx('home'), '2026-11-28', tests.fx('abend'), 'restaurant', null, tests.fx('enzo'), null,
   null, '{}', 0),
  (tests.fx('e_eis'), tests.fx('home'), '2026-11-28', tests.fx('vor'), 'activity', null, null, tests.fx('eis'),
   null, '{}', 0),
  (tests.fx('e_oma'), tests.fx('home'), '2026-11-29', tests.fx('abend'), 'text', null, null, null,
   'Essen bei Oam', '{}', 0);

-- ===================== Schema: what is gone, what is new =====================
select has_column('public', 'meal_plan_entries', 'starts_at', 'REQ-013 meal_plan_entries: "Uhrzeit" is starts_at');
select hasnt_column('public', 'meal_plan_entries', 'reserved_at', 'Daten: reserved_at is gone (now starts_at)');
select hasnt_column('public', 'meal_plan_entries', 'remind_minutes_before',
  'AC-039 meal_plan_entries: "Erinnern n vorher" of the reservation is gone');
select hasnt_column('public', 'notification_settings', 'reservation_reminders_enabled',
  'AC-039 notification_settings: the kind "Restaurant-Reservierung" is gone');
select hasnt_function('private', 'reservation_reminder_candidates',
  'AC-039 scheduler: no reservation reminders any more');

-- ===================== Uhrzeit (AC-035, AC-036) =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(tests.patch_sql('e_eis', '{"starts_at": "10:30"}'),
  'AC-035 apply_changes: an activity gets "Uhrzeit 10:30"');
select is((tests.entry('e_eis')).starts_at, '10:30'::time, 'AC-035 meal_plan_entries: the time is stored');
select lives_ok(tests.patch_sql('e_enzo', '{"starts_at": "19:30"}'),
  'AC-037 apply_changes: a restaurant gets "Uhrzeit 19:30"');
select throws_ok(tests.patch_sql('e_enzo', '{"starts_at": "19:33"}'), '23514', null,
  'AC-036 apply_changes: 19:33 is not a 5-minute step');
select throws_ok(tests.patch_sql('e_lasagne', '{"starts_at": "19:30"}'), '23514', null,
  'AC-036 apply_changes: "Lasagne" cannot get a time');
select throws_ok(
  tests.insert_sql(jsonb_build_object('id', tests.fx('e_new'), 'date', '2026-11-27', 'slot_id', tests.fx('abend'),
                                      'kind', 'text', 'text', 'Pizza', 'starts_at', '19:30')),
  '23514', null, 'AC-036 apply_changes: a new free text cannot carry a time');
select lives_ok(tests.patch_sql('e_eis', '{"starts_at": null}'), 'REQ-013 apply_changes: ✕ removes the time');
select throws_ok(tests.patch_sql('e_enzo', '{"remind_minutes_before": 60}'), '22023', null,
  'AC-039 apply_changes: "Erinnern n vorher" is no field any more');

-- ===================== Zusatz on every kind (AC-023, AC-024) =====================
select lives_ok(tests.patch_sql('e_lasagne', '{"note": "doppelte Menge"}'),
  'AC-023 apply_changes: a recipe entry gets the Zusatz "doppelte Menge"');
select lives_ok(tests.patch_sql('e_enzo', '{"note": "Tisch für 6"}'),
  'AC-023 apply_changes: a restaurant entry gets the Zusatz "Tisch für 6"');
select lives_ok(tests.patch_sql('e_oma', '{"note": "mit Kuchen"}'), 'REQ-008 apply_changes: free text gets a Zusatz');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('note', 'doppelte' || chr(10) || 'Menge')), '23514', null,
  'AC-024 apply_changes: a Zusatz with a line break is refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('note', 'doppelte' || chr(8238) || 'Menge')), '23514', null,
  'Risiken apply_changes: a Zusatz with a direction-changing character is refused (it reaches notifications)');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('note', repeat('x', 121))), '23514', null,
  'REQ-008 apply_changes: a Zusatz over 120 characters is refused');

-- ===================== Free text (AC-022, AC-024) =====================
select lives_ok(tests.patch_sql('e_oma', '{"text": "Essen bei Oma"}'), 'AC-022 apply_changes: the free text is changed');
select throws_ok(tests.patch_sql('e_oma', '{"text": "   "}'), '23514', null,
  'AC-024 apply_changes: an empty free text is refused');

-- ===================== Portions, guests, eaters (AC-018) =====================
select lives_ok(tests.patch_sql('e_lasagne', jsonb_build_object(
    'eater_ids', jsonb_build_array(tests.fx('enrico'), tests.fx('nadja')), 'portions', 3, 'guests', 0)),
  'AC-015 apply_changes: eaters and portions are changed in one patch');
select throws_ok(tests.patch_sql('e_lasagne', '{"portions": 1001}'), '23514', null,
  'AC-018 apply_changes: 1001 portions are refused');
select throws_ok(tests.patch_sql('e_lasagne', '{"guests": 101}'), '23514', null,
  'REQ-006 apply_changes: more than 100 guests are refused');
select throws_ok(tests.patch_sql('e_lasagne', jsonb_build_object('eater_ids', jsonb_build_array(tests.fx('jana')))),
  '23503', null, 'AC-018 apply_changes: a person outside the household cannot eat along');

-- ===================== Foreign household, signed out =====================
select tests.authenticate_as(tests.fx('jana'));
select throws_ok(tests.patch_sql('e_enzo', '{"starts_at": "20:00"}'), '42501', null,
  'Risiken apply_changes: another household cannot set the time');
select tests.authenticate_as_anon();
select throws_ok(tests.patch_sql('e_enzo', '{"starts_at": "20:00"}'), '42501', null,
  'Risiken apply_changes: signed out cannot write');

select * from finish();
rollback;
