-- Spec 0066 — KI-Agent. Covers on the server AC-026, AC-032, AC-040 and AC-041: tenant isolation of
-- ai_chats (read only for members, written only through create_ai_chat, record_ai_chat_turn and
-- delete_ai_chat), the checks of those RPCs (member, chat of the household, ids, lengths, at most
-- 100 answers), the server-set created_by and updated_at, the tombstone, sync_pull and
-- delete_household refusing while chats are left.
begin;
\ir _helpers.psql
select plan(35);

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

-- ===================== create_ai_chat =====================
select tests.authenticate_as(tests.fx('enrico'));
select lives_ok(
  format($$ insert into fx (key, id) select 'chat', public.create_ai_chat(%L, 'conv_abc123', 'Romantisch in Mitte', 'Mitte') $$,
         tests.fx('home_a')),
  'AC-040 create_ai_chat: a member creates a chat of her household');
select is(
  (select created_by from public.ai_chats where id = tests.fx('chat')), tests.fx('enrico'),
  'AC-024: created_by is the caller');
select is(
  (select row(title, place_label, response_ids)::text from public.ai_chats where id = tests.fx('chat')),
  row('Romantisch in Mitte', 'Mitte', '{}'::text[])::text,
  'AC-040: title, place and no answers yet');
select throws_ok(
  format($$ select public.create_ai_chat(%L, 'conv_abc123', 'Noch einmal', null) $$, tests.fx('solo')),
  '23505', null, 'AC-041: a conversation is referenced by one chat only, also from another household');
select throws_ok(
  format($$ select public.create_ai_chat(%L, 'resp_abc', 'Titel', null) $$, tests.fx('home_a')),
  '23514', null, 'AC-040: a conversation id must look like conv_…');
select throws_ok(
  format($$ select public.create_ai_chat(%L, 'conv_x1', %L, null) $$, tests.fx('home_a'), repeat('x', 81)),
  '23514', null, 'AC-040: a title over 80 characters is refused');
select throws_ok(
  format($$ select public.create_ai_chat(%L, 'conv_x2', 'Titel', %L) $$, tests.fx('home_a'), repeat('x', 121)),
  '23514', null, 'AC-040: a place label over 120 characters is refused');
select throws_ok(
  format($$ select public.create_ai_chat(%L, 'conv_x3', 'Titel', null) $$, tests.fx('home_b')),
  '42501', 'not_member', 'AC-026: nobody creates a chat in a household she is no member of');

-- ===================== Isolation: reading only (AC-026, AC-040) =====================
select tests.clear_authentication();
select tests.rpc_only_isolation('ai_chats',
  jsonb_build_object('id', gen_random_uuid(), 'household_id', tests.fx('home_a'),
                     'conversation_id', 'conv_direct', 'title', 'Direkt'),
  tests.fx('nadja'), tests.fx('ben'));

-- ===================== record_ai_chat_turn =====================
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(
  format($$ select public.record_ai_chat_turn(%L, 'resp_one', null) $$, tests.fx('chat')),
  'AC-024: another member continues the chat');
select lives_ok(
  format($$ select public.record_ai_chat_turn(%L, 'resp_one', 'Samstag in Kreuzberg') $$, tests.fx('chat')),
  'the same answer again with the title of its cards');
select is(
  (select row(response_ids, title)::text from public.ai_chats where id = tests.fx('chat')),
  row('{resp_one}'::text[], 'Samstag in Kreuzberg')::text,
  'an answer is listed once; the title of the first cards replaces the first words');
select lives_ok(
  format($$ select public.record_ai_chat_turn(%L, 'resp_two', 'Später anders') $$, tests.fx('chat')),
  'a second answer');
select is(
  (select row(response_ids, title)::text from public.ai_chats where id = tests.fx('chat')),
  row('{resp_one,resp_two}'::text[], 'Samstag in Kreuzberg')::text,
  'later cards keep the title');
select throws_ok(
  format($$ select public.record_ai_chat_turn(%L, 'conv_wrong', null) $$, tests.fx('chat')),
  '23514', null, 'an answer id must look like resp_…');
