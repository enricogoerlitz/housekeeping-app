import { describe, expect, it, vi } from 'vitest';

import { purgeConversations, restConversationsApi, runPurge } from './purge';

// Spec 0067, decision 13: before its database reset the preview deletes its own Foundry chats —
// the conversations whose metadata say `app: housekeeping` and `env: preview`, with every answer
// (resp_…, they outlive the conversation). Production is never purged; nothing secret is printed.

const ENDPOINT = 'https://res.services.ai.azure.com/api/projects/proj';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.SECRET-TOKEN.sig';

interface Conv {
  id: string;
  metadata: Record<string, string>;
  items: { id: string; type: string; created_by?: { response_id: string; agent: unknown } }[];
}

/** The conversations of a Foundry project over HTTP, every call recorded. */
function fakeProject(conversations: Conv[], options: { status?: number } = {}) {
  const live = new Map(conversations.map((conv) => [conv.id, conv]));
  const responses = new Set(
    conversations.flatMap((conv) =>
      conv.items.flatMap((item) => item.created_by?.response_id ?? []),
    ),
  );
  const calls: { method: string; url: string; auth: string | null }[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url: url.toString(),
      auth: new Headers(init?.headers).get('authorization'),
    });
    if (options.status) return json({ error: { code: 'Denied', message: TOKEN } }, options.status);
    const path = url.pathname.replace('/api/projects/proj/openai/v1', '');
    if (path === '/conversations' && method === 'GET') {
      const all = [...live.values()];
      const after = url.searchParams.get('after');
      const start = after ? all.findIndex((conv) => conv.id === after) + 1 : 0;
      const page = all.slice(start, start + 2);
      return json({
        data: page.map((conv) => ({ id: conv.id, metadata: conv.metadata })),
        has_more: start + 2 < all.length,
        last_id: page.at(-1)?.id,
      });
    }
    const items = /^\/conversations\/([^/]+)\/items$/.exec(path);
    if (items && method === 'GET')
      return json({ data: live.get(items[1]!)?.items ?? [], has_more: false });
    const conv = /^\/conversations\/([^/]+)$/.exec(path);
    if (conv && method === 'DELETE') {
      if (!live.delete(conv[1]!)) return json({ error: {} }, 404);
      return json({ deleted: true });
    }
    const resp = /^\/responses\/([^/]+)$/.exec(path);
    if (resp && method === 'DELETE') {
      if (!responses.delete(resp[1]!)) return json({ error: {} }, 404);
      return json({ deleted: true });
    }
    return new Response('unexpected', { status: 599 });
  });
  return { fetchFn, calls, live, responses };
}

const conv = (
  id: string,
  metadata: Record<string, string>,
  responses: string[] = [],
  agent = 'household-agent-preview',
): Conv => ({
  id,
  metadata,
  items: [
    { id: `msg_${id}`, type: 'message' },
    ...responses.map((response, index) => ({
      id: `fc_${id}_${index}`,
      type: 'function_call',
      created_by: { response_id: response, agent: { name: agent } },
    })),
  ],
});

const PROJECT = [
  conv('conv_p1', { app: 'housekeeping', env: 'preview', household_id: 'h1' }, [
    'resp_1',
    'resp_2',
    'resp_1',
  ]),
  conv('conv_prod', { app: 'housekeeping', env: 'prod', household_id: 'h2' }, ['resp_9']),
  conv('conv_old', { app: 'housekeeping', household_id: 'h3' }, ['resp_8'], 'places-agent-prod'),
  conv('conv_p2', { app: 'housekeeping', env: 'preview', household_id: 'h4' }),
  conv('conv_play', { env: 'preview' }, ['resp_7']),
];

