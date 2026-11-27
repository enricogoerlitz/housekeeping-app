-- Spec 0042, REQ-005 — the owner (Eigentümer) of a household: the member who joined first, on a
-- tie the smaller profile id. Only the owner invites and removes others; everybody leaves herself;
-- when the owner leaves or deletes her account the next oldest member is the owner. Covers AC-012
-- to AC-015 and the risk table: a member removing the owner or inviting through the API, a
-- household without an owner after leaving, foreign household and signed out, and a re-joined
-- member (or a client setting housekeeping.keep_created_at) not moving to the front.
begin;
\ir _helpers.psql
select plan(27);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
create function tests.owner(p_key text) returns uuid language sql stable
as $$ select private.household_owner(tests.fx(p_key)) $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('dora', tests.create_user('dora@example.com', 'Dora')),
  ('emil', tests.create_user('emil@example.com', 'Emil')),
  ('ben', tests.create_user('ben@example.com', 'Ben')),
  ('frank', tests.create_user('frank@example.com', 'Frank')),
  ('gina', tests.create_user('gina@example.com', 'Gina')),
  ('tia', tests.create_user('tia@example.com', 'Tia')),
  ('tom', tests.create_user('tom@example.com', 'Tom'));
-- Enrico joined first, then Nadja, Dora and Emil (the helper keeps the array order).
insert into fx (key, id) values
  ('home', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja'), tests.fx('dora'), tests.fx('emil')])),
  ('home_b', tests.create_household('WG Köln', array[tests.fx('ben')])),
  ('home_c', tests.create_household('Frank & Gina', array[tests.fx('frank'), tests.fx('gina')]));
-- Tia and Tom joined at the same moment.
insert into fx (key, id) values ('home_t', tests.create_household('Gleichstand', array[]::uuid[]));
insert into public.household_members (household_id, profile_id)
values (tests.fx('home_t'), tests.fx('tia')), (tests.fx('home_t'), tests.fx('tom'));

-- ===================== who the owner is =====================
select is(tests.owner('home'), tests.fx('enrico'), 'REQ-005: the member who joined first is the owner');
select is(tests.owner('home_t'), least(tests.fx('tia'), tests.fx('tom')),
  'REQ-005 (Decision 1): on the same join time the smaller profile id is the owner');
select is(private.household_owner(gen_random_uuid()), null, 'REQ-005: a household without members has no owner');
select ok(
  not has_function_privilege('authenticated', 'private.household_owner(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.household_owner(uuid)', 'execute'),
  'REQ-005: the helper is not callable through the API');

-- ===================== a member who is not the owner (AC-012, AC-013) =====================
select tests.authenticate_as(tests.fx('nadja'));
select throws_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('enrico')),
  '42501', 'not_owner',
  'AC-012: Nadja cannot remove Enrico, the owner');
select throws_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('dora')),
  '42501', 'not_owner',
  'AC-012: Nadja cannot remove another member either');
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home'), 'carla@example.com'),
  '42501', 'not_owner',
  'AC-013: Nadja cannot invite');
select tests.clear_authentication();
select results_eq(
  format($$ select (select count(*)::int from public.household_members where household_id = %1$L),
                   (select count(*)::int from public.household_invitations where household_id = %1$L) $$,
         tests.fx('home')),
  $$ values (4, 0) $$,
  'AC-012, AC-013: nothing changed: four members, no invitation');

-- ===================== the owner =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home'), 'carla@example.com'),
  'AC-013: Enrico, the owner, invites');
select lives_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('dora')),
  'AC-012: Enrico, the owner, removes Dora');

-- ===================== leaving (AC-014) =====================
select tests.authenticate_as(tests.fx('emil'));
select lives_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('emil')),
  'REQ-005: a member who is not the owner can leave');
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('enrico')),
  'AC-014: the owner can leave');
select tests.clear_authentication();
select is(tests.owner('home'), tests.fx('nadja'), 'AC-014: after Enrico left, Nadja is the owner');
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home'), 'enrico@example.com'),
  'AC-014: Nadja, now the owner, invites (Enrico again)');

-- Enrico comes back, even with the restore setting on as a client: he joins now, after Nadja.
select tests.authenticate_as(tests.fx('enrico'));
select set_config('housekeeping.keep_created_at', 'on', true);
select lives_ok(
  format($$ select public.accept_invitation((select id from public.household_invitations
                                             where household_id = %L and email = 'enrico@example.com')) $$,
         tests.fx('home')),
  'AC-014: Enrico accepts the new invitation');
select set_config('housekeeping.keep_created_at', 'off', true);
select tests.clear_authentication();
select is(tests.owner('home'), tests.fx('nadja'),
  'Risiko Wiederherstellung: a re-joined member joins at the end, Nadja stays the owner');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('nadja')),
  '42501', 'not_owner',
  'AC-012: Enrico, now a member, cannot remove Nadja');

-- created_at of a membership stays on every update; members cannot write memberships at all.
select tests.clear_authentication();
update public.household_members set created_at = now() - interval '10 years'
where household_id = tests.fx('home') and profile_id = tests.fx('enrico');
select is(tests.owner('home'), tests.fx('nadja'),
  'Risiko Wiederherstellung: an update keeps created_at (set_timestamps), the owner does not change');
select ok(
  not has_table_privilege('authenticated', 'public.household_members', 'insert')
  and not has_table_privilege('authenticated', 'public.household_members', 'update')
  and not has_column_privilege('authenticated', 'public.household_members', 'created_at', 'update'),
  'Risiko Wiederherstellung: members cannot insert or update memberships (no created_at of their own)');

-- ===================== account deletion =====================
delete from auth.users where id = tests.fx('frank');
select is(tests.owner('home_c'), tests.fx('gina'), 'REQ-005: after the owner deleted her account, the next member is the owner');
select tests.authenticate_as(tests.fx('gina'));
select lives_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home_c'), 'hanna@example.com'),
  'REQ-005: the new owner invites');

-- ===================== foreign household and signed out (AC-015) =====================
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home'), 'carla2@example.com'),
  '42501', 'not_member',
  'AC-015: a member of another household cannot invite');
select throws_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('enrico')),
  '42501', 'not_member',
  'AC-015: a member of another household cannot remove');
select tests.authenticate_as_anon();
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home'), 'carla3@example.com'),
  '42501', null,
  'AC-015: signed out cannot invite');
select throws_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('enrico')),
  '42501', null,
  'AC-015: signed out cannot remove');

-- The private functions without a user (e.g. a token without sub) refuse before anything else.
select tests.clear_authentication();
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
select throws_ok(
  format('select public.invite_member(%L, %L)', tests.fx('home'), 'carla4@example.com'),
  '42501', 'not_authenticated',
  'AC-015: without a user, inviting is refused');
select throws_ok(
  format('select public.remove_member(%L, %L)', tests.fx('home'), tests.fx('enrico')),
  '42501', 'not_authenticated',
  'AC-015: without a user, removing is refused');

select * from finish();
rollback;
