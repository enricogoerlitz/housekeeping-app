import { describe, expect, it } from 'vitest';

import {
  AGENT_PROPOSAL_LIMITS,
  AGENT_PROPOSAL_TOOLS,
  agentProposalParameters,
  deleteWished,
  isDeleteKind,
  parseDraftArgs,
  parseEntitiesArgs,
  parseChangeArgs,
  parseFillWeekArgs,
  parseImageArgs,
  parsePhotoArgs,
  parseProposalArgs,
} from './agent-proposals';

const empty = {
  target: null,
  id: null,
  date: null,
  slot: null,
  time: null,
  address: null,
  note: null,
  servings: null,
  favorite: null,
  weekday: null,
  every_weeks: null,
};
const action = (fields: Record<string, unknown>) => ({ ...empty, ...fields });
const args = (actions: unknown[], title: string | null = 'Für heute') =>
  JSON.stringify({ title, actions });

describe('propose_actions (spec 0067, REQ-009)', () => {
  it('AC-017: "Milch und Eier auf die Liste, Bad geputzt, Mi Curry" gives four entries', () => {
    const { proposal, dropped } = parseProposalArgs(
      args([
        action({ kind: 'add_to_list', name: 'Milch' }),
        action({ kind: 'add_to_list', name: '6 Eier' }),
        action({ kind: 'chore_done', name: 'Bad putzen' }),
        action({
          kind: 'plan',
          target: 'recipe',
          name: 'Mango-Curry',
          date: '2026-12-02',
          slot: 'Abendessen',
        }),
      ]),
      { id: 'call_1', deletesAllowed: false },
    );
    expect(dropped).toBe(0);
    expect(proposal.title).toBe('Für heute');
    expect(proposal.actions.map((entry) => entry.kind)).toEqual([
      'add_to_list',
      'add_to_list',
      'chore_done',
      'plan',
    ]);
    expect(proposal.actions[3]).toEqual({
      kind: 'plan',
      target: 'recipe',
      name: 'Mango-Curry',
      date: '2026-12-02',
      slot: 'Abendessen',
    });
  });

  it('AC-020: a delete without the wish in the person’s message drops out, the rest stays', () => {
    const raw = args([
      action({ kind: 'add_to_list', name: 'Milch' }),
      action({ kind: 'remove_from_list', name: 'Eier' }),
    ]);
    const refused = parseProposalArgs(raw, { id: 'c', deletesAllowed: false });
    expect(refused.proposal.actions.map((entry) => entry.kind)).toEqual(['add_to_list']);
    expect(refused.deletesDropped).toBe(1);
    const wished = parseProposalArgs(raw, { id: 'c', deletesAllowed: true });
    expect(wished.proposal.actions.map((entry) => entry.kind)).toEqual([
      'add_to_list',
      'remove_from_list',
    ]);
  });

  it('AC-020: only the person’s own words count as a wish to delete', () => {
    expect(deleteWished('Lösch die Eier von der Liste')).toBe(true);
    expect(deleteWished('die Milch kann weg')).toBe(true);
    expect(deleteWished('nimm den Termin am Mittwoch raus')).toBe(true);
    expect(deleteWished('entferne den Dauerposten')).toBe(true);
    expect(deleteWished('Leg das Rezept aus dem Link an')).toBe(false);
    expect(deleteWished('Milch und Eier auf die Liste, Bad geputzt')).toBe(false);
    expect(isDeleteKind('delete_recurring')).toBe(true);
    expect(isDeleteKind('plan')).toBe(false);
  });

  it('invalid input: broken JSON, unknown kinds, bad dates, missing fields drop out', () => {
    expect(parseProposalArgs('{nope', { id: 'c', deletesAllowed: true }).proposal.actions).toEqual(
      [],
    );
    const { proposal, dropped } = parseProposalArgs(
      args([
        action({ kind: 'delete_household', name: 'Enrico & Nadja' }),
        action({ kind: 'plan', target: 'recipe', name: 'Curry', date: '2026-02-31' }),
        action({ kind: 'plan', name: 'Curry', date: '2026-12-02' }),
        action({ kind: 'set_servings', name: 'Curry' }),
        action({ kind: 'add_to_list', name: '   ' }),
        action({ kind: 'plan', target: 'text', name: 'Oma kommt', time: '25:00' }),
        'nonsense',
      ]),
      { id: 'c', deletesAllowed: true },
    );
    expect(proposal.actions).toEqual([]);
    expect(dropped).toBe(7);
  });

  it('untrusted ids: one that is no uuid is ignored, the name finds the row', () => {
    const { proposal } = parseProposalArgs(
      args([action({ kind: 'chore_done', id: "x' or 1=1 --", name: 'Bad putzen' })]),
      { id: 'c', deletesAllowed: false },
    );
    expect(proposal.actions).toEqual([{ kind: 'chore_done', name: 'Bad putzen' }]);
  });

  it('at most 20 entries; the rest is counted as dropped', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      action({ kind: 'add_to_list', name: `Artikel ${index}` }),
    );
    const parsed = parseProposalArgs(args(many, null), { id: 'c', deletesAllowed: false });
    expect(parsed.proposal.actions).toHaveLength(AGENT_PROPOSAL_LIMITS.actions);
    expect(parsed.dropped).toBe(5);
    expect(parsed.proposal.title).toBeUndefined();
  });

  it('control characters and long text are cut to one line', () => {
    const { proposal } = parseProposalArgs(
      args([action({ kind: 'add_to_list', name: 'Milch\n\u0000(laktosefrei)' })]),
      { id: 'c', deletesAllowed: false },
    );
    expect(proposal.actions[0]?.name).toBe('Milch (laktosefrei)');
  });

  it('the YAML parameters are strict: every key required', () => {
    for (const name of AGENT_PROPOSAL_TOOLS) {
      const schema = agentProposalParameters(name) as {
        required: string[];
        properties: Record<string, unknown>;
        additionalProperties: boolean;
      };
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });
});

