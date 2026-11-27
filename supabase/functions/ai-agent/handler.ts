// Spec 0066 "KI-Agent" (ADR-0018), since spec 0067 the one household agent (ADR-0020): `send`
// streams server-sent events of our own contract (core ai-agent.ts), `load` reads a conversation's
// messages, `delete` and `purge` remove conversations, answers and our reference rows. The chat
// belongs to a household: our row (RLS) and the conversation's metadata must both say so, because
// the Foundry key can read every conversation of the project. The household tools (tools.ts) read
// as the caller, for the chat's household only.
import { storedToolStep, toolLabel } from '../_shared/agent-tools.gen.ts';
import {
  AGENT_LIMITS,
  AGENT_QUOTA_PER_TURN,
  AgentLoadReplySchema,
  AgentRequestSchema,
  chatTitle,
  contextBlock,
  createCitationFilter,
  createSseParser,
  enrichmentFromHits,
  functionOutput,
  mergeCards,
  messagesFromItems,
  parseSuggestionsArgs,
  sourcesOf,
  sseData,
  type AgentCard,
  type AgentRequest,
  type AgentSendRequest,
  type AgentStep,
  type AgentStreamEvent,
  type PlaceEnrichment,
} from '../_shared/ai-agent.gen.ts';
import type { Deps, UserClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/http.ts';
import { requireMember } from '../_shared/membership.ts';
import { consumeQuota } from '../_shared/quota.ts';
import { configuredProviders } from '../_shared/web-search.ts';
import { agentConfig, foundryClient, type Foundry } from './foundry-agent.ts';
import { loadToolBase, runHouseholdTool, type ToolBase } from './tools.ts';

/** The whole answer, all rounds included (decision 13). */
const TURN_MS = 120_000;
/** Model runs of one answer: the first and up to four rounds of household tools (spec 0067). */
const MAX_TOOL_ROUNDS = 5;
/** The body of a send with its photos and files (spec 0067, REQ-005). */
const MAX_SEND_BODY_BYTES = AGENT_LIMITS.attachmentChars + 256 * 1024;
const SERPER_ZOOM = 14;

interface ChatRow {
  id: string;
  household_id: string;
  conversation_id: string;
  response_ids: string[];
}

async function loadChat(client: UserClient, householdId: string, chatId: string): Promise<ChatRow> {
  const { data, error } = await client
    .from('ai_chats')
    .select('id, household_id, conversation_id, response_ids')
    .eq('id', chatId)
    .eq('household_id', householdId)
    .limit(1);
  if (error) throw new Error('chat_lookup_failed');
  const row = Array.isArray(data) ? (data[0] as ChatRow | undefined) : undefined;
  if (!row || row.household_id !== householdId) throw new HttpError('forbidden');
  return { ...row, response_ids: Array.isArray(row.response_ids) ? row.response_ids : [] };
}

/** AC-034: the conversation must name the household; undefined when it is gone. */
async function verifyConversation(foundry: Foundry, chat: ChatRow): Promise<'ok' | 'gone'> {
  const metadata = await foundry.conversationMetadata(chat.conversation_id);
  if (metadata === undefined) return 'gone';
  if (metadata.household_id !== chat.household_id) {
    console.error('ai_agent_foreign_conversation');
    throw new HttpError('forbidden');
  }
  return 'ok';
}

async function rpc(
  client: UserClient,
  fn: string,
  args: { [name: string]: unknown },
): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.error('ai_agent_rpc_failed', { fn, code: error.code });
    throw new HttpError(error.message.includes('chat_not_found') ? 'forbidden' : 'internal');
  }
  return data;
}

// ---------- Deleting ----------

/** AC-028–030: every answer of this conversation, the conversation, then our row. */
async function deleteChat(foundry: Foundry, client: UserClient, chat: ChatRow): Promise<void> {
  const state = await verifyConversation(foundry, chat);
  for (const responseId of chat.response_ids) {
    const conversation = await foundry.responseConversation(responseId);
    // Gone, or of another conversation (a forged id): left alone.
    if (conversation !== chat.conversation_id) continue;
    await foundry.deleteResponse(responseId);
  }
  if (state === 'ok') await foundry.deleteConversation(chat.conversation_id);
  await rpc(client, 'delete_ai_chat', { chat_id: chat.id });
}

