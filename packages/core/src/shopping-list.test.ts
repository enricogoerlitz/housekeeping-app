import { describe, expect, it } from 'vitest';

import {
  activeShopper,
  adjustItemCount,
  applyContributionChanges,
  clearListQuestion,
  dishLabel,
  itemCount,
  listHeadline,
  manualAmountText,
  noteChangeHint,
  originRows,
  MAX_ITEM_COUNT,
  recipeSource,
  relabelForDay,
  resolveShoppingStore,
  SHOPPER_ACTIVE_MINUTES,
} from './shopping-list';
import { originLabel } from './shopping';
import { enrico, makeRecipe, nadja, originSummary, vera } from './test-fixtures';
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

  it('AC-025, AC-027 (spec 0009): a recipe of a collection reads "Grillabend · Kartoffelsalat"', () => {
    const grillabend = { id: 'col-grillabend', title: 'Grillabend' };
    const salat = { title: 'Kartoffelsalat' };
    expect(recipeSource(grillabend, undefined, salat)).toEqual({
      kind: 'recipe',
      recipeId: 'col-grillabend',
      label: 'Grillabend · Kartoffelsalat',
    });
    expect(recipeSource(grillabend, { id: 'plan-grill', date: '2026-11-21' }, salat)).toEqual({
      kind: 'recipe',
      recipeId: 'col-grillabend',
      entryId: 'plan-grill',
      label: 'Grillabend · Kartoffelsalat (Sa)',
    });
  });

  it('an entry under "Vorgemerkt" is marked as such', () => {
    expect(recipeSource(curry, { id: 'plan-curry', date: null }).label).toBe(
      'Mango-Curry (vorgemerkt)',
    );
  });

  it('AC-014: manual contributions read "von Hand"', () => {
    expect(originLabel({ kind: 'manual' })).toBe('von Hand');
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

describe('listHeadline (spec 0025, REQ-005)', () => {
  const recipesById: Record<Id, Recipe> = {
    'rec-lasagne': makeRecipe({ id: 'rec-lasagne', title: 'Lasagne' }),
    'rec-grillabend': makeRecipe({ id: 'rec-grillabend', title: 'Grillabend' }),
    'rec-mango-curry': makeRecipe({ id: 'rec-mango-curry', title: 'Mango-Curry' }),
    'rec-shakshuka': makeRecipe({ id: 'rec-shakshuka', title: 'Shakshuka' }),
  };
  const at = (minute: number) => `2026-11-22T08:${String(minute).padStart(2, '0')}:00.000Z`;

  it('AC-017: "14 offen · aus 4 Gerichten", the dishes in the order they were added', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, index) =>
        item([fromPlan(`g${index}`, 'Grillabend', 'Sa')], { id: `g${index}`, createdAt: at(1) }),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        item([fromPlan(`l${index}`, 'Lasagne', 'Mo')], { id: `l${index}`, createdAt: at(2) }),
      ),
      item([fromPlan('m', 'Mango-Curry', 'Mi')], { id: 'm', createdAt: at(3) }),
      item([fromPlan('s', 'Shakshuka', 'So'), fromPlan('s2', 'Lasagne', 'Mo')], {
        id: 's',
        createdAt: at(4),
      }),
      item([manual('h', 1)], { id: 'h', createdAt: at(5) }),
      item([fromPlan('x', 'Lasagne', 'Mo')], { id: 'x', checked: true, createdAt: at(0) }),
    ];
    const headline = listHeadline(items, recipesById);
    expect(headline.label).toBe('14 offen · aus 4 Gerichten');
    expect(headline.dishes.map((dish) => dishLabel(dish))).toEqual([
      'Grillabend · 6 Posten',
      'Lasagne · 6 Posten',
      'Mango-Curry · 1 Posten',
      'Shakshuka · 1 Posten',
    ]);
  });

  it('AC-018: "3 offen · aus 1 Gericht"; only "von Hand" reads "3 offen" without dishes', () => {
    const lasagne = [1, 2, 3].map((n) =>
      item([fromPlan(`l${n}`, 'Lasagne', 'Mo')], { id: `${n}` }),
    );
    expect(listHeadline(lasagne, recipesById).label).toBe('3 offen · aus 1 Gericht');
    const byHand = [1, 2, 3].map((n) => item([manual(`h${n}`, 1)], { id: `${n}` }));
    expect(listHeadline(byHand, recipesById)).toEqual({ open: 3, dishes: [], label: '3 offen' });
  });

  it('a dish that no longer exists is named by its stored label without the day', () => {
    const dishes = listHeadline([item([fromPlan('a', 'Paella', 'Mo')])], {}).dishes;
    expect(dishes.map((dish) => dish.title)).toEqual(['Paella']);
  });
});

