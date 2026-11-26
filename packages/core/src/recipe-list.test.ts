import { describe, expect, it } from 'vitest';

import {
  canReshuffle,
  activeFilterChips,
  activeFilterCount,
  applyRecipeListFilter,
  cuisineFacets,
  cuisineKey,
  EMPTY_RECIPE_LIST_FILTER,
  filterButtonLabel,
  formatAverage,
  isQuickFilterActive,
  orderByShuffle,
  RECIPE_SORTS,
  RECIPE_KINDS,
  recipeCountLabel,
  recipeEmptyLabel,
  recipeListCountLabel,
  recipeShowLabel,
  recipeSortShortLabel,
  removeFilterChip,
  shuffleOrder,
  sortRecipeList,
  toggleQuickFilter,
  toggleRecipeKind,
  type RecipeListContext,
  type RecipeListFilter,
} from './recipe-list';
import { searchRecipes } from './recipes';
import {
  articlesById,
  enrico,
  grillabend,
  grillabendRecipes,
  grillArticlesById,
  grillRecipesById,
  hummus,
  makeCollection,
  makeRecipe,
  nadja,
  tzatziki,
} from './test-fixtures';
import type { CollectionRecipe, Recipe, RecipeIngredient } from './types';

const meat: RecipeIngredient = { id: 'i-hack', articleId: 'art-hack', shoppingRule: 'count' };
const cheese: RecipeIngredient = {
  id: 'i-halloumi',
  articleId: 'art-halloumi',
  shoppingRule: 'count',
};
const tofu: RecipeIngredient = { id: 'i-tofu', articleId: 'art-tofu', shoppingRule: 'count' };

const context: RecipeListContext = {
  me: enrico.id,
  members: [enrico, nadja],
  articlesById,
  today: '2026-11-20',
  recipesById: {},
  collectionRecipes: [],
};

/** 8 × Italienisch (3 vegetarian), 5 × Asiatisch, 3 × Orientalisch, 8 without cuisine (AC-005). */
function household24(): Recipe[] {
  const recipes: Recipe[] = [];
  const add = (count: number, cuisine: string | undefined, prefix: string, vegetarian = 0) => {
    for (let index = 0; index < count; index++) {
      recipes.push(
        makeRecipe({
          id: `${prefix}-${index}`,
          title: `${prefix} ${index}`,
          cuisine,
          ingredients: [index < vegetarian ? cheese : meat],
        }),
      );
    }
  };
  add(8, 'Italienisch', 'Ita', 3);
  add(5, 'Asiatisch', 'Asia');
  add(3, 'Orientalisch', 'Orient');
  add(8, undefined, 'Ohne');
  return recipes;
}

const titles = (recipes: readonly { title: string }[]) => recipes.map((recipe) => recipe.title);

