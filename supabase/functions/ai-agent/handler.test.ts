import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentLoadReplySchema,
  AgentStreamEventSchema,
  createSseParser,
  type AgentStreamEvent,
} from '../_shared/ai-agent.gen.ts';
import type { DbResult, Query } from '../_shared/deps.ts';
import { ANON_JWT, fakeClient, fakeDeps, post, type Row } from '../_shared/test-fakes.ts';
import { ENRICO, HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

const PROJECT = 'https://foundry.example.test/api/projects/p';
const ENV = {
  FOUNDRY_PROJECT_ENDPOINT: PROJECT,
  FOUNDRY_HOUSEHOLD_AGENT: 'household-agent-local',
  FOUNDRY_HOUSEHOLD_AGENT_VERSION: '3',
  SERPER_API_KEY: 'test-serper-SECRET',
};
const CHAT_ID = 'cccccccc-0000-4000-8000-000000000001';
const NEW_CHAT_ID = 'cccccccc-0000-4000-8000-000000000002';
const FOREIGN_HOUSEHOLD = 'bbbbbbbb-0000-4000-8000-000000000009';
const SECRET_PROMPT = 'GEHEIMER-SYSTEMPROMPT';

const place = {
  source: 'device',
  label: 'Aktueller Standort',
  location: { lat: 52.510612, lng: 13.459487 },
  radius: 'walk',
};

const send = (over: Record<string, unknown> = {}) =>
  post({
    action: 'send',
    householdId: HOUSEHOLD_ID,
    message: 'Romantisch in Mitte',
    place,
    timeZone: 'Europe/Berlin',
    ...over,
  });

const suggestionArgs = JSON.stringify({
  title: 'Romantisch in Mitte',
  items: [
    {
      kind: 'restaurant',
      step: null,
      name: 'Crackers',
      category: 'Gourmet',
      address: 'Friedrichstraße 158, 10117 Berlin',
      district: 'Mitte',
      lat: null,
      lng: null,
      price_level: 3,
      price_range: null,
      rating: 5,
      rating_count: null,
      rating_source: null,
      open_status: 'Heute ab 18:00',
      walking_minutes: null,
      why: 'Versteckt hinter einer Tür.',
      highlights: [],
      website: 'https://crackersberlin.com',
      google_maps_url: 'https://maps.google.com/?cid=999',
      source_urls: [],
      tags: [],
    },
  ],
  follow_ups: ['Eher mit Terrasse?'],
});

function sse(events: unknown[]): Response {
  const body = events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** A turn as Foundry streams it: a search, text with a citation token, then show_suggestions. */
function turnEvents(withCards = true): unknown[] {
  return [
    { type: 'response.created', response: { id: 'resp_new', instructions: SECRET_PROMPT } },
    { type: 'response.output_item.added', item: { type: 'web_search_call', id: 'ws_1' } },
    { type: 'response.web_search_call.searching' },
    {
      type: 'response.output_item.done',
      item: {
        type: 'web_search_call',
        action: {
          type: 'search',
          query: 'romantisch mitte',
          sources: [{ url: 'a' }, { url: 'b' }],
        },
      },
    },
    { type: 'response.output_item.added', item: { type: 'message' } },
    { type: 'response.output_text.delta', delta: 'Drei Häuser. citetur' },
    { type: 'response.output_text.delta', delta: 'n0search0 Gute Wahl.' },
    {
      type: 'response.output_text.annotation.added',
      annotation: { type: 'url_citation', url: 'https://www.tip-berlin.de/x', title: 'tip' },
    },
    { type: 'response.output_item.done', item: { type: 'message' } },
    ...(withCards
      ? [
          {
            type: 'response.output_item.added',
            item: { type: 'function_call', name: 'show_suggestions', call_id: 'call_1' },
          },
          {
            type: 'response.output_item.done',
            item: {
              type: 'function_call',
              name: 'show_suggestions',
              call_id: 'call_1',
              arguments: suggestionArgs,
            },
          },
        ]
      : []),
    {
      type: 'response.completed',
      response: { id: 'resp_new', instructions: SECRET_PROMPT, output: [] },
    },
  ];
}

interface FoundryState {
  calls: { method: string; url: string; body?: unknown; headers: Headers }[];
  conversations: Record<string, { metadata: Record<string, string>; items: unknown[] } | undefined>;
  responses: Record<string, { conversation: string } | undefined>;
  stream?: () => Response;
  failDeleteConversation?: boolean;
}

function foundry(state: FoundryState): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    state.calls.push({ method, url, body, headers: new Headers(init?.headers) });
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.startsWith('https://google.serper.dev/maps')) {
      return json({
        places: [
          {
            title: 'Crackers',
            address: 'Friedrichstraße 158',
            latitude: 52.51,
            longitude: 13.38,
            rating: 4.5,
            ratingCount: 1457,
            cid: '123',
            thumbnailUrl: 'https://lh3.googleusercontent.com/p/abc',
          },
        ],
      });
    }
    const path = url.replace(`${PROJECT}/openai/v1`, '').split('?')[0]!;
    const conv = /^\/conversations\/([^/]+)(\/items)?$/.exec(path);
    const resp = /^\/responses\/([^/]+)$/.exec(path);
    if (path === '/conversations' && method === 'POST') {
      state.conversations.conv_new = { metadata: body.metadata, items: [] };
      return json({ id: 'conv_new', metadata: body.metadata });
    }
    if (conv) {
      const id = conv[1]!;
      const found = state.conversations[id];
      if (!found) return json({ error: { code: 'not_found' } }, 404);
      if (conv[2] && method === 'GET') return json({ data: found.items, has_more: false });
      if (conv[2] && method === 'POST') {
        found.items.push(...body.items);
        return json({ data: body.items });
      }
      if (method === 'DELETE') {
        if (state.failDeleteConversation) return json({ error: {} }, 500);
        state.conversations[id] = undefined;
        return json({ deleted: true });
      }
      return json({ id, metadata: found.metadata });
    }
    if (resp) {
      const found = state.responses[resp[1]!];
      if (!found) return json({ error: {} }, 404);
      if (method === 'DELETE') {
        state.responses[resp[1]!] = undefined;
        return json({ deleted: true });
      }
      return json({
        id: resp[1],
        conversation: { id: found.conversation },
        instructions: SECRET_PROMPT,
      });
    }
    if (path === '/responses' && method === 'POST') {
      return state.stream ? state.stream() : sse(turnEvents());
    }
    return new Response('unexpected', { status: 599 });
  };
}

