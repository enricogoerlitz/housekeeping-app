import { describe, expect, it } from 'vitest';

import { ingredientDrafts, withLinePicks, type LinePicks } from './ingredient-drafts';
import {
  articleUseCounts,
  ingredientPreview,
  lineArticleWords,
  lineAtCursor,
  replaceLineArticle,
  typingSuggestions,
} from './ingredient-typing';
import { makeRecipe } from './test-fixtures';
import type { Article, Id, Recipe } from './types';

function article(id: Id, name: string, rest: Partial<Article> = {}): Article {
  return {
    id,
    name,
    synonyms: [],
    diet: 'unknown',
    isPantry: false,
    needsReview: false,
    createdAt: '',
    ...rest,
  };
}

function recipe(id: Id, articleIds: Id[]): Recipe {
  return makeRecipe({
    id,
    title: id,
    ingredients: articleIds.map((articleId, index) => ({
      id: `${id}-i${index}`,
      articleId,
      shoppingRule: 'count',
    })),
  });
}

const zwiebel = article('a-zwiebel', 'Zwiebel');
const zwiebelRot = article('a-zwiebel-rot', 'Zwiebel rot');
const zwetschgen = article('a-zwetschgen', 'Zwetschgen');
const moehren = article('a-moehren', 'Möhren', { synonyms: ['Karotten'] });
const mais = article('a-mais', 'Mais');
const semmel = article('a-semmel', 'Semmelbrösel');
const household = [zwiebel, zwiebelRot, zwetschgen, moehren, mais, semmel];

/** Zwiebel in 3 recipes, Zwiebel rot in 1, Zwetschgen in none. */
const uses = articleUseCounts([
  recipe('r1', ['a-zwiebel', 'a-zwiebel']),
  recipe('r2', ['a-zwiebel', 'a-zwiebel-rot']),
  recipe('r3', ['a-zwiebel']),
]);

const names = (text: string, cursor = text.length, counts = uses) =>
  typingSuggestions(text, cursor, household, counts).map((match) => match.item.name);

function keys() {
  let next = 0;
  return () => `d${++next}`;
}

describe('lineAtCursor', () => {
  it('AC-005: finds the line the cursor stands in, not the last one', () => {
    const text = '2 Zwi\n200 g Semm';
    expect(lineAtCursor(text, 3)).toEqual({ start: 0, end: 5, text: '2 Zwi' });
    expect(lineAtCursor(text, text.length)).toEqual({ start: 6, end: 16, text: '200 g Semm' });
    expect(lineAtCursor(text, 5)).toEqual({ start: 0, end: 5, text: '2 Zwi' });
  });

  it('keeps a cursor outside the text inside it', () => {
    expect(lineAtCursor('Salz', 99)).toEqual({ start: 0, end: 4, text: 'Salz' });
    expect(lineAtCursor('', 0)).toEqual({ start: 0, end: 0, text: '' });
  });
});

describe('lineArticleWords', () => {
  it('splits amount, unit and bullet from the article words as typed', () => {
    expect(lineArticleWords('2 Zwi')).toEqual({ prefix: '2 ', words: 'Zwi' });
    expect(lineArticleWords('200 g Pani')).toEqual({ prefix: '200 g ', words: 'Pani' });
    expect(lineArticleWords('- 1 kleine Dose Mai')).toEqual({
      prefix: '- 1 kleine Dose ',
      words: 'Mai',
    });
    expect(lineArticleWords('Zwiebel rot ')).toEqual({ prefix: '', words: 'Zwiebel rot' });
    expect(lineArticleWords('500g  Mehl')).toEqual({ prefix: '500g  ', words: 'Mehl' });
  });

  it('AC-004: has no article words for an empty line or an amount alone', () => {
    expect(lineArticleWords('')).toBeUndefined();
    expect(lineArticleWords('   ')).toBeUndefined();
    expect(lineArticleWords('200 g')).toBeUndefined();
    expect(lineArticleWords('200 g ')).toBeUndefined();
    expect(lineArticleWords('- ')).toBeUndefined();
  });
});

describe('typingSuggestions', () => {
  it('AC-001: suggests the household articles for "2 Zwi", at most 5', () => {
    expect(names('2 Zwi')).toEqual(['Zwiebel', 'Zwiebel rot']);
    const many = Array.from({ length: 9 }, (_, index) => article(`a-k${index}`, `Käse ${index}`));
    expect(typingSuggestions('Kä', 2, many, new Map())).toHaveLength(5);
  });

  it('AC-002: puts the more used article first among hits of equal quality', () => {
    const counts = new Map<Id, number>([
      ['a-zwetschgen', 5],
      ['a-zwiebel', 3],
    ]);
    expect(names('Zw', 2, counts).slice(0, 2)).toEqual(['Zwetschgen', 'Zwiebel']);
  });

  it('AC-003: ignores case and umlauts and tolerates the plural', () => {
    expect(names('2 zwiebeln')).toContain('Zwiebel');
    expect(names('moeh')).toEqual(['Möhren']);
    expect(names('1 kg Möh')).toEqual(['Möhren']);
  });

  it('AC-004: suggests nothing for an empty line, an amount alone or one letter', () => {
    expect(names('')).toEqual([]);
    expect(names('200 g')).toEqual([]);
    expect(names('2 Z')).toEqual([]);
  });

  it('AC-005: suggests for the line the cursor stands in', () => {
    expect(names('2 Zwi\n1 Mai', 3)).toEqual(['Zwiebel', 'Zwiebel rot']);
    expect(names('2 Zwi\n1 Mai')).toEqual(['Mais']);
  });

  it('AC-006: leaves out the article the line already names exactly, by name or synonym', () => {
    expect(names('2 Zwiebel')).toEqual(['Zwiebel rot']);
    expect(names('Karotten')).toEqual([]);
  });
});

