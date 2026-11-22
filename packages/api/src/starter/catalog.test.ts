import { describe, expect, it } from 'vitest';

import { starterPayload } from './payload';

// Spec 0023, REQ-008: the starter catalog of a new household sets "kein Lebensmittel".

const NON_FOOD_AREAS = ['drogerie', 'haushalt', 'tierbedarf', 'sonstiges'];

describe('starter catalog diet', () => {
  const articles = starterPayload().articles;
  const dietOf = (name: string) => articles.find((article) => article.name === name)?.diet;

  it('AC-028: Backpapier, Grillkohle and Spülmittel are no food, Tortellini stays unknown', () => {
    expect(dietOf('Backpapier')).toBe('non_food');
    expect(dietOf('Grillkohle')).toBe('non_food');
    expect(dietOf('Spülmittel')).toBe('non_food');
    expect(dietOf('Tortellini')).toBe('unknown');
    expect(dietOf('Maultaschen')).toBe('unknown');
    expect(dietOf('Tiefkühlpizza')).toBe('unknown');
    expect(dietOf('Kaffeefilter')).toBe('non_food');
  });

  it('REQ-008: every article of Drogerie, Haushalt, Tierbedarf and Sonstiges is no food', () => {
    const inAreas = articles.filter((article) => NON_FOOD_AREAS.includes(article.area));
    expect(inAreas.length).toBeGreaterThan(50);
    expect(inAreas.filter((article) => article.diet !== 'non_food')).toEqual([]);
  });

  it('REQ-008: no other article is no food except Kaffeefilter', () => {
    const others = articles.filter(
      (article) => !NON_FOOD_AREAS.includes(article.area) && article.diet === 'non_food',
    );
    expect(others.map((article) => article.name)).toEqual(['Kaffeefilter']);
  });
});
