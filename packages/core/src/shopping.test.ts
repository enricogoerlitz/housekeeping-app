import { describe, expect, it } from 'vitest';

import {
  addContribution,
  contributionsFromEntry,
  groupItems,
  listProgress,
  summarizeItem,
} from './shopping';
import { articlesById, halloumiPfanne, mangoCurry } from './test-fixtures';
import type {
  Area,
  Article,
  Id,
  MealPlanEntry,
  ShoppingContribution,
  ShoppingItem,
  Store,
} from './types';

const manual = (id: string, rest: Partial<ShoppingContribution> = {}): ShoppingContribution => ({
  id,
  source: { kind: 'manual' },
  ...rest,
});

function item(
  partial: Partial<ShoppingItem> & Pick<ShoppingItem, 'id' | 'articleId'>,
): ShoppingItem {
  return {
    contributions: [],
    checked: false,
    createdAt: '2026-11-20T08:00:00.000Z',
    ...partial,
  };
}

function curryEntry(partial: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id: 'plan-curry',
    date: '2026-11-18',
    slotId: 'slot-abend',
    kind: 'recipe',
    recipeId: mangoCurry.id,
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [
      { variantId: 'v-tofu', portions: 1 },
      { variantId: 'v-haehnchen', portions: 1 },
    ],
    sort: 0,
    ...partial,
  };
}

describe('contributionsFromEntry', () => {
  it('AC-031: lists Mango and Kokosmilch for the list, Reis and Kreuzkümmel as pantry', () => {
    const rows = contributionsFromEntry(curryEntry(), mangoCurry, articlesById, 'Mi');
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Mango']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.isPantry).toBe(false);
    expect(byName['Reis']?.isPantry).toBe(true);
    expect(byName['Kreuzkümmel']?.isPantry).toBe(true);
    expect(byName['Salz']).toBeUndefined();
  });

  it('scales base ingredients with the entry and variant ingredients with their portions', () => {
    const rows = contributionsFromEntry(curryEntry(), mangoCurry, articlesById, 'Mi');
    const amounts = rows.map((row) => [row.name, row.count, row.qty, row.unit]);
    expect(amounts).toEqual([
      ['Kokosmilch', undefined, 200, 'ml'],
      ['Mango', 1, undefined, undefined],
      ['Reis', 1, undefined, undefined],
      ['Kreuzkümmel', 1, undefined, undefined],
      ['Räuchertofu', undefined, 100, 'g'],
      ['Hähnchenbrust', undefined, 100, 'g'],
    ]);
    expect(rows[0]).toMatchObject({
      articleId: 'art-kokosmilch',
      recipeId: mangoCurry.id,
      entryId: 'plan-curry',
      label: 'Mango-Curry (Mi)',
    });
  });

  it('AC-020: 6 portions need 600 ml Kokosmilch and round pieces up (2 Mangos)', () => {
    const entry = curryEntry({ portions: 6, variants: [{ variantId: 'v-tofu', portions: 6 }] });
    const rows = contributionsFromEntry(entry, mangoCurry, articlesById, 'Mi');
    expect(rows.find((row) => row.name === 'Kokosmilch')?.qty).toBe(600);
    expect(rows.find((row) => row.name === 'Mango')?.count).toBe(2);
    expect(rows.find((row) => row.name === 'Hähnchenbrust')).toBeUndefined();
  });

  it('does not add a whole piece for floating point noise', () => {
    // 2.7 × 10 / 9 is 3.0000000000000004 in floating point.
    const recipe = {
      ...halloumiPfanne,
      servings: 9,
      ingredients: [
        {
          id: 'x',
          articleId: 'art-mango',
          name: 'Mango',
          amount: { text: '2,7', qty: 2.7 },
          shoppingRule: 'recipeAmount' as const,
        },
      ],
    };
    const entry = curryEntry({ portions: 10, variants: [] });
    expect(contributionsFromEntry(entry, recipe, articlesById, 'Mi')[0]?.count).toBe(3);
  });

  it('uses the default variant for entries without variant rows', () => {
    const entry = curryEntry({ portions: 4, variants: [] });
    const names = contributionsFromEntry(entry, mangoCurry, articlesById, 'Mi').map((r) => r.name);
    expect(names).toContain('Räuchertofu');
    expect(names).not.toContain('Hähnchenbrust');
  });

  it('carries the default shopping note of an ingredient onto the contribution', () => {
    const entry = curryEntry({ recipeId: halloumiPfanne.id, variants: [] });
    const rows = contributionsFromEntry(entry, halloumiPfanne, articlesById, 'Do');
    expect(rows.find((row) => row.name === 'Frischkäse')?.note).toBe('Philadelphia');
    expect(rows.find((row) => row.name === 'Halloumi')).not.toHaveProperty('note');
  });

  it('counts free-text ingredients and amounts that are not numbers as one piece', () => {
    const recipe = {
      ...halloumiPfanne,
      ingredients: [
        {
          id: 'x',
          name: 'Kräuter',
          amount: { text: 'etwas' },
          shoppingRule: 'recipeAmount' as const,
        },
      ],
    };
    const [row] = contributionsFromEntry(curryEntry({ variants: [] }), recipe, articlesById, 'Do');
    expect(row).toMatchObject({ name: 'Kräuter', count: 1, isPantry: false });
    expect(row).not.toHaveProperty('articleId');
  });
});

