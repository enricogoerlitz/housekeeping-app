import { describe, expect, it } from 'vitest';

import {
  combineDiets,
  deriveRecipeDiet,
  dietFitsPreference,
  dietLabel,
  dietPreferenceLabel,
  fittingVariantIds,
  recipeFitsPreference,
} from './diet';
import { articlesById, bolognese, halloumiPfanne, makeRecipe, mangoCurry } from './test-fixtures';

describe('combineDiets', () => {
  it('returns the most restrictive diet: vegan < vegetarian < fish < meat', () => {
    expect(combineDiets(['vegan', 'vegetarian'])).toBe('vegetarian');
    expect(combineDiets(['vegan', 'fish', 'vegetarian'])).toBe('fish');
    expect(combineDiets(['fish', 'meat'])).toBe('meat');
    expect(combineDiets([])).toBe('vegan');
  });

  it('never lets an unknown ingredient look vegan or vegetarian', () => {
    expect(combineDiets(['vegan', 'unknown'])).toBe('unknown');
    expect(combineDiets(['vegetarian', 'unknown'])).toBe('unknown');
    expect(combineDiets(['unknown', 'fish'])).toBe('fish');
  });
});

describe('deriveRecipeDiet', () => {
  it('AC-020: switching from "mit Tofu" to "mit Hähnchen" changes vegan to meat', () => {
    expect(deriveRecipeDiet(mangoCurry, 'v-tofu', articlesById)).toBe('vegan');
    expect(deriveRecipeDiet(mangoCurry, 'v-haehnchen', articlesById)).toBe('meat');
  });

  it('uses the default variant when none is given', () => {
    expect(deriveRecipeDiet(mangoCurry, undefined, articlesById)).toBe('vegan');
  });

  it('counts ingredients without (known) article and recipes without ingredients as unknown', () => {
    const withFreeText = makeRecipe({
      id: 'r',
      title: 'Brot',
      ingredients: [{ id: 'i', name: 'Sauerteig', shoppingRule: 'count' }],
    });
    expect(deriveRecipeDiet(withFreeText, undefined, articlesById)).toBe('unknown');
    const withMissingArticle = makeRecipe({
      id: 'r2',
      title: 'Brot',
      ingredients: [{ id: 'i', articleId: 'art-weg', name: 'Weg', shoppingRule: 'count' }],
    });
    expect(deriveRecipeDiet(withMissingArticle, undefined, articlesById)).toBe('unknown');
    expect(deriveRecipeDiet(makeRecipe({ id: 'e', title: 'Leer' }), undefined, articlesById)).toBe(
      'unknown',
    );
  });
});

describe('preferences', () => {
  it('lets vegans eat vegan only, vegetarians vegan or vegetarian, flexible everything', () => {
    expect(dietFitsPreference('vegan', 'vegan')).toBe(true);
    expect(dietFitsPreference('vegetarian', 'vegan')).toBe(false);
    expect(dietFitsPreference('vegetarian', 'vegetarian')).toBe(true);
    expect(dietFitsPreference('fish', 'vegetarian')).toBe(false);
    expect(dietFitsPreference('unknown', 'vegetarian')).toBe(false);
    expect(dietFitsPreference('meat', 'flexible')).toBe(true);
    expect(dietFitsPreference('unknown', 'flexible')).toBe(true);
  });

  it('AC-018: Mango-Curry fits vegetarians because one variant is vegan, Bolognese does not', () => {
    expect(recipeFitsPreference(mangoCurry, 'vegetarian', articlesById)).toBe(true);
    expect(recipeFitsPreference(bolognese, 'vegetarian', articlesById)).toBe(false);
    expect(recipeFitsPreference(bolognese, 'flexible', articlesById)).toBe(true);
  });

  it('lists the fitting variants, ["base"] for a fitting recipe without variants, [] otherwise', () => {
    expect(fittingVariantIds(mangoCurry, 'vegan', articlesById)).toEqual(['v-tofu']);
    expect(fittingVariantIds(mangoCurry, 'flexible', articlesById)).toEqual([
      'v-tofu',
      'v-haehnchen',
    ]);
    expect(fittingVariantIds(halloumiPfanne, 'vegetarian', articlesById)).toEqual(['base']);
    expect(fittingVariantIds(halloumiPfanne, 'vegan', articlesById)).toEqual([]);
  });

  it('has German labels', () => {
    expect(dietLabel('fish')).toBe('mit Fisch');
    expect(dietLabel('meat')).toBe('mit Fleisch');
    expect(dietLabel('vegetarian')).toBe('vegetarisch');
    expect(dietPreferenceLabel('flexible')).toBe('isst alles');
  });
});
