import { describe, expect, it } from 'vitest';

import { addDays } from './dates';
import {
  defaultEaters,
  entriesForDay,
  isAbsent,
  orderSlotEntries,
  splitVariants,
  variantSummary,
  visitsOf,
  withNote,
} from './meal-plan';
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

  it('spec 0004 AC-022: an unknown diet is no conflict — a recipe without ingredients fits everyone', () => {
    // Created while planning: only a title, so nothing is known about its diet.
    const soup = makeRecipe({ id: 'r-soup', title: 'Kürbissuppe' });
    expect(splitVariants(soup, [enrico, nadja, vera], 0, articlesById).misfitMemberIds).toEqual([]);
    // Ingredients without an article are just as unknown.
    const secret = makeRecipe({
      id: 'r-secret',
      title: 'Omas Eintopf',
      ingredients: [{ id: 'i1', name: 'Geheimzutat', shoppingRule: 'count' }],
    });
    expect(splitVariants(secret, [nadja], 0, articlesById).misfitMemberIds).toEqual([]);
    // A real conflict stays one.
    expect(splitVariants(bolognese, [nadja], 0, articlesById).misfitMemberIds).toEqual([nadja.id]);
  });

  it('serves a vegetarian an unknown variant rather than a known meat one, without a misfit', () => {
    const stew = makeRecipe({
      id: 'r',
      title: 'Eintopf',
      variants: [
        { id: 'v-meat', name: 'mit Hack', isDefault: true },
        { id: 'v-unknown', name: 'Spezial', isDefault: false },
      ],
      ingredients: [
        {
          id: 'a',
          articleId: 'art-hack',
          name: 'Hackfleisch',
          shoppingRule: 'count',
          variantId: 'v-meat',
        },
        { id: 'b', name: 'Geheimzutat', shoppingRule: 'count', variantId: 'v-unknown' },
      ],
    });
    expect(splitVariants(stew, [nadja], 0, articlesById)).toEqual({
      portions: 1,
      variants: [{ variantId: 'v-unknown', portions: 1 }],
      misfitMemberIds: [],
    });
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

describe('orderSlotEntries', () => {
  // Saturday evening, in the order the entries were added.
  const lasagne = entry({ id: 'e-lasagne', recipeId: 'rec-lasagne', sort: 0 });
  const salad = entry({ id: 'e-salat', recipeId: 'rec-salat', sort: 1 });
  const enzo = entry({ id: 'e-enzo', kind: 'restaurant', restaurantId: 'rest-enzo', sort: 2 });
  const bouldern = entry({
    id: 'e-bouldern',
    kind: 'activity',
    activityId: 'act-bouldern',
    sort: 3,
  });

  it('AC-002: Lasagne, Salat, then Enzo, then Bouldern → Bouldern, Lasagne, Salat, Enzo', () => {
    expect(orderSlotEntries([lasagne, salad, enzo, bouldern]).map((e) => e.id)).toEqual([
      'e-bouldern',
      'e-lasagne',
      'e-salat',
      'e-enzo',
    ]);
  });

  it('AC-002: free text and leftovers sit with the recipes, in the order they were added', () => {
    const text = entry({ id: 'e-text', kind: 'text', text: 'Brote', sort: 5 });
    const leftovers = entry({ id: 'e-reste', kind: 'leftovers', sort: 4 });
    expect(orderSlotEntries([text, enzo, leftovers, lasagne]).map((e) => e.id)).toEqual([
      'e-lasagne',
      'e-reste',
      'e-text',
      'e-enzo',
    ]);
  });

  it('breaks equal sort values by id, so every device shows the same order', () => {
    const b = entry({ id: 'b', sort: 0 });
    const a = entry({ id: 'a', sort: 0 });
    expect(orderSlotEntries([b, a]).map((e) => e.id)).toEqual(['a', 'b']);
    expect(orderSlotEntries([a, b]).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns a new array and leaves the input as it was; [] stays []', () => {
    const input = [enzo, bouldern];
    orderSlotEntries(input);
    expect(input.map((e) => e.id)).toEqual(['e-enzo', 'e-bouldern']);
    expect(orderSlotEntries([])).toEqual([]);
  });

  it('AC-002: entriesForDay orders the kinds within each slot, slots stay in slot order', () => {
    const morningWalk = entry({
      id: 'e-spaziergang',
      slotId: 'slot-vormittag',
      kind: 'activity',
      activityId: 'act-spaziergang',
    });
    const brunch = entry({
      id: 'e-brunch',
      slotId: 'slot-vormittag',
      kind: 'restaurant',
      restaurantId: 'rest-cafe',
    });
    expect(
      entriesForDay([enzo, brunch, salad, bouldern, morningWalk, lasagne], '2026-11-20', [
        'slot-vormittag',
        'slot-mittag',
        'slot-abend',
      ]).map((e) => e.id),
    ).toEqual(['e-spaziergang', 'e-brunch', 'e-bouldern', 'e-lasagne', 'e-salat', 'e-enzo']);
  });
});

describe('visitsOf', () => {
  const today = '2026-11-20';
  const planned = (
    id: string,
    date: string | null,
    extra: Partial<MealPlanEntry> = {},
  ): MealPlanEntry => entry({ id, date, kind: 'activity', activityId: 'act-bouldern', ...extra });

  it('AC-016: 12, 30 and 45 days ago plus 3 days ahead → last 12 days ago, 3 times, newest first', () => {
    const entries = [
      planned('a', addDays(today, -30)),
      planned('b', addDays(today, 3)),
      planned('c', addDays(today, -12)),
      planned('d', addDays(today, -45)),
    ];
    expect(visitsOf('activity', 'act-bouldern', entries, today)).toEqual({
      count: 3,
      lastOn: '2026-11-08',
      daysSince: 12,
      dates: ['2026-11-08', '2026-10-21', '2026-10-06'],
    });
  });

  it('AC-016: skips other activities, restaurants, unplanned and not-done entries', () => {
    const entries = [
      planned('mine', '2026-11-01'),
      planned('other', '2026-11-10', { activityId: 'act-eislaufen' }),
      planned('restaurant', '2026-11-11', {
        kind: 'restaurant',
        activityId: undefined,
        restaurantId: 'act-bouldern',
      }),
      planned('unplanned', null),
      planned('skipped', '2026-11-12', { notCooked: true }),
    ];
    expect(visitsOf('activity', 'act-bouldern', entries, today)).toEqual({
      count: 1,
      lastOn: '2026-11-01',
      daysSince: 19,
      dates: ['2026-11-01'],
    });
  });

  it('counts an entry planned for today, as restaurant visits do', () => {
    expect(visitsOf('activity', 'act-bouldern', [planned('t', today)], today)).toMatchObject({
      count: 1,
      lastOn: today,
      daysSince: 0,
    });
  });

  it('reads restaurant visits from restaurantId', () => {
    const pho = entry({
      id: 'p',
      date: '2026-11-18',
      kind: 'restaurant',
      restaurantId: 'rest-pho',
    });
    expect(visitsOf('restaurant', 'rest-pho', [pho, planned('x', '2026-11-19')], today)).toEqual({
      count: 1,
      lastOn: '2026-11-18',
      daysSince: 2,
      dates: ['2026-11-18'],
    });
  });

  it('AC-016: reports nothing done without past entries', () => {
    expect(visitsOf('activity', 'act-bouldern', [planned('f', '2026-11-23')], today)).toEqual({
      count: 0,
      lastOn: undefined,
      daysSince: undefined,
      dates: [],
    });
  });
});

describe('withNote', () => {
  it('AC-013: shows the Zusatz in parentheses: "Eislaufen (Hohenschönhausen)"', () => {
    expect(withNote('Eislaufen', 'Hohenschönhausen')).toBe('Eislaufen (Hohenschönhausen)');
  });

  it('trims the Zusatz and leaves the title alone without one', () => {
    expect(withNote('Eislaufen', '  mit Tom ')).toBe('Eislaufen (mit Tom)');
    expect(withNote('Eislaufen', '   ')).toBe('Eislaufen');
    expect(withNote('Eislaufen', '')).toBe('Eislaufen');
    expect(withNote('Eislaufen')).toBe('Eislaufen');
  });
});
