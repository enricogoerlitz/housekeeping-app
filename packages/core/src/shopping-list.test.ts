import { describe, expect, it } from 'vitest';

import {
  activeShopper,
  adjustItemCount,
  applyContributionChanges,
  itemCount,
  listHeadline,
  MAX_ITEM_COUNT,
  originSummary,
  recipeSource,
  resolveShoppingStore,
  SHOPPER_ACTIVE_MINUTES,
} from './shopping-list';
import { originLabel } from './shopping';
import { enrico, makeRecipe, nadja, vera } from './test-fixtures';
import type { Id, Recipe, ShoppingContribution, ShoppingItem, Store } from './types';

const manual = (id: Id, count?: number): ShoppingContribution => ({
  id,
  source: { kind: 'manual' },
  ...(count === undefined ? {} : { count }),
});

const fromPlan = (
  id: Id,
  title: string,
  day: string,
  amount: Partial<ShoppingContribution> = { count: 1 },
): ShoppingContribution => ({
  id,
  source: {
    kind: 'recipe',
    recipeId: `rec-${title.toLowerCase()}`,
    entryId: `plan-${title.toLowerCase()}`,
    label: `${title} (${day})`,
  },
  ...amount,
});

function item(
  contributions: ShoppingContribution[],
  rest: Partial<ShoppingItem> = {},
): ShoppingItem {
  return {
    id: 'item',
    listId: 'list',
    articleId: 'art-zwiebeln',
    contributions,
    checked: false,
    createdAt: '2026-11-20T08:00:00.000Z',
    ...rest,
  };
}

const NEW_ID = 'contrib-new';

describe('recipeSource and originLabel', () => {
  const curry = { id: 'rec-curry', title: 'Mango-Curry' };

  it('AC-055: a contribution from a calendar entry carries the weekday: "Mango-Curry (Sa)"', () => {
    const source = recipeSource(curry, { id: 'plan-curry', date: '2026-11-21' });
    expect(source).toEqual({
      kind: 'recipe',
      recipeId: 'rec-curry',
      entryId: 'plan-curry',
      label: 'Mango-Curry (Sa)',
    });
    expect(originLabel(source)).toBe('Mango-Curry (Sa)');
  });

  it('AC-053, AC-058: from the recipe page or "Rezept wählen …" it has no day: "Mango-Curry"', () => {
    const source = recipeSource(curry);
    expect(source).toEqual({ kind: 'recipe', recipeId: 'rec-curry', label: 'Mango-Curry' });
    expect(originLabel(source)).toBe('Mango-Curry');
  });

  it('an entry under "Vorgemerkt" is marked as such', () => {
    expect(recipeSource(curry, { id: 'plan-curry', date: null }).label).toBe(
      'Mango-Curry (vorgemerkt)',
    );
  });

  it('AC-014: manual contributions read "von Hand"', () => {
    expect(originLabel({ kind: 'manual' })).toBe('von Hand');
    expect(originLabel({ kind: 'recurring' })).toBe('Dauerposten');
  });
});

describe('originSummary', () => {
  it('AC-014: "Lasagne (Fr): 1× · von Hand: 1×"', () => {
    expect(originSummary(item([fromPlan('a', 'Lasagne', 'Fr'), manual('b', 1)]))).toBe(
      'Lasagne (Fr): 1× · von Hand: 1×',
    );
  });

  it('AC-059: keeps the order in which the contributions came: "von Hand: 1× · Mango-Curry: 1×"', () => {
    const direct: ShoppingContribution = {
      id: 'b',
      source: recipeSource({ id: 'rec-curry', title: 'Mango-Curry' }),
      count: 1,
    };
    expect(originSummary(item([manual('a', 1), direct]))).toBe('von Hand: 1× · Mango-Curry: 1×');
  });

  it('AC-001: two manual contributions of a merged item read as one "von Hand: 2×"', () => {
    expect(originSummary(item([manual('a', 1), manual('b', 1)]))).toBe('von Hand: 2×');
  });

  it('AC-008: quantities read with their unit; a contribution without amount reads only its origin', () => {
    expect(
      originSummary(
        item([fromPlan('a', 'Kürbissuppe', 'Sa', { qty: 500, unit: 'g' }), manual('b')]),
      ),
    ).toBe('Kürbissuppe (Sa): 500 g · von Hand');
  });
});