function chatRow(over: Row = {}): Row {
  return {
    id: CHAT_ID,
    household_id: HOUSEHOLD_ID,
    conversation_id: 'conv_old',
    response_ids: ['resp_a', 'resp_b'],
    ...over,
  };
}

function setup(
  options: {
    chats?: Row[];
    state?: Partial<FoundryState>;
    rpc?: (fn: string, args: { [name: string]: unknown }) => DbResult;
    env?: Record<string, string>;
  } = {},
) {
  const state: FoundryState = {
    calls: [],
    conversations: {
      conv_old: { metadata: { household_id: HOUSEHOLD_ID, app: 'housekeeping' }, items: [] },
    },
    responses: { resp_a: { conversation: 'conv_old' }, resp_b: { conversation: 'conv_old' } },
    ...options.state,
  };
  const client = fakeClient({
    tables: { ...householdTables(), ai_chats: options.chats ?? [chatRow()] },
    rpc:
      options.rpc ??
      ((fn) =>
        fn === 'create_ai_chat' ? { data: NEW_CHAT_ID, error: null } : { data: true, error: null }),
  });
  const deps = fakeDeps({ client, fetch: foundry(state), env: { ...ENV, ...options.env } });
  return { deps, state, client };
}

async function events(response: Response): Promise<AgentStreamEvent[]> {
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const parser = createSseParser();
  const parsed = parser.push(await response.text());
  return parsed.map((event) => AgentStreamEventSchema.parse(event));
}