describe('clearListQuestion (spec 0025, AC-019)', () => {
  it('AC-019: names open and checked items apart', () => {
    expect(clearListQuestion(14, 3)).toBe(
      '14 offene und 3 erledigte Posten werden entfernt, auch die aus dem Kalender.',
    );
    expect(clearListQuestion(1, 0)).toBe(
      '1 offener Posten wird entfernt, auch wenn er aus dem Kalender kommt.',
    );
  });

  it('AC-019: only checked or only open items', () => {
    expect(clearListQuestion(0, 2)).toBe('2 erledigte Posten werden entfernt.');
    expect(clearListQuestion(0, 1)).toBe('1 erledigter Posten wird entfernt.');
    expect(clearListQuestion(5, 0)).toBe(
      '5 offene Posten werden entfernt, auch die aus dem Kalender.',
    );
    expect(clearListQuestion(1, 1)).toBe(
      '1 offener und 1 erledigter Posten werden entfernt, auch die aus dem Kalender.',
    );
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

  it('AC-025: a check made on "Liste" is no "kauft gerade ein"', () => {
    const onList = {
      ...checkedBy('milch', nadja.id, '2026-11-20T17:59:30.000Z'),
      checkedOnList: true,
    };
    expect(activeShopper([onList, open('brot')], members, enrico.id, NOW)).toBeUndefined();
  });
});

describe('resolveShoppingStore', () => {
  const store = (id: Id, name: string): Store => ({ id, name, areaOrder: [], hiddenAreaIds: [] });
  const rewe = store('store-rewe', 'Rewe Südstadt');
  const aldi = store('store-aldi', 'Aldi Nord');
  const stores = [aldi, rewe];

  it('AC-040: never chosen on this device → the default store', () => {
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

describe('Herkunft after moving the plan entry (spec 0016)', () => {
  it('AC-017: "Mango-Curry (Sa)" moved to Sunday reads "Mango-Curry (So)"', () => {
    expect(relabelForDay('Mango-Curry (Sa)', '2026-11-22')).toBe('Mango-Curry (So)');
  });

  it('AC-017: a collection keeps both titles; parked, the day reads "vorgemerkt"', () => {
    expect(relabelForDay('Grillabend · Kartoffelsalat (Sa)', null)).toBe(
      'Grillabend · Kartoffelsalat (vorgemerkt)',
    );
    expect(relabelForDay('Dal (Linsen) (vorgemerkt)', '2026-11-23')).toBe('Dal (Linsen) (Mo)');
  });

  it('a label without a day stays as it is', () => {
    expect(relabelForDay('Mango-Curry', '2026-11-22')).toBe('Mango-Curry');
  });
});

describe('manualAmountText (spec 0025, AC-010)', () => {
  it('AC-010: the field "Von Hand" starts with the manual share: "500 g", "2", or empty', () => {
    const moehren = item([fromPlan('l', 'Lasagne', 'Mo'), { ...manual('h'), qty: 500, unit: 'g' }]);
    expect(manualAmountText(moehren)).toBe('500 g');
    expect(manualAmountText(item([manual('a', 2)]))).toBe('2');
    expect(manualAmountText(item([fromPlan('l', 'Lasagne', 'Mo')]))).toBe('');
    expect(manualAmountText(item([{ ...manual('b'), qty: 2, unit: 'Kasten' }]))).toBe('2 Kasten');
  });
});

describe('noteChangeHint (spec 0025, REQ-004)', () => {
  const mozzarella = item([
    fromPlan('l', 'Lasagne', 'Mo', { count: 1, note: 'Fior di Latte' }),
    { ...manual('h', 1) },
  ]);

  it('AC-015: changing the Zusatz names the recipe Zusatz it replaces', () => {
    expect(noteChangeHint(mozzarella, 'Büffel')).toBe(
      'Ersetzt den Zusatz „Fior di Latte“ aus Lasagne (Mo)',
    );
  });

  it('AC-016: clearing it says it removes it; without a recipe Zusatz no hint', () => {
    expect(noteChangeHint(mozzarella, '  ')).toBe(
      'Entfernt den Zusatz „Fior di Latte“ aus Lasagne (Mo)',
    );
    expect(noteChangeHint(mozzarella, 'Fior di Latte')).toBeUndefined();
    expect(noteChangeHint(item([manual('a', 1)]), 'Bio')).toBeUndefined();
  });
});

describe('originRows (spec 0025, AC-010)', () => {
  it('AC-010: one row per recipe origin with its amount and contributions; "von Hand" stays out', () => {
    const moehren = item([
      fromPlan('l', 'Lasagne', 'Mo', { count: 1 }),
      { ...manual('h'), qty: 500, unit: 'g' },
      fromPlan('l2', 'Lasagne', 'Mo', { count: 1 }),
    ]);
    expect(originRows(moehren)).toEqual([
      { label: 'Lasagne (Mo)', amount: '2×', contributionIds: ['l', 'l2'] },
    ]);
  });
});
