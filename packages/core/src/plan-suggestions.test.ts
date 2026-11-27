import { describe, expect, it } from 'vitest';

import {
  assignmentPrepNote,
  dishBase,
  distributeWeek,
  entriesNotOnList,
  freeEvenings,
  slotSuggestions,
  suggestionsHeading,
  weekLineLabel,
  weekListLabel,
  weekMenu,
  weekPlanLabel,
  weekPlannedNotice,
  type Evening,
  type PlanSuggestion,
  type SuggestionInput,
} from './plan-suggestions';
import { makeRecipe } from './test-fixtures';
import type {
  Article,
  Diet,
  Id,
  ISODate,
  MealPlanEntry,
  MealSlot,
  Member,
  Recipe,
  RecipeIngredient,
  ShoppingItem,
} from './types';

// Spec 0063: the suggestions of the add window (A) and "Was kochen wir?" (C). Today is Friday,
// 27.11.2026, 12:00; the week planned is 30.11.–6.12.

const TODAY = '2026-11-27';
const THURSDAY = '2026-12-03';
const MORNING = 'slot-morning';
const NOON = 'slot-noon';
const EVENING = 'slot-evening';
const slots: MealSlot[] = [
  { id: MORNING, name: 'Vormittag', sort: 0 },
  { id: NOON, name: 'Mittag', sort: 1 },
  { id: EVENING, name: 'Abend', sort: 2 },
];

const enrico: Member = {
  id: 'm-enrico',
  name: 'Enrico',
  color: '#000',
  dietPreference: 'flexible',
  dislikes: [],
};
const nadja: Member = {
  id: 'm-nadja',
  name: 'Nadja',
  color: '#000',
  dietPreference: 'vegetarian',
  dislikes: [],
};
const BOTH = [enrico.id, nadja.id];

function article(id: Id, name: string, diet: Diet = 'vegan', synonyms: string[] = []): Article {
  return { id, name, synonyms, diet, isPantry: false, needsReview: false, createdAt: '' };
}
const ARTICLES = [
  article('spaghetti', 'Spaghetti'),
  article('reis', 'Basmatireis'),
  article('reisnudeln', 'Reisnudeln'),
  article('kartoffeln', 'Kartoffeln'),
  article('baguette', 'Baguette'),
  article('linsen', 'Rote Linsen'),
  article('zucchini', 'Zucchini'),
  article('tomaten', 'Tomaten'),
  article('tofu', 'Räuchertofu'),
  article('eier', 'Eier', 'vegetarian'),
  article('huhn', 'Hähnchenbrust', 'meat'),
  article('pilze', 'Champignons', 'vegan', ['Pilze']),
  article('preiselbeeren', 'Preiselbeeren'),
  article('haferflocken', 'Haferflocken'),
];
const articlesById: Record<Id, Article> = Object.fromEntries(ARTICLES.map((a) => [a.id, a]));

let ingredientSeq = 0;
function ing(articleId: Id, variantId?: Id): RecipeIngredient {
  ingredientSeq += 1;
  return { id: `i-${ingredientSeq}`, articleId, shoppingRule: 'count', variantId };
}

/** A main dish with the given ingredients (vegan unless an article says otherwise). */
function dish(id: Id, articleIds: Id[], rest: Partial<Recipe> = {}): Recipe {
  return makeRecipe({
    id,
    title: rest.title ?? id,
    totalMinutes: 30,
    ingredients: articleIds.map((articleId) => ing(articleId)),
    ...rest,
  });
}

/** Ten dishes everyone can eat, each with another base or none. */
function pool(prefix = 'r'): Recipe[] {
  const bases = ['spaghetti', 'reis', 'kartoffeln', 'baguette', 'linsen'];
  return Array.from({ length: 10 }, (_, index) =>
    dish(`${prefix}${index}`, [bases[index % bases.length] ?? 'zucchini', 'tomaten']),
  );
}

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: THURSDAY,
    slotId: EVENING,
    kind: 'recipe',
    eaterIds: BOTH,
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

function input(rest: Partial<SuggestionInput> = {}): SuggestionInput {
  const recipes = rest.recipes ?? pool();
  return {
    recipes,
    entries: [],
    members: [enrico, nadja],
    articlesById,
    book: {
      recipesById: Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe])),
      collectionRecipes: [],
    },
    slots,
    today: TODAY,
    now: '12:00',
    householdId: 'h-1',
    ...rest,
  };
}

const thursdayEvening: Evening = { date: THURSDAY, slotId: EVENING, eaterIds: BOTH };
const ids = (list: readonly PlanSuggestion[]) => list.map((suggestion) => suggestion.recipe.id);
const cooked = (recipe: Recipe, lastCookedOn: ISODate): Recipe => ({
  ...recipe,
  lastCookedOn,
  cookedCount: 1,
});

