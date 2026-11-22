import { describe, expect, it } from 'vitest';

import {
  canPutCollectionOnList,
  collectionContentLabel,
  collectionContents,
  collectionContributions,
  collectionDiet,
  collectionFitsPreference,
  collectionListHint,
  collectionRecipeCountLabel,
  collectionSummary,
  COLLECTION_LIMITS,
  coverPhotos,
  type CollectionContent,
} from './collections';
import { summarizeItem, type PlannedContribution } from './shopping';
import {
  grillabend,
  grillabendRecipes,
  grillArticlesById,
  grillgemuese,
  grillRecipesById,
  hummus,
  kartoffelsalat,
  makeCollection,
  makeRecipe,
  tzatziki,
} from './test-fixtures';
import type { CollectionRecipe, Id, Recipe } from './types';

// Spec 0009: Friday, 20 November 2026. "Grillabend" for 6 with Kartoffelsalat (takes the portions)
// and Grillgemüse (own 8 portions, "mit Halloumi"), own ingredients Würstchen 12 and Grillkohle.

const contentsOf = (
  collection: Recipe,
  rows: CollectionRecipe[] = grillabendRecipes,
  recipesById: Record<Id, Recipe> = grillRecipesById,
): CollectionContent[] => collectionContents(collection, rows, recipesById);

/** The pantry check's rows: one per article, amount summed, origins in order (like api). */
function pantryRows(planned: PlannedContribution[]) {
  const byArticle = new Map<Id, PlannedContribution[]>();
  for (const contribution of planned) {
    byArticle.set(contribution.articleId, [
      ...(byArticle.get(contribution.articleId) ?? []),
      contribution,
    ]);
  }
  return [...byArticle.values()].map((contributions) => {
    const first = contributions[0];
    const summary = summarizeItem({
      id: 'preview',
      articleId: first?.articleId ?? '',
      checked: false,
      createdAt: '',
      contributions: contributions.map((contribution, index) => ({
        id: `p-${index}`,
        source: { kind: 'recipe', recipeId: contribution.recipeId, label: contribution.label },
        count: contribution.count,
        qty: contribution.qty,
        unit: contribution.unit,
      })),
    });
    return {
      line: `${first?.name ?? ''} ${summary.amount}`,
      sources: summary.sources,
      isPantry: first?.isPantry ?? false,
    };
  });
}

const saturday = { id: 'plan-grill', date: '2026-11-21' };

describe('REQ-003, REQ-005: what a collection contains', () => {
  it('AC-014: in the order of sort, with own portions or those of the collection', () => {
    const contents = contentsOf(grillabend);
    expect(contents.map((content) => [content.recipe.title, content.servings])).toEqual([
      ['Kartoffelsalat', 6],
      ['Grillgemüse', 8],
    ]);
    expect(contents[0]?.inherits).toBe(true);
    expect(contents[1]?.inherits).toBe(false);
    expect(contents[1]?.variantId).toBe('v-halloumi');
  });

  it('orders equal sort values by id and leaves out rows of other collections', () => {
    const rows: CollectionRecipe[] = [
      { id: 'cr-b', collectionId: grillabend.id, recipeId: tzatziki.id, sort: 0 },
      { id: 'cr-a', collectionId: grillabend.id, recipeId: hummus.id, sort: 0 },
      { id: 'cr-other', collectionId: 'col-other', recipeId: kartoffelsalat.id, sort: 0 },
    ];
    expect(contentsOf(grillabend, rows).map((content) => content.row.id)).toEqual(['cr-a', 'cr-b']);
  });

  it('AC-015: a recipe that takes the portions follows a change of the collection', () => {
    const contents = contentsOf({ ...grillabend, servings: 10 });
    expect(contents.map(collectionContentLabel)).toEqual([
      'Kartoffelsalat · 10 Port. (wie Sammlung)',
      'Grillgemüse · 8 Port.',
    ]);
  });

  it('AC-006: new rows take the portions of the collection', () => {
    const rows: CollectionRecipe[] = [
      { id: 'cr-1', collectionId: grillabend.id, recipeId: kartoffelsalat.id, sort: 0 },
      { id: 'cr-2', collectionId: grillabend.id, recipeId: grillgemuese.id, sort: 1 },
    ];
    expect(contentsOf(grillabend, rows).map(collectionContentLabel)).toEqual([
      'Kartoffelsalat · 6 Port. (wie Sammlung)',
      'Grillgemüse · 6 Port. (wie Sammlung)',
    ]);
  });

  it('AC-016: the line names a chosen variant other than the default', () => {
    const rows = grillabendRecipes.map((row) =>
      row.recipeId === grillgemuese.id ? { ...row, variantId: 'v-vegan' } : row,
    );
    expect(contentsOf(grillabend, rows).map(collectionContentLabel)).toEqual([
      'Kartoffelsalat · 6 Port. (wie Sammlung)',
      'Grillgemüse · vegan · 8 Port.',
    ]);
  });

  it('Offene Frage 4 A: a chosen variant the recipe no longer has falls back to the default', () => {
    const rows = grillabendRecipes.map((row) =>
      row.recipeId === grillgemuese.id ? { ...row, variantId: 'v-gone' } : row,
    );
    const [, gemuese] = contentsOf(grillabend, rows);
    expect(gemuese?.variantId).toBe('v-halloumi');
    expect(gemuese && collectionContentLabel(gemuese)).toBe('Grillgemüse · 8 Port.');
  });

  it('leaves out a row whose recipe is not in the local cache (deleted on another device)', () => {
    const { [kartoffelsalat.id]: _gone, ...rest } = grillRecipesById;
    expect(contentsOf(grillabend, grillabendRecipes, rest).map((c) => c.recipe.title)).toEqual([
      'Grillgemüse',
    ]);
  });
});

