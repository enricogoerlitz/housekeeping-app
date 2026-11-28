-- Spec 0067 — Housekeeping-Agent, step C (REQ-015, decision 13). Covers on the server AC-024 (one
-- answer per chat at a time: begin_ai_chat_answer, end_ai_chat_answer, ai_chat_answering) and the
-- private deletion log of chats deleted without their Foundry conversation (a trigger on
-- ai_chats, pending_ai_chat_deletions, forget_ai_chat_deletions, delete_household refusing while
-- entries are left). Both tables are private: no grants, reached only through the functions,
-- never another household's rows, never for anon.
begin;
\ir _helpers.psql
select plan(32);

create temp table fx (key text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select, insert on fx to anon, authenticated;
create function tests.fx(p_key text) returns uuid language sql stable
as $$ select id from fx where key = p_key $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into fx (key, id) values
  ('enrico', tests.create_user('enrico@example.com', 'Enrico')),
  ('nadja', tests.create_user('nadja@example.com', 'Nadja')),
  ('ben', tests.create_user('ben@example.com', 'Ben'));
insert into fx (key, id) values
  ('home_a', tests.create_household('Enrico & Nadja', array[tests.fx('enrico'), tests.fx('nadja')])),
  ('home_b', tests.create_household('WG Kreuzberg', array[tests.fx('ben')])),
  ('solo', tests.create_household('Nur Enrico', array[tests.fx('enrico')]));
insert into fx (key) values ('token_e'), ('token_n'), ('token_b');

select tests.authenticate_as(tests.fx('enrico'));
insert into fx (key, id)
select 'chat', public.create_ai_chat(tests.fx('home_a'), 'conv_answers1', 'Woche', null);
select public.record_ai_chat_turn(tests.fx('chat'), 'resp_a1', null);

-- ===================== One answer at a time (AC-024) =====================
select is(public.begin_ai_chat_answer(tests.fx('chat'), tests.fx('token_e')), true,
  'AC-024: the first answer of a chat takes it');
select is(public.ai_chat_answering(tests.fx('chat')), true,
  'AC-024: the chat says an answer is running');
select tests.authenticate_as(tests.fx('nadja'));
select is(public.begin_ai_chat_answer(tests.fx('chat'), tests.fx('token_n')), false,
  'AC-024: Nadja''s answer in the same chat waits');
select is(public.ai_chat_answering(tests.fx('chat')), true,
  'AC-024: Nadja sees that an answer is running');
select lives_ok(
  format($$ select public.end_ai_chat_answer(%L, %L) $$, tests.fx('chat'), tests.fx('token_n')),
  'ending with another token is harmless');
select is(public.ai_chat_answering(tests.fx('chat')), true,
  'concurrency: another token does not end Enrico''s answer');
select tests.authenticate_as(tests.fx('enrico'));
select public.end_ai_chat_answer(tests.fx('chat'), tests.fx('token_e'));
select is(public.ai_chat_answering(tests.fx('chat')), false,
  'AC-024: the end of the answer frees the chat');
select tests.authenticate_as(tests.fx('nadja'));
select is(public.begin_ai_chat_answer(tests.fx('chat'), tests.fx('token_n')), true,
  'AC-024: then Nadja''s answer runs');

-- A crashed function leaves its lease; it runs out.
select tests.clear_authentication();
update private.ai_chat_answers set until = now() - interval '1 second' where chat_id = tests.fx('chat');
select tests.authenticate_as(tests.fx('enrico'));
select is(public.ai_chat_answering(tests.fx('chat')), false,
  'a lease that ran out is no running answer');
select is(public.begin_ai_chat_answer(tests.fx('chat'), tests.fx('token_e')), true,
  'a lease that ran out is taken by the next answer');
select tests.clear_authentication();
select is(
  (select (until - now()) between interval '140 seconds' and interval '160 seconds'
   from private.ai_chat_answers where chat_id = tests.fx('chat')), true,
  'the lease lasts the whole answer (120 s) and a little more');
select tests.authenticate_as(tests.fx('enrico'));

-- Foreign household, signed out, direct access.
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.begin_ai_chat_answer(%L, %L) $$, tests.fx('chat'), tests.fx('token_b')),
  'P0002', 'chat_not_found', 'AC-014: a member of another household cannot take the chat');
