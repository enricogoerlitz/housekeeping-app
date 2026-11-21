import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantReplySchema } from '../_shared/contract.gen.ts';
import {
  ANON_JWT,
  fakeClient,
  fakeDeps,
  foundryReply,
  post,
  type FakeClient,
} from '../_shared/test-fakes.ts';
import { ENRICO, HOUSEHOLD_ID, NADJA, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function request(message = 'Mach das vegan und für 6 Personen', recipeId?: string) {
  return post({ householdId: HOUSEHOLD_ID, message, context: recipeId ? { recipeId } : {} });
}

function part(command: unknown, label = 'Änderung') {
  return { label, before: null, after: null, command };
}

function modelReply(parts: unknown[] | null, text = 'Hier ist mein Vorschlag.') {
  return {
    text,
    consulted: '1 Rezept gelesen',
    proposal: parts ? { title: 'Mango-Curry ändern', note: '', parts } : null,
  };
}

function setup(output: unknown, client: FakeClient = fakeClient({ tables: householdTables() })) {
  return fakeDeps({ client, fetch: async () => foundryReply(output) });
}

function sentPrompt(deps: ReturnType<typeof fakeDeps>): string {
  return String(deps.fetchMock.mock.calls[0]?.[1]?.body);
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ai-assistant', () => {
  it('AC-026: returns a proposal with server-made ids and writes nothing', async () => {
    const deps = setup(
      modelReply([
        part({ type: 'setRecipeServings', recipeId: 'r-curry', servings: 6 }, 'Portionen'),
        part({
          type: 'replaceIngredient',
          recipeId: 'r-curry',
          ingredientId: 'i-cream',
          line: '200 ml Kokosmilch',
        }),
      ]),
    );
    const response = await handler(request(undefined, 'r-curry'), deps);
    expect(response.status).toBe(200);
    const reply = AssistantReplySchema.parse(await response.json());
    expect(reply.text).toBe('Hier ist mein Vorschlag.');
    expect(reply.proposal?.id).toMatch(UUID);
    expect(reply.proposal?.parts.map((p) => p.command.type)).toEqual([
      'setRecipeServings',
      'replaceIngredient',
    ]);
    for (const p of reply.proposal?.parts ?? []) expect(p.id).toMatch(UUID);
    expect(new Set(reply.proposal?.parts.map((p) => p.id)).size).toBe(2);
    expect(deps.client.rpcCalls.map((call) => call.fn)).toEqual(['consume_ai_quota']);
  });

  it('AC-026: loads the open recipe with its ingredients under the caller’s RLS', async () => {
    const deps = setup(modelReply(null, 'Gern.'));
    await handler(request('Was fehlt?', 'r-curry'), deps);
    const prompt = sentPrompt(deps);
    expect(prompt).toContain('i-cream');
    expect(prompt).toContain('Sahne');
    expect(prompt).toContain('slot-dinner');
    expect(prompt).toContain('c-bath');
    expect(prompt).toContain(NADJA);
    expect(prompt).not.toContain('stranger');
    expect(deps.client.selects.map((s) => s.table)).toContain('recipes');
  });

  it('without an open recipe, sends only the recipe index (no ingredient ids)', async () => {
    const deps = setup(modelReply(null, 'Heute gibt es Tofu-Pasta.'));
    const response = await handler(request('Was koche ich heute?'), deps);
    expect(await response.json()).toEqual({
      text: 'Heute gibt es Tofu-Pasta.',
      consulted: '1 Rezept gelesen',
    });
    expect(sentPrompt(deps)).not.toContain('i-cream');
  });

  it('uses today in Europe/Berlin', async () => {
    const deps = setup(modelReply(null, 'Ok.'));
    deps.now = () => new Date('2026-11-20T23:30:00Z');
    await handler(request('Was koche ich morgen?'), deps);
    expect(sentPrompt(deps)).toContain('2026-11-21');
  });

  it('prompt injection: drops every part whose ids are not in the loaded context', async () => {
    const plan = (input: object) => ({
      type: 'addPlanEntry',
      input: { date: '2026-11-25', slotId: 'slot-dinner', kind: 'recipe', eaterIds: [], ...input },
    });
    const deps = setup(
      modelReply([
        part({ type: 'setRecipeServings', recipeId: 'r-foreign', servings: 6 }),
        part({ type: 'replaceIngredient', recipeId: 'r-curry', ingredientId: 'i-x', line: 'a' }),
        part({
          type: 'replaceIngredient',
          recipeId: 'r-pasta',
          ingredientId: 'i-pasta-tofu',
          line: 'a',
        }),
        part({ type: 'completeChore', choreId: 'c-foreign' }),
        part(plan({ recipeId: 'r-curry', slotId: 'slot-x' })),
        part(plan({ recipeId: 'r-foreign' })),
        part(plan({ recipeId: 'r-curry', eaterIds: [ENRICO, 'stranger'] })),
        part(plan({ recipeId: 'r-curry', cookId: 'stranger' })),
        part(plan({ recipeId: 'r-curry', variants: [{ variantId: 'v-foreign', portions: 2 }] })),
        part(plan({ kind: 'restaurant', restaurantId: 'rest-1' })),
        part(plan({ kind: 'leftovers', leftoversOfEntryId: 'entry-1' })),
        part({ type: 'addShoppingItems', texts: ['Milch'] }, 'Einkaufsliste'),
        part(
          plan({
            recipeId: 'r-curry',
            eaterIds: [ENRICO, NADJA],
            cookId: NADJA,
            variants: [{ variantId: 'v-veg', portions: 1 }],
          }),
        ),
        part({ type: 'completeChore', choreId: 'c-bath' }),
        part({ type: 'logSpontaneous', title: 'Fenster geputzt' }),
      ]),
    );
    const response = await handler(request('Mach alles', 'r-curry'), deps);
    const reply = AssistantReplySchema.parse(await response.json());
    expect(reply.proposal?.parts.map((p) => p.command)).toEqual([
      { type: 'addShoppingItems', texts: ['Milch'] },
      {
        type: 'addPlanEntry',
        input: {
          date: '2026-11-25',
          slotId: 'slot-dinner',
          kind: 'recipe',
          recipeId: 'r-curry',
          eaterIds: [ENRICO, NADJA],
          cookId: NADJA,
          variants: [{ variantId: 'v-veg', portions: 1 }],
        },
      },
      { type: 'completeChore', choreId: 'c-bath' },
      { type: 'logSpontaneous', title: 'Fenster geputzt' },
    ]);
  });

  it('prompt injection: a proposal with no valid part is dropped, the text stays', async () => {
    const deps = setup(
      modelReply([part({ type: 'setRecipeServings', recipeId: 'r-foreign', servings: 6 })]),
    );
    const response = await handler(request(), deps);
    expect(await response.json()).toEqual({
      text: 'Hier ist mein Vorschlag.',
      consulted: '1 Rezept gelesen',
    });
  });

  it('prompt injection: a command outside the contract makes the whole answer invalid (503)', async () => {
    const deps = setup(modelReply([part({ type: 'deleteHousehold', householdId: HOUSEHOLD_ID })]));
    const response = await handler(request(), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ai_unavailable' });
  });

  it('AC-029: Foundry down gives 503 ai_unavailable after the retries', async () => {
    vi.useFakeTimers();
    const deps = fakeDeps({
      client: fakeClient({ tables: householdTables() }),
      fetch: async () => new Response('down', { status: 502 }),
    });
    const pending = handler(request(), deps);
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ai_unavailable' });
    expect(deps.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('AC-030: an exhausted quota gives 429 and Foundry is never called', async () => {
    const client = fakeClient({
      tables: householdTables(),
      rpc: () => ({ data: null, error: { message: 'quota_exceeded' } }),
    });
    const deps = setup(modelReply(null), client);
    const response = await handler(request(), deps);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'quota_exceeded' });
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-005: the anon key gets 401; nothing is read and Foundry is not called', async () => {
    const deps = setup(modelReply(null));
    const response = await handler(post({}, { jwt: ANON_JWT }), deps);
    expect(response.status).toBe(401);
    expect(deps.client.selects).toEqual([]);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('a household the caller cannot see (RLS returns nothing) gives 400, no Foundry call', async () => {
    const deps = setup(modelReply(null));
    const response = await handler(
      post({ householdId: 'bbbbbbbb-0000-4000-8000-000000000002', message: 'Hallo', context: {} }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a message over 2000 characters before charging the quota', async () => {
    const deps = setup(modelReply(null));
    const response = await handler(request('x'.repeat(2001)), deps);
    expect(response.status).toBe(400);
    expect(deps.client.rpcCalls).toEqual([]);
  });
});