describe('itemCount', () => {
  it('AC-008: sums pure counts', () => {
    expect(itemCount(item([fromPlan('a', 'Lasagne', 'Fr', { count: 2 }), manual('b', 1)]))).toBe(3);
  });

  it('AC-018: an item with a quantity has no count for + and −', () => {
    expect(itemCount(item([fromPlan('a', 'Kürbissuppe', 'Sa', { qty: 500, unit: 'g' })]))).toBe(
      undefined,
    );
    expect(
      itemCount(
        item([fromPlan('a', 'Kürbissuppe', 'Sa', { qty: 500, unit: 'g' }), manual('b', 1)]),
      ),
    ).toBe(undefined);
  });

  it('an item without any amount has no count', () => {
    expect(itemCount(item([manual('a')]))).toBe(undefined);
  });
});

describe('adjustItemCount', () => {
  it('AC-014: + on "Lasagne (Fr): 1×" adds a manual contribution', () => {
    const zwiebeln = item([fromPlan('a', 'Lasagne', 'Fr')]);
    const result = adjustItemCount(zwiebeln, 1, NEW_ID);
    expect(result).toEqual({
      count: 2,
      removesItem: false,
      changes: [
        { type: 'insert', contribution: { id: NEW_ID, source: { kind: 'manual' }, count: 1 } },
      ],
    });
    const after = applyContributionChanges(zwiebeln, result?.changes ?? []);
    expect(originSummary(after)).toBe('Lasagne (Fr): 1× · von Hand: 1×');
  });

  it('AC-014: + raises an existing manual contribution', () => {
    const milch = item([manual('a', 1)]);
    expect(adjustItemCount(milch, 1, NEW_ID)).toEqual({
      count: 2,
      removesItem: false,
      changes: [{ type: 'update', contributionId: 'a', count: 2 }],
    });
  });

  it('AC-015: − takes the manual share first, then on 1× removes the item', () => {
    const zwiebeln = item([fromPlan('a', 'Lasagne', 'Fr'), manual('b', 1)]);
    const first = adjustItemCount(zwiebeln, -1, NEW_ID);
    expect(first).toEqual({
      count: 1,
      removesItem: false,
      changes: [{ type: 'delete', contributionId: 'b' }],
    });
    const after = applyContributionChanges(zwiebeln, first?.changes ?? []);
    expect(originSummary(after)).toBe('Lasagne (Fr): 1×');

    expect(adjustItemCount(after, -1, NEW_ID)).toEqual({
      count: 0,
      removesItem: true,
      changes: [],
    });
  });

  it('AC-015: − lowers a manual share above 1 instead of removing it', () => {
    expect(
      adjustItemCount(item([fromPlan('a', 'Lasagne', 'Fr'), manual('b', 2)]), -1, NEW_ID),
    ).toEqual({
      count: 2,
      removesItem: false,
      changes: [{ type: 'update', contributionId: 'b', count: 1 }],
    });
  });

  it('AC-016: without a manual share, − takes the most recent calendar contribution', () => {
    const eier = item([fromPlan('a', 'Kuchen', 'Mi'), fromPlan('b', 'Pfannkuchen', 'Sa')]);
    const result = adjustItemCount(eier, -1, NEW_ID);
    expect(result?.changes).toEqual([{ type: 'delete', contributionId: 'b' }]);
    expect(originSummary(applyContributionChanges(eier, result?.changes ?? []))).toBe(
      'Kuchen (Mi): 1×',
    );
  });

  it('AC-016: lowers the most recent calendar contribution when it holds more than 1', () => {
    const eier = item([
      fromPlan('a', 'Kuchen', 'Mi'),
      fromPlan('b', 'Pfannkuchen', 'Sa', { count: 3 }),
    ]);
    expect(adjustItemCount(eier, -1, NEW_ID)?.changes).toEqual([
      { type: 'update', contributionId: 'b', count: 2 },
    ]);
  });

  it('AC-018: an item with a quantity cannot be changed with + and −', () => {
    const moehren = item([fromPlan('a', 'Kürbissuppe', 'Sa', { qty: 500, unit: 'g' })]);
    expect(adjustItemCount(moehren, 1, NEW_ID)).toBeNull();
    expect(adjustItemCount(moehren, -1, NEW_ID)).toBeNull();
  });

  it(`stops at ${MAX_ITEM_COUNT}×`, () => {
    const full = item([manual('a', MAX_ITEM_COUNT)]);
    expect(adjustItemCount(full, 1, NEW_ID)).toBeNull();
    expect(adjustItemCount(full, -1, NEW_ID)?.count).toBe(MAX_ITEM_COUNT - 1);
  });

  it('an item without contributions cannot be changed', () => {
    expect(adjustItemCount(item([]), 1, NEW_ID)).toBeNull();
    expect(adjustItemCount(item([]), -1, NEW_ID)).toBeNull();
  });

  describe('scope "manual" (Offene Frage 4b: ± in "Posten bearbeiten")', () => {
    it('+ adds a manual count also to an item with a quantity', () => {
      const moehren = item([fromPlan('a', 'Kürbissuppe', 'Sa', { qty: 500, unit: 'g' })]);
      const result = adjustItemCount(moehren, 1, NEW_ID, 'manual');
      expect(result).toEqual({
        count: 1,
        removesItem: false,
        changes: [
          { type: 'insert', contribution: { id: NEW_ID, source: { kind: 'manual' }, count: 1 } },
        ],
      });
      expect(originSummary(applyContributionChanges(moehren, result?.changes ?? []))).toBe(
        'Kürbissuppe (Sa): 500 g · von Hand: 1×',
      );
    });

    it('− only lowers the manual share and never touches calendar contributions', () => {
      const milch = item([fromPlan('a', 'Pfannkuchen', 'Sa'), manual('b', 1)]);
      expect(adjustItemCount(milch, -1, NEW_ID, 'manual')).toEqual({
        count: 0,
        removesItem: false,
        changes: [{ type: 'delete', contributionId: 'b' }],
      });
      expect(
        adjustItemCount(item([fromPlan('a', 'Pfannkuchen', 'Sa')]), -1, NEW_ID, 'manual'),
      ).toBeNull();
    });

    it('count is the manual share, not the whole item', () => {
      const milch = item([fromPlan('a', 'Pfannkuchen', 'Sa'), manual('b', 1)]);
      expect(adjustItemCount(milch, 1, NEW_ID, 'manual')).toEqual({
        count: 2,
        removesItem: false,
        changes: [{ type: 'update', contributionId: 'b', count: 2 }],
      });
    });

    it('− on the only contribution removes the item', () => {
      expect(adjustItemCount(item([manual('a', 1)]), -1, NEW_ID, 'manual')).toEqual({
        count: 0,
        removesItem: true,
        changes: [],
      });
    });
  });
});