select tests.authenticate_as(tests.fx('ben'));
select throws_ok(
  format($$ select public.record_ai_chat_turn(%L, 'resp_ben', null) $$, tests.fx('chat')),
  'P0002', 'chat_not_found', 'AC-026: a member of another household cannot add to the chat');
select tests.clear_authentication();
select is(
  (select cardinality(response_ids) from public.ai_chats where id = tests.fx('chat')), 2,
  'AC-026: nothing of Ben arrived');
update public.ai_chats set response_ids = (select array_agg('resp_' || n) from generate_series(1, 100) n)
where id = tests.fx('chat');
select tests.authenticate_as(tests.fx('enrico'));
select throws_ok(
  format($$ select public.record_ai_chat_turn(%L, 'resp_101', null) $$, tests.fx('chat')),
  '23514', null, 'at most 100 answers per chat');
select tests.clear_authentication();
update public.ai_chats set response_ids = '{resp_one,resp_two}', updated_at = '2026-01-01' where id = tests.fx('chat');
select tests.authenticate_as(tests.fx('enrico'));
select public.record_ai_chat_turn(tests.fx('chat'), 'resp_three', null);
select ok(
  (select updated_at > '2026-01-02' from public.ai_chats where id = tests.fx('chat')),
  'the server sets updated_at, so the delta sync brings the change');

-- ===================== sync_pull (AC-024) =====================
select is(
  jsonb_array_length(public.sync_pull(jsonb_build_object('households',
    jsonb_build_object(tests.fx('home_a'), jsonb_build_object('full', true))))
    -> 'households' -> tests.fx('home_a')::text -> 'rows' -> 'ai_chats'), 1,
  'AC-024 sync_pull: the chat reaches the devices of the household');
select tests.authenticate_as(tests.fx('ben'));
select is(
  public.sync_pull(jsonb_build_object('households',
    jsonb_build_object(tests.fx('home_a'), jsonb_build_object('full', true)))) -> 'households' -> tests.fx('home_a')::text,
  null, 'AC-026 sync_pull: not to another household');

-- ===================== delete_ai_chat =====================
select throws_ok(
  format($$ select public.delete_ai_chat(%L) $$, tests.fx('chat')),
  'P0002', 'chat_not_found', 'AC-026: a member of another household cannot delete the chat');
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.delete_ai_chat(%L) $$, tests.fx('chat')),
  '42501', null, 'AC-040: anon cannot call delete_ai_chat');
select throws_ok(
  format($$ select public.create_ai_chat(%L, 'conv_anon', 'x', null) $$, tests.fx('home_a')),
  '42501', null, 'AC-040: anon cannot call create_ai_chat');
select tests.authenticate_as(tests.fx('nadja'));
select lives_ok(format($$ select public.delete_ai_chat(%L) $$, tests.fx('chat')), 'AC-028: a member deletes the chat');
select is(tests.affected(format('select 1 from public.ai_chats where id = %L', tests.fx('chat'))), 0,
  'AC-028: the chat is gone');
select is(
  tests.affected(format($$ select 1 from public.deleted_records where table_name = 'ai_chats' and record_id = %L $$,
                        tests.fx('chat'))), 1,
  'AC-028: the delete leaves a tombstone, so every device drops it');

-- ===================== delete_household (AC-032) =====================
select tests.authenticate_as(tests.fx('enrico'));
select public.create_ai_chat(tests.fx('solo'), 'conv_solo', 'Allein', null);
select throws_ok(
  format($$ select public.delete_household(%L) $$, tests.fx('solo')),
  'P0001', 'ai_chats_remaining', 'AC-032: delete_household refuses while a chat is left');
select public.delete_ai_chat((select id from public.ai_chats where conversation_id = 'conv_solo'));
-- Spec 0067: ai-agent clears the deletion log once Foundry is cleaned (ai_chat_answers.test.sql).
select public.forget_ai_chat_deletions(tests.fx('solo'),
  (select array_agg(id) from public.pending_ai_chat_deletions(tests.fx('solo'))));
select lives_ok(format($$ select public.delete_household(%L) $$, tests.fx('solo')),
  'AC-031: without chats the household is deleted');

select tests.clear_authentication();
select * from finish();
rollback;
