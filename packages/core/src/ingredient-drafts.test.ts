import { describe, expect, it } from 'vitest';

import type { StarterCatalogEntry } from './article-catalog';
import { ingredientDrafts, type IngredientDraft } from './ingredient-drafts';
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

/** Amount and name as parsed: "200 ml · Kokosmilch". */
const parsed = (draft: IngredientDraft) =>
  [draft.line.amount?.text, draft.line.name].filter(Boolean).join(' · ');

const AC_008_BLOCK = '200 ml Kokosmilch\n1 Mango\n1 Prise Salz\n2 Drachenfrüchte';

describe('ingredientDrafts', () => {
  it('AC-008: sure lines have their article, the unknown line is orange without suggestion', () => {
    const drafts = ingredientDrafts(AC_008_BLOCK, household, starter, keys());
    expect(drafts.map(parsed)).toEqual([
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

  it('AC-009: look-alikes are orange with "Meinst du …?"', () => {
    const drafts = ingredientDrafts('200 ml Kokosmilsch\n2 Tomate', household, starter, keys());
    expect(drafts.map((draft) => draft.article)).toEqual([undefined, undefined]);
    expect(drafts.map((draft) => draft.suggestion?.name)).toEqual(['Kokosmilch', 'Tomaten']);
  });

  it('a line found in the starter catalog is sure with the starter hit', () => {
    const [draft] = ingredientDrafts('1 Dose Kichererbsen', household, starter, keys());
    expect(draft?.article?.kind === 'hit' && draft.article.hit.kind).toBe('starter');
  });

  it('empty text gives no drafts; a line without amount has only its name', () => {
    expect(ingredientDrafts('\n  \n', household, starter, keys())).toEqual([]);
    const [draft] = ingredientDrafts('Salz', household, starter, keys());
    expect(draft?.line).toMatchObject({ name: 'Salz' });
    expect(draft?.line.amount).toBeUndefined();
  });
});
