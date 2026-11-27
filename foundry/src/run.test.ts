import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadAgents, parseAgentFile } from './definitions';
import { agentName, type AgentSpec } from './environments';
import { run, type RunDeps } from './run';
import { definitionKey, type AgentsApi } from './upsert';

const ENDPOINT = 'https://res.services.ai.azure.com/api/projects/proj';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.SECRET-TOKEN.sig';

const spec: AgentSpec = {
  name: 'places-agent',
  description: 'Test',
  metadata: { app: 'housekeeping' },
  definition: {
    kind: 'prompt',
    model: 'gpt-6.1-terra',
    instructions: 'Du bist der Ausgeh-Scout.',
    tools: [{ type: 'web_search', search_context_size: 'medium' }],
  },
};

/** An in-memory Foundry project: agent name → versions. */
function fakeFoundry(initial: Record<string, { version: string; definition: unknown }[]> = {}) {
  const agents = new Map(Object.entries(initial));
  const created: { name: string; options: unknown }[] = [];
  const api: AgentsApi = {
    versions: async (name) => agents.get(name),
    createVersion: async (name, definition, options) => {
      const list = agents.get(name) ?? [];
      const version = String(list.length + 1);
      agents.set(name, [...list, { version, definition }]);
      created.push({ name, options });
      return { version };
    },
  };
  return { api, created };
}

function deps(
  api: AgentsApi,
  env: Record<string, string> = { FOUNDRY_PROJECT_ENDPOINT: ENDPOINT },
) {
  const lines: string[] = [];
  const errors: string[] = [];
  const outputs: string[] = [];
  const value: RunDeps = {
    env: (name) => env[name],
    agents: () => [spec],
    api: () => api,
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
    output: (entries) => outputs.push(...entries),
  };
  return { value, lines, errors, outputs };
}

describe('foundry-agents (spec 0066, ADR-0019)', () => {
  it('creates a missing agent with the environment suffix and reports its version', async () => {
    const foundry = fakeFoundry();
    const d = deps(foundry.api);
    expect(await run(['--env', 'preview'], d.value)).toBe(0);
    expect(foundry.created).toEqual([
      {
        name: 'places-agent-preview',
        options: { description: 'Test', metadata: { app: 'housekeeping', environment: 'preview' } },
      },
    ]);
    expect(d.lines).toEqual(['places-agent-preview Version 1 (neu angelegt)']);
    expect(d.outputs).toEqual(['places_agent_name=places-agent-preview', 'places_agent_version=1']);
  });

  it('AC-042: an unchanged definition creates no new version, whatever the key order', async () => {
    const stored = {
      tools: [{ search_context_size: 'medium', type: 'web_search' }],
      instructions: 'Du bist der Ausgeh-Scout.',
      model: 'gpt-6.1-terra',
      kind: 'prompt',
      temperature: undefined,
    };
    const foundry = fakeFoundry({ 'places-agent-prod': [{ version: '4', definition: stored }] });
    const d = deps(foundry.api);
    expect(await run(['--env', 'prod'], d.value)).toBe(0);
    expect(foundry.created).toEqual([]);
    expect(d.lines).toEqual(['places-agent-prod Version 4 (unverändert)']);
    expect(d.outputs).toContain('places_agent_version=4');
  });

  it('a changed definition gets a new version', async () => {
    const foundry = fakeFoundry({
      'places-agent-local': [{ version: '1', definition: { ...spec.definition, model: 'alt' } }],
    });
    const d = deps(foundry.api);
    expect(await run(['--env', 'local'], d.value)).toBe(0);
    expect(d.lines).toEqual(['places-agent-local Version 2 (neu angelegt)']);
  });

  it('--check only says that a new version is needed and fails', async () => {
    const foundry = fakeFoundry();
    const d = deps(foundry.api);
    expect(await run(['--env', 'local', '--check'], d.value)).toBe(1);
    expect(foundry.created).toEqual([]);
    expect(d.lines).toEqual(['places-agent-local: neue Version nötig']);
  });

  it('AC-045: an auth failure fails with a German hint and never prints the token', async () => {
    const api: AgentsApi = {
      versions: async () => {
        throw Object.assign(new Error(`401 Bearer ${TOKEN}`), {
          statusCode: 401,
          request: { headers: { authorization: `Bearer ${TOKEN}` } },
        });
      },
      createVersion: async () => ({ version: '1' }),
    };
    const d = deps(api);
    expect(await run(['--env', 'prod'], d.value)).toBe(1);
    expect(d.errors).toEqual([
      'places-agent-prod: Anlegen scheiterte (HTTP 401) – Azure-Anmeldung und Rolle „Foundry User“ auf dem Projekt prüfen (docs/architecture/betrieb.md, „KI-Agent“)',
    ]);
    expect(JSON.stringify([d.errors, d.lines, d.outputs])).not.toContain('SECRET-TOKEN');
  });

  it('without a login: a clear message', async () => {
    const api: AgentsApi = {
      versions: async () => {
        throw Object.assign(new Error(`token ${TOKEN}`), { name: 'CredentialUnavailableError' });
      },
      createVersion: async () => ({ version: '1' }),
    };
    const d = deps(api);
    expect(await run(['--env', 'local'], d.value)).toBe(1);
    expect(d.errors[0]).toContain('keine Azure-Anmeldung');
    expect(d.errors[0]).not.toContain('SECRET-TOKEN');
  });

  it('a missing endpoint or environment fails loudly before anything is called', async () => {
    const foundry = fakeFoundry();
    const missing = deps(foundry.api, {});
    expect(await run(['--env', 'preview'], missing.value)).toBe(2);
    expect(missing.errors[0]).toContain('FOUNDRY_PROJECT_ENDPOINT fehlt');
    const wrong = deps(foundry.api);
    expect(await run(['--env', 'staging'], wrong.value)).toBe(2);
    expect(foundry.created).toEqual([]);
  });
});

describe('agent files', () => {
  it('places-agent.yaml reads with its instructions file and the show_suggestions schema', () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../agents');
    const [agent] = loadAgents(dir);
    expect(agent?.name).toBe('places-agent');
    expect(agentName('places-agent', 'prod')).toBe('places-agent-prod');
    expect(agent?.definition.model).toBe('gpt-6.1-terra');
    expect(agent?.definition.instructions).toContain('Ausgeh-Scout');
    const tools = agent?.definition.tools as { type: string; name?: string; strict?: boolean }[];
    expect(tools.map((tool) => tool.type)).toEqual(['web_search', 'function']);
    expect(tools[1]).toMatchObject({ name: 'show_suggestions', strict: true });
  });

  it('refuses an unknown key, a bad name and missing instructions', () => {
    const read = () => 'Text';
    expect(() => parseAgentFile('name: x\ndefinition: {kind: prompt, model: m}', read)).toThrow();
    expect(() =>
      parseAgentFile(
        'name: a-agent\nextra: 1\ndefinition: {kind: prompt, model: m, instructions: x}',
        read,
      ),
    ).toThrow();
    expect(() =>
      parseAgentFile('name: a-agent\ndefinition: {kind: prompt, model: m}', read),
    ).toThrow('instructions fehlen');
  });

  it('the same definition gives the same key, a change another', () => {
    expect(definitionKey(spec.definition)).toBe(definitionKey({ ...spec.definition }));
    expect(definitionKey(spec.definition)).not.toBe(
      definitionKey({ ...spec.definition, instructions: 'Anders' }),
    );
  });
});
