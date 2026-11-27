import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { AgentSpec } from './environments';
import { FoundryError, restAgentsApi } from './rest';
import { run } from './run';

const ENDPOINT = 'https://res.services.ai.azure.com/api/projects/proj';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.SECRET-TOKEN.sig';
const definition: AgentSpec['definition'] = {
  kind: 'prompt',
  model: 'gpt-6.1-terra',
  instructions: 'Du bist der Ausgeh-Scout.',
  tools: [{ type: 'web_search' }],
};

/** A Foundry project over HTTP: agents with versions, every call recorded. */
function fakeFoundry(options: { status?: number; agents?: Record<string, unknown[]> } = {}) {
  const agents = new Map(Object.entries(options.agents ?? {}));
  const calls: { method: string; url: string; auth: string | null; body?: unknown }[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, url, auth: new Headers(init?.headers).get('authorization'), body });
    if (options.status)
      return json(
        { error: { code: 'PermissionDenied', message: `token ${TOKEN}` } },
        options.status,
      );
    const path = url.replace(ENDPOINT, '').split('?')[0]!;
    const versions = /^\/agents\/([^/]+)\/versions$/.exec(path);
    if (versions) {
      const list = agents.get(versions[1]!);
      if (!list) return json({ error: { code: 'NotFound' } }, 404);
      if (method === 'GET') return json({ data: list });
      const last = list.at(-1) as { version?: string } | undefined;
      const entry = {
        version: String(Number(last?.version ?? 0) + 1),
        definition: body?.definition,
      };
      list.push(entry);
      return json(entry);
    }
    if (path === '/agents' && method === 'POST') {
      const entry = { version: '1', definition: body?.definition };
      agents.set(String(body?.name), [entry]);
      return json({ name: body?.name, versions: { latest: entry } });
    }
    return json({}, 599);
  });
  return { fetchFn, calls };
}

const spec: AgentSpec = { name: 'places-agent', metadata: { app: 'housekeeping' }, definition };

async function upsert(foundry: ReturnType<typeof fakeFoundry>, env = 'preview') {
  const lines: string[] = [];
  const errors: string[] = [];
  const code = await run(['--env', env], {
    env: (name) => (name === 'FOUNDRY_PROJECT_ENDPOINT' ? ENDPOINT : undefined),
    agents: () => [spec],
    api: (endpoint) => restAgentsApi(endpoint, TOKEN, foundry.fetchFn),
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
    output: () => undefined,
  });
  return { code, lines, errors };
}

describe('Foundry agents over REST (ADR-0019)', () => {
  it('creates a missing agent with POST /agents and the token only in the header', async () => {
    const foundry = fakeFoundry();
    const result = await upsert(foundry);
    expect(result).toMatchObject({
      code: 0,
      lines: ['places-agent-preview Version 1 (neu angelegt)'],
    });
    expect(foundry.calls.map((call) => `${call.method} ${call.url.replace(ENDPOINT, '')}`)).toEqual(
      [
        'GET /agents/places-agent-preview/versions?api-version=v1&limit=100',
        'POST /agents/places-agent-preview/versions?api-version=v1',
        'POST /agents?api-version=v1',
      ],
    );
    expect(foundry.calls.every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(foundry.calls[2]?.body).toEqual({
      name: 'places-agent-preview',
      definition,
      metadata: { app: 'housekeeping', environment: 'preview' },
    });
  });

  it('AC-042: unchanged → no new version; changed → POST …/versions', async () => {
    const same = fakeFoundry({ agents: { 'places-agent-prod': [{ version: '3', definition }] } });
    expect((await upsert(same, 'prod')).lines).toEqual([
      'places-agent-prod Version 3 (unverändert)',
    ]);
    expect(same.calls.filter((call) => call.method === 'POST')).toEqual([]);

    const changed = fakeFoundry({
      agents: {
        'places-agent-prod': [{ version: '3', definition: { ...definition, model: 'alt' } }],
      },
    });
    expect((await upsert(changed, 'prod')).lines).toEqual([
      'places-agent-prod Version 4 (neu angelegt)',
    ]);
  });

  it('AC-045: an auth failure: status and code only, never the token', async () => {
    const foundry = fakeFoundry({ status: 401 });
    const result = await upsert(foundry);
    expect(result.code).toBe(1);
    expect(result.errors[0]).toContain('HTTP 401 PermissionDenied');
    expect(result.errors[0]).toContain('Foundry User');
    expect(JSON.stringify(result)).not.toContain('SECRET-TOKEN');
    await expect(restAgentsApi(ENDPOINT, TOKEN, foundry.fetchFn).versions('x')).rejects.toEqual(
      new FoundryError(401, 'PermissionDenied'),
    );
  });

  it('the pipeline entry and the REST client import nothing but Node and our own files', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const file of ['ci.ts', 'rest.ts', 'run.ts', 'upsert.ts', 'environments.ts', 'token.ts']) {
      const text = readFileSync(path.join(here, file), 'utf8');
      const imports = [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
      for (const name of imports) expect(name, `${file}: ${name}`).toMatch(/^(node:|\.\/)/);
    }
  });
});
