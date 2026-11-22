import { describe, expect, it } from 'vitest';

import {
  canPutOnList,
  canPutRecipeOnList,
  entryIdsOnList,
  listPickerContinueLabel,
  listPickerDayLabel,
  listPickerEntryLabel,
  listPickerPage,
  listPickerPreselection,
  listPickerStart,
  shiftListPickerStart,
  toggleDaySelection,
  type ListPickerInput,
} from './shopping-picker';
import type { RecipeBook } from './collections';
import {
  grillabend,
  grillabendRecipes,
  grillRecipesById,
  makeCollection,
  makeRecipe,
} from './test-fixtures';
import type { Id, MealPlanEntry, Recipe, ShoppingItem } from './types';

// Spec 0006, REQ-008 "Ausgangsplan": today is Friday, 20 November 2026 (KW 47: 16.–22. November).
const TODAY = '2026-11-20';
const SLOTS = ['slot-mittag', 'slot-abend'];

function recipe(id: Id, title: string, partial: Partial<Recipe> = {}): Recipe {
  return makeRecipe({
    id,
    title,
    ingredients: [{ id: `${id}-i`, articleId: 'art-mango', shoppingRule: 'count' }],
    ...partial,
  });
}

const recipes: Recipe[] = [
  recipe('rec-shakshuka', 'Shakshuka'),
  recipe('rec-lasagne', 'Lasagne'),
  recipe('rec-curry', 'Mango-Curry'),
  recipe('rec-kuerbis', 'Kürbissuppe'),
  recipe('rec-dal', 'Linsen-Dal'),
  recipe('rec-halloumi', 'Halloumi-Pfanne'),
  recipe('rec-paella', 'Paella'),
  recipe('rec-old', 'Ofengemüse'),
];
const recipesById: Record<Id, Recipe> = Object.fromEntries(recipes.map((r) => [r.id, r]));
const book: RecipeBook = { recipesById, collectionRecipes: [] };

