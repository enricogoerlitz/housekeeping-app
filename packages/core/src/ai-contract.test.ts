import { describe, expect, it } from 'vitest';

import {
  AiSearchRequestSchema,
  AiSearchResultSchema,
  AssistantCommandSchema,
  AssistantReplySchema,
  AssistantRequestSchema,
  ResolveMapsLinkReplySchema,
  ResolveMapsLinkRequestSchema,
  SpeechTokenReplySchema,
  type AssistantReply,
} from './ai-contract';

const reply: AssistantReply = {
  text: 'So wird das Mango-Curry vegan und reicht für 6.',
  consulted: 'Rezept gelesen',
  proposal: {
    id: 'p1',
    title: 'Mango-Curry ändern',
    note: '',
    parts: [
      {
        id: 'part1',
        label: 'Portionen',
        before: '4',
        after: '6',
        command: { type: 'setRecipeServings', recipeId: 'r1', servings: 6 },
      },
      {
        id: 'part2',
        label: 'Wochenplan',
        command: {
          type: 'addPlanEntry',
          input: {
            date: '2026-11-25',
            slotId: 'dinner',
            kind: 'recipe',
            recipeId: 'r1',
            eaterIds: ['p1', 'p2'],
            portions: 2,
            variants: [{ variantId: 'v1', portions: 2 }],
          },
        },
      },
    ],
  },
};

describe('AssistantRequestSchema', () => {
  it('accepts a message with an optional open recipe', () => {
    const request = { message: 'Mach das vegan', context: { recipeId: 'r1' } };
    expect(AssistantRequestSchema.parse(request)).toEqual(request);
    expect(AssistantRequestSchema.parse({ message: 'Hallo', context: {} })).toEqual({
      message: 'Hallo',
      context: {},
    });
  });

  it('rejects an empty message, one over 2000 characters, and unknown fields', () => {
    expect(AssistantRequestSchema.safeParse({ message: '  ', context: {} }).success).toBe(false);
    expect(
      AssistantRequestSchema.safeParse({ message: 'x'.repeat(2001), context: {} }).success,
    ).toBe(false);
    expect(
      AssistantRequestSchema.safeParse({ message: 'Hallo', context: {}, model: 'gpt' }).success,
    ).toBe(false);
  });
});

describe('AssistantReplySchema', () => {
  it('accepts a reply with a proposal of every command kind', () => {
    const all = AssistantCommandSchema.options.map((option) => option.shape.type.value);
    expect(all.sort()).toEqual(
      [
        'addPlanEntry',
        'addShoppingItems',
        'completeChore',
        'logSpontaneous',
        'replaceIngredient',
        'setRecipeServings',
      ].sort(),
    );
    expect(AssistantReplySchema.parse(reply)).toEqual(reply);
  });

  it('rejects an unknown command, which is how injected instructions would show up', () => {
    const injected = JSON.parse(JSON.stringify(reply)) as {
      proposal: { parts: { command: Record<string, unknown> }[] };
    };
    const part = injected.proposal.parts[0];
    if (part) part.command = { type: 'deleteHousehold', householdId: 'h1' };
    expect(AssistantReplySchema.safeParse(injected).success).toBe(false);
  });

  it('rejects impossible values: zero servings, bad dates, too many shopping texts', () => {
    const bad = [
      { type: 'setRecipeServings', recipeId: 'r1', servings: 0 },
      { type: 'addShoppingItems', listId: 'l1', texts: Array.from({ length: 51 }, () => 'Milch') },
      { type: 'addShoppingItems', listId: 'l1', texts: [''] },
      {
        type: 'addPlanEntry',
        input: { date: '25.11.2026', slotId: 's', kind: 'recipe', eaterIds: [] },
      },
      { type: 'logSpontaneous', title: 'x'.repeat(201) },
    ];
    for (const command of bad)
      expect(AssistantCommandSchema.safeParse(command).success).toBe(false);
  });
});

describe('AI search', () => {
  it('accepts a query and a result with chips, reasons and a trace', () => {
    expect(AiSearchRequestSchema.parse({ query: 'was Schnelles mit Tofu' })).toEqual({
      query: 'was Schnelles mit Tofu',
      disabledChips: [],
    });
    const result = {
      chips: [{ id: 'fast', label: '≤ 30 Min' }],
      results: [{ recipeId: 'r1', reason: 'mit Tofu · 25 Min' }],
      trace: '1 Runde',
    };
    expect(AiSearchResultSchema.parse(result)).toEqual(result);
  });

  it('rejects a query over 500 characters', () => {
    expect(AiSearchRequestSchema.safeParse({ query: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('SpeechTokenReplySchema', () => {
  it('accepts a short-lived token with region and expiry', () => {
    const token = { token: 'abc', region: 'westeurope', expiresAt: '2026-11-20T10:10:00Z' };
    expect(SpeechTokenReplySchema.parse(token)).toEqual(token);
    expect(SpeechTokenReplySchema.safeParse({ ...token, expiresAt: 'bald' }).success).toBe(false);
  });
});

describe('maps link', () => {
  it('accepts only https links on the request', () => {
    expect(ResolveMapsLinkRequestSchema.parse({ url: 'https://maps.app.goo.gl/abc' }).url).toBe(
      'https://maps.app.goo.gl/abc',
    );
    expect(
      ResolveMapsLinkRequestSchema.safeParse({ url: 'http://maps.app.goo.gl/abc' }).success,
    ).toBe(false);
    expect(ResolveMapsLinkRequestSchema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(
      false,
    );
  });

  it('a reply carries name, place and the resolved link', () => {
    const place = {
      name: 'Café Fleur',
      address: 'Lindenstraße 10, Köln',
      location: { lat: 50.9338, lng: 6.9395 },
      mapsUrl: 'https://www.google.com/maps/place/Caf%C3%A9+Fleur',
    };
    expect(ResolveMapsLinkReplySchema.parse(place)).toEqual(place);
    expect(
      ResolveMapsLinkReplySchema.safeParse({ ...place, location: { lat: 91, lng: 0 } }).success,
    ).toBe(false);
  });
});
