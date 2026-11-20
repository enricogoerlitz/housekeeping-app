import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransportError, classifyError, isTransient } from './transport';
import { createSupabaseTransport, type SupabaseLike } from './transport-supabase';

type Reply = { data: unknown; error: { message: string; code?: string } | null; status: number };

/** A stand-in for supabase-js: records rpc calls and answers with the queued replies. */
type InvokeReply = Awaited<ReturnType<SupabaseLike['functions']['invoke']>>;

function stubClient(replies: (Reply | 'hang')[], invokeReplies: InvokeReply[] = []) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const invoked: { name: string; body: unknown }[] = [];
  const channels: { topic: string; options: unknown; handlers: (() => void)[] }[] = [];
  const removed: string[] = [];
  const client: SupabaseLike = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return {
        abortSignal(signal) {
          const reply = replies.shift();
          if (reply === 'hang') {
            return new Promise((resolve) =>
              signal.addEventListener('abort', () =>
                resolve({
                  data: null,
                  error: { message: 'AbortError: The user aborted a request.', code: '' },
                  status: 0,
                }),
              ),
            );
          }
          return Promise.resolve(reply ?? { data: null, error: null, status: 200 });
        },
      };
    },
    channel(topic, options) {
      const entry = { topic, options, handlers: [] as (() => void)[] };
      channels.push(entry);
      const channel = {
        on(_type: 'broadcast', filter: { event: string }, handler: () => void) {
          if (filter.event === 'changed') entry.handlers.push(handler);
          return channel;
        },
        subscribe() {
          return channel;
        },
        topic,
      };
      return channel;
    },
    async removeChannel(channel) {
      removed.push((channel as { topic?: string }).topic ?? '');
      return 'ok';
    },
    realtime: { setAuth: async () => {} },
    functions: {
      async invoke(name, options) {
        invoked.push({ name, body: options.body });
        return invokeReplies.shift() ?? { data: null, error: null };
      },
    },
  };
  return { client, calls, channels, removed, invoked };
}

const ok = (data: unknown): Reply => ({ data, error: null, status: 200 });

afterEach(() => {
  vi.useRealTimers();
});