describe('draft_recipe (spec 0067, REQ-010)', () => {
  it('AC-021: a TikTok link with the wish', () => {
    expect(
      parseDraftArgs(
        JSON.stringify({
          wish: 'leg das an, vegetarisch, für 2',
          links: ['https://www.tiktok.com/@koch/video/1', 'javascript:alert(1)', 'http://x.de'],
          page_text: null,
          page_url: null,
          refine: false,
          use_photos: false,
        }),
      ),
    ).toEqual({
      wish: 'leg das an, vegetarisch, für 2',
      links: ['https://www.tiktok.com/@koch/video/1'],
      refine: false,
      usePhotos: false,
    });
  });

  it('AC-022: page text read by the web search only with its https page', () => {
    const base = { wish: 'Linsensuppe', links: [], refine: false, use_photos: false };
    expect(
      parseDraftArgs(
        JSON.stringify({ ...base, page_text: 'Zutaten: …', page_url: 'https://koch.de/suppe' }),
      )?.page,
    ).toEqual({ url: 'https://koch.de/suppe', text: 'Zutaten: …' });
    expect(
      parseDraftArgs(JSON.stringify({ ...base, page_text: 'Zutaten', page_url: 'ftp://x' }))?.page,
    ).toBeUndefined();
  });

  it('invalid input: nothing to draft from', () => {
    expect(parseDraftArgs('{')).toBeUndefined();
    expect(
      parseDraftArgs(JSON.stringify({ wish: ' ', links: [], refine: true, use_photos: false })),
    ).toBeUndefined();
  });
});

