import { describe, expect, it } from 'vitest';

import {
  canPutOnList,
  entryIdsOnList,
  listPickerPreselection,
  listPickerWeek,
  toggleDaySelection,
  type ListPickerInput,
} from './shopping-picker';
import { makeRecipe } from './test-fixtures';
import type { Id, MealPlanEntry, Recipe, ShoppingItem } from './types';

// Spec 0006, REQ-008 "Ausgangsplan": today is Friday, 20 November 2026 (KW 47: 16.–22. November).
const TODAY = '2026-11-20';
const SLOTS = ['slot-mittag', 'slot-abend'];

function recipe(id: Id, title: string, partial: Partial<Recipe> = {}): Recipe {
  return makeRecipe({
    id,
    title,
    ingredients: [{ id: `${id}-i`, articleId: 'art-mango', name: 'Mango', shoppingRule: 'count' }],
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
    items,
    today: TODAY,
    week: TODAY,
    slotOrder: SLOTS,
    ...partial,
  };
}

const titles = (rows: { recipe: Recipe }[]): string[] => rows.map((row) => row.recipe.title);

describe('listPickerPreselection', () => {
  it('AC-049: from the list, preselects what is planned from today to Sunday and not yet on the list', () => {
    expect(listPickerPreselection(input())).toEqual(['plan-lasagne', 'plan-kuerbis', 'plan-dal']);
  });

  it('AC-051: from the plan in KW 48, preselects that week only', () => {
    expect(listPickerPreselection(input({ week: '2026-11-25' }))).toEqual(['plan-paella']);
  });

  it('AC-054: a past week preselects nothing', () => {
    expect(listPickerPreselection(input({ week: '2026-11-11' }))).toEqual([]);
  });

  it('AC-061: a recipe without ingredients is not preselected', () => {
    const empty = {
      ...recipesById,
      'rec-kuerbis': recipe('rec-kuerbis', 'Kürbissuppe', { ingredients: [] }),
    };
    expect(listPickerPreselection(input({ recipesById: empty }))).toEqual([
      'plan-lasagne',
      'plan-dal',
    ]);
  });

  it('AC-039: after the list was cleared, Lasagne is preselected again', () => {
    const lasagneItem: ShoppingItem = {
      id: 'item-zwiebeln',
      articleId: 'art-zwiebeln',
      checked: false,
      createdAt: '2026-11-19T08:00:00.000Z',
      contributions: [
        {
          id: 'c-z',
          source: {
            kind: 'recipe',
            recipeId: 'rec-lasagne',
            entryId: 'plan-lasagne',
            label: 'Lasagne (Fr)',
          },
          count: 2,
        },
      ],
    };
    expect(listPickerPreselection(input({ items: [lasagneItem] }))).not.toContain('plan-lasagne');
    expect(listPickerPreselection(input({ items: [] }))).toContain('plan-lasagne');
  });

  it('a checked item still counts as on the list (REQ-008: "offen oder erledigt")', () => {
    const checked = items.map((row) => ({ ...row, checked: true }));
    expect(listPickerPreselection(input({ items: checked }))).not.toContain('plan-curry');
  });
});

describe('listPickerWeek', () => {
  it('AC-049: shows recipe days of KW 47, past and on-list hints, Vorgemerkt at the bottom', () => {
    const week = listPickerWeek(input());

    expect(week.weekStart).toBe('2026-11-16');
    expect(week.weekNumber).toBe(47);
    expect(week.days.map((day) => day.date)).toEqual([
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);

    const [thursday, friday, saturday, sunday] = week.days;
    expect(thursday).toMatchObject({ isPast: true, isToday: false });
    expect(titles(thursday?.entries ?? [])).toEqual(['Shakshuka']);
    expect(friday).toMatchObject({ isPast: false, isToday: true });
    expect(friday?.entries.map((row) => [row.recipe.title, row.onList])).toEqual([
      ['Lasagne', false],
      ['Mango-Curry', true],
    ]);
    expect(titles(saturday?.entries ?? [])).toEqual(['Kürbissuppe']);
    expect(titles(sunday?.entries ?? [])).toEqual(['Linsen-Dal']);
    expect(titles(week.parked)).toEqual(['Halloumi-Pfanne']);
  });

  it('AC-049: restaurants and activities are not in the window', () => {
    const ids = listPickerWeek(input()).days.flatMap((day) =>
      day.entries.map((row) => row.entry.id),
    );
    expect(ids).not.toContain('plan-enzo');
    expect(ids).not.toContain('plan-bouldern');
  });

  it('AC-050: any day inside KW 48 shows KW 48 with Paella', () => {
    const week = listPickerWeek(input({ week: '2026-11-29' }));
    expect(week.weekStart).toBe('2026-11-23');
    expect(week.weekNumber).toBe(48);
    expect(week.days.map((day) => [day.date, titles(day.entries)])).toEqual([
      ['2026-11-23', ['Paella']],
    ]);
    expect(titles(week.parked)).toEqual(['Halloumi-Pfanne']);
  });

  it('AC-061: a recipe without ingredients is left out, and so is its day when nothing else is there', () => {
    const empty = {
      ...recipesById,
      'rec-kuerbis': recipe('rec-kuerbis', 'Kürbissuppe', { ingredients: [] }),
    };
    const week = listPickerWeek(input({ recipesById: empty }));
    expect(week.days.map((day) => day.date)).toEqual(['2026-11-19', '2026-11-20', '2026-11-22']);
  });

  it('a week without anything to buy has no days, only Vorgemerkt', () => {
    const week = listPickerWeek(input({ week: '2026-12-07' }));
    expect(week.days).toEqual([]);
    expect(titles(week.parked)).toEqual(['Halloumi-Pfanne']);
  });

  it('orders Vorgemerkt by slot, then as in a slot', () => {
    const parked = [
      entry('plan-dal', null, { sort: 1 }),
      entry('plan-halloumi', null),
      entry('plan-shakshuka', null, { slotId: 'slot-mittag', sort: 5 }),
    ];
    const week = listPickerWeek(input({ entries: parked }));
    expect(titles(week.parked)).toEqual(['Shakshuka', 'Halloumi-Pfanne', 'Linsen-Dal']);
  });
});

describe('canPutOnList', () => {
  it('AC-061: a recipe entry whose recipe has ingredients to buy can go on the list', () => {
    expect(canPutOnList(entry('plan-lasagne', TODAY), recipesById['rec-lasagne'])).toBe(true);
  });

  it('AC-061: a recipe without ingredients, or with only "skip" ingredients, cannot', () => {
    const skipOnly = recipe('rec-x', 'Salat', {
      ingredients: [{ id: 'x', articleId: 'art-salz', name: 'Salz', shoppingRule: 'skip' }],
    });
    expect(canPutOnList(entry('plan-x', TODAY), recipe('rec-x', 'X', { ingredients: [] }))).toBe(
      false,
    );
    expect(canPutOnList(entry('plan-x', TODAY), skipOnly)).toBe(false);
  });

  it('restaurants, activities, free text, leftovers and missing recipes cannot', () => {
    const lasagne = recipesById['rec-lasagne'];
    for (const kind of ['restaurant', 'activity', 'text', 'leftovers'] as const) {
      expect(canPutOnList(entry('plan-lasagne', TODAY, { kind }), lasagne)).toBe(false);
    }
    expect(canPutOnList(entry('plan-lasagne', TODAY), undefined)).toBe(false);
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
