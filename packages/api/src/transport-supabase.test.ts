import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransportError, classifyError, isTransient } from './transport';
import { createSupabaseTransport, type SupabaseLike } from './transport-supabase';

type Reply = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  status: number;
};

/** A stand-in for supabase-js: records rpc calls and answers with the queued replies. */
type InvokeReply = Awaited<ReturnType<SupabaseLike['functions']['invoke']>>;

type StorageReply = { data: unknown; error: unknown };

/** A storage answer the test gives later (an upload still on its way). */
function later() {
  let settle: (reply: StorageReply) => void = () => {};
  const reply = new Promise<StorageReply>((resolve) => {
    settle = resolve;
  });
  return { reply, settle };
}

/** 'hang': the request answers only when its signal aborts, like fetch does. */
type StorageStub = StorageReply | 'hang' | Promise<StorageReply>;

function stubClient(
  replies: (Reply | 'hang')[],
  invokeReplies: InvokeReply[] = [],
  storageReplies: StorageStub[] = [],
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const invoked: { name: string; body: unknown }[] = [];
  const stored: { bucket: string; op: string; args: unknown[] }[] = [];
  const storageReply = async (signal?: AbortSignal): Promise<StorageReply> => {
    const next = storageReplies.shift() ?? { data: null, error: null };
    if (next !== 'hang') return next;
    return new Promise((resolve) =>
      signal?.addEventListener('abort', () =>
        resolve({ data: null, error: { name: 'StorageUnknownError', message: 'AbortError' } }),
      ),
    );
  };
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
    storage: {
      from: (bucket) => ({
        upload: (...args) => {
          stored.push({ bucket, op: 'upload', args });
          return storageReply();
        },
        download: (...args) => {
          stored.push({ bucket, op: 'download', args });
          return storageReply(args[2].signal);
        },
        remove: (...args) => {
          stored.push({ bucket, op: 'remove', args });
          return storageReply();
        },
      }),
    },
  };
  return { client, calls, channels, removed, invoked, stored };
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
      ok(null),
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
    await transport.addShoppingContributions('h1', []);
    await transport.assignArticleArea('a1', null);
    await transport.clearCheckedItems('h1');
    expect(await transport.removeContributions(['c1', 'c2'])).toBe(2);
    await transport.setRecipeRating('r1', null);
    await transport.setActivityFavorite('act1', true);
    await transport.setActivityRating('act1', 4);
    expect(await transport.inviteMember('h1', 'nadja@example.com')).toBe('inv-1');
    await transport.removeMember('h1', 'm2');

    expect(calls).toEqual([
      { fn: 'apply_changes', args: { p_household_id: 'h1', p_ops: [op] } },
      {
        fn: 'set_shopping_item_checked',
        args: { p_item_id: 'i1', p_checked: true, p_seen_check_seq: 2 },
      },
      { fn: 'set_shopping_item_not_available', args: { p_item_id: 'i1', p_value: true } },
      { fn: 'add_shopping_contributions', args: { p_household_id: 'h1', p_entries: [] } },
      { fn: 'assign_article_area', args: { p_article_id: 'a1', p_area_id: null } },
      { fn: 'clear_checked_items', args: { p_household_id: 'h1' } },
      { fn: 'remove_contributions', args: { p_ids: ['c1', 'c2'] } },
      { fn: 'set_recipe_rating', args: { recipe_id: 'r1', stars: null } },
      { fn: 'set_activity_favorite', args: { activity_id: 'act1', favorite: true } },
      { fn: 'set_activity_rating', args: { activity_id: 'act1', stars: 4 } },
      { fn: 'invite_member', args: { household_id: 'h1', email: 'nadja@example.com' } },
      { fn: 'remove_member', args: { household_id: 'h1', profile_id: 'm2' } },
    ]);
  });

  it('spec 0006: adjust_item_count and clear_shopping_list with their parameters and answers', async () => {
    const removed = {
      item_id: 'i1',
      count: 0,
      removed: true,
      item: { id: 'i1', household_id: 'h1' },
      contributions: [{ id: 'c1', item_id: 'i1' }],
    };
    const { client, calls } = stubClient([
      ok({ item_id: 'i1', count: 3, removed: false }),
      ok(removed),
      ok(null),
      ok([{ item: { id: 'i1' }, contributions: [] }]),
      ok({ item_id: 'i1', count: 'drei', removed: false }),
    ]);
    const transport = createSupabaseTransport(client);
    expect(await transport.adjustItemCount('i1', 1)).toEqual({
      item_id: 'i1',
      count: 3,
      removed: false,
    });
    expect(await transport.adjustItemCount('i1', -1)).toEqual(removed);
    expect(await transport.adjustItemCount('i1', -1)).toBeNull();
    expect(await transport.clearShoppingList('h1')).toEqual([
      { item: { id: 'i1' }, contributions: [] },
    ]);
    await expect(transport.adjustItemCount('i1', 1)).rejects.toMatchObject({
      kind: 'permanent',
      code: 'invalid_response',
    });
    expect(calls).toEqual([
      { fn: 'adjust_item_count', args: { p_item_id: 'i1', p_delta: 1 } },
      { fn: 'adjust_item_count', args: { p_item_id: 'i1', p_delta: -1 } },
      { fn: 'adjust_item_count', args: { p_item_id: 'i1', p_delta: -1 } },
      { fn: 'clear_shopping_list', args: { p_household_id: 'h1' } },
      { fn: 'adjust_item_count', args: { p_item_id: 'i1', p_delta: 1 } },
    ]);
  });

  it('spec 0007: delete_article, merge_articles and merge_areas with their parameters and answers', async () => {
    const deleted = {
      id: 'a1',
      household_id: 'h1',
      name: 'Drachenfrucht',
      name_key: 'drachenfrucht',
    };
    const { client, calls } = stubClient([
      ok(deleted),
      ok({ recipes: 1, items: 2 }),
      ok(12),
      ok({ recipes: 'eins', items: 2 }),
      { data: null, error: { message: 'article_in_use', code: 'P0001' }, status: 400 },
    ]);
    const transport = createSupabaseTransport(client);
    expect(await transport.deleteArticle('a1')).toEqual(deleted);
    expect(await transport.mergeArticles('a-mk', 'a-km')).toEqual({ recipes: 1, items: 2 });
    expect(await transport.mergeAreas('area-1', 'area-2')).toBe(12);
    await expect(transport.mergeArticles('a-mk', 'a-km')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'invalid_response',
    });
    await expect(transport.deleteArticle('a1')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'article_in_use',
    });
    expect(calls).toEqual([
      { fn: 'delete_article', args: { p_article_id: 'a1' } },
      { fn: 'merge_articles', args: { p_source_id: 'a-mk', p_target_id: 'a-km' } },
      { fn: 'merge_areas', args: { p_source_id: 'area-1', p_target_id: 'area-2' } },
      { fn: 'merge_articles', args: { p_source_id: 'a-mk', p_target_id: 'a-km' } },
      { fn: 'delete_article', args: { p_article_id: 'a1' } },
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
    // PostgREST answers P0001 with 400 and P0002 with 500. What our functions raise on purpose is
    // permanent whatever the status, else a queued entry the server refuses would block the store
    // queue for ever.
    [500, { message: 'last_member', code: 'P0001' }, 'permanent', 'last_member'],
    [500, { message: 'row_not_found', code: 'P0002' }, 'permanent', 'row_not_found'],
    [500, { message: 'invitation_not_found', code: 'P0001' }, 'permanent', 'invitation_not_found'],
    // spec 0007: what the catalog's checks raise on purpose is permanent and keeps its code.
    [400, { message: 'too_many_synonyms', code: '22023' }, 'permanent', 'too_many_synonyms'],
    [409, { message: 'name_taken', code: '23505' }, 'permanent', 'name_taken'],
    [
      409,
      { message: 'ingredient_article_invalid', code: '23503' },
      'permanent',
      'ingredient_article_invalid',
    ],
    [
      409,
      { message: 'insert or update on table "shopping_items" violates foreign key', code: '23503' },
      'permanent',
      '23503',
    ],
  ] as const)('classifies status %i as %s', (status, error, kind, code) => {
    const classified = classifyError(status, error);
    expect(classified).toBeInstanceOf(TransportError);
    expect(classified).toMatchObject({ kind, code, status });
  });

  it('spec 0011, AC-031: already_done keeps who and when from the details; numeric stars stay unrounded', async () => {
    const details = JSON.stringify({ done_by: 'u-nadja', done_at: '2026-11-20T09:02:00.1+00:00' });
    const { client, calls } = stubClient([
      { data: null, error: { message: 'already_done', code: 'P0001', details }, status: 400 },
      { data: null, error: null, status: 204 },
    ]);
    const transport = createSupabaseTransport(client);
    await expect(transport.applyChanges('h1', [])).rejects.toMatchObject({
      kind: 'permanent',
      code: 'already_done',
      detail: { done_by: 'u-nadja', done_at: '2026-11-20T09:02:00.1+00:00' },
    });
    await transport.setRestaurantRating('rest1', 4.5);
    expect(calls[1]).toEqual({
      fn: 'set_restaurant_rating',
      args: { restaurant_id: 'rest1', stars: 4.5 },
    });
    expect(
      classifyError(400, { message: 'chore_changed', code: 'P0001', details: 'kein JSON' }),
    ).toMatchObject({ code: 'chore_changed', detail: undefined });
  });

  it('spec 0007 T8: a deadlock or serialization failure (rolled back) is retried once, then transient', async () => {
    const deadlock = { message: 'deadlock detected', code: '40P01' };
    const { client, calls } = stubClient([
      { data: null, error: deadlock, status: 500 },
      { data: { recipes: 1, items: 2 }, error: null, status: 200 },
      { data: null, error: { message: 'could not serialize access', code: '40001' }, status: 409 },
      { data: null, error: deadlock, status: 500 },
    ]);
    const transport = createSupabaseTransport(client);
    await expect(transport.mergeArticles('a-mk', 'a-km')).resolves.toEqual({
      recipes: 1,
      items: 2,
    });
    expect(calls.map((call) => call.fn)).toEqual(['merge_articles', 'merge_articles']);

    const error = await transport.mergeArticles('a-mk', 'a-km').catch((caught: unknown) => caught);
    expect(calls).toHaveLength(4);
    expect(isTransient(error)).toBe(true);
    expect(error).toMatchObject({ code: '40P01' });
    expect(
      classifyError(409, { message: 'could not serialize access', code: '40001' }),
    ).toMatchObject({ kind: 'transient', code: '40001' });
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

describe('supabase transport: photo storage (spec 0004)', () => {
  /** What storage-js answers for a refused request: HTTP 400 with the real status in the body. */
  const apiError = (statusCode: string, code: string) => ({
    data: null,
    error: { name: 'StorageApiError', message: code, status: 400, statusCode, code },
  });

  it('uploads as image/jpeg without upsert and uncached, downloads past the HTTP cache, removes in household-media', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const { client, stored } = stubClient(
      [],
      [],
      [
        { data: { path: 'h1/activities/a1/p.jpg' }, error: null },
        { data: blob, error: null },
        { data: [], error: null },
      ],
    );
    const transport = createSupabaseTransport(client);
    await transport.uploadMedia('h1/activities/a1/p.jpg', blob);
    await expect(transport.downloadMedia('h1/activities/a1/p.jpg')).resolves.toBe(blob);
    await transport.removeMedia(['h1/activities/a1/p.jpg']);
    expect(stored).toEqual([
      {
        bucket: 'household-media',
        op: 'upload',
        // max-age=0: no browser or CDN keeps the photo after sign-out (security check 0004).
        args: [
          'h1/activities/a1/p.jpg',
          blob,
          { contentType: 'image/jpeg', upsert: false, cacheControl: '0' },
        ],
      },
      {
        bucket: 'household-media',
        op: 'download',
        args: [
          'h1/activities/a1/p.jpg',
          {},
          { cache: 'no-store', signal: expect.any(AbortSignal) as AbortSignal },
        ],
      },
      { bucket: 'household-media', op: 'remove', args: [['h1/activities/a1/p.jpg']] },
    ]);
  });

  it.each([
    ['413', 'EntityTooLarge', 'permanent', 'too_large', 413],
    ['415', 'InvalidMimeType', 'permanent', 'invalid_mime', 415],
    ['403', 'AccessDenied', 'permanent', 'access_denied', 403],
    ['409', 'KeyAlreadyExists', 'permanent', 'already_exists', 409],
    ['404', 'NoSuchKey', 'permanent', 'not_found', 404],
    ['500', 'InternalError', 'transient', 'http_500', 500],
  ] as const)(
    'classifies storage status %s (%s) as %s %s',
    async (statusCode, code, kind, mapped, status) => {
      const { client } = stubClient([], [], [apiError(statusCode, code)]);
      await expect(
        createSupabaseTransport(client).uploadMedia('h1/recipes/r1/p.jpg', new Blob(['x'])),
      ).rejects.toMatchObject({ kind, code: mapped, status });
    },
  );

  it('a failed request without an answer is a transient network failure', async () => {
    const { client } = stubClient(
      [],
      [],
      [
        { data: null, error: { name: 'StorageUnknownError', message: 'Failed to fetch' } },
        { data: { not: 'a blob' }, error: null },
      ],
    );
    const transport = createSupabaseTransport(client);
    await expect(transport.downloadMedia('h1/recipes/r1/p.jpg')).rejects.toMatchObject({
      kind: 'transient',
      code: 'network',
    });
    await expect(transport.downloadMedia('h1/recipes/r1/p.jpg')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'invalid_response',
    });
  });

  it('a download that takes too long is cancelled, not left running', async () => {
    vi.useFakeTimers();
    const { client, stored } = stubClient([], [], ['hang']);
    const download = createSupabaseTransport(client, { mediaTimeoutMs: 1000 })
      .downloadMedia('h1/recipes/r1/p.jpg')
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await download).toMatchObject({ kind: 'transient', code: 'timeout' });
    const parameters = stored[0]?.args[2] as { signal: AbortSignal };
    expect(parameters.signal.aborted).toBe(true);
  });

  it('a download the caller cancels (sign-out) stops and fails as aborted', async () => {
    const { client, stored } = stubClient([], [], ['hang']);
    const caller = new AbortController();
    const download = createSupabaseTransport(client)
      .downloadMedia('h1/recipes/r1/p.jpg', caller.signal)
      .catch((error: unknown) => error);
    await Promise.resolve();
    caller.abort();
    expect(await download).toMatchObject({ kind: 'transient', code: 'aborted' });
    expect((stored[0]?.args[2] as { signal: AbortSignal }).signal.aborted).toBe(true);
    // Already cancelled: nothing is requested.
    await expect(
      createSupabaseTransport(client).downloadMedia('h1/recipes/r1/q.jpg', caller.signal),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(stored).toHaveLength(1);
  });

  it('an upload that lands after its timeout is removed again, so no file is left without a row', async () => {
    vi.useFakeTimers();
    const late = later();
    const failed = later();
    const { client, stored } = stubClient(
      [],
      [],
      [late.reply, { data: [], error: null }, failed.reply],
    );
    const transport = createSupabaseTransport(client, { mediaTimeoutMs: 1000 });
    const blob = new Blob(['x'], { type: 'image/jpeg' });

    const upload = transport.uploadMedia('h1/recipes/r1/late.jpg', blob).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await upload).toMatchObject({ kind: 'transient', code: 'timeout' });
    late.settle({ data: { path: 'h1/recipes/r1/late.jpg' }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(stored.map((entry) => [entry.op, entry.args[0]])).toEqual([
      ['upload', 'h1/recipes/r1/late.jpg'],
      ['remove', ['h1/recipes/r1/late.jpg']],
    ]);

    // One that is refused in the end left nothing to remove.
    const refused = transport.uploadMedia('h1/recipes/r1/no.jpg', blob).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await refused).toMatchObject({ code: 'timeout' });
    failed.settle(apiError('403', 'AccessDenied'));
    await vi.advanceTimersByTimeAsync(0);
    expect(stored.map((entry) => entry.op)).toEqual(['upload', 'remove', 'upload']);
  });
});