describe('make_image and show_images (spec 0067, REQ-011)', () => {
  it('one prompt for a recipe, a query for a draft (without a name)', () => {
    expect(
      parseImageArgs(
        JSON.stringify({ prompt: 'A bowl of curry', for: 'recipe', name: 'Mango-Curry' }),
        1000,
      ),
    ).toEqual({ text: 'A bowl of curry', for: 'recipe', name: 'Mango-Curry' });
    expect(
      parseImageArgs(JSON.stringify({ query: 'Kürbissuppe', for: 'draft', name: 'x' }), 200),
    ).toEqual({ text: 'Kürbissuppe', for: 'draft' });
  });

  it('invalid input: no text, an unknown subject becomes a recipe', () => {
    expect(parseImageArgs(JSON.stringify({ prompt: '' }), 10)).toBeUndefined();
    expect(parseImageArgs(JSON.stringify({ query: 'Eis', for: 'household' }), 10)?.for).toBe(
      'recipe',
    );
  });
});

describe('show_entities (preview 28.11.: own entries as cards)', () => {
  const R = '6f1c0f5e-0000-4000-8000-0000000000a1';
  const C = '6f1c0f5e-0000-4000-8000-0000000000a2';
  it('kinds and uuids are kept, the rest drops out, at most 12', () => {
    const parsed = parseEntitiesArgs(
      JSON.stringify({
        title: 'Eure Sammlungen',
        items: [
          { kind: 'collection', id: C },
          { kind: 'recipe', id: R },
          { kind: 'recipe', id: "x' or 1=1" },
          { kind: 'household', id: R },
          ...Array.from({ length: 20 }, () => ({ kind: 'recipe', id: R })),
        ],
      }),
    );
    expect(parsed.title).toBe('Eure Sammlungen');
    expect(parsed.items[0]).toEqual({ kind: 'collection', id: C });
    expect(parsed.items).toHaveLength(2);
  });
  it('invalid input gives nothing', () => {
    expect(parseEntitiesArgs('{').items).toEqual([]);
  });
});

describe('bulk editing (spec 0067, REQ-013)', () => {
  const ID = '11111111-2222-4333-8444-555555555555';
  it('AC-023: at most 20 entries per pass; "weitere prüfen" when the agent says so or the card is full', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      action({
        kind: 'set_remembered',
        target: 'activity',
        name: `Ausflug ${index}`,
        favorite: false,
      }),
    );
    const full = parseProposalArgs(args(many, 'Eher einmalig'), { id: 'c', deletesAllowed: false });
    expect(full.proposal.actions).toHaveLength(20);
    expect(full.proposal.more).toBe(true);
    const few = parseProposalArgs(
      JSON.stringify({ title: 't', more: true, actions: many.slice(0, 3) }),
      { id: 'c', deletesAllowed: false },
    );
    expect(few.proposal.more).toBe(true);
    const done = parseProposalArgs(
      JSON.stringify({ title: 't', more: false, actions: many.slice(0, 3) }),
      { id: 'c', deletesAllowed: false },
    );
    expect(done.proposal.more).toBeUndefined();
  });

  it('"nicht mehr merken" and "Mit KI ausarbeiten" are entries; set_remembered needs on or off', () => {
    const { proposal, dropped } = parseProposalArgs(
      args([
        action({ kind: 'set_remembered', target: 'activity', name: 'Zoo', favorite: false }),
        action({ kind: 'set_remembered', target: 'activity', name: 'Kino', favorite: null }),
        action({ kind: 'work_out', target: 'recipe', id: ID, name: 'Linsen-Dal' }),
      ]),
      { id: 'c', deletesAllowed: false },
    );
    expect(proposal.actions.map((entry) => entry.kind)).toEqual(['set_remembered', 'work_out']);
    expect(dropped).toBe(1);
  });
});