describe('supabase transport', () => {
  it('calls the RPCs with the contract parameter names', async () => {
    const { client, calls } = stubClient([
      ok({ applied: 1, results: [] }),
      ok({ item_id: 'i1', checked: true, check_seq: 3 }),
      ok(null),
      ok([]),
      ok(null),
      ok([]),
      ok(2),
      ok(null),
      ok('inv-1'),
      ok(null),
    ]);
    const transport = createSupabaseTransport(client);
    const op = { kind: 'delete' as const, table: 'recipes', id: 'r1' };
    expect(await transport.applyChanges('h1', [op])).toEqual({ applied: 1, results: [] });
    expect(await transport.setItemChecked('i1', true, 2)).toEqual({
      item_id: 'i1',
      checked: true,
      check_seq: 3,
    });
    expect(await transport.setItemNotAvailable('i1', true)).toBeNull();
    await transport.addShoppingContributions('l1', []);
    await transport.assignArticleArea('a1', null);
    await transport.clearCheckedItems('l1');
    expect(await transport.removeContributions(['c1', 'c2'])).toBe(2);
    await transport.setRecipeRating('r1', null);
    expect(await transport.inviteMember('h1', 'nadja@example.com')).toBe('inv-1');
    await transport.removeMember('h1', 'm2');

    expect(calls).toEqual([
      { fn: 'apply_changes', args: { p_household_id: 'h1', p_ops: [op] } },
      {
        fn: 'set_shopping_item_checked',
        args: { p_item_id: 'i1', p_checked: true, p_seen_check_seq: 2 },
      },
      { fn: 'set_shopping_item_not_available', args: { p_item_id: 'i1', p_value: true } },
      { fn: 'add_shopping_contributions', args: { p_list_id: 'l1', p_entries: [] } },
      { fn: 'assign_article_area', args: { p_article_id: 'a1', p_area_id: null } },
      { fn: 'clear_checked_items', args: { p_list_id: 'l1' } },
      { fn: 'remove_contributions', args: { p_ids: ['c1', 'c2'] } },
      { fn: 'set_recipe_rating', args: { recipe_id: 'r1', stars: null } },
      { fn: 'invite_member', args: { household_id: 'h1', email: 'nadja@example.com' } },
      { fn: 'remove_member', args: { household_id: 'h1', profile_id: 'm2' } },
    ]);
  });

  it.each([
    [0, { message: 'TypeError: fetch failed', code: '' }, 'transient', 'network'],
    [408, { message: 'timeout' }, 'transient', 'timeout'],
    [429, { message: 'Too Many Requests', code: '' }, 'transient', 'http_429'],
    [503, { message: 'Service Unavailable', code: '' }, 'transient', 'http_503'],
    [
      500,
      { message: 'canceling statement due to statement timeout', code: '57014' },
      'transient',
      '57014',
    ],
    [400, { message: 'invalid_email', code: '22023' }, 'permanent', 'invalid_email'],
    [404, { message: 'row_not_found', code: 'P0002' }, 'permanent', 'row_not_found'],
    [409, { message: 'already_member', code: '23505' }, 'permanent', 'already_member'],
    [403, { message: 'permission denied for table recipes', code: '42501' }, 'permanent', '42501'],
  ] as const)('classifies status %i as %s', (status, error, kind, code) => {
    const classified = classifyError(status, error);
    expect(classified).toBeInstanceOf(TransportError);
    expect(classified).toMatchObject({ kind, code, status });
  });

  it('rejects with the classified error of a failed call', async () => {
    const { client } = stubClient([
      { data: null, error: { message: 'invalid_email', code: '22023' }, status: 400 },
    ]);
    const transport = createSupabaseTransport(client);
    await expect(transport.inviteMember('h1', 'nadja@')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'invalid_email',
    });
  });

  it('gives up after the timeout with a transient error', async () => {
    vi.useFakeTimers();
    const { client } = stubClient(['hang']);
    const transport = createSupabaseTransport(client, { timeoutMs: 1000 });
    const call = transport.setItemChecked('i1', true, 0).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await call;
    expect(isTransient(error)).toBe(true);
    expect(error).toMatchObject({ code: 'timeout' });
  });

  it('validates the pull and gives composite-key rows their "a:b" id', async () => {
    const pull = {
      serverTime: '2026-11-20T10:00:00.123456+00:00',
      small: { profiles: [], households: [], household_members: [], household_invitations: [] },
      households: {
        h1: {
          full: true,
          rows: {
            recipes: [{ id: 'r1', updated_at: '2026-11-20T09:00:00Z', title: 'Dal' }],
            recipe_favorites: [
              { recipe_id: 'r1', member_id: 'm1', updated_at: '2026-11-20T09:00:00Z' },
            ],
          },
          tombstones: [{ table: 'recipe_ratings', id: 'r1:m1', deletedAt: '2026-11-20T09:00:00Z' }],
        },
      },
    };
    const { client, calls } = stubClient([ok(pull)]);
    const result = await createSupabaseTransport(client).syncPull({
      households: { h1: { full: true } },
    });
    expect(calls[0]).toEqual({
      fn: 'sync_pull',
      args: { p_request: { households: { h1: { full: true } } } },
    });
    expect(result.households.h1?.rows.recipe_favorites?.[0]?.id).toBe('r1:m1');
    expect(result.households.h1?.rows.recipes?.[0]).toMatchObject({ id: 'r1', title: 'Dal' });
  });

  it('rejects a malformed answer as permanent "invalid_response"', async () => {
    const { client } = stubClient([ok({ serverTime: 5 }), ok({ item_id: 1 })]);
    const transport = createSupabaseTransport(client);
    await expect(transport.syncPull({ households: {} })).rejects.toMatchObject({
      kind: 'permanent',
      code: 'invalid_response',
    });
    await expect(transport.setItemChecked('i1', true, 0)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('subscribes to the private household topic and only signals "changed"', () => {
    const { client, channels, removed } = stubClient([]);
    const onSignal = vi.fn();
    const unsubscribe = createSupabaseTransport(client).subscribe('h1', onSignal);
    expect(channels[0]).toMatchObject({
      topic: 'household:h1',
      options: { config: { private: true } },
    });
    for (const handler of channels[0]?.handlers ?? []) handler();
    expect(onSignal).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(removed).toEqual(['household:h1']);
  });

  it('resolves a short link through the edge function and classifies its errors', async () => {
    const reply = {
      name: 'Café Fleur',
      location: { lat: 50.9, lng: 6.9 },
      mapsUrl: 'https://www.google.com/maps/place/Fleur',
    };
    const httpError = (status: number, body: unknown) => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: { status, json: async () => body },
      },
    });
    const { client, invoked } = stubClient(
      [],
      [
        { data: reply, error: null },
        httpError(422, { error: 'not_a_maps_link' }),
        httpError(503, { error: 'ai_unavailable' }),
        { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request' } },
        { data: { name: '' }, error: null },
      ],
    );
    const transport = createSupabaseTransport(client);
    const url = 'https://maps.app.goo.gl/abc';
    await expect(transport.resolveMapsLink(url)).resolves.toEqual(reply);
    expect(invoked).toEqual([{ name: 'resolve-maps-link', body: { url } }]);
    await expect(transport.resolveMapsLink(url)).rejects.toMatchObject({
      kind: 'permanent',
      code: 'not_a_maps_link',
      status: 422,
    });
    await expect(transport.resolveMapsLink(url)).rejects.toMatchObject({
      kind: 'transient',
      code: 'ai_unavailable',
    });
    await expect(transport.resolveMapsLink(url)).rejects.toMatchObject({
      kind: 'transient',
      code: 'network',
    });
    await expect(transport.resolveMapsLink(url)).rejects.toMatchObject({
      kind: 'permanent',
      code: 'invalid_response',
    });
  });
});