const calls = (state: FoundryState, method: string, part: string) =>
  state.calls.filter((call) => call.method === method && call.url.includes(part));

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('ai-agent: access', () => {
  it('AC-033: no sign-in is 401, a foreign household 403 before Foundry is asked', async () => {
    const { deps, state } = setup();
    expect((await handler(post({}, { jwt: ANON_JWT }), deps)).status).toBe(401);
    const foreign = await handler(send({ householdId: FOREIGN_HOUSEHOLD }), deps);
    expect(foreign.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it('AC-026: a chat id of another household is 403', async () => {
    const { deps, state } = setup({ chats: [chatRow({ household_id: FOREIGN_HOUSEHOLD })] });
    expect((await handler(send({ chatId: CHAT_ID }), deps)).status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it('AC-034: a conversation whose metadata names another household is 403, nothing is sent', async () => {
    const { deps, state, client } = setup({
      state: {
        conversations: {
          conv_old: { metadata: { household_id: FOREIGN_HOUSEHOLD }, items: [] },
        },
      },
    });
    expect((await handler(send({ chatId: CHAT_ID }), deps)).status).toBe(403);
    expect(calls(state, 'POST', '/responses')).toEqual([]);
    expect(client.rpcCalls.map((call) => call.fn)).not.toContain('consume_ai_quota');
  });

  it('AC-035: the 21st answer is 409 chat_too_long', async () => {
    const ids = Array.from({ length: 20 }, (_, n) => `resp_${n}`);
    const { deps } = setup({ chats: [chatRow({ response_ids: ids })] });
    const response = await handler(send({ chatId: CHAT_ID }), deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'chat_too_long' });
  });

  it('AC-036: an exhausted quota is 429 and costs nothing at Foundry', async () => {
    const { deps, state } = setup({
      rpc: (fn) =>
        fn === 'consume_ai_quota'
          ? { data: null, error: { message: 'quota_exceeded', code: 'P0001' } }
          : { data: true, error: null },
    });
    const response = await handler(send(), deps);
    expect(response.status).toBe(429);
    expect(state.calls).toEqual([]);
  });

  it('a missing agent setting is 500 and names only the variable', async () => {
    const { deps } = setup({ env: { FOUNDRY_HOUSEHOLD_AGENT: '' } });
    expect((await handler(send(), deps)).status).toBe(500);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain(
      'FOUNDRY_HOUSEHOLD_AGENT',
    );
  });

  it('without a pinned version the latest version of the agent answers (local)', async () => {
    const { deps, state } = setup({ env: { FOUNDRY_HOUSEHOLD_AGENT_VERSION: '' } });
    await events(await handler(send({ chatId: CHAT_ID }), deps));
    const body = calls(state, 'POST', '/responses')[0]?.body as { agent_reference: object };
    expect(body.agent_reference).toEqual({
      type: 'agent_reference',
      name: 'household-agent-local',
    });
  });

  it('a message over 2000 characters is 400', async () => {
    const { deps } = setup();
    expect((await handler(send({ message: 'x'.repeat(2001) }), deps)).status).toBe(400);
  });
});

describe('ai-agent: send', () => {
  it('AC-037, AC-007: a new chat streams steps, clean text, sources and enriched cards', async () => {
    const { deps, state, client } = setup();
    const response = await handler(send(), deps);
    const all = await events(response);
    const text = all.flatMap((event) => (event.type === 'text' ? [event.delta] : [])).join('');

    expect(all[0]).toEqual({ type: 'chat', chatId: NEW_CHAT_ID, title: 'Romantisch in Mitte' });
    expect(text).toBe('Drei Häuser. Gute Wahl.');
    const steps = all.flatMap((event) => (event.type === 'step' ? [event.step] : []));
    expect(steps.at(-1)).toMatchObject({ kind: 'web_search', count: 2, status: 'done' });
    expect(steps.at(-1)?.details).toEqual(['romantisch mitte']);
    expect(all.map((event) => event.type)).toContain('cards_pending');
    expect(all.find((event) => event.type === 'sources')).toEqual({
      type: 'sources',
      sources: [{ url: 'https://www.tip-berlin.de/x', host: 'tip-berlin.de', title: 'tip' }],
    });
    const cards = all.find((event) => event.type === 'cards');
    expect(cards).toMatchObject({
      type: 'cards',
      title: 'Romantisch in Mitte',
      followUps: ['Eher mit Terrasse?'],
    });
    expect(cards?.type === 'cards' && cards.cards[0]).toMatchObject({
      name: 'Crackers',
      rating: 4.5,
      ratingCount: 1457,
      mapsUrl: 'https://maps.google.com/?cid=123',
      imageUrl: 'https://lh3.googleusercontent.com/p/abc',
    });
    expect(all.at(-1)).toEqual({ type: 'done' });

    // Nothing of Foundry's raw objects reaches the app.
    const raw = all.map((event) => JSON.stringify(event)).join('\n');
    expect(raw).not.toContain(SECRET_PROMPT);
    expect(raw).not.toMatch(/[-]|cite|resp_new|conv_new/);

    // The request to Foundry: pinned agent, the conversation, context block + message, api-key.
    const sent = calls(state, 'POST', '/responses')[0]!;
    expect(sent.headers.get('api-key')).toBe('test-foundry-key-SECRET');
    expect(sent.body).toMatchObject({
      agent_reference: { type: 'agent_reference', name: 'household-agent-local', version: '3' },
      conversation: 'conv_new',
      stream: true,
    });
    const content = (sent.body as { input: { content: { text: string }[] }[] }).input[0]!.content;
    expect(content[0]!.text).toContain('Koordinaten: 52.511, 13.459');
    expect(content[1]!.text).toBe('Romantisch in Mitte');
    expect(calls(state, 'POST', '/conversations')[0]?.body).toEqual({
      metadata: { household_id: HOUSEHOLD_ID, app: 'housekeeping' },
    });

    // AC-037: exactly one output per call_id, carrying the enrichment (decision 11).
    const appended = calls(state, 'POST', '/conversations/conv_new/items');
    expect(appended).toHaveLength(1);
    expect(appended[0]?.body).toMatchObject({
      items: [{ type: 'function_call_output', call_id: 'call_1' }],
    });
    expect(JSON.stringify(appended[0]?.body)).toContain('cid=123');

    expect(client.rpcCalls).toEqual([
      { fn: 'consume_ai_quota', args: { kind: 'request', amount: 5 } },
      {
        fn: 'create_ai_chat',
        args: {
          household_id: HOUSEHOLD_ID,
          conversation_id: 'conv_new',
          title: 'Romantisch in Mitte',
          place_label: 'Aktueller Standort',
        },
      },
      {
        fn: 'record_ai_chat_turn',
        args: { chat_id: NEW_CHAT_ID, response_id: 'resp_new', title: null },
      },
      {
        fn: 'record_ai_chat_turn',
        args: { chat_id: NEW_CHAT_ID, response_id: 'resp_new', title: 'Romantisch in Mitte' },
      },
    ]);
  });

  it('AC-038: an open function call of an interrupted answer is closed before the next message', async () => {
    const { deps, state } = setup({
      state: {
        conversations: {
          conv_old: {
            metadata: { household_id: HOUSEHOLD_ID },
            items: [
              { type: 'message', role: 'user', content: [] },
              {
                type: 'function_call',
                name: 'show_suggestions',
                call_id: 'call_open',
                arguments: '{}',
              },
            ],
          },
        },
      },
    });
    await events(await handler(send({ chatId: CHAT_ID }), deps));
    const order = state.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.url.replace(`${PROJECT}/openai/v1`, ''));
    expect(order.slice(0, 2)).toEqual(['/conversations/conv_old/items', '/responses']);
    expect(calls(state, 'POST', '/conversations/conv_old/items')[0]?.body).toMatchObject({
      items: [{ type: 'function_call_output', call_id: 'call_open' }],
    });
  });

  it('a follow-up in an existing chat sends no chat event and no title', async () => {
    const { deps, client } = setup();
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(all.map((event) => event.type)).not.toContain('chat');
    expect(
      client.rpcCalls.filter((call) => call.fn === 'record_ai_chat_turn').at(-1)?.args,
    ).toEqual({
      chat_id: CHAT_ID,
      response_id: 'resp_new',
      title: null,
    });
  });

  it('Foundry failing ends the stream with ai_unavailable and logs only a status', async () => {
    const { deps } = setup({
      state: { stream: () => new Response(`{"error":"${SECRET_PROMPT}"}`, { status: 500 }) },
    });
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(all.at(-1)).toEqual({ type: 'error', error: 'ai_unavailable' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(SECRET_PROMPT);
  });

  it('AC-007: Serper gets the place rounded to about 100 m, never the exact location', async () => {
    const { deps, state } = setup();
    await events(await handler(send({ chatId: CHAT_ID }), deps));
    const lls = state.calls
      .filter((call) => call.url.startsWith('https://google.serper.dev/maps'))
      .flatMap((call) =>
        (call.body as { ll?: string }).ll ? [(call.body as { ll: string }).ll] : [],
      );
    expect(lls.length).toBeGreaterThan(0);
    for (const ll of lls) expect(ll).toMatch(/^@52\.511,13\.459,/);
  });

  it('a row that cannot be written deletes the new conversation again', async () => {
    const { deps, state } = setup({
      rpc: (fn) =>
        fn === 'create_ai_chat'
          ? { data: null, error: { code: 'XX000', message: 'boom' } }
          : { data: true, error: null },
    });
    const response = await handler(send(), deps);
    expect(response.status).toBe(500);
    expect(calls(state, 'DELETE', '/conversations/conv_new')).toHaveLength(1);
    expect(calls(state, 'POST', '/responses')).toHaveLength(0);
  });

  it('an answer that cannot be recorded is deleted and its run aborted', async () => {
    let upstream: AbortSignal | undefined;
    const { deps, state } = setup({
      state: { responses: { resp_x: { conversation: 'conv_old' } } },
      rpc: (fn) =>
        fn === 'record_ai_chat_turn'
          ? { data: null, error: { code: 'P0001', message: 'chat_not_found' } }
          : { data: true, error: null },
    });
    const fetch = deps.fetch;
    deps.fetch = (input, init) => {
      if (String(input).endsWith('/openai/v1/responses') && init?.method === 'POST')
        upstream = init.signal ?? undefined;
      return fetch(input, init);
    };
    state.stream = () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: 'response.created', response: { id: 'resp_x' } })}\n\n`,
              ),
            );
            // Never closes: only the abort ends the upstream run.
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(all.at(-1)).toEqual({ type: 'error', error: 'ai_unavailable' });
    expect(calls(state, 'DELETE', '/responses/resp_x')).toHaveLength(1);
    expect(upstream?.aborted).toBe(true);
  });

  it('a failed response event ends with ai_unavailable', async () => {
    const { deps } = setup({
      state: {
        stream: () =>
          sse([
            { type: 'response.created', response: { id: 'resp_x' } },
            {
              type: 'response.failed',
              response: { id: 'resp_x', error: { message: SECRET_PROMPT } },
            },
          ]),
      },
    });
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(all.at(-1)).toEqual({ type: 'error', error: 'ai_unavailable' });
  });

  it('an answer without cards appends nothing and ends with done', async () => {
    const { deps, state } = setup({ state: { stream: () => sse(turnEvents(false)) } });
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(all.at(-1)).toEqual({ type: 'done' });
    expect(calls(state, 'POST', '/items')).toEqual([]);
  });
});

describe('ai-agent: load', () => {
  it('AC-025: the messages without the context block', async () => {
    const { deps } = setup({
      state: {
        conversations: {
          conv_old: {
            metadata: { household_id: HOUSEHOLD_ID },
            items: [
              {
                type: 'message',
                role: 'user',
                content: [
                  { type: 'input_text', text: '[KONTEXT]\nKoordinaten: 1, 2\n[/KONTEXT]' },
                  { type: 'input_text', text: 'Brunch mit Kinderwagen' },
                ],
              },
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Zwei Cafés.', annotations: [] }],
              },
            ],
          },
        },
      },
    });
    const response = await handler(
      post({ action: 'load', householdId: HOUSEHOLD_ID, chatId: CHAT_ID }),
      deps,
    );
    expect(response.status).toBe(200);
    const reply = AgentLoadReplySchema.parse(await response.json());
    expect(reply.messages.map((message) => message.text)).toEqual([
      'Brunch mit Kinderwagen',
      'Zwei Cafés.',
    ]);
    expect(JSON.stringify(reply)).not.toContain('KONTEXT');
  });
});

describe('ai-agent: delete', () => {
  const del = (chatId = CHAT_ID) => post({ action: 'delete', householdId: HOUSEHOLD_ID, chatId });

  it('AC-028: deletes every answer, the conversation and then the row', async () => {
    const { deps, state, client } = setup();
    const response = await handler(del(), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 1 });
    expect(calls(state, 'DELETE', '/responses/').map((call) => call.url)).toEqual([
      `${PROJECT}/openai/v1/responses/resp_a`,
      `${PROJECT}/openai/v1/responses/resp_b`,
    ]);
    expect(calls(state, 'DELETE', '/conversations/conv_old')).toHaveLength(1);
    expect(client.rpcCalls).toEqual([{ fn: 'delete_ai_chat', args: { chat_id: CHAT_ID } }]);
  });

  it('AC-029: Foundry failing keeps the row and answers 503', async () => {
    const { deps, client } = setup({ state: { failDeleteConversation: true } });
    const response = await handler(del(), deps);
    expect(response.status).toBe(503);
    expect(client.rpcCalls).toEqual([]);
  });

  it('AC-030: an answer of another conversation is not deleted', async () => {
    const { deps, state } = setup({
      state: {
        responses: { resp_a: { conversation: 'conv_other' }, resp_b: { conversation: 'conv_old' } },
      },
    });
    await handler(del(), deps);
    expect(calls(state, 'DELETE', '/responses/').map((call) => call.url)).toEqual([
      `${PROJECT}/openai/v1/responses/resp_b`,
    ]);
  });

  it('AC-034: a conversation of another household is not touched', async () => {
    const { deps, state, client } = setup({
      state: {
        conversations: { conv_old: { metadata: { household_id: FOREIGN_HOUSEHOLD }, items: [] } },
      },
    });
    expect((await handler(del(), deps)).status).toBe(403);
    expect(state.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
    expect(client.rpcCalls).toEqual([]);
  });

  it('a conversation already gone still deletes the answers and the row', async () => {
    const { deps, client } = setup({ state: { conversations: {} } });
    expect((await handler(del(), deps)).status).toBe(200);
    expect(client.rpcCalls.map((call) => call.fn)).toEqual(['delete_ai_chat']);
  });

  it('AC-031: purge deletes every chat of the household', async () => {
    const { deps, client } = setup({
      chats: [
        chatRow(),
        chatRow({
          id: 'cccccccc-0000-4000-8000-000000000003',
          conversation_id: 'conv_gone',
          response_ids: [],
        }),
      ],
    });
    const response = await handler(post({ action: 'purge', householdId: HOUSEHOLD_ID }), deps);
    expect(await response.json()).toEqual({ deleted: 2 });
    expect(client.rpcCalls.map((call) => call.fn)).toEqual(['delete_ai_chat', 'delete_ai_chat']);
  });

  it('AC-031: a household without chats is purged without any Foundry setting (no agent configured)', async () => {
    const { deps, state } = setup({
      chats: [],
      env: { FOUNDRY_PROJECT_ENDPOINT: '', FOUNDRY_HOUSEHOLD_AGENT: '' },
    });
    const response = await handler(post({ action: 'purge', householdId: HOUSEHOLD_ID }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 0 });
    expect(state.calls).toHaveLength(0);
  });

  it('only a member deletes', async () => {
    const { deps } = setup();
    const response = await handler(post({ action: 'purge', householdId: FOREIGN_HOUSEHOLD }), deps);
    expect(response.status).toBe(403);
    void ENRICO;
  });
});

// ---------- Spec 0067: the household agent's tools, badges and attachments ----------

/** Round 1 calls tools, round 2 answers with text: the stream Foundry sends per model run. */
function toolTurn(calls: { name: string; callId: string; args: unknown }[]): () => Response {
  let run = 0;
  return () => {
    run += 1;
    if (run === 1)
      return sse([
        { type: 'response.created', response: { id: 'resp_t1' } },
        ...calls.flatMap((call) => [
          {
            type: 'response.output_item.added',
            item: { type: 'function_call', name: call.name, call_id: call.callId },
          },
          {
            type: 'response.output_item.done',
            item: {
              type: 'function_call',
              name: call.name,
              call_id: call.callId,
              arguments: JSON.stringify(call.args),
            },
          },
        ]),
        { type: 'response.completed', response: { id: 'resp_t1' } },
      ]);
    return sse([
      { type: 'response.created', response: { id: 'resp_t2' } },
      { type: 'response.output_item.added', item: { type: 'message' } },
      { type: 'response.output_text.delta', delta: 'Am Samstag gibt es Mango-Curry.' },
      { type: 'response.output_item.done', item: { type: 'message' } },
      { type: 'response.completed', response: { id: 'resp_t2' } },
    ]);
  };
}

type Sent = { input: { type: string; call_id?: string; output?: string; content?: unknown[] }[] };
const outputsOf = (state: FoundryState, round: number) =>
  ((calls(state, 'POST', '/responses')[round]?.body as Sent | undefined)?.input ?? []).filter(
    (item) => item.type === 'function_call_output',
  );

function failingQuery(): Query {
  const failed = Promise.resolve({ data: null, error: { message: 'down' } });
  const query: Query = {
    eq: () => query,
    in: () => query,
    gte: () => query,
    lte: () => query,
    limit: () => query,
    order: () => query,
    range: () => query,
    then: (onFulfilled, onRejected) => failed.then(onFulfilled, onRejected),
  };
  return query;
}

describe('ai-agent: household tools (spec 0067)', () => {
  it('AC-016: two tool calls are two step rows before the text; their outputs go to round 2', async () => {
    const { deps, state } = setup({
      state: {
        stream: toolTurn([
          { name: 'list_recipes', callId: 'call_r', args: { query: 'curry', fields: ['title'] } },
          { name: 'calendar', callId: 'call_c', args: { from: '2026-11-21', to: '2026-11-22' } },
        ]),
      },
    });
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    const steps = all.flatMap((event) => (event.type === 'step' ? [event.step] : []));
    const done = steps.filter((step) => step.status === 'done' && step.kind === 'tool');
    expect(done.map((step) => [step.id, step.label])).toEqual([
      ['t1', 'Liest eure Rezepte'],
      ['t2', 'Schaut in den Kalender'],
    ]);
    expect(steps.filter((step) => step.status === 'running').map((step) => step.id)).toEqual([
      't1',
      't2',
    ]);
    const firstText = all.findIndex((event) => event.type === 'text');
    const lastStep = all.map((event) => event.type).lastIndexOf('step');
    expect(lastStep).toBeLessThan(firstText);

    const outputs = outputsOf(state, 1);
    expect(outputs.map((item) => item.call_id)).toEqual(['call_r', 'call_c']);
    expect(JSON.parse(outputs[0]!.output!)).toMatchObject({
      total: 1,
      items: [{ title: 'Mango-Curry' }],
    });
    expect(all.at(-1)).toEqual({ type: 'done' });
  });

  it('AC-014: the tools read only the chat household, as the caller, never a foreign row', async () => {
    const { deps, state, client } = setup({
      state: {
        stream: toolTurn([
          { name: 'list_articles', callId: 'call_a', args: { limit: 300, fields: ['name'] } },
        ]),
      },
    });
    await events(await handler(send({ chatId: CHAT_ID }), deps));
    const output = outputsOf(state, 1)[0]!.output!;
    expect(output).toContain('Tofu');
    expect(output).not.toContain('Fremdartikel');
    // Only the names of the household's members; never e-mail addresses.
    expect(client.selects.find((entry) => entry.table === 'profiles')?.columns).toBe('id,name');
    for (const entry of client.selects) expect(entry.columns).not.toContain('email');
  });

  it("AC-014: a household id in the model's arguments is refused, nothing is read", async () => {
    const { deps, state, client } = setup({
      state: {
        stream: toolTurn([
          { name: 'list_recipes', callId: 'call_x', args: { household_id: FOREIGN_HOUSEHOLD } },
        ]),
      },
    });
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(JSON.parse(outputsOf(state, 1)[0]!.output!)).toEqual({ error: 'invalid_arguments' });
    expect(client.selects.map((entry) => entry.table)).not.toContain('recipes');
    const step = all.find((event) => event.type === 'step' && event.step.status === 'done');
    expect(step?.type === 'step' && step.step.detail).toBe('Anfrage ungültig');
  });

  it('AC-015: SQL in the arguments finds nothing, errors name no SQL, the answer goes on', async () => {
    const { deps, state, client } = setup({
      state: {
        stream: toolTurn([
          { name: 'list_recipes', callId: 'call_q', args: { query: "x' or 1=1 --" } },
          {
            name: 'calendar',
            callId: 'call_d',
            args: { from: "2026-11-21'; drop table x", to: '2026-11-22' },
          },
        ]),
      },
    });
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    const [search, range] = outputsOf(state, 1);
    expect(JSON.parse(search!.output!)).toMatchObject({ total: 0, items: [] });
    expect(JSON.parse(range!.output!)).toEqual({ error: 'invalid_arguments' });
    for (const entry of client.selects) expect(entry.columns).toMatch(/^[a-z_, ]+$/);
    expect(JSON.stringify(all)).not.toMatch(/drop table|syntax/i);
    expect(all.at(-1)).toEqual({ type: 'done' });
  });

  it('a read that fails tells the model and shows "konnte nicht lesen", the answer goes on', async () => {
    const { deps, state, client } = setup({
      state: { stream: toolTurn([{ name: 'list_chores', callId: 'call_h', args: {} }]) },
    });
    const from = client.from;
    client.from = (table) => (table === 'chores' ? { select: failingQuery } : from(table));
    const all = await events(await handler(send({ chatId: CHAT_ID }), deps));
    expect(JSON.parse(outputsOf(state, 1)[0]!.output!)).toEqual({ error: 'tool_failed' });
    const step = all.find((event) => event.type === 'step' && event.step.status === 'done');
    expect(step?.type === 'step' && step.step.detail).toBe('konnte nicht lesen');
    expect(all.at(-1)).toEqual({ type: 'done' });
  });

  it("AC-008, AC-025: badges and the household's day go into the context block", async () => {
    const { deps, state } = setup();
    deps.now = () => new Date('2026-11-27T23:30:00Z');
    await events(await handler(send({ chatId: CHAT_ID, badges: ['rezepte', 'ausgehen'] }), deps));
    const content = (calls(state, 'POST', '/responses')[0]!.body as Sent).input[0]!.content as {
      text: string;
    }[];
    expect(content[0]!.text).toContain('Hinweise der Person: Rezepte, Ausgehen');
    expect(content[0]!.text).toContain('Heute im Haushalt: Samstag, 2026-11-28 (Europe/Berlin)');
  });

  it('REQ-005: photos go as input_image, a PDF as input_file; a body over the limit is 413', async () => {
    const { deps, state } = setup();
    const jpeg = `data:image/jpeg;base64,${'A'.repeat(64)}`;
    const pdf = `data:application/pdf;base64,${'A'.repeat(64)}`;
    await events(
      await handler(
        send({
          chatId: CHAT_ID,
          message: '',
          attachments: [
            { kind: 'image', dataUrl: jpeg },
            { kind: 'pdf', name: 'Rezept.pdf', dataUrl: pdf },
          ],
        }),
        deps,
      ),
    );
    const content = (calls(state, 'POST', '/responses')[0]!.body as Sent).input[0]!.content;
    expect(content).toEqual([
      expect.objectContaining({ type: 'input_text' }),
      { type: 'input_image', image_url: jpeg, detail: 'auto' },
      { type: 'input_file', filename: 'Rezept.pdf', file_data: pdf },
    ]);
    const huge = await handler(
      send({
        chatId: CHAT_ID,
        attachments: [{ kind: 'image', dataUrl: `${jpeg}${'A'.repeat(9_000_000)}` }],
      }),
      deps,
    );
    expect(huge.status).toBe(413);
  });

  it('AC-016: a stored chat shows its tool steps when it is opened again', async () => {
    const { deps } = setup({
      state: {
        conversations: {
          conv_old: {
            metadata: { household_id: HOUSEHOLD_ID },
            items: [
              { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Curry?' }] },
              {
                type: 'function_call',
                name: 'list_recipes',
                call_id: 'call_r',
                arguments: '{"query":"curry"}',
              },
              {
                type: 'function_call_output',
                call_id: 'call_r',
                output: '{"total":1,"offset":0,"items":[{"title":"Mango-Curry"}]}',
              },
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Mango-Curry.' }],
              },
            ],
          },
        },
      },
    });
    const reply = AgentLoadReplySchema.parse(
      await (
        await handler(post({ action: 'load', householdId: HOUSEHOLD_ID, chatId: CHAT_ID }), deps)
      ).json(),
    );
    expect(reply.messages[1]?.steps).toEqual([
      expect.objectContaining({ label: 'Liest eure Rezepte', detail: 'Suche „curry“', count: 1 }),
    ]);
  });
});
