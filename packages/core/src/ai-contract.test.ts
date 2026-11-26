import { describe, expect, it } from 'vitest';

import {
  AiSearchRequestSchema,
  AiSearchResultSchema,
  AssistantCommandSchema,
  AssistantReplySchema,
  AssistantRequestSchema,
  ErrorReplySchema,
  FetchImageRequestSchema,
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
  it('accepts a message for the active household with an optional open recipe', () => {
    const request = { householdId: 'h1', message: 'Mach das vegan', context: { recipeId: 'r1' } };
    expect(AssistantRequestSchema.parse(request)).toEqual(request);
    expect(
      AssistantRequestSchema.parse({ householdId: 'h1', message: 'Hallo', context: {} }),
    ).toEqual({ householdId: 'h1', message: 'Hallo', context: {} });
  });

  it('requires the active household', () => {
    expect(AssistantRequestSchema.safeParse({ message: 'Hallo', context: {} }).success).toBe(false);
  });

  it('rejects an empty message, one over 2000 characters, and unknown fields', () => {
    const base = { householdId: 'h1', context: {} };
    expect(AssistantRequestSchema.safeParse({ ...base, message: '  ' }).success).toBe(false);
    expect(AssistantRequestSchema.safeParse({ ...base, message: 'x'.repeat(2001) }).success).toBe(
      false,
    );
    expect(
      AssistantRequestSchema.safeParse({ ...base, message: 'Hallo', model: 'gpt' }).success,
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
      { type: 'addShoppingItems', texts: Array.from({ length: 51 }, () => 'Milch') },
      { type: 'addShoppingItems', texts: [''] },
      // ADR-0012: the shopping list is the household's; a list id is not part of the command.
      { type: 'addShoppingItems', listId: 'l1', texts: ['Milch'] },
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
    expect(
      AiSearchRequestSchema.parse({ householdId: 'h1', query: 'was Schnelles mit Tofu' }),
    ).toEqual({ householdId: 'h1', query: 'was Schnelles mit Tofu', disabledChips: [] });
    const result = {
      chips: [{ id: 'fast', label: '≤ 30 Min' }],
      results: [{ recipeId: 'r1', reason: 'mit Tofu · 25 Min' }],
      trace: '1 Runde',
      note: '',
    };
    expect(AiSearchResultSchema.parse(result)).toEqual(result);
  });

  it('rejects a query over 500 characters', () => {
    expect(
      AiSearchRequestSchema.safeParse({ householdId: 'h1', query: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(AiSearchRequestSchema.safeParse({ query: 'Tofu' }).success).toBe(false);
  });
});

describe('SpeechTokenReplySchema', () => {
  it('accepts a short-lived token with region, expiry, language and an optional model', () => {
    const token = {
      token: 'abc',
      region: 'westeurope',
      expiresAt: '2026-11-20T10:10:00Z',
      language: 'de-DE',
    };
    expect(SpeechTokenReplySchema.parse(token)).toEqual(token);
    const withModel = { ...token, model: 'mai-transcribe-2-streaming' };
    expect(SpeechTokenReplySchema.parse(withModel)).toEqual(withModel);
    expect(SpeechTokenReplySchema.safeParse({ ...token, expiresAt: 'bald' }).success).toBe(false);
    expect(SpeechTokenReplySchema.safeParse({ ...token, language: 'de DE' }).success).toBe(false);
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

describe('fetch image (spec 0039)', () => {
  it('AC-006: asks for an https address in the active household', () => {
    const request = {
      householdId: 'aaaaaaaa-0000-4000-8000-000000000001',
      url: 'https://example.org/kuchen.jpg',
    };
    expect(FetchImageRequestSchema.parse(request)).toEqual(request);
  });

  it('AC-007: refuses http, other schemes, a missing household and extra fields', () => {
    const householdId = 'aaaaaaaa-0000-4000-8000-000000000001';
    for (const url of ['http://localhost/a.jpg', 'file:///etc/passwd', 'ftp://x.org/a.jpg'])
      expect(FetchImageRequestSchema.safeParse({ householdId, url }).success).toBe(false);
    expect(FetchImageRequestSchema.safeParse({ url: 'https://example.org/a.jpg' }).success).toBe(
      false,
    );
    expect(
      FetchImageRequestSchema.safeParse({ householdId, url: 'https://x.org/a.jpg', bytes: 1 })
        .success,
    ).toBe(false);
  });
});

describe('ErrorReplySchema', () => {
  it('accepts every stable error code and nothing else', () => {
    for (const error of [
      'unauthorized',
      'invalid_request',
      'not_a_maps_link',
      'quota_exceeded',
      'ai_unavailable',
      'internal',
      'forbidden',
      'not_an_image',
    ])
      expect(ErrorReplySchema.parse({ error })).toEqual({ error });
    expect(ErrorReplySchema.safeParse({ error: 'teapot' }).success).toBe(false);
  });
});