async function purge(
  foundry: () => Foundry,
  client: UserClient,
  householdId: string,
): Promise<number> {
  const { data, error } = await client
    .from('ai_chats')
    .select('id, household_id, conversation_id, response_ids')
    .eq('household_id', householdId)
    .limit(1000);
  if (error) throw new Error('chat_lookup_failed');
  const chats = (Array.isArray(data) ? data : []) as ChatRow[];
  for (const chat of chats) {
    await deleteChat(foundry(), client, {
      ...chat,
      response_ids: Array.isArray(chat.response_ids) ? chat.response_ids : [],
    });
  }
  return chats.length;
}

// ---------- Sending ----------

/** AC-038: a function call without output (an interrupted answer) blocks the next message. */
async function closeOpenCalls(foundry: Foundry, conversation: string): Promise<void> {
  const items = await foundry.items(conversation, 'desc', 1);
  const answered = new Set<string>();
  const open: { name: string; callId: string }[] = [];
  for (const raw of items) {
    const item = raw as { type?: unknown; call_id?: unknown; name?: unknown };
    if (typeof item.call_id !== 'string') continue;
    if (item.type === 'function_call_output') answered.add(item.call_id);
    else if (item.type === 'function_call' && !answered.has(item.call_id))
      open.push({ name: String(item.name), callId: item.call_id });
  }
  if (open.length === 0) return;
  await foundry.appendItems(
    conversation,
    open.map((call) => ({
      type: 'function_call_output',
      call_id: call.callId,
      output: call.name === 'show_suggestions' ? functionOutput([]) : '{"error":"interrupted"}',
    })),
  );
}

async function enrich(
  deps: Deps,
  cards: readonly AgentCard[],
  around: AgentSendRequest['place']['location'],
): Promise<PlaceEnrichment[]> {
  const serper = configuredProviders(deps).find((provider) => provider.name === 'serper');
  if (!serper || cards.length === 0) return [];
  const results = await Promise.allSettled(
    cards.map(async (card) => {
      const query = [card.name, card.address ?? card.district].filter(Boolean).join(' ');
      const hits = await serper.places(
        query,
        around ? { lat: around.lat, lng: around.lng, zoom: SERPER_ZOOM } : undefined,
      );
      return enrichmentFromHits(card, hits);
    }),
  );
  const found = results.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  );
  if (found.length < results.length)
    console.error('ai_agent_enrichment_partial', { found: found.length });
  return found;
}

interface FunctionCall {
  name: string;
  callId: string;
  args: string;
}