describe('summarizeItem', () => {
  it('AC-029: two "Milch" contributions add up to 2×', () => {
    const milk = item({
      id: 'i',
      articleId: 'art-milch',
      contributions: [manual('a', { count: 1 }), manual('b', { count: 1 })],
    });
    expect(summarizeItem(milk).amount).toBe('2×');
  });

  it('adds kg to g and shows 1000 g and more in kg', () => {
    const potatoes = item({
      id: 'i',
      articleId: 'x',
      contributions: [manual('a', { qty: 500, unit: 'g' }), manual('b', { qty: 1, unit: 'kg' })],
    });
    expect(summarizeItem(potatoes).amount).toBe('1,5 kg');
    const milk = item({
      id: 'j',
      articleId: 'x',
      contributions: [manual('a', { qty: 200, unit: 'ml' }), manual('b', { qty: 0.4, unit: 'l' })],
    });
    expect(summarizeItem(milk).amount).toBe('600 ml');
  });

  it('puts counts first, then one part per unit; quantities without unit are pieces', () => {
    const mixed = item({
      id: 'i',
      articleId: 'x',
      contributions: [
        manual('a', { qty: 500, unit: 'g' }),
        manual('b', { count: 2 }),
        manual('c', { qty: 1 }),
        manual('d', { qty: 2, unit: 'Dose' }),
      ],
    });
    expect(summarizeItem(mixed).amount).toBe('3× · 500 g · 2 Dosen');
  });

  it('collects distinct notes and sources and flags recurring items', () => {
    const cheese = item({
      id: 'i',
      articleId: 'x',
      contributions: [
        manual('a', { note: 'Gouda' }),
        manual('b', { note: 'Gouda' }),
        manual('c', { note: '' }),
        { id: 'd', source: { kind: 'recurring' } },
        {
          id: 'e',
          source: { kind: 'recipe', recipeId: 'r', label: 'Lasagne (Mo)' },
          note: 'gerieben',
        },
      ],
    });
    expect(summarizeItem(cheese)).toEqual({
      amount: '',
      notes: ['Gouda', 'gerieben'],
      sources: ['von Hand', 'Dauerposten', 'Lasagne (Mo)'],
      isRecurring: true,
    });
  });
});

describe('addContribution', () => {
  const now = '2026-11-20T09:00:00.000Z';

  it('AC-029: appends to an open item of the same article instead of a second row', () => {
    const items = [item({ id: 'i1', articleId: 'art-milch', contributions: [manual('a')] })];
    const next = addContribution(items, 'art-milch', manual('b'), 'new', now);
    expect(next).toHaveLength(1);
    expect(next[0]?.contributions.map((c) => c.id)).toEqual(['a', 'b']);
    expect(items[0]?.contributions).toHaveLength(1);
  });

  it('reopens a checked item with only the new contribution', () => {
    const items = [
      item({
        id: 'i1',
        articleId: 'art-milch',
        contributions: [manual('a')],
        checked: true,
        checkedAt: now,
        checkedBy: 'm',
        notAvailable: true,
      }),
    ];
    const [reopened] = addContribution(items, 'art-milch', manual('b'), 'new', now);
    expect(reopened).toEqual({
      id: 'i1',
      articleId: 'art-milch',
      contributions: [manual('b')],
      checked: false,
      createdAt: '2026-11-20T08:00:00.000Z',
    });
  });

  it('creates a new item for a new article', () => {
    const items = [item({ id: 'i1', articleId: 'art-milch' })];
    const next = addContribution(items, 'art-tee', manual('b'), 'new', now);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({
      id: 'new',
      articleId: 'art-tee',
      contributions: [manual('b')],
      checked: false,
      createdAt: now,
    });
  });
});