describe('supabase transport: AI edge functions', () => {
  const httpError = (status: number, body: unknown) => ({
    data: null,
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: { status, json: async () => body },
    },
  });
  const assistantRequest = {
    householdId: 'h1',
    message: 'Mach das vegan',
    context: { recipeId: 'r1' },
  };
  const assistantReply = {
    text: 'Hier ist mein Vorschlag.',
    proposal: {
      id: 'p1',
      title: 'Curry ändern',
      note: '',
      parts: [
        {
          id: 'a',
          label: 'Portionen',
          before: '4',
          after: '6',
          command: { type: 'setRecipeServings', recipeId: 'r1', servings: 6 },
        },
      ],
    },
  };

  it('asks the assistant with the request as body and validates the reply', async () => {
    const { client, invoked } = stubClient(
      [],
      [
        { data: assistantReply, error: null },
        // A proposal with a command outside the contract is refused, never applied.
        {
          data: {
            ...assistantReply,
            proposal: {
              ...assistantReply.proposal,
              parts: [{ id: 'x', label: 'Löschen', command: { type: 'deleteEverything' } }],
            },
          },
          error: null,
        },
        httpError(429, { error: 'quota_exceeded' }),
        httpError(401, { error: 'unauthorized' }),
      ],
    );
    const transport = createSupabaseTransport(client);
    await expect(transport.askAssistant(assistantRequest)).resolves.toEqual(assistantReply);
    expect(invoked[0]).toEqual({ name: 'ai-assistant', body: assistantRequest });
    await expect(transport.askAssistant(assistantRequest)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(transport.askAssistant(assistantRequest)).rejects.toMatchObject({
      code: 'quota_exceeded',
      status: 429,
    });
    await expect(transport.askAssistant(assistantRequest)).rejects.toMatchObject({
      kind: 'permanent',
      code: 'unauthorized',
    });
  });

  it('runs the AI search and validates the result', async () => {
    const result = {
      chips: [{ id: 'term:tofu', label: 'Tofu' }],
      results: [{ recipeId: 'r1', reason: 'mit Tofu' }],
      trace: '1 Runde',
      note: '',
    };
    const { client, invoked } = stubClient(
      [],
      [
        { data: result, error: null },
        { data: { chips: 'nope' }, error: null },
      ],
    );
    const transport = createSupabaseTransport(client);
    const request = { householdId: 'h1', query: 'Tofu', disabledChips: ['fast'] };
    await expect(transport.aiSearch(request)).resolves.toEqual(result);
    expect(invoked[0]).toEqual({ name: 'ai-search', body: request });
    await expect(transport.aiSearch(request)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('fetches a speech token with an empty body and validates it', async () => {
    const token = {
      token: 'eyJ.short.lived',
      region: 'westeurope',
      expiresAt: '2026-11-20T10:09:00.000Z',
      language: 'de-DE',
    };
    const { client, invoked } = stubClient(
      [],
      [
        { data: token, error: null },
        { data: { ...token, region: 'evil.example.com/' }, error: null },
      ],
    );
    const transport = createSupabaseTransport(client);
    await expect(transport.speechToken()).resolves.toEqual(token);
    expect(invoked[0]).toEqual({ name: 'speech-token', body: {} });
    // The region becomes part of a host name: anything but a plain region name is refused.
    await expect(transport.speechToken()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