select throws_ok(format($$ select public.ai_chat_answering(%L) $$, tests.fx('chat')),
  'P0002', 'chat_not_found', 'AC-014: nor see whether it answers');
select throws_ok(format($$ select public.end_ai_chat_answer(%L, %L) $$, tests.fx('chat'), tests.fx('token_e')),
  'P0002', 'chat_not_found', 'AC-014: nor end its answer, even with its token');
select tests.clear_authentication();
select is((select count(*)::int from private.ai_chat_answers where chat_id = tests.fx('chat')), 1,
  'AC-014: the answer still runs');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.begin_ai_chat_answer(%L, %L) $$, tests.fx('chat'), tests.fx('token_b')),
  '42501', null, 'signed out: no begin');
select throws_ok(format($$ select public.ai_chat_answering(%L) $$, tests.fx('chat')),
  '42501', null, 'signed out: no status');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok('select * from private.ai_chat_answers', '42501', null,
  'members cannot read the locks directly');
select throws_ok('select * from private.ai_chat_deletions', '42501', null,
  'members cannot read the deletion log directly');
select throws_ok(
  format($$ insert into private.ai_chat_deletions (household_id, conversation_id) values (%L, 'conv_x') $$,
         tests.fx('home_a')),
  '42501', null, 'members cannot write the deletion log directly');

-- ===================== Deletion log (decision 13) =====================
select public.delete_ai_chat(tests.fx('chat'));
select is(
  (select array_agg(row(conversation_id, response_ids)::text)
   from public.pending_ai_chat_deletions(tests.fx('home_a'))),
  array[row('conv_answers1', '{resp_a1}'::text[])::text],
  'a chat deleted directly leaves its conversation and answers in the log');
select tests.clear_authentication();
select is((select count(*)::int from private.ai_chat_answers), 0,
  'deleting the chat takes its lock with it');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(format($$ select * from public.pending_ai_chat_deletions(%L) $$, tests.fx('home_a')),
  '42501', 'not_member', 'AC-014: another household''s log stays hidden');
select throws_ok(
  format($$ select public.forget_ai_chat_deletions(%L, array[gen_random_uuid()]) $$, tests.fx('home_a')),
  '42501', 'not_member', 'AC-014: another household''s log cannot be cleared');
select is((select count(*)::int from public.pending_ai_chat_deletions(tests.fx('home_b'))), 0,
  'Ben''s own household has nothing in the log');
select tests.authenticate_as_anon();
select throws_ok(format($$ select * from public.pending_ai_chat_deletions(%L) $$, tests.fx('home_a')),
  '42501', null, 'signed out: no log');

-- delete_household waits for the log (REQ-010 of spec 0066).
select tests.authenticate_as(tests.fx('enrico'));
select public.create_ai_chat(tests.fx('solo'), 'conv_solo1', 'Allein', null);
select public.delete_ai_chat((select id from public.ai_chats where conversation_id = 'conv_solo1'));
select throws_ok(format($$ select public.delete_household(%L) $$, tests.fx('solo')),
  'P0001', 'ai_chats_remaining', 'delete_household refuses while the log has the household''s chats');
select is(
  public.forget_ai_chat_deletions(tests.fx('solo'),
    (select array_agg(id) from public.pending_ai_chat_deletions(tests.fx('solo')))),
  1, 'the function clears what it deleted in Foundry');
select is(
  public.forget_ai_chat_deletions(tests.fx('home_a'),
    (select array_agg(id) from public.pending_ai_chat_deletions(tests.fx('solo')))),
  0, 'clearing names the household: ids of another one change nothing');
select lives_ok(format($$ select public.delete_household(%L) $$, tests.fx('solo')),
  'with the log empty the household can go');

-- A household deleted outside the app (cascade) leaves its chats in the log for the operator.
select tests.clear_authentication();
insert into public.ai_chats (household_id, conversation_id, title)
values (tests.fx('home_b'), 'conv_cascade1', 'Weg');
delete from public.households where id = tests.fx('home_b');
select is(
  (select count(*)::int from private.ai_chat_deletions where conversation_id = 'conv_cascade1'), 1,
  'a household deleted directly leaves its conversations in the log');
select is(
  (select count(*)::int from private.ai_chat_deletions where household_id = tests.fx('home_a')), 1,
  'the log of home_a is untouched');

select * from finish();
rollback;
