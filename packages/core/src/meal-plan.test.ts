import { describe, expect, it } from 'vitest';

import { defaultEaters, entriesForDay, isAbsent, splitVariants, variantSummary } from './meal-plan';
import {
  articlesById,
  bolognese,
  enrico,
  halloumiPfanne,
  makeRecipe,
  mangoCurry,
  nadja,
  vera,
} from './test-fixtures';
import type { Absence, MealPlanEntry } from './types';

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: '2026-11-20',
    slotId: 'slot-abend',
    kind: 'recipe',
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

describe('splitVariants', () => {
  it('AC-024: Enrico (flexible) and Nadja (vegetarian) get "mit Tofu 1 · mit Hähnchen 1"', () => {
    const split = splitVariants(mangoCurry, [enrico, nadja], 0, articlesById);
    expect(split).toEqual({
      portions: 2,
      variants: [
        { variantId: 'v-tofu', portions: 1 },
        { variantId: 'v-haehnchen', portions: 1 },
      ],
      misfitMemberIds: [],
    });
    const planned = entry({ id: 'e', recipeId: mangoCurry.id, variants: split.variants });
    expect(variantSummary(planned, mangoCurry)).toBe('mit Tofu 1 · mit Hähnchen 1');
  });

  it('AC-025: Spaghetti Bolognese does not fit Nadja', () => {
    const split = splitVariants(bolognese, [enrico, nadja], 0, articlesById);
    expect(split.portions).toBe(2);
    expect(split.variants).toEqual([]);
    expect(split.misfitMemberIds).toEqual([nadja.id]);
  });

  it('counts guests on the default variant and omits variants nobody eats', () => {
    const split = splitVariants(mangoCurry, [nadja], 2, articlesById);
    expect(split.portions).toBe(3);
    expect(split.variants).toEqual([{ variantId: 'v-tofu', portions: 3 }]);
  });

  it('ignores a negative number of guests', () => {
    expect(splitVariants(mangoCurry, [enrico], -3, articlesById).portions).toBe(1);
  });

  it('serves a member without a fitting variant the default and lists them as misfit', () => {
    const cheesy = makeRecipe({
      id: 'r',
      title: 'Käsespätzle',
      variants: [
        { id: 'v-a', name: 'klassisch', isDefault: true },
        { id: 'v-b', name: 'mit Speck', isDefault: false },
      ],
      ingredients: [
        { id: 'i1', articleId: 'art-halloumi', name: 'Halloumi', shoppingRule: 'count' },
        {
          id: 'i2',
          articleId: 'art-hack',
          name: 'Hackfleisch',
          shoppingRule: 'count',
          variantId: 'v-b',
        },
      ],
    });
    const split = splitVariants(cheesy, [vera, nadja], 0, articlesById);
    expect(split.misfitMemberIds).toEqual([vera.id]);
    expect(split.variants).toEqual([{ variantId: 'v-a', portions: 2 }]);
  });

  it('gives flexible members meat over fish over vegetarian, never "unknown" first', () => {
    const recipe = makeRecipe({
      id: 'r',
      title: 'Bowl',
      variants: [
        { id: 'v-unknown', name: 'Spezial', isDefault: true },
        { id: 'v-fish', name: 'mit Lachs', isDefault: false },
        { id: 'v-veg', name: 'mit Halloumi', isDefault: false },
      ],
      ingredients: [
        { id: 'a', name: 'Geheimzutat', shoppingRule: 'count', variantId: 'v-unknown' },
        {
          id: 'b',
          articleId: 'art-lachs',
          name: 'Lachs',
          shoppingRule: 'count',
          variantId: 'v-fish',
        },
        {
          id: 'c',
          articleId: 'art-halloumi',
          name: 'Halloumi',
          shoppingRule: 'count',
          variantId: 'v-veg',
        },
      ],
    });
    expect(splitVariants(recipe, [enrico], 0, articlesById).variants).toEqual([
      { variantId: 'v-fish', portions: 1 },
    ]);
  });

  it('prefers the default among equally good variants', () => {
    const recipe = {
      ...mangoCurry,
      variants: [
        { id: 'v-tofu', name: 'mit Tofu', isDefault: false },
        { id: 'v-haehnchen', name: 'mit Hähnchen', isDefault: false },
        { id: 'v-tofu2', name: 'mit Tofu extra', isDefault: true },
      ],
    };
    // v-tofu2 has no own ingredients, so it is as vegan as v-tofu and wins as default.
    expect(splitVariants(recipe, [nadja], 0, articlesById).variants).toEqual([
      { variantId: 'v-tofu2', portions: 1 },
    ]);
  });

  it('handles recipes without variants that fit everyone', () => {
    expect(splitVariants(halloumiPfanne, [enrico, nadja], 1, articlesById)).toEqual({
      portions: 3,
      variants: [],
      misfitMemberIds: [],
    });
  });
});