function entry(id: Id, date: string | null, partial: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id,
    date,
    slotId: 'slot-abend',
    kind: 'recipe',
    recipeId: `rec-${id.replace('plan-', '')}`,
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

const plan: MealPlanEntry[] = [
  entry('plan-old', '2026-11-12'),
  entry('plan-shakshuka', '2026-11-19'),
  entry('plan-lasagne', '2026-11-20', { slotId: 'slot-mittag' }),
  entry('plan-curry', '2026-11-20'),
  entry('plan-kuerbis', '2026-11-21'),
  entry('plan-enzo', '2026-11-21', {
    kind: 'restaurant',
    recipeId: undefined,
    restaurantId: 'rest-enzo',
  }),
  entry('plan-dal', '2026-11-22'),
  entry('plan-bouldern', '2026-11-22', {
    kind: 'activity',
    recipeId: undefined,
    activityId: 'act-bouldern',
  }),
  entry('plan-halloumi', null),
  entry('plan-paella', '2026-11-23'),
];

// "Mango-Curry" already has a contribution on the list.
const items: ShoppingItem[] = [
  {
    id: 'item-mango',
    articleId: 'art-mango',
    checked: false,
    createdAt: '2026-11-19T08:00:00.000Z',
    contributions: [
      {
        id: 'c-1',
        source: {
          kind: 'recipe',
          recipeId: 'rec-curry',
          entryId: 'plan-curry',
          label: 'Mango-Curry (Fr)',
        },
        count: 1,
      },
      { id: 'c-2', source: { kind: 'manual' }, count: 1 },
    ],
  },
];

function input(partial: Partial<ListPickerInput> = {}): ListPickerInput {
  return {
    entries: plan,
    recipesById,
    collectionRecipes: [],
    items,
    today: TODAY,
    start: TODAY,
    slotOrder: SLOTS,
    ...partial,
  };
}

const titles = (rows: { recipe: Recipe }[]): string[] => rows.map((row) => row.recipe.title);

// Spec 0025, REQ-001: today is Sunday, 22 November 2026 (KW 47: 16.–22. Nov, KW 48: 23.–29. Nov,
// KW 49: 30. Nov – 6. Dez). Mango-Curry (Mi 25) is on the list already.
describe('listPickerPage (spec 0025, REQ-001)', () => {
  const SUNDAY = '2026-11-22';
  const grillBook: RecipeBook = {
    recipesById: { ...recipesById, ...grillRecipesById },
    collectionRecipes: grillabendRecipes,
  };
  const page0025: MealPlanEntry[] = [
    entry('plan-lasagne-fr', '2026-11-20', { recipeId: 'rec-lasagne' }),
    entry('plan-shakshuka', SUNDAY),
    entry('plan-lasagne', '2026-11-23'),
    entry('plan-curry', '2026-11-25'),
    entry('plan-enzo', '2026-11-27', {
      kind: 'restaurant',
      recipeId: undefined,
      restaurantId: 'rest-enzo',
    }),
    entry('plan-grill', '2026-11-28', { recipeId: grillabend.id, portions: 3 }),
    entry('plan-eislaufen', '2026-11-28', {
      kind: 'activity',
      recipeId: undefined,
      activityId: 'act-eis',
      sort: 1,
    }),
    entry('plan-shakshuka-di', '2026-12-01', { recipeId: 'rec-shakshuka' }),
    entry('plan-dal', null),
  ];
  const pageInput = (partial: Partial<ListPickerInput> = {}): ListPickerInput => ({
    ...input({ entries: page0025, today: SUNDAY, start: SUNDAY }),
    ...grillBook,
    ...partial,
  });
  const shown = (page: ReturnType<typeof listPickerPage>) =>
    page.groups.map((group) => [
      group.label,
      group.days.map((day) => [listPickerDayLabel(day), day.entries.map((row) => row.label)]),
    ]);

  it('AC-001: seven days from today, grouped by KW, without past days, restaurants and activities', () => {
    const page = listPickerPage(pageInput());
    expect(page.title).toBe('22.–28. Nov');
    expect(page.canGoBack).toBe(false);
    expect(shown(page)).toEqual([
      ['KW 47 · 22. Nov', [['So 22 · heute', ['Shakshuka']]]],
      [
        'KW 48 · 23.–28. Nov',
        [
          ['Mo 23', ['Lasagne']],
          ['Mi 25', ['Mango-Curry']],
          ['Sa 28', ['Grillabend (2 Rezepte)']],
        ],
      ],
    ]);
    const curry = page.groups[1]?.days[1]?.entries[0];
    expect(curry?.onList).toBe(true);
    expect(titles(page.parked)).toEqual(['Linsen-Dal']);
  });

  it('AC-001: preselects what the start page plans and is not on the list yet', () => {
    expect(listPickerPreselection(pageInput())).toEqual([
      'plan-shakshuka',
      'plan-lasagne',
      'plan-grill',
    ]);
  });

  it('AC-002: › shows the next seven days, ‹ comes back to today and stops there', () => {
    const next = shiftListPickerStart(SUNDAY, SUNDAY, 1);
    expect(next).toBe('2026-11-29');
    const page = listPickerPage(pageInput({ start: next }));
    expect(page.title).toBe('29. Nov – 5. Dez');
    expect(page.canGoBack).toBe(true);
    expect(shown(page)).toEqual([['KW 49 · 30. Nov – 5. Dez', [['Di 1', ['Shakshuka']]]]]);
    expect(shiftListPickerStart(next, SUNDAY, -1)).toBe(SUNDAY);
  });

  it('AC-003: from the calendar in KW 49 the page starts on its Monday; ‹ steps back to today', () => {
    const start = listPickerStart(SUNDAY, '2026-12-02');
    expect(start).toBe('2026-11-30');
    expect(listPickerPage(pageInput({ start })).title).toBe('30. Nov – 6. Dez');
    expect(listPickerPreselection(pageInput({ start }))).toEqual(['plan-shakshuka-di']);
    const back = shiftListPickerStart(start, SUNDAY, -1);
    expect(back).toBe('2026-11-23');
    expect(listPickerPage(pageInput({ start: back })).title).toBe('23.–29. Nov');
    expect(shiftListPickerStart(back, SUNDAY, -1)).toBe(SUNDAY);
  });

  it('AC-004: from the calendar in KW 46 or KW 47 the page starts today', () => {
    expect(listPickerStart(SUNDAY, '2026-11-11')).toBe(SUNDAY);
    expect(listPickerStart(SUNDAY, '2026-11-18')).toBe(SUNDAY);
    expect(listPickerStart(SUNDAY)).toBe(SUNDAY);
  });

  it('AC-005: across the turn of the year, KW 52 and KW 53', () => {
    const today = '2026-12-27';
    const entries = [entry('plan-shakshuka', today), entry('plan-lasagne', '2027-01-02')];
    const page = listPickerPage(pageInput({ today, start: today, entries }));
    expect(page.title).toBe('27. Dez – 2. Jan');
    expect(page.groups.map((group) => group.label)).toEqual([
      'KW 52 · 27. Dez',
      'KW 53 · 28. Dez – 2. Jan',
    ]);
  });

  it('AC-006: seven days without a recipe have no groups; Vorgemerkt stays', () => {
    const page = listPickerPage(pageInput({ start: '2026-12-06' }));
    expect(page.groups).toEqual([]);
    expect(titles(page.parked)).toEqual(['Linsen-Dal']);
  });

  it('AC-061: a recipe without ingredients is left out, and so is its day', () => {
    const empty = {
      ...grillBook.recipesById,
      'rec-lasagne': recipe('rec-lasagne', 'Lasagne', { ingredients: [] }),
    };
    const page = listPickerPage(pageInput({ recipesById: empty }));
    expect(page.groups[1]?.days.map((day) => day.date)).toEqual(['2026-11-25', '2026-11-28']);
  });

  it('a checked item still counts as on the list (REQ-008: "offen oder erledigt")', () => {
    const checked = items.map((row) => ({ ...row, checked: true }));
    expect(listPickerPreselection(pageInput({ items: checked }))).not.toContain('plan-curry');
  });

  it('orders Vorgemerkt by slot, then as in a slot', () => {
    const parked = [
      entry('plan-dal', null, { sort: 1 }),
      entry('plan-halloumi', null),
      entry('plan-shakshuka', null, { slotId: 'slot-mittag', sort: 5 }),
    ];
    const page = listPickerPage(pageInput({ entries: parked }));
    expect(titles(page.parked)).toEqual(['Shakshuka', 'Halloumi-Pfanne', 'Linsen-Dal']);
  });
});

describe('canPutOnList', () => {
  it('AC-061: a recipe entry whose recipe has ingredients to buy can go on the list', () => {
    expect(canPutOnList(entry('plan-lasagne', TODAY), recipesById['rec-lasagne'], book)).toBe(true);
  });

  it('AC-061: a recipe without ingredients, or with only "skip" ingredients, cannot', () => {
    const skipOnly = recipe('rec-x', 'Salat', {
      ingredients: [{ id: 'x', articleId: 'art-salz', shoppingRule: 'skip' }],
    });
    expect(
      canPutOnList(entry('plan-x', TODAY), recipe('rec-x', 'X', { ingredients: [] }), book),
    ).toBe(false);
    expect(canPutOnList(entry('plan-x', TODAY), skipOnly, book)).toBe(false);
  });

  it('restaurants, activities, free text, leftovers and missing recipes cannot', () => {
    const lasagne = recipesById['rec-lasagne'];
    for (const kind of ['restaurant', 'activity', 'text', 'leftovers'] as const) {
      expect(canPutOnList(entry('plan-lasagne', TODAY, { kind }), lasagne, book)).toBe(false);
    }
    expect(canPutOnList(entry('plan-lasagne', TODAY), undefined, book)).toBe(false);
  });
});

describe('canPutRecipeOnList', () => {
  it('AC-060: a recipe with ingredients to buy can go on the list from its page', () => {
    expect(canPutRecipeOnList(recipe('rec-kuerbis', 'Kürbissuppe'), 2, [])).toBe(true);
  });

  it('AC-060: a recipe without ingredients, or with only "skip" ingredients, cannot', () => {
    const skipOnly = recipe('rec-x', 'Salat', {
      ingredients: [{ id: 'x', articleId: 'art-salz', shoppingRule: 'skip' }],
    });
    expect(canPutRecipeOnList(recipe('rec-x', 'Kürbissuppe', { ingredients: [] }), 2, [])).toBe(
      false,
    );
    expect(canPutRecipeOnList(skipOnly, 2, [])).toBe(false);
  });
});

describe('entryIdsOnList', () => {
  it('collects the plan entries that have a contribution on the list', () => {
    expect([...entryIdsOnList(items)]).toEqual(['plan-curry']);
  });
});

describe('toggleDaySelection', () => {
  it('AC-052: a tap on the day selects all its entries, a second tap deselects them', () => {
    const selected = new Set(['plan-lasagne', 'plan-dal']);
    const friday = ['plan-lasagne', 'plan-curry'];

    const all = toggleDaySelection(selected, friday);
    expect([...all].sort()).toEqual(['plan-curry', 'plan-dal', 'plan-lasagne']);

    const none = toggleDaySelection(all, friday);
    expect([...none]).toEqual(['plan-dal']);
  });

  it('does not change the given set', () => {
    const selected = new Set<Id>();
    toggleDaySelection(selected, ['plan-lasagne']);
    expect(selected.size).toBe(0);
  });

  it('a day without entries changes nothing', () => {
    expect([...toggleDaySelection(new Set(['plan-dal']), [])]).toEqual(['plan-dal']);
  });
});

describe('listPickerDayLabel', () => {
  it('AC-001: "So 22 · heute", "Mo 23"', () => {
    expect(listPickerDayLabel({ date: '2026-11-22', isToday: true })).toBe('So 22 · heute');
    expect(listPickerDayLabel({ date: '2026-11-23', isToday: false })).toBe('Mo 23');
  });
});

describe('listPickerContinueLabel', () => {
  it('AC-049, AC-050: names the number of chosen dishes', () => {
    expect(listPickerContinueLabel(3)).toBe('Weiter: 3 Gerichte');
    expect(listPickerContinueLabel(4)).toBe('Weiter: 4 Gerichte');
    expect(listPickerContinueLabel(1)).toBe('Weiter: 1 Gericht');
  });

  it('AC-054: nothing chosen reads "Weiter"', () => {
    expect(listPickerContinueLabel(0)).toBe('Weiter');
  });
});

describe('Sammlungen in step 1 (spec 0009, REQ-008)', () => {
  const leer = makeCollection({ id: 'col-leer', title: 'Leer' });
  const sommerfest = makeCollection({
    id: 'col-sommerfest',
    title: 'Sommerfest',
    ingredients: [{ id: 'o-bier', articleId: 'art-bier', shoppingRule: 'count' }],
  });
  const grillBook: RecipeBook = {
    recipesById: { ...recipesById, ...grillRecipesById, [leer.id]: leer },
    collectionRecipes: grillabendRecipes,
  };
  const grillPlan: MealPlanEntry[] = [
    ...plan,
    entry('plan-grill', '2026-11-21', { recipeId: grillabend.id, portions: 3, sort: 1 }),
    entry('plan-leer', '2026-11-22', { recipeId: leer.id, sort: 1 }),
  ];
  const grillInput = (): ListPickerInput => ({ ...input({ entries: grillPlan }), ...grillBook });
  const pageDays = () => listPickerPage(grillInput()).groups.flatMap((group) => group.days);

  it('AC-027: "Grillabend (2 Rezepte)" stands under Sa 21 and is preselected', () => {
    const saturday = pageDays().find((day) => day.date === '2026-11-21');
    expect(saturday?.entries.map((row) => row.label)).toEqual([
      'Kürbissuppe',
      'Grillabend (2 Rezepte)',
    ]);
    expect(listPickerPreselection(grillInput())).toContain('plan-grill');
  });

  it('REQ-008: a collection without anything to buy does not appear', () => {
    expect(canPutOnList(entry('plan-leer', TODAY, { recipeId: leer.id }), leer, grillBook)).toBe(
      false,
    );
    const sunday = pageDays().find((day) => day.date === '2026-11-22');
    expect(sunday?.entries.map((row) => row.entry.id)).toEqual(['plan-dal']);
  });

  it('AC-024: a collection without recipes reads without a count', () => {
    expect(listPickerEntryLabel(sommerfest, grillBook)).toBe('Sommerfest');
    expect(
      canPutOnList(entry('plan-fest', TODAY, { recipeId: sommerfest.id }), sommerfest, grillBook),
    ).toBe(true);
    expect(listPickerEntryLabel(recipesById['rec-lasagne'] as Recipe, grillBook)).toBe('Lasagne');
  });
});