describe('REQ-002: texts of a collection', () => {
  it('AC-004: "für 6 · 2 Rezepte · 4 eigene Zutaten"', () => {
    const withFour = makeCollection({
      id: grillabend.id,
      title: 'Grillabend',
      ingredients: [
        ...grillabend.ingredients,
        { id: 'o-bier', articleId: 'art-bier', shoppingRule: 'count' },
        { id: 'o-anzuender', articleId: 'art-anzuender', shoppingRule: 'count' },
      ],
    });
    expect(collectionSummary(withFour, contentsOf(withFour))).toBe(
      'für 6 · 2 Rezepte · 4 eigene Zutaten',
    );
  });

  it('parts with 0 drop out, one of each is singular', () => {
    const one = makeCollection({
      id: grillabend.id,
      title: 'Grillabend',
      ingredients: grillabend.ingredients.slice(0, 1),
    });
    expect(collectionSummary(one, contentsOf(one, grillabendRecipes.slice(0, 1)))).toBe(
      'für 6 · 1 Rezept · 1 eigene Zutat',
    );
    const empty = makeCollection({ id: 'col-leer', title: 'Leer' });
    expect(collectionSummary(empty, [])).toBe('für 6');
  });

  it('AC-018, AC-024: "2 Rezepte", "1 Rezept", nothing for 0', () => {
    expect(collectionRecipeCountLabel(2)).toBe('2 Rezepte');
    expect(collectionRecipeCountLabel(1)).toBe('1 Rezept');
    expect(collectionRecipeCountLabel(0)).toBe('');
  });
});