describe('applyContributionChanges', () => {
  it('applies inserts, updates and deletes and leaves the input untouched', () => {
    const before = item([manual('a', 1), manual('b', 2)]);
    const after = applyContributionChanges(before, [
      { type: 'update', contributionId: 'a', count: 5 },
      { type: 'delete', contributionId: 'b' },
      { type: 'insert', contribution: manual('c', 1) },
    ]);
    expect(after.contributions).toEqual([manual('a', 5), manual('c', 1)]);
    expect(before.contributions).toEqual([manual('a', 1), manual('b', 2)]);
  });
});

describe('listHeadline', () => {
  const recipesById: Record<Id, Recipe> = {
    'rec-lasagne': makeRecipe({ id: 'rec-lasagne', title: 'Lasagne' }),
    'rec-kürbissuppe': makeRecipe({ id: 'rec-kürbissuppe', title: 'Kürbissuppe' }),
  };

  it('AC-008: "3 offen · für Lasagne, Kürbissuppe"', () => {
    const items = [
      item([fromPlan('a', 'Lasagne', 'Fr', { count: 2 })], { id: 'zwiebeln' }),
      item([fromPlan('b', 'Kürbissuppe', 'Sa', { qty: 500, unit: 'g' })], { id: 'moehren' }),
      item([manual('c', 2)], { id: 'milch' }),
      item([fromPlan('d', 'Lasagne', 'Fr')], { id: 'tomaten' }),
      item([fromPlan('e', 'Shakshuka', 'Do')], { id: 'eier', checked: true }),
    ];
    expect(listHeadline(items, recipesById)).toEqual({
      open: 4,
      recipeTitles: ['Lasagne', 'Kürbissuppe'],
      label: '4 offen · für Lasagne, Kürbissuppe',
    });
  });

  it('without recipes it only counts; an unknown recipe falls back to its stored label', () => {
    expect(listHeadline([item([manual('a', 1)])], recipesById).label).toBe('1 offen');
    expect(listHeadline([item([fromPlan('a', 'Paella', 'Mo')])], {}).recipeTitles).toEqual([
      'Paella (Mo)',
    ]);
  });
});

