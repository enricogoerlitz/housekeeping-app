import { describe, expect, it } from 'vitest';

import {
  findArticleByName,
  spelledAlike,
  suggestSimilarArticle,
  withExactArticleName,
} from './articles';
import { articles } from './test-fixtures';
import type { Article } from './types';

describe('withExactArticleName (spec 0025, REQ-009)', () => {
  const mozzarella = (name: string): Article => ({
    id: `art-${name}`,
    name,
    synonyms: [],
    diet: 'vegetarian',
    isPantry: false,
    needsReview: false,
    createdAt: '2026-11-22T08:00:00.000Z',
  });

  it('AC-034: "2 Mozzarella (Fior di Latte)" is that article, 2×, without a Zusatz', () => {
    const catalog = [mozzarella('Mozzarella'), mozzarella('Mozzarella (Fior di Latte)')];
    const typed = { name: 'Mozzarella', count: 2, note: 'Fior di Latte' };
    expect(withExactArticleName(typed, catalog)).toEqual({
      name: 'Mozzarella (Fior di Latte)',
      count: 2,
    });
  });

  it('AC-034: a name with a comma typed in full is that article', () => {
    const catalog = [mozzarella('Tomaten, passiert')];
    expect(withExactArticleName({ name: 'Tomaten', note: 'passiert' }, catalog)).toEqual({
      name: 'Tomaten, passiert',
    });
  });

  it('AC-035: with only "Mozzarella" the parentheses stay the Zusatz', () => {
    const typed = { name: 'Mozzarella', note: 'Büffel' };
    expect(withExactArticleName(typed, [mozzarella('Mozzarella')])).toEqual(typed);
  });
});

describe('findArticleByName', () => {
  it('finds by normalised name or synonym', () => {
    expect(findArticleByName('  möhren ', articles)?.id).toBe('art-moehren');
    expect(findArticleByName('karotten', articles)?.id).toBe('art-moehren');
    expect(findArticleByName('Mohrrueben', articles)?.id).toBe('art-moehren');
  });

  it('prefers a name match over a synonym match', () => {
    const list: Article[] = [
      {
        id: 'a',
        name: 'Weizenmehl',
        synonyms: ['Mehl'],
        diet: 'vegan',
        isPantry: true,
        needsReview: false,
        createdAt: '',
      },
      {
        id: 'b',
        name: 'Mehl',
        synonyms: [],
        diet: 'vegan',
        isPantry: true,
        needsReview: false,
        createdAt: '',
      },
    ];
    expect(findArticleByName('Mehl', list)?.id).toBe('b');
  });

  it('returns undefined for empty or unknown names', () => {
    expect(findArticleByName('', articles)).toBeUndefined();
    expect(findArticleByName('Möhre', articles)).toBeUndefined();
  });
});

describe('suggestSimilarArticle', () => {
  it('suggests the plural for a singular ("Möhre" → Möhren)', () => {
    expect(suggestSimilarArticle('Möhre', articles)?.id).toBe('art-moehren');
  });

  it('suggests an article a typo away', () => {
    expect(suggestSimilarArticle('Milhc', articles)?.id).toBe('art-milch');
  });

  it('suggests nothing for an exact match, an empty name or nothing close', () => {
    expect(suggestSimilarArticle('Milch', articles)).toBeUndefined();
    expect(suggestSimilarArticle('', articles)).toBeUndefined();
    expect(suggestSimilarArticle('Geschenkpapier', articles)).toBeUndefined();
  });

  it('does not pair very short stems with an ending ("Ei" is not "Eis")', () => {
    const list: Article[] = [
      {
        id: 'eis',
        name: 'Eis',
        synonyms: [],
        diet: 'vegetarian',
        isPantry: false,
        needsReview: false,
        createdAt: '',
      },
    ];
    expect(suggestSimilarArticle('Ei', list)).toBeUndefined();
  });

  it('AC-023: suggests nothing for a different word that only looks alike ("Fleischkäse")', () => {
    const list: Article[] = [
      {
        id: 'frischkaese',
        name: 'Frischkäse',
        synonyms: [],
        diet: 'vegetarian',
        isPantry: false,
        needsReview: false,
        createdAt: '',
      },
    ];
    expect(suggestSimilarArticle('Fleischkäse', list)).toBeUndefined();
  });
});

describe('spelledAlike', () => {
  // Spec 0007, AC-023 and decision E13: the same thing spelled differently, never two things.
  const truePairs: [string, string][] = [
    ['Zwiebel', 'Zwiebeln'],
    ['Kokosmilch', 'Kokosmilsh'],
    ['Kokosmilch', 'Kokosmilsch'],
    ['Möhre', 'Möhren'],
    ['Tomate', 'Tomaten'],
    ['Milch', 'Milhc'],
    ['Kichererbsen', 'Kichererbsn'],
    ['Karotten', 'Karoten'],
    ['Kokosmilch', 'Kokos-Milch'],
    ['Rote Zwiebel', 'rote Zwiebeln'],
    ['Schwarze Linsen', 'Schwarze Linse'],
  ];
  const falsePairs: [string, string][] = [
    ['Schwarze Linsen', 'Schwarze Oliven'],
    ['Tafelessig', 'Apfelessig'],
    ['Fleischkäse', 'Frischkäse'],
    ['Pfefferminze', 'Pfefferminztee'],
    ['Kochschinken', 'Rohschinken'],
    ['Spülmaschinentabs', 'Spülmaschinensalz'],
    ['Reis', 'Eis'],
    ['Brot', 'Boot'],
    ['Milch', 'Buttermilch'],
    ['Ei', 'Eis'],
    ['Kokosmilch', 'Kokosmilch light'],
    ['', ''],
  ];

  it.each(truePairs)('AC-023: "%s" and "%s" are spelled alike', (a, b) => {
    expect(spelledAlike(a, b)).toBe(true);
    expect(spelledAlike(b, a)).toBe(true);
  });

  it.each(falsePairs)('AC-023: "%s" and "%s" are different things', (a, b) => {
    expect(spelledAlike(a, b)).toBe(false);
    expect(spelledAlike(b, a)).toBe(false);
  });

  it('AC-023: one typo is fine, two only in long words', () => {
    expect(spelledAlike('Kichererbsen', 'Kicherrebsn')).toBe(false);
    expect(spelledAlike('Gemüsebrühe', 'Gemüsebrüe')).toBe(true);
    expect(spelledAlike('Vollkornspaghetti', 'Volkornspagetti')).toBe(true);
  });
});