describe('REQ-005, REQ-008: scaling and Herkunft', () => {
  it('AC-014: the plan entry for 3 scales everything by 3/6', () => {
    const planned = collectionContributions(grillabend, contentsOf(grillabend), grillArticlesById, {
      portions: 3,
      entry: saturday,
    });
    const rows = pantryRows(planned);
    expect(rows.map((row) => row.line)).toEqual([
      'Würstchen 6×',
      'Grillkohle 1×',
      'Kartoffeln 1,5 kg',
      'Mayonnaise 1×',
      'Zucchini 2×',
      'Olivenöl 1×',
      'Halloumi 1×',
    ]);
    expect(rows.filter((row) => row.isPantry).map((row) => row.line)).toEqual(['Olivenöl 1×']);
  });

  it('AC-027: from the calendar the Herkunft carries the day; source is the collection', () => {
    const planned = collectionContributions(grillabend, contentsOf(grillabend), grillArticlesById, {
      portions: 3,
      entry: saturday,
    });
    expect([...new Set(planned.map((contribution) => contribution.label))]).toEqual([
      'Grillabend (Sa)',
      'Grillabend · Kartoffelsalat (Sa)',
      'Grillabend · Grillgemüse (Sa)',
    ]);
    expect(new Set(planned.map((contribution) => contribution.recipeId))).toEqual(
      new Set([grillabend.id]),
    );
    expect(new Set(planned.map((contribution) => contribution.entryId))).toEqual(
      new Set(['plan-grill']),
    );
  });

  it('a parked entry says "(vorgemerkt)"', () => {
    const planned = collectionContributions(grillabend, contentsOf(grillabend), grillArticlesById, {
      portions: 6,
      entry: { id: 'plan-parked', date: null },
    });
    expect(planned[0]?.label).toBe('Grillabend (vorgemerkt)');
  });

  it('AC-025: from the page with the portions of the collection, Herkunft per line', () => {
    const planned = collectionContributions(grillabend, contentsOf(grillabend), grillArticlesById, {
      portions: grillabend.servings,
    });
    const rows = pantryRows(planned);
    expect(rows.map((row) => [row.line, row.sources])).toEqual([
      ['Würstchen 12×', ['Grillabend']],
      ['Grillkohle 1×', ['Grillabend']],
      ['Kartoffeln 3 kg', ['Grillabend · Kartoffelsalat']],
      ['Mayonnaise 1×', ['Grillabend · Kartoffelsalat']],
      ['Zucchini 4×', ['Grillabend · Grillgemüse']],
      ['Olivenöl 1×', ['Grillabend · Grillgemüse']],
      ['Halloumi 1×', ['Grillabend · Grillgemüse']],
    ]);
    expect(new Set(planned.map((contribution) => contribution.entryId))).toEqual(new Set(['']));
  });

  it('AC-016: the variant "vegan" brings Zucchini but no Halloumi', () => {
    const rows = grillabendRecipes.map((row) =>
      row.recipeId === grillgemuese.id ? { ...row, variantId: 'v-vegan' } : row,
    );
    const planned = collectionContributions(
      grillabend,
      contentsOf(grillabend, rows),
      grillArticlesById,
      { portions: 6 },
    );
    const names = planned.map((contribution) => contribution.name);
    expect(names).toContain('Zucchini');
    expect(names).not.toContain('Halloumi');
  });

  it('AC-026: merged with "Kartoffeln 500 g" von Hand into one row of 3,5 kg', () => {
    const planned = collectionContributions(grillabend, contentsOf(grillabend), grillArticlesById, {
      portions: 6,
    });
    const kartoffeln = planned.filter(
      (contribution) => contribution.articleId === 'art-kartoffeln',
    );
    const summary = summarizeItem({
      id: 'item',
      articleId: 'art-kartoffeln',
      checked: false,
      createdAt: '',
      contributions: [
        { id: 'manual', source: { kind: 'manual' }, qty: 500, unit: 'g' },
        ...kartoffeln.map((contribution, index) => ({
          id: `c-${index}`,
          source: {
            kind: 'recipe' as const,
            recipeId: contribution.recipeId,
            label: contribution.label,
          },
          qty: contribution.qty,
          unit: contribution.unit,
        })),
      ],
    });
    expect(summary.amount).toBe('3,5 kg');
    expect(summary.sources).toEqual(['von Hand', 'Grillabend · Kartoffelsalat']);
  });

  it('AC-028: an empty collection has nothing for the list and says "Noch nichts enthalten"', () => {
    const leer = makeCollection({ id: 'col-leer', title: 'Leer' });
    expect(canPutCollectionOnList(leer, [])).toBe(false);
    expect(collectionListHint(leer, [])).toBe('Noch nichts enthalten');
    expect(canPutCollectionOnList(grillabend, contentsOf(grillabend))).toBe(true);
    expect(collectionListHint(grillabend, contentsOf(grillabend))).toBeUndefined();
  });

  it('content with nothing to buy cannot go on the list, without the hint for empty ones', () => {
    const skipOnly = makeRecipe({
      id: 'rec-skip',
      title: 'Nur Salz',
      ingredients: [{ id: 's', articleId: 'art-kartoffeln', shoppingRule: 'skip' }],
    });
    const collection = makeCollection({ id: 'col-salz', title: 'Salzabend' });
    const contents = collectionContents(
      collection,
      [{ id: 'cr', collectionId: collection.id, recipeId: skipOnly.id, sort: 0 }],
      { [skipOnly.id]: skipOnly },
    );
    expect(canPutCollectionOnList(collection, contents)).toBe(false);
    expect(collectionListHint(collection, contents)).toBeUndefined();
  });
});