describe('slotSuggestions — hard rules (REQ-001)', () => {
  it('AC-001: suggests nothing a present eater cannot eat; a fitting variant lets it in', () => {
    const butterChicken = dish('butter-chicken', ['huhn', 'reis']);
    const padSeeEw = makeRecipe({
      id: 'pad-see-ew',
      title: 'Pad See Ew',
      totalMinutes: 25,
      variants: [
        { id: 'v-huhn', name: 'Hähnchen', isDefault: true },
        { id: 'v-tofu', name: 'Tofu', isDefault: false },
      ],
      ingredients: [ing('reisnudeln'), ing('huhn', 'v-huhn'), ing('tofu', 'v-tofu')],
    });
    // Only the two dishes and two others: every candidate must be shown.
    const recipes = [butterChicken, padSeeEw, dish('a', ['kartoffeln']), dish('b', ['linsen'])];
    const result = slotSuggestions(input({ recipes }), thursdayEvening);
    expect(ids(result.suggestions)).not.toContain('butter-chicken');
    expect(ids(result.suggestions)).toContain('pad-see-ew');
  });

  it('AC-001: an eater who does not eat that evening does not count', () => {
    const recipes = [dish('butter-chicken', ['huhn']), dish('a', ['reis']), dish('b', ['linsen'])];
    const onlyEnrico = { ...thursdayEvening, eaterIds: [enrico.id] };
    expect(ids(slotSuggestions(input({ recipes }), onlyEnrico).suggestions)).toContain(
      'butter-chicken',
    );
  });

  it('AC-002: never suggests what an eater dislikes, in title, article name or synonym', () => {
    const picky = { ...nadja, dislikes: ['Pilze'] };
    const recipes = [
      dish('pilzrisotto', ['pilze', 'reis'], { title: 'Risotto' }),
      dish('pilzpfanne', ['zucchini'], { title: 'Pilzpfanne' }),
      ...pool(),
    ];
    for (let round = 0; round < 5; round += 1) {
      const result = slotSuggestions(
        input({ recipes, members: [enrico, picky] }),
        thursdayEvening,
        {
          round,
        },
      );
      expect(ids(result.suggestions)).not.toContain('pilzrisotto');
      expect(ids(result.suggestions)).not.toContain('pilzpfanne');
    }
  });

  it('AC-002: a variant without the dislike still fits', () => {
    const picky = { ...nadja, dislikes: ['pilze'] };
    const withVariant = makeRecipe({
      id: 'curry',
      title: 'Curry',
      variants: [
        { id: 'v-pilz', name: 'Pilze', isDefault: true },
        { id: 'v-tofu', name: 'Tofu', isDefault: false },
      ],
      ingredients: [ing('reis'), ing('pilze', 'v-pilz'), ing('tofu', 'v-tofu')],
    });
    const recipes = [withVariant, dish('a', ['kartoffeln']), dish('b', ['linsen'])];
    const result = slotSuggestions(input({ recipes, members: [enrico, picky] }), thursdayEvening);
    expect(ids(result.suggestions)).toContain('curry');
  });

  it('AC-003: nothing an eater rated 2 stars or less', () => {
    const shakshuka = dish('shakshuka', ['eier'], { ratings: { [nadja.id]: 2 } });
    const recipes = [
      shakshuka,
      dish('a', ['kartoffeln']),
      dish('b', ['linsen']),
      dish('c', ['reis']),
    ];
    const result = slotSuggestions(input({ recipes }), thursdayEvening);
    expect(ids(result.suggestions).sort()).toEqual(['a', 'b', 'c']);
  });

  it('AC-004: nothing cooked in the last 14 days or planned within 7 days of the day', () => {
    const recipes = [
      cooked(dish('dal', ['linsen']), '2026-11-20'),
      dish('chili', ['reis']),
      dish('a', ['kartoffeln']),
      dish('b', ['baguette']),
      dish('c', ['spaghetti']),
    ];
    const entries = [entry({ id: 'e-chili', date: '2026-12-07', recipeId: 'chili' })];
    const result = slotSuggestions(input({ recipes, entries }), thursdayEvening);
    expect(ids(result.suggestions).sort()).toEqual(['a', 'b', 'c']);
  });

  it('AC-004: a recipe in a planned collection counts as planned', () => {
    const recipes = [
      dish('chili', ['reis']),
      makeRecipe({ id: 'party', title: 'Party', kind: 'collection', course: undefined }),
      dish('a', ['kartoffeln']),
      dish('b', ['baguette']),
      dish('c', ['spaghetti']),
    ];
    const base = input({ recipes });
    const result = slotSuggestions(
      {
        ...base,
        entries: [entry({ id: 'e-party', date: '2026-12-01', recipeId: 'party' })],
        book: {
          ...base.book,
          collectionRecipes: [{ id: 'cr', collectionId: 'party', recipeId: 'chili', sort: 0 }],
        },
      },
      thursdayEvening,
    );
    expect(ids(result.suggestions)).not.toContain('chili');
  });

  it('AC-004: a dish cooked 14 days ago and one marked "nicht gemacht" are fine again', () => {
    const recipes = [
      cooked(dish('dal', ['linsen']), '2026-11-13'),
      dish('chili', ['reis']),
      dish('a', ['kartoffeln']),
    ];
    const entries = [
      entry({ id: 'e-chili', date: '2026-12-02', recipeId: 'chili', notDone: true }),
    ];
    const result = slotSuggestions(input({ recipes, entries }), thursdayEvening);
    expect(ids(result.suggestions).sort()).toEqual(['a', 'chili', 'dal']);
  });

  it('AC-005: an overnight Vorlauf is not offered for tomorrow evening from 20:00', () => {
    const curry = dish('kichererbsen-curry', ['linsen'], {
      leadTime: { text: 'Kichererbsen einweichen', hoursBefore: 12 },
    });
    const recipes = [curry, dish('a', ['kartoffeln']), dish('b', ['baguette']), dish('c', [])];
    const tomorrow: Evening = { date: '2026-11-28', slotId: EVENING, eaterIds: BOTH };
    const at = (now: string) => ids(slotSuggestions(input({ recipes, now }), tomorrow).suggestions);
    expect(at('19:55')).toContain('kichererbsen-curry');
    expect(at('20:00')).not.toContain('kichererbsen-curry');
  });

  it('AC-005: a Vorlauf that should have started today at 11:00 is gone at 12:00', () => {
    const marinated = dish('marinated', ['tofu'], {
      leadTime: { text: 'Tofu marinieren', hoursBefore: 6 },
    });
    const recipes = [marinated, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const tonight: Evening = { date: TODAY, slotId: EVENING, eaterIds: BOTH };
    expect(ids(slotSuggestions(input({ recipes, now: '10:55' }), tonight).suggestions)).toContain(
      'marinated',
    );
    expect(ids(slotSuggestions(input({ recipes }), tonight).suggestions)).not.toContain(
      'marinated',
    );
  });

  it('AC-006: title-only recipes are never suggested', () => {
    const recipes = [dish('only-title', []), dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    expect(slotSuggestions(input({ recipes }), thursdayEvening).suggestions).toEqual([]);
  });

  it('AC-007: the first Tageszeit gets breakfasts, the others main dishes', () => {
    const breakfasts = ['porridge', 'pancakes', 'menemen'].map((id) =>
      dish(id, ['haferflocken'], { course: 'breakfast' }),
    );
    const recipes = [...breakfasts, ...pool()];
    const morning = slotSuggestions(input({ recipes }), {
      date: '2026-12-05',
      slotId: MORNING,
      eaterIds: BOTH,
    });
    expect(ids(morning.suggestions).sort()).toEqual(['menemen', 'pancakes', 'porridge']);
    const noon = slotSuggestions(input({ recipes }), { ...thursdayEvening, slotId: NOON });
    expect(noon.suggestions.every((suggestion) => suggestion.recipe.course === 'main')).toBe(true);
  });

  it('AC-018: no suggestions for a day in the past', () => {
    const past = { ...thursdayEvening, date: '2026-11-26' };
    expect(slotSuggestions(input(), past).suggestions).toEqual([]);
  });
});

describe('slotSuggestions — reasons (REQ-002)', () => {
  it('AC-008: favourite of one eater and long not cooked', () => {
    const curry = cooked(
      dish('kokos-curry', ['linsen'], { favoriteOf: [nadja.id], totalMinutes: 35 }),
      '2026-10-02',
    );
    const recipes = [curry, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const shown = slotSuggestions(input({ recipes }), thursdayEvening).suggestions;
    const row = shown.find((suggestion) => suggestion.recipe.id === 'kokos-curry');
    expect(row?.reason).toBe('Favorit von Nadja · zuletzt vor 8 Wochen');
    expect(row?.facts).toBe('35 Min · vegan');
  });

  it('AC-008: a favourite of everyone is "Euer Favorit"; months after 60 days', () => {
    const lasagne = cooked(dish('lasagne', ['spaghetti'], { favoriteOf: BOTH }), '2026-08-01');
    const recipes = [lasagne, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const row = slotSuggestions(input({ recipes }), thursdayEvening).suggestions.find(
      (suggestion) => suggestion.recipe.id === 'lasagne',
    );
    expect(row?.reason).toBe('Euer Favorit · zuletzt vor 3 Monaten');
  });

  it('AC-009: five stars from both eaters', () => {
    const shakshuka = cooked(
      dish('shakshuka', ['eier'], { ratings: { [enrico.id]: 5, [nadja.id]: 5 } }),
      '2026-10-23',
    );
    const recipes = [shakshuka, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const row = slotSuggestions(input({ recipes }), thursdayEvening).suggestions.find(
      (suggestion) => suggestion.recipe.id === 'shakshuka',
    );
    expect(row?.reason).toBe('5 ★ von beiden · zuletzt vor 5 Wochen');
    expect(row?.facts).toBe('30 Min · vegetarisch');
  });

  it('AC-009: one rating shows the average with a comma', () => {
    const risotto = dish('risotto', ['reis'], { ratings: { [enrico.id]: 4.5 } });
    const recipes = [risotto, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const row = slotSuggestions(input({ recipes }), thursdayEvening).suggestions.find(
      (suggestion) => suggestion.recipe.id === 'risotto',
    );
    expect(row?.reason).toBe('4,5 ★ · Noch nie gekocht');
  });

  it('AC-010: the variant an eater needs is named in the facts', () => {
    const padSeeEw = makeRecipe({
      id: 'pad-see-ew',
      title: 'Pad See Ew',
      totalMinutes: 25,
      variants: [
        { id: 'v-huhn', name: 'Hähnchen', isDefault: true },
        { id: 'v-tofu', name: 'Tofu', isDefault: false },
      ],
      ingredients: [ing('reisnudeln'), ing('huhn', 'v-huhn'), ing('tofu', 'v-tofu')],
    });
    const recipes = [padSeeEw, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const row = slotSuggestions(input({ recipes }), thursdayEvening).suggestions.find(
      (suggestion) => suggestion.recipe.id === 'pad-see-ew',
    );
    expect(row?.facts).toBe('25 Min · Tofu für Nadja');
  });

  it('REQ-002: a Vorlauf and a long dish on the weekend show up', () => {
    const dal = dish('dal', ['linsen'], {
      totalMinutes: 90,
      leadTime: { text: 'Linsen einweichen', hoursBefore: 12 },
    });
    const recipes = [dal, dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    const row = slotSuggestions(input({ recipes }), {
      date: '2026-12-05',
      slotId: EVENING,
      eaterIds: BOTH,
    }).suggestions.find((suggestion) => suggestion.recipe.id === 'dal');
    expect(row?.reason).toBe('Noch nie gekocht · am Wochenende');
    expect(row?.facts).toBe('90 Min · vegan · Vorlauf: Linsen einweichen');
  });

  it('AC-019: a vorgemerkt dish comes first with "Vorgemerkt"', () => {
    const recipes = pool();
    const entries = [entry({ id: 'e-later', date: null, recipeId: 'r7' })];
    const result = slotSuggestions(input({ recipes, entries }), thursdayEvening);
    expect(result.suggestions[0]?.recipe.id).toBe('r7');
    expect(result.suggestions[0]?.reason).toBe('Vorgemerkt · Noch nie gekocht');
    expect(result.suggestions[0]?.plannedLaterEntryId).toBe('e-later');
  });

  it('AC-019: a vorgemerkt collection can be suggested for an evening, never for breakfast', () => {
    const party = makeRecipe({
      id: 'party',
      title: 'Party',
      kind: 'collection',
      course: undefined,
      ingredients: [ing('baguette')],
    });
    const recipes = [party, ...pool()];
    const entries = [entry({ id: 'e-party', date: null, recipeId: 'party' })];
    expect(
      ids(slotSuggestions(input({ recipes, entries }), thursdayEvening).suggestions),
    ).toContain('party');
    const breakfasts = ['p1', 'p2', 'p3'].map((id) =>
      dish(id, ['haferflocken'], { course: 'breakfast' }),
    );
    const morning = slotSuggestions(input({ recipes: [...recipes, ...breakfasts], entries }), {
      ...thursdayEvening,
      slotId: MORNING,
    });
    expect(ids(morning.suggestions)).not.toContain('party');
  });
});

describe('slotSuggestions — stable (REQ-003)', () => {
  it('AC-011: same data, same week → same suggestions; reordered input → same suggestions', () => {
    const recipes = pool();
    const first = ids(slotSuggestions(input({ recipes }), thursdayEvening).suggestions);
    const reversed = ids(
      slotSuggestions(input({ recipes: [...recipes].reverse() }), thursdayEvening).suggestions,
    );
    const wednesday = ids(
      slotSuggestions(input({ recipes }), { ...thursdayEvening, date: '2026-12-02' }).suggestions,
    );
    expect(first).toHaveLength(3);
    expect(reversed).toEqual(first);
    expect(wednesday).toEqual(first);
  });

  it('AC-011: another household or week may differ, but is stable too', () => {
    const recipes = [...pool('a'), ...pool('b'), ...pool('c')];
    const other = input({ recipes, householdId: 'h-2' });
    expect(ids(slotSuggestions(other, thursdayEvening).suggestions)).toEqual(
      ids(slotSuggestions(other, thursdayEvening).suggestions),
    );
  });
});

describe('slotSuggestions — variety and limits (REQ-004)', () => {
  it('AC-012: at most one never-cooked dish of three', () => {
    const recipes = pool().map((recipe, index) =>
      index < 2 ? cooked(recipe, '2026-09-01') : recipe,
    );
    for (let round = 0; round < 4; round += 1) {
      const shown = slotSuggestions(input({ recipes }), thursdayEvening, { round }).suggestions;
      expect(shown).toHaveLength(3);
      expect(shown.filter((suggestion) => suggestion.isNew).length).toBeLessThanOrEqual(1);
    }
  });

  it('AC-012: three different bases when there are enough', () => {
    const shown = slotSuggestions(input(), thursdayEvening).suggestions;
    expect(new Set(shown.map((suggestion) => suggestion.base)).size).toBe(3);
  });

  it('AC-013: without any history the limit gives way and the hint says so', () => {
    const result = slotSuggestions(input(), thursdayEvening);
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions.every((suggestion) => suggestion.isNew)).toBe(true);
    expect(result.fresh).toBe(true);
  });

  it('AC-013: with a favourite among the candidates there is no hint', () => {
    const recipes = pool().map((recipe, index) =>
      index === 0 ? { ...recipe, favoriteOf: [enrico.id] } : recipe,
    );
    expect(slotSuggestions(input({ recipes }), thursdayEvening).fresh).toBe(false);
  });

  it('AC-015: fewer than 3 candidates → nothing (the block is hidden)', () => {
    const recipes = [dish('a', ['kartoffeln']), dish('b', ['baguette'])];
    expect(slotSuggestions(input({ recipes }), thursdayEvening)).toEqual({
      suggestions: [],
      more: false,
      fresh: false,
    });
  });

  it('REQ-004: long dishes stand back on weekdays', () => {
    const recipes = [
      ...['l1', 'l2', 'l3'].map((id) => dish(id, ['zucchini'], { totalMinutes: 120 })),
      ...['s1', 's2', 's3'].map((id) => dish(id, ['zucchini'], { totalMinutes: 20 })),
    ];
    // Over many households the short dishes win clearly more often on a Thursday.
    let short = 0;
    for (let household = 0; household < 40; household += 1) {
      const shown = slotSuggestions(
        input({ recipes, householdId: `h-${household}` }),
        thursdayEvening,
      ).suggestions;
      short += shown.filter((suggestion) => suggestion.recipe.id.startsWith('s')).length;
    }
    expect(short).toBeGreaterThan(70);
  });
});

describe('slotSuggestions — "Andere" (REQ-007)', () => {
  it('AC-024: a new round never repeats a shown dish until all were shown', () => {
    const recipes = pool().slice(0, 9);
    let shown: Id[] = [];
    const seen: Id[] = [];
    for (let round = 0; round < 3; round += 1) {
      const result = slotSuggestions(input({ recipes }), thursdayEvening, { round, shown });
      expect(result.more).toBe(true);
      seen.push(...ids(result.suggestions));
      shown = [...shown, ...ids(result.suggestions)];
    }
    expect(new Set(seen).size).toBe(9);
    const again = slotSuggestions(input({ recipes }), thursdayEvening, { round: 3, shown });
    expect(again.suggestions).toHaveLength(3);
  });

  it('AC-024: exactly 3 candidates → no "Andere"', () => {
    const recipes = [dish('a', ['kartoffeln']), dish('b', ['baguette']), dish('c', ['reis'])];
    expect(slotSuggestions(input({ recipes }), thursdayEvening).more).toBe(false);
  });
});

describe('dishBase (REQ-004)', () => {
  it('AC-014: Reisnudeln are pasta, Preiselbeeren are no rice', () => {
    expect(dishBase(dish('pad', ['reisnudeln', 'reis']), articlesById)).toBe('pasta');
    expect(dishBase(dish('wild', ['preiselbeeren', 'zucchini']), articlesById)).toBe('other');
    expect(dishBase(dish('curry', ['zucchini', 'reis']), articlesById)).toBe('rice');
    expect(dishBase(dish('pommes', ['kartoffeln']), articlesById)).toBe('potato');
    expect(dishBase(dish('dal', ['linsen']), articlesById)).toBe('pulses');
    expect(dishBase(dish('brot', ['baguette']), articlesById)).toBe('bread');
    expect(dishBase(dish('unknown', ['gone']), articlesById)).toBe('other');
  });
});

describe('suggestionsHeading (REQ-005)', () => {
  it('AC-016: names the day and Tageszeit', () => {
    expect(suggestionsHeading(THURSDAY, EVENING, slots)).toBe('Vorschläge für Donnerstagabend');
    expect(suggestionsHeading(THURSDAY, NOON, slots)).toBe('Vorschläge für Donnerstagmittag');
    expect(suggestionsHeading(THURSDAY, MORNING, slots)).toBe('Vorschläge fürs Frühstück');
    const own: MealSlot[] = [...slots, { id: 'late', name: 'Spät am Abend', sort: 3 }];
    expect(suggestionsHeading(THURSDAY, 'late', own)).toBe(
      'Vorschläge für Donnerstag, Spät am Abend',
    );
  });
});

const WEEK = [
  '2026-11-30',
  '2026-12-01',
  '2026-12-02',
  '2026-12-03',
  '2026-12-04',
  '2026-12-05',
  '2026-12-06',
];
const evenings = (dates: ISODate[]): Evening[] =>
  dates.map((date) => ({ date, slotId: EVENING, eaterIds: BOTH }));

describe('freeEvenings (REQ-008)', () => {
  it('AC-025: evenings from today on without food; activities do not count', () => {
    const entries = [
      entry({ id: 'e1', date: '2026-12-02', kind: 'restaurant', restaurantId: 'x' }),
      entry({ id: 'e2', date: '2026-12-05', kind: 'text', text: 'Essen bei Oma' }),
      entry({ id: 'e3', date: '2026-12-04', kind: 'activity', activityId: 'y' }),
      entry({ id: 'e4', date: '2026-12-06', slotId: MORNING, recipeId: 'r1' }),
    ];
    expect(freeEvenings(entries, WEEK, EVENING, TODAY)).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-03',
      '2026-12-04',
      '2026-12-06',
    ]);
    expect(weekLineLabel(5)).toBe('5 Abende frei');
  });

  it('AC-026: a past week has no free evenings; today counts', () => {
    expect(freeEvenings([], WEEK, EVENING, '2026-12-07')).toEqual([]);
    expect(freeEvenings([], WEEK, EVENING, '2026-12-06')).toEqual(['2026-12-06']);
  });
});

describe('weekMenu (REQ-009)', () => {
  const big = () => [...pool('a'), ...pool('b')];

  it('AC-027: vorgemerkt first, then at most 6, mixed', () => {
    const recipes = big();
    const entries = [entry({ id: 'e-later', date: null, recipeId: 'a3' })];
    const menu = weekMenu(input({ recipes, entries }), evenings(WEEK.slice(0, 5)));
    expect(ids(menu.planned)).toEqual(['a3']);
    expect(menu.picks).toHaveLength(6);
    expect(ids(menu.picks)).not.toContain('a3');
    const perBase = new Map<string, number>();
    for (const pick of menu.picks) perBase.set(pick.base, (perBase.get(pick.base) ?? 0) + 1);
    expect(Math.max(...perBase.values())).toBeLessThanOrEqual(2);
    expect(menu.more).toBe(true);
  });

  it('AC-027: at most 2 never-cooked when tried dishes exist, at most 2 per cuisine', () => {
    const cuisines = ['Italienisch', 'Indisch', 'Thai', 'Mexikanisch'];
    const recipes = big().map((recipe, index) => ({
      ...(index < 12 ? cooked(recipe, '2026-09-01') : recipe),
      cuisine: cuisines[index % cuisines.length],
    }));
    const menu = weekMenu(input({ recipes }), evenings(WEEK));
    expect(menu.picks).toHaveLength(6);
    expect(menu.picks.filter((pick) => pick.isNew).length).toBeLessThanOrEqual(2);
    for (const cuisine of cuisines) {
      expect(
        menu.picks.filter((pick) => pick.recipe.cuisine === cuisine).length,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('AC-028: "Mehr" adds the next six and keeps the first', () => {
    const recipes = big();
    const first = weekMenu(input({ recipes }), evenings(WEEK));
    const second = weekMenu(input({ recipes }), evenings(WEEK), 2);
    expect(ids(second.picks).slice(0, 6)).toEqual(ids(first.picks));
    expect(new Set(ids(second.picks)).size).toBe(12);
  });

  it('AC-011: reordered input → same menu', () => {
    const recipes = big();
    expect(ids(weekMenu(input({ recipes: [...recipes].reverse() }), evenings(WEEK)).picks)).toEqual(
      ids(weekMenu(input({ recipes }), evenings(WEEK)).picks),
    );
  });

  it('REQ-009: a dish that fits only some evenings says so', () => {
    const recipes = [
      dish('chili', ['reis']),
      dish('a', ['kartoffeln']),
      dish('b', ['baguette']),
      dish('c', ['spaghetti']),
    ];
    // Planned on Wednesday 9.12.: within 7 days of Friday and Sunday, not of Monday.
    const entries = [entry({ id: 'e-chili', date: '2026-12-10', recipeId: 'chili' })];
    const menu = weekMenu(
      input({ recipes, entries }),
      evenings(['2026-11-30', '2026-12-04', '2026-12-06']),
    );
    const chili = menu.picks.find((pick) => pick.recipe.id === 'chili');
    expect(chili?.fits).toEqual(['2026-11-30']);
    expect(chili?.reason).toBe('Noch nie gekocht · nur Mo');
  });

  it('AC-015: fewer than 4 dishes → an empty menu', () => {
    const recipes = [dish('a', ['kartoffeln']), dish('b', ['baguette']), dish('c', ['reis'])];
    expect(weekMenu(input({ recipes }), evenings(WEEK))).toEqual({
      planned: [],
      picks: [],
      more: false,
      fresh: false,
    });
  });
});

describe('distributeWeek (REQ-010)', () => {
  const suggestion = (recipe: Recipe, rest: Partial<PlanSuggestion> = {}): PlanSuggestion => ({
    recipe,
    reason: '',
    facts: '',
    fits: WEEK,
    base: dishBase(recipe, articlesById),
    isNew: true,
    ...rest,
  });

  it('AC-029: keeps rice off neighbouring evenings', () => {
    const risotto = suggestion(dish('risotto', ['reis']));
    const paella = suggestion(dish('paella', ['reis']));
    const pasta = suggestion(dish('pasta', ['spaghetti']));
    const result = distributeWeek(
      input(),
      [risotto, paella, pasta],
      evenings(['2026-11-30', '2026-12-01', '2026-12-02']),
    );
    const day = (id: Id) => result.find((row) => row.suggestion.recipe.id === id)?.date;
    expect(day('pasta')).toBe('2026-12-01');
    expect([day('risotto'), day('paella')].sort()).toEqual(['2026-11-30', '2026-12-02']);
  });

  it('AC-029: an existing rice dish next door counts as neighbour', () => {
    const entries = [entry({ id: 'e-curry', date: '2026-12-01', recipeId: 'curry' })];
    const curry = dish('curry', ['reis']);
    const risotto = suggestion(dish('risotto', ['reis']));
    const pasta = suggestion(dish('pasta', ['spaghetti']));
    const result = distributeWeek(
      input({ recipes: [curry, ...pool()], entries }),
      [risotto, pasta],
      evenings(['2026-11-30', '2026-12-04']),
    );
    expect(result.find((row) => row.suggestion.recipe.id === 'risotto')?.date).toBe('2026-12-04');
  });

  it('AC-030: puts a 90-minute dish on the weekend', () => {
    const long = suggestion(dish('long', ['zucchini'], { totalMinutes: 90 }));
    const quick = suggestion(dish('quick', ['tomaten'], { totalMinutes: 20 }));
    const result = distributeWeek(input(), [long, quick], evenings(['2026-12-04', '2026-12-05']));
    expect(result.map((row) => [row.suggestion.recipe.id, row.date])).toEqual([
      ['quick', '2026-12-04'],
      ['long', '2026-12-05'],
    ]);
  });

  it('REQ-010: early evenings first, only where a dish fits, vorgemerkt early', () => {
    const later = suggestion(dish('later', ['zucchini']), { plannedLaterEntryId: 'e-1' });
    const onlyFriday = suggestion(dish('only-friday', ['tomaten']), { fits: ['2026-12-04'] });
    const result = distributeWeek(
      input(),
      [onlyFriday, later],
      evenings(['2026-11-30', '2026-12-01', '2026-12-04']),
    );
    expect(result.map((row) => [row.suggestion.recipe.id, row.date])).toEqual([
      ['later', '2026-11-30'],
      ['only-friday', '2026-12-04'],
    ]);
  });

  it('AC-031: more dishes than evenings → the rest is vorgemerkt', () => {
    const picks = ['a', 'b', 'c'].map((id) => suggestion(dish(id, ['zucchini'])));
    const result = distributeWeek(input(), picks, evenings(['2026-11-30', '2026-12-01']));
    expect(result.filter((row) => row.date === null)).toHaveLength(1);
    expect(weekPlanLabel(result)).toBe('2 Abende einplanen · 1 vormerken');
    expect(weekPlannedNotice(result)).toBe('2 Abende eingeplant · 1 vorgemerkt');
  });

  it('REQ-010: a dish without a fitting evening is vorgemerkt', () => {
    const nowhere = suggestion(dish('nowhere', ['zucchini']), { fits: ['2026-12-06'] });
    const result = distributeWeek(input(), [nowhere], evenings(['2026-11-30']));
    expect(result).toEqual([{ suggestion: nowhere, date: null }]);
    expect(weekPlanLabel(result)).toBe('1 vormerken');
  });

  it('REQ-010: "Verteilung ändern" pins a dish to an evening or to vormerken', () => {
    const a = suggestion(dish('a', ['zucchini']));
    const b = suggestion(dish('b', ['tomaten']));
    const two = evenings(['2026-11-30', '2026-12-01']);
    const pinned = distributeWeek(input(), [a, b], two, { b: '2026-11-30' });
    expect(pinned.map((row) => [row.suggestion.recipe.id, row.date])).toEqual([
      ['b', '2026-11-30'],
      ['a', '2026-12-01'],
    ]);
    const parked = distributeWeek(input(), [a, b], two, { a: null });
    expect(parked.map((row) => [row.suggestion.recipe.id, row.date])).toEqual([
      ['b', '2026-11-30'],
      ['a', null],
    ]);
  });

  it('REQ-010: same choice in another order → same distribution', () => {
    const picks = ['a', 'b', 'c', 'd'].map((id, index) =>
      suggestion(dish(id, [index % 2 === 0 ? 'reis' : 'spaghetti'])),
    );
    const week = evenings(WEEK.slice(0, 4));
    expect(distributeWeek(input(), [...picks].reverse(), week)).toEqual(
      distributeWeek(input(), picks, week),
    );
  });

  it('REQ-010: nothing chosen → nothing to plan', () => {
    const result = distributeWeek(input(), [], evenings(WEEK));
    expect(result).toEqual([]);
    expect(weekPlanLabel(result)).toBe('Einplanen');
  });

  it('REQ-010: stays quick with seven evenings and many dishes', () => {
    const picks = Array.from({ length: 13 }, (_, index) =>
      suggestion(dish(`d${index}`, [index % 3 === 0 ? 'reis' : 'zucchini'])),
    );
    const started = Date.now();
    const result = distributeWeek(input(), picks, evenings(WEEK));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.filter((row) => row.date !== null)).toHaveLength(7);
  });
});

describe('labels after planning (REQ-011)', () => {
  it('AC-032: one evening, several evenings', () => {
    const one = [{ suggestion: {} as PlanSuggestion, date: '2026-11-30' }];
    expect(weekPlanLabel(one)).toBe('1 Abend einplanen');
    expect(weekPlannedNotice(one)).toBe('1 Abend eingeplant');
  });

  it('AC-034: counts the planned entries with nothing on the list', () => {
    const item = (entryId: Id, checked = false): ShoppingItem => ({
      id: `item-${entryId}`,
      articleId: 'reis',
      checked,
      createdAt: '',
      contributions: [
        { id: 'c', source: { kind: 'recipe', recipeId: 'r', entryId, label: 'x' }, count: 1 },
      ],
    });
    expect(entriesNotOnList([item('e1'), item('e2', true)], ['e1', 'e2', 'e3'])).toEqual(['e3']);
    expect(weekListLabel(1)).toBe('1 Gericht nicht auf der Liste');
    expect(weekListLabel(4)).toBe('4 Gerichte nicht auf der Liste');
  });
});

describe('assignmentPrepNote (REQ-010)', () => {
  it('AC-029: the bar says when a Vorlauf starts', () => {
    const dal = dish('dal', ['linsen'], {
      leadTime: { text: 'Linsen einweichen', hoursBefore: 12 },
    });
    // Thursday 17 Uhr − 12 h = 5 Uhr → the evening before.
    expect(assignmentPrepNote(dal, THURSDAY, 'Abend')).toBe('Vorlauf Mi abends');
    const marinated = dish('m', ['tofu'], { leadTime: { text: 'marinieren', hoursBefore: 4 } });
    expect(assignmentPrepNote(marinated, THURSDAY, 'Abend')).toBe('Vorlauf Do ab 13 Uhr');
    expect(assignmentPrepNote(dish('x', ['reis']), THURSDAY, 'Abend')).toBeUndefined();
  });
});
