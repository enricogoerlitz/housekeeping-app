import { describe, expect, it } from 'vitest';

import { articleFilterCounts, filterArticles } from './article-catalog';
import { collectionDiet } from './collections';
import {
  deriveRecipeDiet,
  dietLabel,
  recipeDietChip,
  recipeFitsPreference,
  unknownDietArticles,
} from './diet';
import { filterRecipes } from './recipes';
import { makeCollection, makeRecipe } from './test-fixtures';
import type { Article, Diet, Id, RecipeIngredient } from './types';

// Spec 0023, REQ-008: the diet "kein Lebensmittel" never counts when a diet is derived.

function article(id: Id, name: string, diet: Diet): Article {
  return { id, name, synonyms: [], diet, isPantry: false, needsReview: false, createdAt: '' };
}
const items = [
  article('zucchini', 'Zucchini', 'vegan'),
  article('paprika', 'Paprika', 'vegan'),
  article('oel', 'Olivenöl', 'vegan'),
  article('kohle', 'Grillkohle', 'non_food'),
  article('anzuender', 'Grillanzünder', 'unknown'),
  article('backpapier', 'Backpapier', 'non_food'),
  article('wurst', 'Würstchen', 'meat'),
];
const byId: Record<Id, Article> = Object.fromEntries(items.map((entry) => [entry.id, entry]));
const ing = (articleId: Id): RecipeIngredient => ({
  id: `i-${articleId}`,
  articleId,
  shoppingRule: 'count',
});
const book = { recipesById: {}, collectionRecipes: [] };
const grillgemuese = makeRecipe({
  id: 'grillgemuese',
  title: 'Grillgemüse',
  ingredients: ['zucchini', 'paprika', 'oel', 'kohle'].map(ing),
});

describe('non_food', () => {
  it('labels it "kein Lebensmittel"', () => {
    expect(dietLabel('non_food')).toBe('kein Lebensmittel');
  });

  it('AC-026: Grillkohle does not count: Grillgemüse is vegan and fits a vegetarian', () => {
    expect(deriveRecipeDiet(grillgemuese, undefined, byId)).toBe('vegan');
    expect(recipeDietChip(grillgemuese, undefined, byId)).toBe('vegan');
    expect(recipeFitsPreference(grillgemuese, 'vegetarian', byId)).toBe(true);
    expect(
      filterRecipes([grillgemuese], { diet: 'vegan' }, byId, '2026-11-22', book).map(
        (recipe) => recipe.id,
      ),
    ).toEqual(['grillgemuese']);
  });

  it('AC-027: an unknown article keeps it unknown and is named in "Warum unbekannt?"', () => {
    const withAnzuender = {
      ...grillgemuese,
      ingredients: [...grillgemuese.ingredients, ing('anzuender')],
    };
    expect(recipeDietChip(withAnzuender, undefined, byId)).toBe('unknown');
    expect(unknownDietArticles(withAnzuender.ingredients, byId).map((entry) => entry.name)).toEqual(
      ['Grillanzünder'],
    );
  });

  it('AC-029: only non-food ingredients: unknown without a chip, never vegan', () => {
    const ofen = makeRecipe({
      id: 'ofen',
      title: 'Ofen vorbereiten',
      ingredients: [ing('backpapier')],
    });
    expect(deriveRecipeDiet(ofen, undefined, byId)).toBe('unknown');
    expect(recipeDietChip(ofen, undefined, byId)).toBeUndefined();
    expect(filterRecipes([ofen], { diet: 'vegan' }, byId, '2026-11-22', book)).toEqual([]);
  });

  it('a recipe without ingredients has no chip', () => {
    expect(recipeDietChip(makeRecipe({ id: 'x', title: 'X' }), undefined, byId)).toBeUndefined();
  });

  it('a collection ignores non-food own ingredients', () => {
    const abend = makeCollection({
      id: 'abend',
      title: 'Grillabend',
      ingredients: [ing('kohle')],
    });
    expect(
      collectionDiet(
        abend,
        [
          {
            row: { id: 'r', collectionId: 'abend', recipeId: 'grillgemuese', sort: 0 },
            recipe: grillgemuese,
            servings: 6,
            inherits: true,
          },
        ],
        byId,
      ),
    ).toBe('vegan');
    expect(collectionDiet(abend, [], byId)).toBe('unknown');
    const withWurst = { ...abend, ingredients: [ing('kohle'), ing('wurst')] };
    expect(collectionDiet(withWurst, [], byId)).toBe('meat');
  });
});

describe('the filter "Ernährung unbekannt" on "Artikel"', () => {
  it('AC-030: lists exactly the articles without a diet, not those "kein Lebensmittel"', () => {
    const context = { similar: new Map(), areas: [] };
    expect(filterArticles(items, 'unknownDiet', context).map((entry) => entry.name)).toEqual([
      'Grillanzünder',
    ]);
    expect(articleFilterCounts(items, context).unknownDiet).toBe(1);
  });
});
