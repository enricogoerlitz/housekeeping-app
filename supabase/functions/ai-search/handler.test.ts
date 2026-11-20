import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiSearchResultSchema } from '../_shared/contract.gen.ts';
import { ANON_JWT, fakeClient, fakeDeps, foundryReply, post } from '../_shared/test-fakes.ts';
import { HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

const chips = [
  { id: 'fast', label: '≤ 30 Min' },
  { id: 'term:tofu', label: 'Tofu' },
];

function model(results: { recipeId: string; reason: string }[]) {
  return { chips, results, trace: 'gesucht: tofu, ≤ 30 Min', note: '' };
}

function setup(output: unknown, tables = householdTables()) {
  return fakeDeps({
    client: fakeClient({ tables }),
    fetch: async () => foundryReply(output),
  });
}

function search(query = 'was Schnelles mit Tofu', disabledChips: string[] = []) {
  return post({ householdId: HOUSEHOLD_ID, query, disabledChips });
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ai-search', () => {
  it('AC-027: returns the interpretation as chips and hits with a reason', async () => {
    const deps = setup(model([{ recipeId: 'r-pasta', reason: 'mit Räuchertofu · 20 Min' }]));
    const response = await handler(search(), deps);
    expect(response.status).toBe(200);
    expect(AiSearchResultSchema.parse(await response.json())).toEqual({
      chips,
      results: [{ recipeId: 'r-pasta', reason: 'mit Räuchertofu · 20 Min' }],
      trace: 'gesucht: tofu, ≤ 30 Min',
      note: '',
    });
    const prompt = String(deps.fetchMock.mock.calls[0]?.[1]?.body);
    expect(prompt).toContain('Räuchertofu');
    expect(prompt).toContain('r-curry');
  });

  it('AC-027: drops unknown and repeated recipe ids and keeps at most 8 hits', async () => {
    const results = [
      { recipeId: 'r-foreign', reason: 'x' },
      { recipeId: 'r-pasta', reason: 'a' },
      { recipeId: 'r-pasta', reason: 'b' },
      ...Array.from({ length: 12 }, () => ({ recipeId: 'r-curry', reason: 'c' })),
    ];
    const tables = householdTables();
    const recipes = tables.recipes ?? [];
    for (let i = 0; i < 10; i += 1)
      recipes.push({ household_id: HOUSEHOLD_ID, id: `r-extra-${i}`, title: `Extra ${i}` });
    const extra = Array.from({ length: 10 }, (_, i) => ({ recipeId: `r-extra-${i}`, reason: 'e' }));
    const deps = setup(model([...results, ...extra]), tables);
    const reply = AiSearchResultSchema.parse(await (await handler(search(), deps)).json());
    expect(reply.results.map((r) => r.recipeId)).toEqual([
      'r-pasta',
      'r-curry',
      'r-extra-0',
      'r-extra-1',
      'r-extra-2',
      'r-extra-3',
      'r-extra-4',
      'r-extra-5',
    ]);
  });

  it('AC-027: tells the model which chips the user switched off', async () => {
    const deps = setup(model([]));
    await handler(search('was Schnelles mit Tofu', ['fast']), deps);
    const body = JSON.parse(String(deps.fetchMock.mock.calls[0]?.[1]?.body)) as {
      input: { content: string }[];
    };
    expect(JSON.parse(body.input[1]?.content ?? '')).toEqual({
      anfrage: 'was Schnelles mit Tofu',
      abgeschaltet: ['fast'],
    });
  });

  it('a household without recipes is answered without calling Foundry', async () => {
    const tables = householdTables();
    tables.recipes = [];
    const deps = setup(model([]), tables);
    const response = await handler(search(), deps);
    expect(response.status).toBe(200);
    expect(AiSearchResultSchema.parse(await response.json()).results).toEqual([]);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-029: invalid model output gives 503 ai_unavailable', async () => {
    const deps = setup({ chips: 'kaputt' });
    const response = await handler(search(), deps);
    expect(response.status).toBe(503);
  });

  it('AC-030: an exhausted quota gives 429 without calling Foundry', async () => {
    const deps = fakeDeps({
      client: fakeClient({ tables: householdTables(), rpc: () => ({ data: false, error: null }) }),
    });
    const response = await handler(search(), deps);
    expect(response.status).toBe(429);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-005: the anon key gets 401', async () => {
    const deps = setup(model([]));
    const response = await handler(post({}, { jwt: ANON_JWT }), deps);
    expect(response.status).toBe(401);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});