interface Round {
  responseId?: string;
  calls: FunctionCall[];
  failed: boolean;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** One streamed model run: our events out, the function calls and the response id back. */
async function streamRound(input: {
  foundry: Foundry;
  conversation: string;
  items: unknown[];
  signal: AbortSignal;
  emit: (event: AgentStreamEvent) => void;
  web: AgentStep;
  sources: Map<string, ReturnType<typeof sourcesOf>[number]>;
  onResponse: (id: string) => Promise<void>;
  /** The step row of a household tool call as soon as the model starts it (REQ-008). */
  onToolStarted: (callId: string, name: string) => void;
}): Promise<Round> {
  const round: Round = { calls: [], failed: false };
  const response = await input.foundry.respond(input.conversation, input.items, input.signal);
  const parser = createSseParser();
  const filter = createCitationFilter();
  const decoder = new TextDecoder();
  const reader = response.body!.getReader();
  const text = (delta: string) => {
    if (delta) input.emit({ type: 'text', delta });
  };
  const handle = async (raw: unknown) => {
    const event = record(raw);
    const item = record(event.item);
    switch (event.type) {
      case 'response.created': {
        const id = record(event.response).id;
        if (typeof id === 'string' && /^resp_[A-Za-z0-9_-]{1,200}$/.test(id)) {
          round.responseId = id;
          await input.onResponse(id);
        }
        break;
      }
      case 'response.output_item.added':
        if (item.type === 'web_search_call') {
          input.web.status = 'running';
          input.emit({ type: 'step', step: { ...input.web } });
        } else if (item.type === 'function_call' && item.name === 'show_suggestions') {
          input.emit({ type: 'cards_pending' });
        } else if (item.type === 'function_call' && typeof item.call_id === 'string') {
          input.onToolStarted(item.call_id, typeof item.name === 'string' ? item.name : '');
        }
        break;
      case 'response.output_item.done':
        if (item.type === 'web_search_call') {
          const action = record(item.action);
          const queries = [...(typeof action.query === 'string' ? [action.query] : [])].map(
            (query) => query.slice(0, 200),
          );
          input.web.details = [...input.web.details, ...queries].slice(0, 20);
          const found = Array.isArray(action.sources) ? action.sources.length : 0;
          input.web.count = (input.web.count ?? 0) + found;
          input.emit({ type: 'step', step: { ...input.web } });
        } else if (item.type === 'message') {
          text(filter.flush());
        } else if (item.type === 'function_call') {
          if (typeof item.call_id === 'string' && typeof item.name === 'string')
            round.calls.push({
              name: item.name,
              callId: item.call_id,
              args: typeof item.arguments === 'string' ? item.arguments : '',
            });
        }
        break;
      case 'response.output_text.delta':
        if (typeof event.delta === 'string') text(filter.push(event.delta));
        break;
      case 'response.output_text.annotation.added':
        for (const source of sourcesOf([event.annotation]))
          if (!input.sources.has(source.host) && input.sources.size < 12)
            input.sources.set(source.host, source);
        break;
      case 'response.failed':
      case 'response.incomplete':
      case 'error':
        round.failed = true;
        console.error('foundry_agent_failed', { step: 'stream', event: event.type });
        break;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) await handle(event);
  }
  text(filter.flush());
  return round;
}

interface PreparedTurn {
  chat: ChatRow;
  /** Set for a new chat: its first event. */
  created?: { title: string };
}

/**
 * Everything that may still answer with a status (403, 409, 429) before the stream starts: the
 * chat of the household, its length, the quota, a new conversation and its row.
 */
async function prepareTurn(
  foundry: Foundry,
  client: UserClient,
  input: AgentSendRequest,
): Promise<PreparedTurn> {
  if (input.chatId) {
    const chat = await loadChat(client, input.householdId, input.chatId);
    if (chat.response_ids.length >= AGENT_LIMITS.turns) throw new HttpError('chat_too_long');
    if ((await verifyConversation(foundry, chat)) === 'gone') throw new HttpError('forbidden');
    await consumeQuota(client, 'request', AGENT_QUOTA_PER_TURN);
    await closeOpenCalls(foundry, chat.conversation_id);
    return { chat };
  }
  await consumeQuota(client, 'request', AGENT_QUOTA_PER_TURN);
  const conversation = await foundry.createConversation({
    household_id: input.householdId,
    app: 'housekeeping',
  });
  const title = chatTitle(input.message);
  // Without its row nobody could ever delete the conversation: it goes again (best effort).
  const id = await rpc(client, 'create_ai_chat', {
    household_id: input.householdId,
    conversation_id: conversation,
    title,
    place_label: input.place.label,
  }).catch(async (error: unknown) => {
    await foundry.deleteConversation(conversation).catch(() => undefined);
    throw error;
  });
  if (typeof id !== 'string') {
    await foundry.deleteConversation(conversation).catch(() => undefined);
    throw new HttpError('internal');
  }
  return {
    chat: { id, household_id: input.householdId, conversation_id: conversation, response_ids: [] },
    created: { title },
  };
}

async function streamTurn(
  deps: Deps,
  foundry: Foundry,
  client: UserClient,
  input: AgentSendRequest,
  prepared: PreparedTurn,
  signal: AbortSignal,
  emit: (event: AgentStreamEvent) => void,
): Promise<void> {
  const { chat } = prepared;
  if (prepared.created) emit({ type: 'chat', chatId: chat.id, title: prepared.created.title });
  const web: AgentStep = {
    id: 'web',
    kind: 'web_search',
    label: 'Sucht im Web',
    details: [],
    countLabel: 'Quellen',
    status: 'running',
  };
  const sources = new Map<string, ReturnType<typeof sourcesOf>[number]>();
  // The household's zone, members and slots, once per answer (AC-025).
  const base: ToolBase = await loadToolBase(client, chat.household_id, deps.now());
  let items: unknown[] = [
    {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: contextBlock({
            place: input.place,
            now: deps.now(),
            timeZone: input.timeZone,
            badges: input.badges,
            householdTimeZone: base.timeZone,
          }),
        },
        ...(input.message ? [{ type: 'input_text', text: input.message }] : []),
        // Spec 0067, REQ-005: photos as JPEG, PDF as a file (decision 9).
        ...input.attachments.map((attachment) =>
          attachment.kind === 'image'
            ? { type: 'input_image', image_url: attachment.dataUrl, detail: 'auto' }
            : { type: 'input_file', filename: attachment.name, file_data: attachment.dataUrl },
        ),
      ],
    },
  ];
  let cardsTitle: string | undefined;
  let lastResponse: string | undefined;
  // One step row per tool call (REQ-008), numbered in the order the model starts them.
  const stepOf = new Map<string, string>();
  const stepFor = (callId: string) => {
    let id = stepOf.get(callId);
    if (!id) {
      id = `t${stepOf.size + 1}`;
      stepOf.set(callId, id);
    }
    return id;
  };
  for (let roundNo = 0; roundNo < MAX_TOOL_ROUNDS; roundNo += 1) {
    const round = await streamRound({
      foundry,
      conversation: chat.conversation_id,
      items,
      signal,
      emit,
      web,
      sources,
      onToolStarted: (callId, name) =>
        emit({
          type: 'step',
          step: {
            id: stepFor(callId),
            kind: 'tool',
            label: toolLabel(name),
            details: [],
            status: 'running',
          },
        }),
      onResponse: async (id) => {
        lastResponse = id;
        // An answer the row does not name could never be deleted (chat deleted meanwhile).
        await rpc(client, 'record_ai_chat_turn', {
          chat_id: chat.id,
          response_id: id,
          title: null,
        }).catch(async (error: unknown) => {
          await foundry.deleteResponse(id).catch(() => undefined);
          throw error;
        });
      },
    });
    if (round.failed) throw new HttpError('ai_unavailable');

    // UI tools close at once without a model run; household tools answer and the model runs on.
    const outputs: unknown[] = [];
    const dataCalls: FunctionCall[] = [];
    for (const call of round.calls) {
      if (call.name === 'show_suggestions') {
        const parsed = parseSuggestionsArgs(call.args);
        const enrichments = parsed ? await enrich(deps, parsed.cards, input.place.location) : [];
        if (parsed && parsed.cards.length > 0) {
          cardsTitle ??= parsed.title;
          emit({
            type: 'cards',
            ...(parsed.title ? { title: parsed.title } : {}),
            cards: mergeCards(parsed.cards, enrichments),
            followUps: parsed.followUps,
          });
        }
        outputs.push({
          type: 'function_call_output',
          call_id: call.callId,
          output: functionOutput(enrichments),
        });
      } else {
        dataCalls.push(call);
      }
    }
    // The household id is the chat's, checked by requireMember; never an argument (AC-014).
    const dataOutputs = await Promise.all(
      dataCalls.map(async (call) => {
        const result = await runHouseholdTool(call, {
          client,
          householdId: chat.household_id,
          base,
          stepId: stepFor(call.callId),
        });
        emit({ type: 'step', step: result.step });
        return { type: 'function_call_output', call_id: call.callId, output: result.output };
      }),
    );
    if (outputs.length > 0) await foundry.appendItems(chat.conversation_id, outputs);
    if (dataOutputs.length === 0) break;
    if (roundNo === MAX_TOOL_ROUNDS - 1) {
      // No run left: the outputs still go into the conversation, so the next message is taken.
      await foundry.appendItems(chat.conversation_id, dataOutputs);
      break;
    }
    items = dataOutputs;
  }
  web.status = 'done';
  if (web.details.length > 0 || web.count) emit({ type: 'step', step: { ...web } });
  if (sources.size > 0) emit({ type: 'sources', sources: [...sources.values()] });
  if (lastResponse) {
    await rpc(client, 'record_ai_chat_turn', {
      chat_id: chat.id,
      response_id: lastResponse,
      title: prepared.created && cardsTitle ? cardsTitle : null,
    });
  }
  emit({ type: 'done' });
}

