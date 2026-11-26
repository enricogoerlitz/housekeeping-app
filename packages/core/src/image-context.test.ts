import { describe, expect, it } from 'vitest';

import { AiImageRequestSchema } from './ai-contract';
import {
  activityImageContext,
  draftImageContext,
  recipeImageContext,
  restaurantImageContext,
} from './image-context';
import { articlesById, makeRecipe } from './test-fixtures';
import type { Activity, Restaurant } from './types';

// Spec 0052, REQ-003: what the photo window and the photo suggestions tell ai-image the picture
// is for.

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';

const restaurant: Restaurant = {
  id: 'r1',
  name: 'Mutzenbacher',
  address: 'Kollwitzstraße 1, Berlin',
  cuisine: 'Österreichisch',
  tags: [],
  notes: 'Tisch am Fenster',
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-11-01T10:00:00Z',
};

const activity: Activity = {
  id: 'a1',
  name: 'Bertablock',
  description: 'Bouldern nach der Arbeit',
  placeName: 'Berta Block Boulderhalle',
  address: 'Mühlenstraße 62, Berlin',
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-11-01T10:00:00Z',
  remembered: true,
};

describe('image context of an entry (spec 0052, REQ-003)', () => {
  it('AC-008: a restaurant: its name and its cuisine as the category; no address, no notes', () => {
    expect(restaurantImageContext(restaurant)).toEqual({
      kind: 'restaurant',
      title: 'Mutzenbacher',
      category: 'Österreichisch',
    });
    expect(restaurantImageContext({ ...restaurant, cuisine: ' ' })).toEqual({
      kind: 'restaurant',
      title: 'Mutzenbacher',
    });
  });

  it('AC-009: an activity: name, its kind, the place and the description; no address', () => {
    expect(activityImageContext(activity, 'Bouldern')).toEqual({
      kind: 'activity',
      title: 'Bertablock',
      category: 'Bouldern',
      place: 'Berta Block Boulderhalle',
      description: 'Bouldern nach der Arbeit',
    });
    expect(
      activityImageContext({
        id: 'a2',
        name: 'Eislaufen',
        favoriteOf: [],
        ratings: {},
        createdAt: '',
        remembered: true,
      }),
    ).toEqual({ kind: 'activity', title: 'Eislaufen' });
  });

  it('AC-002: a recipe: title, main ingredients (no Vorrat, no variant) and its description', () => {
    const recipe = makeRecipe({
      id: 'r',
      title: 'Linsen-Dal',
      description: 'Cremig, mit Kokosmilch.',
      ingredients: [
        { id: '1', articleId: 'art-salz', shoppingRule: 'skip' },
        { id: '2', articleId: 'art-kokosmilch', shoppingRule: 'count' },
        { id: '3', articleId: 'art-mango', shoppingRule: 'count' },
      ],
    });
    expect(recipeImageContext(recipe, articlesById)).toEqual({
      kind: 'recipe',
      title: 'Linsen-Dal',
      ingredients: ['Kokosmilch', 'Mango'],
      description: 'Cremig, mit Kokosmilch.',
    });
  });

  it('a collection is a collection, with its title only', () => {
    const collection = makeRecipe({ id: 'c', title: 'Sommerküche', kind: 'collection' });
    expect(recipeImageContext(collection, articlesById)).toEqual({
      kind: 'collection',
      title: 'Sommerküche',
    });
  });

  it('a draft: its title and description', () => {
    expect(
      draftImageContext({
        title: 'Spaghetti mit Bällchen in Tomatensoße',
        description: 'Saftige Bällchen in fruchtiger Soße.',
      }),
    ).toEqual({
      kind: 'recipe',
      title: 'Spaghetti mit Bällchen in Tomatensoße',
      description: 'Saftige Bällchen in fruchtiger Soße.',
    });
  });

  it('AC-010: long texts are cut to what the contract takes, so the request still goes out', () => {
    const context = activityImageContext(
      { ...activity, name: 'B'.repeat(300), description: 'd'.repeat(900) },
      'k'.repeat(120),
    );
    expect(
      AiImageRequestSchema.safeParse({ householdId: HOUSEHOLD, prompt: 'x', context }).success,
    ).toBe(true);
    const recipe = makeRecipe({
      id: 'r',
      title: 'Curry',
      ingredients: Array.from({ length: 12 }, (_, index) => ({
        id: String(index),
        articleId: 'art-mango',
        shoppingRule: 'count' as const,
      })),
    });
    expect(recipeImageContext(recipe, articlesById).ingredients).toHaveLength(3);
  });
});

describe('AiImageRequestSchema with context and extra (spec 0052)', () => {
  it('AC-011: the wish, the extra of "Neu generieren" and the context are taken', () => {
    const request = {
      householdId: HOUSEHOLD,
      prompt: 'spaghetti with meatballs in tomato sauce',
      extra: 'heller und mit Basilikum',
      context: { kind: 'recipe', title: 'Spaghetti mit Bällchen in Tomatensoße' },
    };
    expect(AiImageRequestSchema.parse(request)).toEqual(request);
  });

  it('AC-010: an unknown kind, an extra over 300 characters or more than 8 ingredients is refused', () => {
    for (const body of [
      { prompt: 'x', context: { kind: 'hotel', title: 'Adlon' } },
      { prompt: 'x', extra: 'e'.repeat(301) },
      {
        prompt: 'x',
        context: { kind: 'recipe', title: 'Curry', ingredients: Array(9).fill('Reis') },
      },
      { prompt: 'x', context: { kind: 'recipe', title: ' ' } },
      { prompt: 'x', context: { kind: 'recipe', title: 'Curry', secret: 1 } },
    ]) {
      expect(AiImageRequestSchema.safeParse({ householdId: HOUSEHOLD, ...body }).success).toBe(
        false,
      );
    }
  });
});