describe('purge of the preview conversations (decision 13)', () => {
  it('deletes the preview’s conversations and their answers, over every page, nothing else', async () => {
    const project = fakeProject(PROJECT);
    const api = restConversationsApi(ENDPOINT, TOKEN, project.fetchFn);
    expect(await purgeConversations(api, 'preview')).toEqual({ conversations: 2, responses: 2 });
    expect([...project.live.keys()]).toEqual(['conv_prod', 'conv_old', 'conv_play']);
    expect([...project.responses].sort()).toEqual(['resp_7', 'resp_8', 'resp_9']);
    expect(project.calls.every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('review D: a chat from before decision 44 (no env) goes when only this environment’s agents answered in it', async () => {
    const project = fakeProject([
      conv('conv_legacy_p', { app: 'housekeeping', household_id: 'h1' }, ['resp_a', 'resp_b']),
      conv(
        'conv_legacy_0066',
        { app: 'housekeeping', household_id: 'h1' },
        ['resp_c'],
        'places-agent-preview',
      ),
      conv(
        'conv_legacy_prod',
        { app: 'housekeeping', household_id: 'h2' },
        ['resp_d'],
        'household-agent-prod',
      ),
      conv(
        'conv_legacy_local',
        { app: 'housekeeping', household_id: 'h3' },
        ['resp_e'],
        'household-agent-local',
      ),
      // Never answered: whose it is cannot be told, so it stays.
      conv('conv_legacy_empty', { app: 'housekeeping', household_id: 'h4' }),
    ]);
    const api = restConversationsApi(ENDPOINT, TOKEN, project.fetchFn);
    expect(await purgeConversations(api, 'preview')).toEqual({ conversations: 2, responses: 3 });
    expect([...project.live.keys()]).toEqual([
      'conv_legacy_prod',
      'conv_legacy_local',
      'conv_legacy_empty',
    ]);
    expect([...project.responses].sort()).toEqual(['resp_d', 'resp_e']);
    // A conversation answered by agents of two environments stays as well.
    const mixed: Conv = {
      ...conv('conv_mixed', { app: 'housekeeping' }, ['resp_f']),
      items: [
        ...conv('conv_mixed', { app: 'housekeeping' }, ['resp_f']).items,
        {
          id: 'fc_x',
          type: 'function_call',
          created_by: { response_id: 'resp_g', agent: { name: 'household-agent-prod' } },
        },
      ],
    };
    const second = fakeProject([mixed]);
    expect(
      await purgeConversations(restConversationsApi(ENDPOINT, TOKEN, second.fetchFn), 'preview'),
    ).toEqual({ conversations: 0, responses: 0 });
  });

  it('production is never purged, local only on purpose; the log names counts, never a token', async () => {
    const project = fakeProject(PROJECT);
    const lines: string[] = [];
    const deps = {
      env: (name: string) => (name === 'FOUNDRY_PROJECT_ENDPOINT' ? ENDPOINT : undefined),
      api: () => restConversationsApi(ENDPOINT, TOKEN, project.fetchFn),
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
    expect(await runPurge(['--purge-conversations', 'prod'], deps)).toBe(2);
    expect(project.calls).toEqual([]);
    expect(await runPurge(['--purge-conversations', 'preview'], deps)).toBe(0);
    expect(lines.at(-1)).toBe('Foundry-Chats der Vorschau gelöscht: 2 Conversations, 2 Antworten');
    expect(lines.join('\n')).not.toContain('SECRET');
  });

  it('a refused call fails the step with status and code only', async () => {
    const project = fakeProject(PROJECT, { status: 403 });
    const lines: string[] = [];
    const code = await runPurge(['--purge-conversations', 'preview'], {
      env: () => ENDPOINT,
      api: () => restConversationsApi(ENDPOINT, TOKEN, project.fetchFn),
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('HTTP 403');
    expect(lines.join('\n')).not.toContain('SECRET');
  });

  it('invalid input: no endpoint is an error, not an empty purge', async () => {
    const lines: string[] = [];
    expect(
      await runPurge(['--purge-conversations', 'preview'], {
        env: () => undefined,
        api: () => {
          throw new Error('not reached');
        },
        log: (line) => lines.push(line),
        error: (line) => lines.push(line),
      }),
    ).toBe(2);
  });
});