describe('activeShopper', () => {
  const NOW = '2026-11-20T18:00:00.000Z';
  const members = [enrico, nadja, vera];
  const open = (id: Id) => item([manual(`c-${id}`, 1)], { id });
  const checkedBy = (id: Id, memberId: Id, at: string) =>
    item([manual(`c-${id}`, 1)], { id, checked: true, checkedBy: memberId, checkedAt: at });

  it('AC-011: "Nadja kauft gerade ein · 1 von 3" right after her first check', () => {
    const items = [
      checkedBy('milch', nadja.id, '2026-11-20T17:59:30.000Z'),
      open('brot'),
      open('eier'),
    ];
    expect(activeShopper(items, members, enrico.id, NOW)).toEqual({
      member: nadja,
      done: 1,
      total: 3,
      label: 'Nadja kauft gerade ein · 1 von 3',
    });
  });

  it(`AC-012: disappears ${SHOPPER_ACTIVE_MINUTES} minutes after her last check`, () => {
    const justInside = [checkedBy('milch', nadja.id, '2026-11-20T17:45:00.001Z'), open('brot')];
    const atLimit = [checkedBy('milch', nadja.id, '2026-11-20T17:45:00.000Z'), open('brot')];
    expect(activeShopper(justInside, members, enrico.id, NOW)?.member).toBe(nadja);
    expect(activeShopper(atLimit, members, enrico.id, NOW)).toBeUndefined();
  });

  it('AC-012: disappears after "Fertig", which removes the checked items', () => {
    expect(activeShopper([open('brot'), open('eier')], members, enrico.id, NOW)).toBeUndefined();
  });

  it('never shows the current member', () => {
    const items = [checkedBy('milch', enrico.id, '2026-11-20T17:59:00.000Z'), open('brot')];
    expect(activeShopper(items, members, enrico.id, NOW)).toBeUndefined();
  });

  it('shows the member who checked most recently when two others are shopping', () => {
    const items = [
      checkedBy('milch', nadja.id, '2026-11-20T17:50:00.000Z'),
      checkedBy('brot', vera.id, '2026-11-20T17:55:00.000Z'),
      open('eier'),
    ];
    expect(activeShopper(items, members, enrico.id, NOW)?.label).toBe(
      'Vera kauft gerade ein · 2 von 3',
    );
  });

  it('ignores unknown members, missing or invalid timestamps and unchecked items', () => {
    const items = [
      checkedBy('a', 'm-gone', '2026-11-20T17:59:00.000Z'),
      checkedBy('b', nadja.id, 'kaputt'),
      item([manual('c', 1)], { id: 'c', checked: true, checkedBy: nadja.id }),
      item([manual('d', 1)], {
        id: 'd',
        checkedBy: nadja.id,
        checkedAt: '2026-11-20T17:59:00.000Z',
      }),
    ];
    expect(activeShopper(items, members, enrico.id, NOW)).toBeUndefined();
  });

  it('an invalid "now" shows nothing', () => {
    const items = [checkedBy('milch', nadja.id, '2026-11-20T17:59:30.000Z')];
    expect(activeShopper(items, members, enrico.id, 'kaputt')).toBeUndefined();
  });
});

describe('resolveShoppingStore', () => {
  const store = (id: Id, name: string): Store => ({ id, name, areaOrder: [], hiddenAreaIds: [] });
  const rewe = store('store-rewe', 'Rewe Südstadt');
  const aldi = store('store-aldi', 'Aldi Nord');
  const stores = [aldi, rewe];

  it('AC-040, AC-007: never chosen on this device → the default store', () => {
    expect(resolveShoppingStore(stores, undefined, rewe.id)).toBe(rewe);
  });

  it('AC-042: the store chosen on this device wins over the default', () => {
    expect(resolveShoppingStore(stores, aldi.id, rewe.id)).toBe(aldi);
  });

  it('AC-041: "Ohne Markt – nach Bereichen" chosen on this device stays without store', () => {
    expect(resolveShoppingStore(stores, null, rewe.id)).toBeUndefined();
  });

  it('AC-043: the chosen store was deleted and there is no default → without store', () => {
    expect(resolveShoppingStore([rewe], aldi.id, undefined)).toBeUndefined();
  });

  it('AC-043: the chosen store was deleted → the default store', () => {
    expect(resolveShoppingStore([rewe], aldi.id, rewe.id)).toBe(rewe);
  });

  it('a default store that no longer exists → without store', () => {
    expect(resolveShoppingStore([aldi], undefined, rewe.id)).toBeUndefined();
  });
});