describe('REQ-006: diet of a collection', () => {
  const mezze = makeCollection({ id: 'col-mezze', title: 'Mezze-Abend' });
  const mezzeRows: CollectionRecipe[] = [
    { id: 'cr-hummus', collectionId: mezze.id, recipeId: hummus.id, sort: 0 },
    { id: 'cr-tzatziki', collectionId: mezze.id, recipeId: tzatziki.id, sort: 1 },
  ];

  it('AC-020: "Mezze-Abend" is vegetarian, not vegan; "Grillabend" neither', () => {
    const mezzeContents = contentsOf(mezze, mezzeRows);
    expect(collectionDiet(mezze, mezzeContents, grillArticlesById)).toBe('vegetarian');
    expect(collectionFitsPreference(mezze, mezzeContents, 'vegetarian', grillArticlesById)).toBe(
      true,
    );
    expect(collectionFitsPreference(mezze, mezzeContents, 'vegan', grillArticlesById)).toBe(false);

    const grill = contentsOf(grillabend);
    expect(collectionDiet(grillabend, grill, grillArticlesById)).toBe('meat');
    expect(collectionFitsPreference(grillabend, grill, 'vegetarian', grillArticlesById)).toBe(
      false,
    );
    expect(collectionFitsPreference(grillabend, grill, 'flexible', grillArticlesById)).toBe(true);
  });

  it('AC-016: each recipe counts in its chosen variant', () => {
    const veggie = makeCollection({ id: 'col-veggie', title: 'Gemüseabend' });
    const row = (variantId: Id): CollectionRecipe[] => [
      { id: 'cr', collectionId: veggie.id, recipeId: grillgemuese.id, variantId, sort: 0 },
    ];
    expect(collectionDiet(veggie, contentsOf(veggie, row('v-vegan')), grillArticlesById)).toBe(
      'vegan',
    );
    expect(collectionDiet(veggie, contentsOf(veggie, row('v-halloumi')), grillArticlesById)).toBe(
      'vegetarian',
    );
  });

  it('an empty collection is "unbekannt", like a recipe without ingredients', () => {
    const leer = makeCollection({ id: 'col-leer', title: 'Leer' });
    expect(collectionDiet(leer, [], grillArticlesById)).toBe('unknown');
    expect(collectionFitsPreference(leer, [], 'vegetarian', grillArticlesById)).toBe(false);
  });
});

describe('REQ-002: the photo', () => {
  const photoRecipe = (index: number, withPhoto: boolean): Recipe =>
    makeRecipe({
      id: `rec-${index}`,
      title: `Rezept ${index}`,
      ...(withPhoto ? { photoPath: `household/recipes/rec-${index}/p.jpg` } : {}),
    });
  const contentsFor = (recipes: Recipe[]): CollectionContent[] => {
    const collection = makeCollection({ id: 'col-fotos', title: 'Fotos' });
    return collectionContents(
      collection,
      recipes.map((recipe, sort) => ({
        id: `cr-${recipe.id}`,
        collectionId: collection.id,
        recipeId: recipe.id,
        sort,
      })),
      Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe])),
    );
  };
  const collection = makeCollection({ id: 'col-fotos', title: 'Fotos' });
  const ids = (recipes: Recipe[]) => recipes.map((recipe) => recipe.id);

  it('AC-004: the photos of the contained recipes in their order', () => {
    expect(ids(coverPhotos(grillabend, contentsOf(grillabend)))).toEqual([
      kartoffelsalat.id,
      grillgemuese.id,
    ]);
  });

  it('AC-005: without any photo nothing (the placeholder), with an own photo only that', () => {
    expect(coverPhotos(collection, contentsFor([photoRecipe(1, false)]))).toEqual([]);
    const own = { ...collection, photoPath: 'household/recipes/col-fotos/own.jpg' };
    expect(ids(coverPhotos(own, contentsOf(grillabend)))).toEqual([own.id]);
  });

  it('skips recipes without photo and takes at most four', () => {
    expect(ids(coverPhotos(collection, contentsFor([photoRecipe(1, true)])))).toEqual(['rec-1']);
    const three = [1, 2, 3].map((index) => photoRecipe(index, true));
    expect(ids(coverPhotos(collection, contentsFor([photoRecipe(0, false), ...three])))).toEqual([
      'rec-1',
      'rec-2',
      'rec-3',
    ]);
    const five = [1, 2, 3, 4, 5].map((index) => photoRecipe(index, true));
    expect(ids(coverPhotos(collection, contentsFor(five)))).toEqual([
      'rec-1',
      'rec-2',
      'rec-3',
      'rec-4',
    ]);
  });

  it('a recipe shows its own photo, without photo nothing', () => {
    expect(ids(coverPhotos(kartoffelsalat, []))).toEqual([kartoffelsalat.id]);
    expect(coverPhotos(tzatziki, [])).toEqual([]);
  });
});

describe('E15: limits', () => {
  it('Offene Frage 5 A: 50 recipes per collection, 20 removed at once', () => {
    expect(COLLECTION_LIMITS).toEqual({ recipes: 50, removeAtOnce: 20 });
  });
});
