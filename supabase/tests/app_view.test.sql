-- Spec 0067, REQ-001, decision 14: the view of the app ("Normal" / "KI zuerst") per person, a
-- column of her own synced row of notification_settings: readable only by herself (AC-002),
-- written only through set_app_view, for all her households at once; a new membership takes it.
begin;
\ir _helpers.psql
select plan(18);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on function tests.fx(text) to anon, authenticated;

-- The view of a member in a household, read past RLS.
create function tests.view_of(p_household text, p_member text) returns text language sql stable
security definer set search_path = ''
as $$
  select s.app_view from public.notification_settings s
  where s.household_id = tests.fx(p_household) and s.member_id = tests.fx(p_member)
$$;
grant execute on function tests.view_of(text, text) to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('test', tests.create_household('Test', array[tests.fx('enrico')])),
  ('home_b', tests.create_household('B', array[tests.fx('ben')]));

-- ===================== the column and its default =====================
select col_type_is('public', 'notification_settings', 'app_view', 'text',
  'AC-001 notification_settings.app_view is text');
select col_default_is('public', 'notification_settings', 'app_view', 'normal',
  'AC-002 notification_settings.app_view: "Normal" is the default');
select is(tests.view_of('home', 'nadja'), 'normal', 'AC-002 a member starts with "Normal"');
select throws_ok(
  format($$ update public.notification_settings set app_view = 'chaos' where member_id = %L $$, tests.fx('ben')),
  '23514', null, 'notification_settings.app_view: only "normal" and "ai_first" are allowed');

-- ===================== AC-001: Enrico chooses "KI zuerst" =====================
alter table public.notification_settings disable trigger notification_settings_set_timestamps;
update public.notification_settings set updated_at = '2026-01-01T00:00:00Z' where member_id = tests.fx('enrico');
alter table public.notification_settings enable trigger notification_settings_set_timestamps;

select tests.authenticate_as(tests.fx('enrico'));
select lives_ok($$ select public.set_app_view('ai_first') $$, 'AC-001 set_app_view: Enrico chooses "KI zuerst"');
select tests.clear_authentication();
select is(tests.view_of('home', 'enrico'), 'ai_first', 'AC-001 his row in "Enrico & Nadja" says "KI zuerst"');
select is(tests.view_of('test', 'enrico'), 'ai_first', 'AC-001 the view is his, in every household of his');
select ok(
  (select bool_and(updated_at > '2026-01-01T00:00:00Z') from public.notification_settings
   where member_id = tests.fx('enrico')),
  'AC-001 the server sets updated_at, so the view reaches his other devices');

-- ===================== AC-002: Nadja keeps her own view =====================
select is(tests.view_of('home', 'nadja'), 'normal', 'AC-002 Nadja still has "Normal"');
select tests.authenticate_as(tests.fx('nadja'));
select is(
  tests.affected(format('select 1 from public.notification_settings where member_id = %L', tests.fx('enrico'))), 0,
  'AC-002 Nadja does not read Enrico''s view');
select throws_ok(
  format($$ update public.notification_settings set app_view = 'normal' where member_id = %L $$, tests.fx('enrico')),
  '42501', null, 'AC-002 Nadja cannot change Enrico''s view directly');
select throws_ok(
  format($$ update public.notification_settings set app_view = 'ai_first' where member_id = %L $$, tests.fx('nadja')),
  '42501', null, 'set_app_view is the only way: no column of the row is writable, not even her own');
select throws_ok($$ select public.set_app_view('admin') $$, '22023', 'invalid_view',
  'set_app_view refuses an unknown view');
select throws_ok($$ select public.set_app_view(null) $$, '22023', 'invalid_view',
  'set_app_view refuses no view');

-- ===================== a foreign household and anon =====================
select tests.authenticate_as(tests.fx('ben'));
select lives_ok($$ select public.set_app_view('ai_first') $$, 'Ben sets his own view');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notification_settings
   where member_id <> tests.fx('ben') and app_view = 'ai_first' and member_id <> tests.fx('enrico')), 0,
  'set_app_view of Ben changes nobody else''s row');

select tests.authenticate_as_anon();
select throws_ok($$ select public.set_app_view('ai_first') $$, '42501', null,
  'anon cannot call set_app_view');

-- ===================== a new membership takes her view =====================
select tests.clear_authentication();
insert into public.household_members (household_id, profile_id) values (tests.fx('home_b'), tests.fx('enrico'));
select is(tests.view_of('home_b', 'enrico'), 'ai_first',
  'AC-001 joining another household, Enrico keeps "KI zuerst"');

select * from finish();
rollback;
