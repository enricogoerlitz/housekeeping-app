import { describe, expect, it } from 'vitest';

import type { StarterCatalogEntry } from './article-catalog';
import {
  chooseDraftArticle,
  draftArticleName,
  draftLineLabel,
  ingredientDrafts,
  returnRejectedDrafts,
  splitIngredientDrafts,
} from './ingredient-drafts';
import type { Article, Id } from './types';

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

const kokosmilch = article('a-kokosmilch', 'Kokosmilch', { diet: 'vegan' });
const mango = article('a-mango', 'Mango', { diet: 'vegan' });
const salz = article('a-salz', 'Salz', { diet: 'vegan', isPantry: true });
const tomaten = article('a-tomaten', 'Tomaten', { diet: 'vegan' });
const household: Article[] = [kokosmilch, mango, salz, tomaten];
const starter: StarterCatalogEntry[] = [
  { name: 'Kichererbsen', areaName: 'Nudeln, Reis & Hülsenfrüchte', diet: 'vegan', isPantry: true },
];

function keys() {
  let next = 0;
  return () => `d${++next}`;
}

const AC_008_BLOCK = '200 ml Kokosmilch\n1 Mango\n1 Prise Salz\n2 Drachenfrüchte';

describe('ingredientDrafts', () => {
  it('AC-008: sure lines have their article, the unknown line is orange without suggestion', () => {
    const drafts = ingredientDrafts(AC_008_BLOCK, household, starter, keys());
    expect(drafts.map(draftLineLabel)).toEqual([
      '200 ml · Kokosmilch',
      '1 · Mango',
      '1 Prise · Salz',
      '2 · Drachenfrüchte',
    ]);
    expect(drafts.map((draft) => draft.article?.kind === 'hit' && draft.article.hit.id)).toEqual([
      'a-kokosmilch',
      'a-mango',
      'a-salz',
      false,
    ]);
    expect(drafts[3]?.suggestion).toBeUndefined();
    expect(new Set(drafts.map((draft) => draft.key)).size).toBe(4);
  });

  it('AC-009: look-alikes are orange with "Meinst du …?" until "Ja"', () => {
    const drafts = ingredientDrafts('200 ml Kokosmilsch\n2 Tomate', household, starter, keys());
    expect(drafts.map((draft) => draft.article)).toEqual([undefined, undefined]);
    expect(drafts.map((draft) => draft.suggestion?.name)).toEqual(['Kokosmilch', 'Tomaten']);

    let next = drafts;
    for (const draft of drafts) {
      if (!draft.suggestion) throw new Error('fixture');
      next = chooseDraftArticle(next, draft.key, { kind: 'hit', hit: draft.suggestion });
    }
    expect(next.map((draft) => draftArticleName(draft))).toEqual(['Kokosmilch', 'Tomaten']);
    expect(next.map((draft) => draft.suggestion)).toEqual([undefined, undefined]);
    expect(next.map(draftLineLabel)).toEqual(['200 ml · Kokosmilch', '2 · Tomaten']);
  });

  it('a line found in the starter catalog is sure with the starter hit', () => {
    const [draft] = ingredientDrafts('1 Dose Kichererbsen', household, starter, keys());
    expect(draft?.article?.kind === 'hit' && draft.article.hit.kind).toBe('starter');
  });

  it('empty text gives no drafts; a line without amount has no "·"', () => {
    expect(ingredientDrafts('\n  \n', household, starter, keys())).toEqual([]);
    const [draft] = ingredientDrafts('Salz', household, starter, keys());
    expect(draft && draftLineLabel(draft)).toBe('Salz');
  });
});

describe('splitIngredientDrafts', () => {
  it('AC-010: lines with an article are ready, the orange one stays open', () => {
    const drafts = ingredientDrafts(AC_008_BLOCK, household, starter, keys());
    const { ready, open } = splitIngredientDrafts(drafts, household);
    expect(ready.map(draftLineLabel)).toEqual([
      '200 ml · Kokosmilch',
      '1 · Mango',
      '1 Prise · Salz',
    ]);
    expect(open.map(draftLineLabel)).toEqual(['2 · Drachenfrüchte']);
  });

  it('AC-002: "„Drachenfrüchte“ neu anlegen" makes the line ready with the new name', () => {
    const drafts = ingredientDrafts(AC_008_BLOCK, household, starter, keys());
    const orange = drafts[3];
    if (!orange) throw new Error('fixture');
    const chosen = chooseDraftArticle(drafts, orange.key, { kind: 'new', name: 'Drachenfrüchte' });
    const { ready, open } = splitIngredientDrafts(chosen, household);
    expect(open).toEqual([]);
    expect(ready.at(-1)?.article).toEqual({ kind: 'new', name: 'Drachenfrüchte' });
  });

  it('a chosen article deleted meanwhile is orange again, not ready', () => {
    const drafts = ingredientDrafts('1 Mango\n1 Prise Salz', household, starter, keys());
    const { ready, open } = splitIngredientDrafts(drafts, [kokosmilch, salz, tomaten]);
    expect(ready.map(draftLineLabel)).toEqual(['1 Prise · Salz']);
    expect(open.map((draft) => [draftLineLabel(draft), draft.article])).toEqual([
      ['1 · Mango', undefined],
    ]);
  });

  it('a starter hit stays ready (the article is created on saving)', () => {
    const drafts = ingredientDrafts('1 Dose Kichererbsen', household, starter, keys());
    expect(splitIngredientDrafts(drafts, household).ready).toHaveLength(1);
  });
});

describe('returnRejectedDrafts', () => {
  it('AC-006: lines the server refused come back orange, before the lines still open', () => {
    const drafts = ingredientDrafts(AC_008_BLOCK, household, starter, keys());
    const { ready, open } = splitIngredientDrafts(drafts, household);
    const back = returnRejectedDrafts(open, ready.slice(0, 1));
    expect(back.map(draftLineLabel)).toEqual(['200 ml · Kokosmilch', '2 · Drachenfrüchte']);
    expect(back.map((draft) => draft.article)).toEqual([undefined, undefined]);
    // The same line twice (refused again while still listed) stays one row.
    expect(returnRejectedDrafts(back, ready.slice(0, 1))).toHaveLength(2);
  });
});