describe('groupItems', () => {
  const areas: Area[] = [
    { id: 'area-obst', name: 'Obst & Gemüse', sort: 0 },
    { id: 'area-kuehl', name: 'Kühlregal & Molkerei', sort: 1 },
    { id: 'area-getraenke', name: 'Getränke', sort: 2 },
    { id: 'area-haushalt', name: 'Haushalt & Reinigung', sort: 3 },
    { id: 'area-tier', name: 'Tierbedarf', sort: 4 },
  ];
  const localArticles: Record<Id, Article> = {
    ...articlesById,
    'art-wasser': {
      id: 'art-wasser',
      name: 'Wasser',
      synonyms: [],
      areaId: 'area-getraenke',
      diet: 'vegan',
      isPantry: false,
    },
    'art-futter': {
      id: 'art-futter',
      name: 'Katzenfutter',
      synonyms: [],
      areaId: 'area-tier',
      diet: 'meat',
      isPantry: false,
    },
  };
  const items = [
    item({ id: 'spuel', articleId: 'art-spuelmittel', createdAt: '2026-11-20T08:00:00.000Z' }),
    item({ id: 'milch', articleId: 'art-milch', createdAt: '2026-11-20T08:02:00.000Z' }),
    item({ id: 'wasser', articleId: 'art-wasser', createdAt: '2026-11-20T08:03:00.000Z' }),
    item({ id: 'mango', articleId: 'art-mango', createdAt: '2026-11-20T08:04:00.000Z' }),
    item({ id: 'tofu', articleId: 'art-tofu', createdAt: '2026-11-20T08:01:00.000Z' }),
    item({ id: 'futter', articleId: 'art-futter', createdAt: '2026-11-20T08:05:00.000Z' }),
    item({ id: 'weg', articleId: 'art-unbekannt', createdAt: '2026-11-20T08:06:00.000Z' }),
  ];
  const rewe: Store = {
    id: 'store-rewe',
    name: 'Rewe Südstadt',
    areaOrder: ['area-kuehl', 'area-obst'],
    hiddenAreaIds: ['area-tier'],
  };
  const summary = (groups: ReturnType<typeof groupItems>) =>
    groups.map((group) => [group.title, group.items.map((i) => i.id)]);

  it('AC-032: follows the store walking order and ends with "Ohne Bereich"', () => {
    expect(summary(groupItems(items, localArticles, areas, rewe))).toEqual([
      ['Kühlregal & Molkerei', ['tofu', 'milch']],
      ['Obst & Gemüse', ['mango']],
      ['Getränke', ['wasser']],
      ['Ohne Bereich', ['spuel', 'weg']],
      ['Woanders kaufen', ['futter']],
    ]);
  });

  it('AC-033: an item moves from "Ohne Bereich" to the area assigned to its article', () => {
    const spuelmittel = localArticles['art-spuelmittel'];
    if (!spuelmittel) throw new Error('fixture missing');
    const assigned = {
      ...localArticles,
      'art-spuelmittel': { ...spuelmittel, areaId: 'area-haushalt' },
    };
    const groups = groupItems(items, assigned, areas, rewe);
    expect(
      groups.find((group) => group.key === 'area:area-haushalt')?.items.map((i) => i.id),
    ).toEqual(['spuel']);
    expect(groups.find((group) => group.key === 'none')?.items.map((i) => i.id)).toEqual(['weg']);
  });

  it('AC-034: "Getränke" moved to the front of the walking order comes first', () => {
    const reordered = { ...rewe, areaOrder: ['area-getraenke', 'area-kuehl', 'area-obst'] };
    expect(groupItems(items, localArticles, areas, reordered)[0]?.title).toBe('Getränke');
  });

  it('uses the default area order without a store and hides nothing', () => {
    expect(summary(groupItems(items, localArticles, areas))).toEqual([
      ['Obst & Gemüse', ['mango']],
      ['Kühlregal & Molkerei', ['tofu', 'milch']],
      ['Getränke', ['wasser']],
      ['Tierbedarf', ['futter']],
      ['Ohne Bereich', ['spuel', 'weg']],
    ]);
  });

  it('ignores unknown and duplicate area ids in the walking order', () => {
    const odd = { ...rewe, areaOrder: ['area-weg', 'area-obst', 'area-obst'], hiddenAreaIds: [] };
    expect(groupItems(items, localArticles, areas, odd).map((group) => group.key)).toEqual([
      'area:area-obst',
      'area:area-kuehl',
      'area:area-getraenke',
      'area:area-tier',
      'none',
    ]);
  });

  it('returns no groups for no items', () => {
    expect(groupItems([], localArticles, areas, rewe)).toEqual([]);
  });
});

describe('listProgress', () => {
  it('AC-032: counts checked of all items', () => {
    expect(
      listProgress([
        item({ id: 'a', articleId: 'x', checked: true }),
        item({ id: 'b', articleId: 'y' }),
        item({ id: 'c', articleId: 'z' }),
      ]),
    ).toEqual({ done: 1, total: 3 });
    expect(listProgress([])).toEqual({ done: 0, total: 0 });
  });
});
