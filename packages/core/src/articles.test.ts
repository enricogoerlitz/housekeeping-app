import { describe, expect, it } from 'vitest';

import { findArticleByName, searchArticles, suggestSimilarArticle } from './articles';
import { articles } from './test-fixtures';
import type { Article } from './types';

const names = (matches: { article: Article }[]): string[] =>
  matches.map((match) => match.article.name);

describe('searchArticles', () => {
  it('AC-013: "Karot" suggests Möhren via the synonym Karotten', () => {
    const [first] = searchArticles('Karot', articles);
    expect(first?.article.name).toBe('Möhren');
    expect(first?.matchedSynonym).toBe('Karotten');
  });

  it('AC-013: tolerates a typo in a synonym ("Karoten")', () => {
    expect(names(searchArticles('Karoten', articles))).toContain('Möhren');
  });

  it('ranks exact before prefix before substring', () => {
    const extra: Article[] = [
      ...articles,
      { id: 'art-milchreis', name: 'Milchreis', synonyms: [], diet: 'vegetarian', isPantry: false },
    ];
    expect(names(searchArticles('milch', extra))).toEqual([
      'Milch',
      'Milchreis',
      'Kokosmilch',
      'Mandelmilch',
    ]);
  });

  it('prefers a hit on the name over the same kind of hit on a synonym', () => {
    const list: Article[] = [
      { id: 'a', name: 'Weizenmehl', synonyms: ['Mehl'], diet: 'vegan', isPantry: true },
      { id: 'b', name: 'Mehl', synonyms: [], diet: 'vegan', isPantry: true },
    ];
    const [first, second] = searchArticles('Mehl', list);
    expect(first?.article.id).toBe('b');
    expect(first?.matchedSynonym).toBeUndefined();
    expect(second?.matchedSynonym).toBe('Mehl');
  });

  it('ranks a prefix of the name above a prefix of a synonym, even for a longer name', () => {
    const list: Article[] = [
      { id: 'm', name: 'Möhren', synonyms: ['Karotten'], diet: 'vegan', isPantry: false },
      { id: 'k', name: 'Karottenkuchen', synonyms: [], diet: 'vegetarian', isPantry: false },
    ];
    expect(names(searchArticles('karot', list))).toEqual(['Karottenkuchen', 'Möhren']);
  });

  it('orders equal scores by shorter name, then alphabetically', () => {
    const list: Article[] = [
      { id: 'a', name: 'Tomatenmark', synonyms: [], diet: 'vegan', isPantry: false },
      { id: 'b', name: 'Tomaten', synonyms: [], diet: 'vegan', isPantry: false },
      { id: 'c', name: 'Tomatensoße', synonyms: [], diet: 'vegan', isPantry: false },
    ];
    expect(names(searchArticles('toma', list))).toEqual(['Tomaten', 'Tomatenmark', 'Tomatensoße']);
  });

  it('returns nothing for an empty query or no match', () => {
    expect(searchArticles('  ', articles)).toEqual([]);
    expect(searchArticles('xyzq', articles)).toEqual([]);
  });

  it('returns at most 8 results by default and respects a given limit', () => {
    const many: Article[] = Array.from({ length: 12 }, (_, index) => ({
      id: `a-${index}`,
      name: `Saft ${index}`,
      synonyms: [],
      diet: 'vegan',
      isPantry: false,
    }));
    expect(searchArticles('saft', many)).toHaveLength(8);
    expect(searchArticles('saft', many, 3)).toHaveLength(3);
    expect(searchArticles('saft', many, -1)).toEqual([]);
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
      { id: 'a', name: 'Weizenmehl', synonyms: ['Mehl'], diet: 'vegan', isPantry: true },
      { id: 'b', name: 'Mehl', synonyms: [], diet: 'vegan', isPantry: true },
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
      { id: 'eis', name: 'Eis', synonyms: [], diet: 'vegetarian', isPantry: false },
    ];
    expect(suggestSimilarArticle('Ei', list)).toBeUndefined();
  });
});