describe('change_recipe (spec 0067, variant from the chat)', () => {
  const ID = '11111111-2222-4333-8444-555555555555';
  it('the recipe and the wish; an id that is no uuid is ignored', () => {
    expect(
      parseChangeArgs(JSON.stringify({ id: ID, name: 'Lasagne', wish: 'vegetarische Variante' })),
    ).toEqual({ id: ID, name: 'Lasagne', wish: 'vegetarische Variante' });
    expect(
      parseChangeArgs(JSON.stringify({ id: "x' or 1=1", name: 'Lasagne', wish: 'vegan' })),
    ).toEqual({ name: 'Lasagne', wish: 'vegan' });
  });

  it('invalid input: no wish, no recipe, broken JSON; long wishes are cut', () => {
    expect(parseChangeArgs(JSON.stringify({ id: ID, name: 'Lasagne', wish: ' ' }))).toBeUndefined();
    expect(parseChangeArgs(JSON.stringify({ id: null, name: '', wish: 'vegan' }))).toBeUndefined();
    expect(parseChangeArgs('{')).toBeUndefined();
    const long = parseChangeArgs(JSON.stringify({ id: ID, name: 'L', wish: 'x'.repeat(900) }));
    expect(long?.wish).toHaveLength(AGENT_PROPOSAL_LIMITS.wish);
  });
});

describe('fill_week (spec 0067, REQ-014)', () => {
  const week = {
    from: '2026-11-30',
    to: '2026-12-06',
    slot: null,
    vegetarian: 2,
    quick_days: ['2026-12-02'],
    guest_days: [{ date: '2026-12-05', count: 2 }],
    skip_days: [],
  };
  it('"2× vegetarisch, Mittwoch wenig Zeit, Samstag Gäste" as checked wishes', () => {
    expect(parseFillWeekArgs(JSON.stringify(week))).toEqual({
      from: '2026-11-30',
      to: '2026-12-06',
      vegetarian: 2,
      quick: ['2026-12-02'],
      guests: [{ date: '2026-12-05', count: 2 }],
      skip: [],
    });
  });

  it('untrusted values: days outside the range, bad dates, odd counts drop out; 7 days at most', () => {
    const parsed = parseFillWeekArgs(
      JSON.stringify({
        ...week,
        to: '2027-03-01',
        slot: 'Abendessen',
        vegetarian: 99,
        quick_days: ['2026-12-02', '2026-02-30', '2026-11-01', '2026-12-08', 7],
        guest_days: [
          { date: '2026-12-05', count: 0 },
          { date: '2026-12-06', count: 3 },
          { date: '2026-12-07', count: 3 },
          { date: 'morgen', count: 2 },
        ],
      }),
    );
    expect(parsed).toEqual({
      from: '2026-11-30',
      to: '2026-12-06',
      slot: 'Abendessen',
      vegetarian: 7,
      quick: ['2026-12-02'],
      guests: [{ date: '2026-12-06', count: 3 }],
      skip: [],
    });
  });

  it('invalid input: no range, an end before the start, broken JSON', () => {
    expect(parseFillWeekArgs(JSON.stringify({ ...week, from: null }))).toBeUndefined();
    expect(parseFillWeekArgs(JSON.stringify({ ...week, to: '2026-11-01' }))).toBeUndefined();
    expect(parseFillWeekArgs('nope')).toBeUndefined();
  });
});

describe('look_at_photos (spec 0067, REQ-013: photos only on request)', () => {
  const A = '11111111-2222-4333-8444-555555555555';
  const B = '11111111-2222-4333-8444-666666666666';
  it('one kind and up to 6 uuids, each once', () => {
    const ids = [
      A,
      B,
      A,
      'nope',
      ...Array.from({ length: 8 }, (_, n) => `11111111-2222-4333-8444-00000000000${n}`),
    ];
    const parsed = parsePhotoArgs(JSON.stringify({ kind: 'recipe', ids }));
    expect(parsed?.kind).toBe('recipe');
    expect(parsed?.ids).toHaveLength(AGENT_PROPOSAL_LIMITS.photos);
    expect(parsed?.ids.slice(0, 2)).toEqual([A, B]);
  });

  it('invalid input: an unknown kind or no ids', () => {
    expect(parsePhotoArgs(JSON.stringify({ kind: 'households', ids: [A] }))).toBeUndefined();
    expect(parsePhotoArgs(JSON.stringify({ kind: 'recipe', ids: ['x'] }))).toBeUndefined();
  });
});
