-- Spec 0023: links of a recipe or collection (REQ-009, AC-035, AC-036), the shared address check
-- private.is_web_url (also for spec 0024), the step timer and group checks (REQ-004, REQ-005), the
-- diet "kein Lebensmittel" (REQ-008, AC-028) and the dropped column recipes.source (REQ-011,
-- AC-047). Links are checked by the database, whatever path the member takes.
begin;
\ir _helpers.psql
select plan(50);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The SQL text of a direct update of one column of a recipe.
create function tests.set_sql(p_recipe text, p_column text, p_value jsonb) returns text language sql stable
as $$ select format('update public.recipes set %I = %L where id = %L', p_column, p_value, tests.fx(p_recipe)) $$;
grant execute on function tests.set_sql(text, text, jsonb) to anon, authenticated;

-- The SQL text of an apply_changes call.
create function tests.apply_sql(p_household text, p_ops jsonb) returns text language sql stable
as $$ select format('select public.apply_changes(%L, %L)', tests.fx(p_household), p_ops) $$;
grant execute on function tests.apply_sql(text, jsonb) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')]));
insert into fx (key) values ('lasagne'), ('grillabend'), ('new_recipe'), ('backpapier'), ('zwiebeln');
insert into public.articles (id, household_id, name, name_key) values
  (tests.fx('zwiebeln'), tests.fx('home_a'), 'Zwiebeln', 'zwiebeln');

insert into public.recipes (id, household_id, title, links) values
  (tests.fx('lasagne'), tests.fx('home_a'), 'Lasagne',
   '[{"url": "https://www.chefkoch.de/rezepte/123/lasagne.html"}]');
insert into public.recipes (id, household_id, kind, title, course) values
  (tests.fx('grillabend'), tests.fx('home_a'), 'collection', 'Grillabend', null);

-- ===================== private.is_web_url =====================
select ok(private.is_web_url('https://www.chefkoch.de/rezepte/123/lasagne.html'), 'REQ-009 is_web_url: https with path');
select ok(private.is_web_url('http://chefkoch.de'), 'REQ-009 is_web_url: http without path');
select ok(private.is_web_url('https://chefkoch.de:8443/r/1?x=1#top'), 'REQ-009 is_web_url: port, query and fragment');
select ok(private.is_web_url('https://bäckerei-müller.de/brot'), 'REQ-009 is_web_url: a host with umlauts');
select ok(not private.is_web_url('javascript:alert(1)'), 'AC-033 is_web_url: javascript: is refused');
select ok(not private.is_web_url('data:text/html,hallo'), 'AC-033 is_web_url: data: is refused');
select ok(not private.is_web_url('mailto:info@enzo.de'), 'AC-033 is_web_url: mailto: is refused');
select ok(not private.is_web_url('ftp://server/datei'), 'AC-033 is_web_url: ftp: is refused');
select ok(not private.is_web_url('https://'), 'AC-033 is_web_url: no host');
select ok(not private.is_web_url('https://chef koch.de'), 'AC-033 is_web_url: a space');
select ok(not private.is_web_url('https://localhost/r'), 'AC-033 is_web_url: a host without a dot');
select ok(not private.is_web_url('chefkoch.de/r/1'), 'REQ-009 is_web_url: the database gets the address with scheme');
select ok(not private.is_web_url(' https://chefkoch.de'), 'REQ-009 is_web_url: edge spaces');
select ok(not private.is_web_url(E'https://chefkoch.de/\u200br'), 'REQ-009 is_web_url: an invisible control character');
select ok(not private.is_web_url('https://user@chefkoch.de'), 'REQ-009 is_web_url: no user name in front of the host');
select ok(not private.is_web_url('https://chefkoch..de'), 'REQ-009 is_web_url: an empty part of the host');
select ok(private.is_web_url('https://chefkoch.de/' || repeat('a', 1980)), 'AC-035 is_web_url: 2000 characters');
select ok(not private.is_web_url('https://chefkoch.de/' || repeat('a', 1981)), 'AC-035 is_web_url: 2001 characters');
select ok(not private.is_web_url(null), 'REQ-009 is_web_url: null is no address');

-- ===================== links, directly as a member =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.set_sql('lasagne', 'links', '[{"url": "https://chefkoch.de/r/1", "label": "Omas Variante"},
                                      {"url": "https://www.chefkoch.de/rezepte/123/lasagne.html"}]'),
  'AC-032 links: two links, one with a label, are stored');
select lives_ok(
  tests.set_sql('grillabend', 'links', '[{"url": "https://grillen.de/abend"}]'),
  'REQ-009 links: a collection has links too');
select throws_ok(
  tests.set_sql('lasagne', 'links', '[{"url": "javascript:alert(1)"}]'),
  '23514', null, 'AC-035 links: javascript: is refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', jsonb_build_array(jsonb_build_object('url', 'https://chefkoch.de/' || repeat('a', 1981)))),
  '23514', null, 'AC-035 links: an address of 2001 characters is refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', jsonb_build_array(jsonb_build_object('url', 'https://chefkoch.de', 'label', repeat('x', 81)))),
  '23514', null, 'AC-035 links: a label of 81 characters is refused');
select lives_ok(
  tests.set_sql('lasagne', 'links', jsonb_build_array(jsonb_build_object('url', 'https://chefkoch.de', 'label', repeat('x', 80)))),
  'AC-035 links: a label of 80 characters is stored');
select throws_ok(
  tests.set_sql('lasagne', 'links', (select jsonb_agg(jsonb_build_object('url', 'https://chefkoch.de/r/' || n)) from generate_series(1, 11) n)),
  '23514', null, 'AC-035 links: 11 links are refused');