describe('replaceLineArticle', () => {
  it('AC-007: replaces the article words and keeps the amount', () => {
    expect(replaceLineArticle('2 Zwi', 5, 'Zwiebel')).toEqual({ text: '2 Zwiebel', cursor: 9 });
  });

  it('AC-008: changes only the line of the cursor and puts the cursor behind it', () => {
    const text = '2 Zwiebel\n200 g Semm\n1 Mais';
    expect(replaceLineArticle(text, 18, 'Semmelbrösel')).toEqual({
      text: '2 Zwiebel\n200 g Semmelbrösel\n1 Mais',
      cursor: 28,
    });
  });

  it('AC-009: keeps the bullet, the size and the unit as typed', () => {
    expect(replaceLineArticle('- 1 kleine Dose Mai', 19, 'Mais')?.text).toBe(
      '- 1 kleine Dose Mais',
    );
  });

  it('does nothing on a line without article words', () => {
    expect(replaceLineArticle('2 Zwiebel\n', 10, 'Mais')).toBeUndefined();
  });
});

describe('articleUseCounts', () => {
  it('counts each recipe once per article', () => {
    expect(uses.get('a-zwiebel')).toBe(3);
    expect(uses.get('a-zwiebel-rot')).toBe(1);
    expect(uses.get('a-zwetschgen')).toBeUndefined();
  });
});

describe('ingredientPreview and withLinePicks', () => {
  const drafts = (text: string, picks: LinePicks = new Map()) =>
    withLinePicks(ingredientDrafts(text, household, [], keys()), picks);

  it('AC-011: shows an existing article with ✓ and an unknown name as new', () => {
    expect(ingredientPreview(drafts('2 Zwiebel\n200 g Paniermehl'))).toEqual([
      { key: 'd1', amount: '2', name: 'Zwiebel', typed: 'Zwiebel', state: 'article' },
      { key: 'd2', amount: '200 g', name: 'Paniermehl', typed: 'Paniermehl', state: 'new' },
    ]);
  });

  it('shows a look-alike as "Meinst du …?"', () => {
    expect(ingredientPreview(drafts('2 Zwiebeln'))[0]).toMatchObject({
      name: 'Zwiebeln',
      state: 'similar',
      suggestion: 'Zwiebel',
    });
  });

  it('AC-012: a picked article is used for every line of that name', () => {
    const picks: LinePicks = new Map([
      ['paniermehl', { kind: 'hit', hit: { kind: 'article', ...pick(semmel) } }],
    ]);
    const picked = drafts('200 g Paniermehl\n1 EL paniermehl', picks);
    expect(picked.map((draft) => draft.article)).toEqual([
      { kind: 'hit', hit: { kind: 'article', ...pick(semmel) } },
      { kind: 'hit', hit: { kind: 'article', ...pick(semmel) } },
    ]);
    expect(ingredientPreview(picked)[0]).toEqual({
      key: 'd1',
      amount: '200 g',
      name: 'Semmelbrösel',
      typed: 'Paniermehl',
      state: 'article',
    });
  });

  it('AC-013: "neu anlegen" in the preview gives the line its new article', () => {
    const picks: LinePicks = new Map([['paniermehl', { kind: 'new', name: 'Paniermehl' }]]);
    const [draft] = drafts('200 g Paniermehl', picks);
    expect(draft?.article).toEqual({ kind: 'new', name: 'Paniermehl' });
    expect(ingredientPreview(drafts('200 g Paniermehl', picks))[0]?.state).toBe('created');
  });

  it('AC-014: a pick no longer applies once the line is renamed', () => {
    const picks: LinePicks = new Map([['paniermehl', { kind: 'new', name: 'Paniermehl' }]]);
    const [draft] = drafts('200 g Panko', picks);
    expect(draft?.article).toBeUndefined();
    expect(ingredientPreview(drafts('200 g Panko', picks))[0]?.state).toBe('new');
  });

  it('AC-015: without a pick an unknown line keeps no article (orange on its page)', () => {
    const [draft] = drafts('200 g Paniermehl');
    expect(draft?.article).toBeUndefined();
  });
});

function pick(source: Article) {
  return { id: source.id, name: source.name, synonyms: source.synonyms, article: source };
}