describe('variantSummary', () => {
  it('lists only variants with portions, in recipe order; "" without variants', () => {
    const planned = entry({
      id: 'e',
      variants: [
        { variantId: 'v-haehnchen', portions: 1.5 },
        { variantId: 'v-tofu', portions: 0 },
      ],
    });
    expect(variantSummary(planned, mangoCurry)).toBe('mit Hähnchen 1,5');
    expect(variantSummary(entry({ id: 'b' }), bolognese)).toBe('');
  });
});

describe('absences', () => {
  const absences: Absence[] = [
    { id: 'a', memberId: enrico.id, from: '2026-11-20', to: '2026-11-22' },
  ];

  it('AC-038: only Nadja is preselected on a Saturday Enrico is away', () => {
    expect(defaultEaters([enrico, nadja], '2026-11-21', absences)).toEqual([nadja]);
  });

  it('treats from and to as inclusive', () => {
    expect(isAbsent(enrico.id, '2026-11-20', absences)).toBe(true);
    expect(isAbsent(enrico.id, '2026-11-22', absences)).toBe(true);
    expect(isAbsent(enrico.id, '2026-11-23', absences)).toBe(false);
    expect(isAbsent(enrico.id, '2026-11-19', absences)).toBe(false);
    expect(isAbsent(nadja.id, '2026-11-21', absences)).toBe(false);
  });

  it('applies a household absence to everyone', () => {
    const away: Absence[] = [{ id: 'h', from: '2026-12-24', to: '2026-12-26' }];
    expect(defaultEaters([enrico, nadja], '2026-12-25', away)).toEqual([]);
  });

  it('preselects everyone for an entry without a day', () => {
    expect(defaultEaters([enrico, nadja], null, absences)).toEqual([enrico, nadja]);
  });
});

describe('entriesForDay', () => {
  it('AC-048: keeps several dishes of one meal, each with its cook, in their order', () => {
    const lasagne = entry({ id: 'lasagne', recipeId: 'rec-lasagne', cookId: enrico.id, sort: 0 });
    const salad = entry({ id: 'salat', recipeId: 'rec-salat', cookId: nadja.id, sort: 1 });
    const result = entriesForDay([salad, lasagne], '2026-11-20', ['slot-mittag', 'slot-abend']);
    expect(result.map((e) => [e.id, e.cookId])).toEqual([
      ['lasagne', enrico.id],
      ['salat', nadja.id],
    ]);
  });

  it('sorts by slot order, puts unknown slots last and skips other days', () => {
    const dinner = entry({ id: 'abend', slotId: 'slot-abend' });
    const lunch = entry({ id: 'mittag', slotId: 'slot-mittag' });
    const odd = entry({ id: 'snack', slotId: 'slot-weg' });
    const tomorrow = entry({ id: 'morgen', date: '2026-11-21' });
    const unplanned = entry({ id: 'vorgemerkt', date: null });
    expect(
      entriesForDay([odd, dinner, tomorrow, lunch, unplanned], '2026-11-20', [
        'slot-mittag',
        'slot-abend',
      ]).map((e) => e.id),
    ).toEqual(['mittag', 'abend', 'snack']);
  });
});