/** A fixed sequence instead of Math.random, so a shuffle is repeatable. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe('recipe list: counts and labels (REQ-001)', () => {
  it('AC-001: "24 Rezepte", "1 Rezept", "0 Rezepte"', () => {
    expect(recipeCountLabel(24)).toBe('24 Rezepte');
    expect(recipeCountLabel(1)).toBe('1 Rezept');
    expect(recipeCountLabel(0)).toBe('0 Rezepte');
  });

  it('AC-004: a search without hits names the query', () => {
    expect(recipeEmptyLabel('xyzzy')).toBe('Keine Rezepte für „xyzzy“');
    expect(recipeEmptyLabel('  xyzzy ')).toBe('Keine Rezepte für „xyzzy“');
  });
});

describe('recipe list: quick chips and filter panel (REQ-002)', () => {
  it('AC-005: cuisines come from the recipes with counts, most first', () => {
    const facets = cuisineFacets(household24());
    expect(facets.map((facet) => [facet.label, facet.count])).toEqual([
      ['Italienisch', 8],
      ['Asiatisch', 5],
      ['Orientalisch', 3],
    ]);
  });

  it('AC-005: two cuisines show 13 recipes, "Filter (2)" and two chips', () => {
    const recipes = household24();
    const facets = cuisineFacets(recipes);
    const filter: RecipeListFilter = {
      ...EMPTY_RECIPE_LIST_FILTER,
      cuisines: ['italienisch', 'asiatisch'],
    };
    const shown = applyRecipeListFilter(recipes, filter, context);
    expect(shown).toHaveLength(13);
    expect(recipeShowLabel(shown)).toBe('13 Rezepte zeigen');
    expect(activeFilterCount(filter)).toBe(2);
    expect(filterButtonLabel(activeFilterCount(filter))).toBe('Filter (2)');
    expect(activeFilterChips(filter, facets).map((chip) => chip.label)).toEqual([
      'Italienisch',
      'Asiatisch',
    ]);
  });

  it('spec 0023 AC-057: the button counts like the line over the list', () => {
    const plain = Array.from({ length: 26 }, () => ({ kind: 'recipe' as const }));
    const collections = [{ kind: 'collection' as const }, { kind: 'collection' as const }];
    expect(recipeShowLabel([...plain, ...collections])).toBe('26 Rezepte · 2 Sammlungen zeigen');
    expect(recipeShowLabel(plain)).toBe('26 Rezepte zeigen');
    expect(recipeShowLabel(collections)).toBe('2 Sammlungen zeigen');
    expect(recipeShowLabel([])).toBe('0 Rezepte zeigen');
  });

  it('AC-005: "Filter" without a count when nothing is active; "1 Rezept zeigen"', () => {
    expect(filterButtonLabel(activeFilterCount(EMPTY_RECIPE_LIST_FILTER))).toBe('Filter');
    expect(recipeShowLabel([{ kind: 'recipe' }])).toBe('1 Rezept zeigen');
  });

  it('AC-006: a quick chip adds to a panel filter, and diet holds one value', () => {
    const recipes = household24();
    const italian: RecipeListFilter = { ...EMPTY_RECIPE_LIST_FILTER, cuisines: ['italienisch'] };
    const vegetarian = toggleQuickFilter(italian, 'vegetarian');
    expect(applyRecipeListFilter(recipes, vegetarian, context)).toHaveLength(3);
    expect(activeFilterCount(vegetarian)).toBe(2);

    const vegan = toggleQuickFilter(vegetarian, 'vegan');
    expect(isQuickFilterActive(vegan, 'vegetarian')).toBe(false);
    expect(isQuickFilterActive(vegan, 'vegan')).toBe(true);
    expect(activeFilterCount(vegan)).toBe(2);
    expect(toggleQuickFilter(vegan, 'vegan').diet).toBeUndefined();
  });

  it('AC-006: quick chips without a panel chip of their own are not listed with ✕', () => {
    let filter = EMPTY_RECIPE_LIST_FILTER;
    for (const chip of ['favorites', 'fast', 'vegetarian', 'fitsAll', 'rare'] as const) {
      filter = toggleQuickFilter(filter, chip);
    }
    expect(activeFilterCount(filter)).toBe(5);
    expect(activeFilterChips(filter, [])).toEqual([]);
  });

  it('AC-007: spellings that differ in case and outer spaces count as one cuisine', () => {
    const recipes = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeRecipe({ id: `i${index}`, title: `I ${index}`, cuisine: 'Italienisch' }),
      ),
      makeRecipe({ id: 'lower', title: 'Lower', cuisine: 'italienisch ' }),
    ];
    const facets = cuisineFacets(recipes);
    expect(facets).toEqual([{ key: 'italienisch', label: 'Italienisch', count: 6 }]);
    const filter = { ...EMPTY_RECIPE_LIST_FILTER, cuisines: [facets[0]?.key ?? ''] };
    expect(applyRecipeListFilter(recipes, filter, context)).toHaveLength(6);
  });

  it('AC-007: the most common spelling is shown, on a tie the first from A to Z', () => {
    const recipes = [
      makeRecipe({ id: 'a', title: 'A', cuisine: 'thai' }),
      makeRecipe({ id: 'b', title: 'B', cuisine: 'Thai' }),
      makeRecipe({ id: 'c', title: 'C', cuisine: ' Asiatisch' }),
      makeRecipe({ id: 'd', title: 'D', cuisine: 'ASIATISCH' }),
      makeRecipe({ id: 'e', title: 'E', cuisine: 'asiatisch' }),
      makeRecipe({ id: 'f', title: 'F', cuisine: 'Asiatisch' }),
    ];
    expect(cuisineFacets(recipes).map((facet) => [facet.label, facet.count])).toEqual([
      ['Asiatisch', 4],
      ['thai', 2],
    ]);
    expect(cuisineKey('  Italienisch ')).toBe('italienisch');
  });

  it('AC-008: nothing fits → "0 Rezepte zeigen", then "Keine Rezepte für diese Filter"', () => {
    const recipes = household24().map((recipe) => ({ ...recipe, totalMinutes: 40 }));
    const filter: RecipeListFilter = {
      ...EMPTY_RECIPE_LIST_FILTER,
      cuisines: ['orientalisch'],
      maxMinutes: 15,
    };
    const shown = applyRecipeListFilter(recipes, filter, context);
    expect(recipeShowLabel(shown)).toBe('0 Rezepte zeigen');
    expect(recipeEmptyLabel('')).toBe('Keine Rezepte für diese Filter');
    expect(applyRecipeListFilter(recipes, EMPTY_RECIPE_LIST_FILTER, context)).toHaveLength(24);
  });

  it('AC-008: time 15 and 60 are chips with ✕, 30 is the quick chip; ✕ removes the value', () => {
    const facets = cuisineFacets(household24());
    const filter: RecipeListFilter = {
      ...EMPTY_RECIPE_LIST_FILTER,
      cuisines: ['orientalisch'],
      maxMinutes: 15,
      courses: ['dessert'],
      minRating: 4.5,
    };
    const chips = activeFilterChips(filter, facets);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Dessert',
      'Orientalisch',
      '< 15 Min',
      'ab 4,5 ★',
    ]);
    let rest = filter;
    for (const chip of chips) rest = removeFilterChip(rest, chip);
    expect(rest).toEqual(EMPTY_RECIPE_LIST_FILTER);
    expect(activeFilterChips({ ...EMPTY_RECIPE_LIST_FILTER, maxMinutes: 30 }, facets)).toEqual([]);
  });

  it('AC-009: without any cuisine there is no section "Küche"', () => {
    const recipes = [
      makeRecipe({ id: 'a', title: 'A' }),
      makeRecipe({ id: 'b', title: 'B', cuisine: '  ' }),
    ];
    expect(cuisineFacets(recipes)).toEqual([]);
    expect(cuisineFacets([])).toEqual([]);
  });

  it('a recipe passes with one of several courses; all sections must fit', () => {
    const recipes = [
      makeRecipe({ id: 'm', title: 'Main', course: 'main', cuisine: 'Italienisch' }),
      makeRecipe({ id: 'd', title: 'Dessert', course: 'dessert', cuisine: 'Asiatisch' }),
      makeRecipe({ id: 's', title: 'Snack', course: 'snack', cuisine: 'Italienisch' }),
    ];
    const courses = { ...EMPTY_RECIPE_LIST_FILTER, courses: ['main' as const, 'dessert' as const] };
    expect(titles(applyRecipeListFilter(recipes, courses, context))).toEqual(['Main', 'Dessert']);
    expect(
      titles(applyRecipeListFilter(recipes, { ...courses, cuisines: ['italienisch'] }, context)),
    ).toEqual(['Main']);
  });

  it('quick chips: own favourites, ≤ 30 min, fits every member, not cooked for 21 days', () => {
    const recipes = [
      makeRecipe({ id: 'fav', title: 'Fav', favoriteOf: [enrico.id], ingredients: [meat] }),
      makeRecipe({ id: 'nadja', title: 'NadjaFav', favoriteOf: [nadja.id], ingredients: [meat] }),
      makeRecipe({ id: 'fast', title: 'Fast', totalMinutes: 30, ingredients: [tofu] }),
      makeRecipe({
        id: 'recent',
        title: 'Recent',
        lastCookedOn: '2026-11-10',
        ingredients: [tofu],
      }),
      makeRecipe({ id: 'old', title: 'Old', lastCookedOn: '2026-10-30', ingredients: [cheese] }),
    ];
    const only = (chip: Parameters<typeof toggleQuickFilter>[1]) =>
      titles(
        applyRecipeListFilter(recipes, toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, chip), context),
      );
    expect(only('favorites')).toEqual(['Fav']);
    expect(only('fast')).toEqual(['Fast']);
    expect(only('fitsAll')).toEqual(['Fast', 'Recent', 'Old']);
    expect(only('rare')).toEqual(['Fav', 'NadjaFav', 'Fast', 'Old']);
  });
});

describe('recipe list: sorting and random order (REQ-003)', () => {
  it('AC-010: the menu lists the sorts in order; the button names the chosen one', () => {
    expect(RECIPE_SORTS.map((sort) => sort.label)).toEqual([
      'Zuletzt gekocht',
      'Am häufigsten',
      'Bewertung',
      'Neu',
      'A–Z',
      'Zufall',
    ]);
    expect(recipeSortShortLabel('recent')).toBe('Zuletzt');
    expect(recipeSortShortLabel('title')).toBe('A–Z');
    const recipes = [
      makeRecipe({ id: 'b', title: 'Shakshuka' }),
      makeRecipe({ id: 'a', title: 'Lasagne' }),
      makeRecipe({ id: 'c', title: 'Äpfel im Schlafrock' }),
    ];
    expect(titles(sortRecipeList(recipes, 'title', []))).toEqual([
      'Äpfel im Schlafrock',
      'Lasagne',
      'Shakshuka',
    ]);
  });

  it('AC-011: a shuffle is a permutation, repeatable with the same random numbers', () => {
    const ids = Array.from({ length: 24 }, (_, index) => `r${index}`);
    const first = shuffleOrder(ids, sequence([0.1, 0.7, 0.3, 0.9, 0.5]));
    expect([...first].sort()).toEqual([...ids].sort());
    expect(first).not.toEqual(ids);
    expect(shuffleOrder(ids, sequence([0.1, 0.7, 0.3, 0.9, 0.5]))).toEqual(first);
    expect(shuffleOrder(ids, sequence([0.8, 0.2, 0.6]))).not.toEqual(first);
    expect(ids[0]).toBe('r0');
  });

  it('AC-011: Fisher–Yates swaps from the end with the drawn index', () => {
    expect(shuffleOrder(['a', 'b', 'c'], sequence([0]))).toEqual(['b', 'c', 'a']);
    expect(shuffleOrder(['a', 'b', 'c'], sequence([0.99]))).toEqual(['a', 'b', 'c']);
    expect(shuffleOrder([], sequence([0.5]))).toEqual([]);
  });

  it('AC-011: "Zufall" keeps the stored order', () => {
    const recipes = [
      makeRecipe({ id: 'a', title: 'A' }),
      makeRecipe({ id: 'b', title: 'B' }),
      makeRecipe({ id: 'c', title: 'C' }),
    ];
    expect(titles(sortRecipeList(recipes, 'random', ['c', 'a', 'b']))).toEqual(['C', 'A', 'B']);
  });

  it('AC-012: filtering keeps the random order; new recipes go to the end, deleted ones out', () => {
    const shakshuka = makeRecipe({ id: 'shak', title: 'Shakshuka', ingredients: [cheese] });
    const lasagne = makeRecipe({ id: 'las', title: 'Lasagne', ingredients: [meat] });
    const dal = makeRecipe({ id: 'dal', title: 'Linsen-Dal', ingredients: [tofu] });
    const curry = makeRecipe({ id: 'curry', title: 'Mango-Curry', ingredients: [meat] });
    const order = ['shak', 'las', 'dal', 'curry'];
    const vegetarian = toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'vegetarian');

    const all = [curry, dal, lasagne, shakshuka];
    expect(
      titles(applyRecipeListFilter(sortRecipeList(all, 'random', order), vegetarian, context)),
    ).toEqual(['Shakshuka', 'Linsen-Dal']);

    const kuerbis = makeRecipe({ id: 'kuerbis', title: 'Kürbissuppe' });
    expect(titles(sortRecipeList([kuerbis, ...all], 'random', order))).toEqual([
      'Shakshuka',
      'Lasagne',
      'Linsen-Dal',
      'Mango-Curry',
      'Kürbissuppe',
    ]);

    const apfel = makeRecipe({ id: 'apfel', title: 'Apfelkuchen' });
    expect(
      titles(orderByShuffle([kuerbis, apfel, curry, shakshuka], order, (recipe) => recipe.title)),
    ).toEqual(['Shakshuka', 'Mango-Curry', 'Apfelkuchen', 'Kürbissuppe']);
  });
});

describe('recipe list: average rating (REQ-011)', () => {
  const recipes = [
    makeRecipe({ id: 'shak', title: 'Shakshuka' }),
    makeRecipe({ id: 'curry', title: 'Mango-Curry', ratings: { [enrico.id]: 4 } }),
    makeRecipe({ id: 'las', title: 'Lasagne', ratings: { [enrico.id]: 4.5, [nadja.id]: 5 } }),
  ];

  it('AC-040: the tile shows the average with one decimal and a comma, rounded half up', () => {
    expect(formatAverage(4.75)).toBe('4,8');
    expect(formatAverage(4.25)).toBe('4,3');
    expect(formatAverage(4.5)).toBe('4,5');
    expect(formatAverage(5)).toBe('5');
    expect(formatAverage(3.333)).toBe('3,3');
  });

  it('AC-042: the rating filter counts the average from the threshold on', () => {
    const minimum = (minRating: 4 | 4.5) =>
      titles(applyRecipeListFilter(recipes, { ...EMPTY_RECIPE_LIST_FILTER, minRating }, context));
    expect(minimum(4.5)).toEqual(['Lasagne']);
    expect(minimum(4)).toEqual(['Mango-Curry', 'Lasagne']);
  });

  it('AC-042: sorting by rating puts unrated recipes after all rated ones', () => {
    expect(titles(sortRecipeList(recipes, 'rating', []))).toEqual([
      'Lasagne',
      'Mango-Curry',
      'Shakshuka',
    ]);
  });
});

describe('Sammlungen in "Essen → Rezepte" (spec 0009, REQ-006)', () => {
  const raclette = makeCollection({ id: 'col-raclette', title: 'Raclette-Abend' });
  const mezze = makeCollection({ id: 'col-mezze', title: 'Mezze-Abend' });
  const rows: CollectionRecipe[] = [
    ...grillabendRecipes,
    { id: 'cr-hummus', collectionId: mezze.id, recipeId: hummus.id, sort: 0 },
    { id: 'cr-tzatziki', collectionId: mezze.id, recipeId: tzatziki.id, sort: 1 },
  ];
  const all: Recipe[] = [...household24(), grillabend, raclette, mezze, hummus, tzatziki];
  const grillContext: RecipeListContext = {
    ...context,
    articlesById: { ...articlesById, ...grillArticlesById },
    recipesById: {
      ...grillRecipesById,
      ...Object.fromEntries(all.map((recipe) => [recipe.id, recipe])),
    },
    collectionRecipes: rows,
  };
  const shown = (filter: RecipeListFilter) =>
    titles(applyRecipeListFilter(all, filter, grillContext));

  it('AC-018: the section "Art" offers "Rezepte" and "Sammlungen", one value or none', () => {
    expect(RECIPE_KINDS).toEqual([
      { value: 'recipe', label: 'Rezepte' },
      { value: 'collection', label: 'Sammlungen' },
    ]);
    const collections = toggleRecipeKind(EMPTY_RECIPE_LIST_FILTER, 'collection');
    expect(collections.kind).toBe('collection');
    expect(toggleRecipeKind(collections, 'recipe').kind).toBe('recipe');
    expect(toggleRecipeKind(collections, 'collection').kind).toBeUndefined();
  });

  it('AC-018: "Sammlungen" shows only the collections, with a chip and a count', () => {
    const filter = toggleRecipeKind(EMPTY_RECIPE_LIST_FILTER, 'collection');
    expect(shown(filter)).toEqual(['Grillabend', 'Raclette-Abend', 'Mezze-Abend']);
    expect(activeFilterCount(filter)).toBe(1);
    const chips = activeFilterChips(filter, []);
    expect(chips).toEqual([{ kind: 'kind', value: 'collection', label: 'Sammlungen' }]);
    const [chip] = chips;
    expect(chip && removeFilterChip(filter, chip).kind).toBeUndefined();
    expect(shown(toggleRecipeKind(EMPTY_RECIPE_LIST_FILTER, 'recipe'))).toHaveLength(26);
  });

  it('AC-018: the search finds "Grillabend" typo tolerant by its title', () => {
    expect(titles(searchRecipes('grilabend', all, grillContext.articlesById))).toEqual([
      'Grillabend',
    ]);
  });

  it('AC-019: "< 30 Min" never matches a collection without time; a cuisine none of its recipes has neither', () => {
    expect(shown(toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'fast'))).not.toContain('Grillabend');
    expect(shown({ ...EMPTY_RECIPE_LIST_FILTER, cuisines: ['italienisch'] })).not.toContain(
      'Grillabend',
    );
    // Spec 0037, AC-015: a contained main course makes the collection one.
    expect(shown({ ...EMPTY_RECIPE_LIST_FILTER, courses: ['main'] })).toContain('Grillabend');
  });

  it('AC-020: "Vegetarisch" shows "Mezze-Abend", not "Grillabend"; "Vegan" neither', () => {
    const vegetarian = shown(toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'vegetarian'));
    expect(vegetarian).toContain('Mezze-Abend');
    expect(vegetarian).not.toContain('Grillabend');
    const vegan = shown(toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'vegan'));
    expect(vegan).not.toContain('Mezze-Abend');
    expect(vegan).not.toContain('Grillabend');
  });

  it('AC-020: "Passt für alle" asks the whole collection', () => {
    const fitsAll = shown(toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'fitsAll'));
    expect(fitsAll).toContain('Mezze-Abend');
    expect(fitsAll).not.toContain('Grillabend');
  });

  it('Offene Frage 8 A: "24 Rezepte · 2 Sammlungen", only collections, none', () => {
    const recipes = household24();
    expect(recipeListCountLabel([...recipes, grillabend, raclette])).toBe(
      '24 Rezepte · 2 Sammlungen',
    );
    expect(recipeListCountLabel([grillabend, raclette])).toBe('2 Sammlungen');
    expect(recipeListCountLabel([grillabend])).toBe('1 Sammlung');
    expect(recipeListCountLabel(recipes)).toBe('24 Rezepte');
    expect(recipeListCountLabel([])).toBe('0 Rezepte');
  });
});

describe('canReshuffle (spec 0036, REQ-001)', () => {
  it('AC-001: "Neu mischen" is offered with "Zufall" and no search', () => {
    expect(canReshuffle('random', '')).toBe(true);
    expect(canReshuffle('random', '  ')).toBe(true);
    expect(canReshuffle('title', '')).toBe(false);
  });

  it('AC-002: a search hides "Neu mischen" (the search sorts by hit)', () => {
    expect(canReshuffle('random', 'Nudeln')).toBe(false);
  });
});
