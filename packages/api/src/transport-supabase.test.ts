import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransportError, classifyError, isTransient } from './transport';
import { createSupabaseTransport, type SupabaseLike } from './transport-supabase';

type Reply = { data: unknown; error: { message: string; code?: string } | null; status: number };

/** A stand-in for supabase-js: records rpc calls and answers with the queued replies. */
function stubClient(replies: (Reply | 'hang')[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
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
  };
  return { client, calls, channels, removed };
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
});