select lives_ok(
  tests.set_sql('lasagne', 'links', (select jsonb_agg(jsonb_build_object('url', 'https://chefkoch.de/r/' || n)) from generate_series(1, 10) n)),
  'AC-034 links: 10 links are stored');
select throws_ok(
  tests.set_sql('lasagne', 'links', '[{"url": "https://chefkoch.de/r/1"}, {"url": "https://chefkoch.de/r/1", "label": "Noch mal"}]'),
  '23514', null, 'AC-034 links: the same address twice is refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', '[{"url": "https://chefkoch.de", "label": ""}]'),
  '23514', null, 'REQ-009 links: an empty label is refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', E'[{"url": "https://chefkoch.de", "label": "Oma\\u0007s"}]'),
  '23514', null, 'REQ-009 links: a label with a control character is refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', '[{"url": "https://chefkoch.de", "preview": "https://chefkoch.de/bild.jpg"}]'),
  '23514', null, 'REQ-009 links: other keys are refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', '["https://chefkoch.de"]'),
  '23514', null, 'REQ-009 links: an element that is no object is refused');
select throws_ok(
  tests.set_sql('lasagne', 'links', '{"url": "https://chefkoch.de"}'),
  '23514', null, 'REQ-009 links: an object instead of a list is refused');

-- ===================== links through apply_changes =====================
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'insert', 'table', 'recipes',
    'row', jsonb_build_object('id', tests.fx('new_recipe'), 'title', 'Shakshuka',
                              'links', '[{"url": "https://chefkoch.de/shakshuka"}]'::jsonb)))),
  'REQ-009 apply_changes: a recipe is inserted with links');
select lives_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('new_recipe'),
    'changes', '{"links": [{"url": "https://chefkoch.de/r/2", "label": "Scharf"}]}'::jsonb))),
  'AC-032 apply_changes: links are patched');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('new_recipe'),
    'changes', '{"links": [{"url": "javascript:alert(1)"}]}'::jsonb))),
  '23514', null, 'AC-035 apply_changes: javascript: is refused');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('new_recipe'),
    'changes', '{"source": "https://chefkoch.de"}'::jsonb))),
  '22023', 'invalid_change', 'AC-047 apply_changes: source is no column any more');

-- ===================== another household, signed out =====================
select tests.authenticate_as(tests.fx('ben'));
select is(
  (select count(*)::integer from public.recipes where id = tests.fx('lasagne')), 0,
  'AC-036 links: a member of another household does not read the recipe and its links');
select is(
  tests.affected(tests.set_sql('lasagne', 'links', '[{"url": "https://ben.de/x"}]')), 0,
  'AC-036 links: a member of another household changes nothing');
select throws_ok(
  tests.apply_sql('home_a', jsonb_build_array(jsonb_build_object(
    'kind', 'patch', 'table', 'recipes', 'id', tests.fx('lasagne'),
    'changes', '{"links": []}'::jsonb))),
  '42501', 'not_member', 'AC-036 apply_changes: a member of another household cannot patch the links');
select tests.authenticate_as_anon();
select throws_ok(
  tests.set_sql('lasagne', 'links', '[]'),
  '42501', null, 'AC-036 links: a signed-out caller cannot write links');
select tests.clear_authentication();
select is(
  (select links from public.recipes where id = tests.fx('lasagne')),
  (select jsonb_agg(jsonb_build_object('url', 'https://chefkoch.de/r/' || n)) from generate_series(1, 10) n),
  'AC-036 links: the links of Lasagne are unchanged');

-- ===================== steps and groups =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  tests.set_sql('lasagne', 'steps', '[{"id": "s1", "text": "Backen", "timerMinutes": 35},
                                      {"id": "s2", "text": "Ruhen", "timerMinutes": 600}, {"id": "s3", "text": "Essen"}]'),
  'AC-015 steps: timers of 35 and 600 minutes and a step without timer are stored');
select throws_ok(
  tests.set_sql('lasagne', 'steps', '[{"id": "s1", "text": "Backen", "timerMinutes": 0}]'),
  '23514', null, 'AC-016 steps: a timer of 0 minutes is refused');
select throws_ok(
  tests.set_sql('lasagne', 'steps', '[{"id": "s1", "text": "Backen", "timerMinutes": 601}]'),
  '23514', null, 'AC-016 steps: a timer of 601 minutes is refused');
select throws_ok(
  tests.set_sql('lasagne', 'steps', '[{"id": "s1", "text": "Backen", "timerMinutes": 1.5}]'),
  '23514', null, 'AC-016 steps: a timer of 1,5 minutes is refused');
select throws_ok(
  tests.set_sql('lasagne', 'steps', '[{"id": "s1", "text": "Backen", "timerMinutes": "35"}]'),
  '23514', null, 'AC-016 steps: a timer as text is refused');
select throws_ok(
  tests.set_sql('lasagne', 'ingredients', jsonb_build_array(jsonb_build_object(
    'id', 'i1', 'articleId', tests.fx('zwiebeln')::text, 'shoppingRule', 'count', 'group', repeat('g', 61)))),
  '23514', null, 'REQ-004 ingredients: a group of 61 characters is refused');

-- ===================== diet "kein Lebensmittel", no source =====================
select tests.clear_authentication();
select lives_ok(
  format('insert into public.articles (id, household_id, name, name_key, diet) values (%L, %L, %L, %L, %L)',
         tests.fx('backpapier'), tests.fx('home_a'), 'Backpapier', 'backpapier', 'non_food'),
  'AC-028 articles: the diet non_food is stored');
select hasnt_column('public', 'recipes', 'source', 'AC-047 recipes: the column source is gone');

select * from finish();
rollback;