const STREAM_ERRORS = new Set(['ai_unavailable', 'quota_exceeded', 'chat_too_long']);

/**
 * The checks run before the stream, so they answer with a status; once it runs, a failure is an
 * `error` event (decision 12). "Recherche anhalten" closes the request: the upstream run is
 * aborted with it, and so is a turn over 120 s.
 */
async function streamed(
  deps: Deps,
  foundry: Foundry,
  client: UserClient,
  input: AgentSendRequest,
  request: Request,
): Promise<Response> {
  const prepared = await prepareTurn(foundry, client, input);
  const encoder = new TextEncoder();
  const controller = new AbortController();
  request.signal?.addEventListener('abort', () => controller.abort());
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      const timer = setTimeout(() => controller.abort(), TURN_MS);
      const emit = (event: AgentStreamEvent) => {
        try {
          stream.enqueue(encoder.encode(sseData(event)));
        } catch {
          // The app has gone (stopped): nothing more to send.
        }
      };
      void streamTurn(deps, foundry, client, input, prepared, controller.signal, emit)
        .catch((error: unknown) => {
          const code =
            error instanceof HttpError && STREAM_ERRORS.has(error.code)
              ? (error.code as 'ai_unavailable')
              : 'ai_unavailable';
          if (!(error instanceof HttpError) && !controller.signal.aborted)
            console.error('ai_agent_failed', error instanceof Error ? error.name : 'unknown');
          emit({ type: 'error', error: code });
        })
        .finally(() => {
          clearTimeout(timer);
          // A failure mid-stream must not leave the upstream run going (tokens, web searches).
          controller.abort();
          try {
            stream.close();
          } catch {
            // Already closed by the app.
          }
        });
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function run(deps: Deps, client: UserClient, input: AgentRequest, request: Request) {
  await requireMember(client, input.householdId);
  // Deleting a household without chats must not depend on the agent settings (REQ-010): only
  // the purge reaches here without needing Foundry when there is nothing to delete.
  if (input.action === 'purge') {
    let lazy: Foundry | undefined;
    const foundry = () => (lazy ??= foundryClient(deps, agentConfig(deps.env)));
    return { deleted: await purge(foundry, client, input.householdId) };
  }
  const foundry = foundryClient(deps, agentConfig(deps.env));
  switch (input.action) {
    case 'send':
      return streamed(deps, foundry, client, input, request);
    case 'load': {
      const chat = await loadChat(client, input.householdId, input.chatId);
      if ((await verifyConversation(foundry, chat)) === 'gone') return { messages: [] };
      const items = await foundry.items(chat.conversation_id, 'asc', 5);
      return AgentLoadReplySchema.parse({
        messages: messagesFromItems(items, { toolStep: storedToolStep }).slice(0, 200),
      });
    }
    case 'delete': {
      const chat = await loadChat(client, input.householdId, input.chatId);
      await deleteChat(foundry, client, chat);
      return { deleted: 1 };
    }
  }
}

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: AgentRequestSchema,
    maxBodyBytes: MAX_SEND_BODY_BYTES,
    run: ({ input, client }) => run(deps, client, input, request),
  });
}
