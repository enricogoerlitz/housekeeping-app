import { describe, expect, it } from 'vitest';

import { loadRecipeIndex } from './context.ts';
import { fakeClient, type Row } from './test-fakes.ts';

const HOUSEHOLD = 'h1';

function article(index: number, household = HOUSEHOLD): Row {
  return { id: `a-${index}`, household_id: household, name: `Artikel ${index}` };
}

function recipe(id: string, articleIds: string[]): Row {
  return {
    id,
    household_id: HOUSEHOLD,
    title: id,
    tags: [],
    variants: [],
    ingredients: articleIds.map((articleId, index) => ({ id: `i${index}`, articleId })),
  };
}

describe('loadRecipeIndex (spec 0007 T8, security-check hint)', () => {
  it('names the ingredients of a household with more articles than one answer holds (max_rows)', async () => {
    const articles = Array.from({ length: 1500 }, (_, index) => article(index));
    const client = fakeClient({
      maxRows: 1000,
      tables: { articles, recipes: [recipe('r-curry', ['a-1400', 'a-3'])] },
    });
    const [entry] = await loadRecipeIndex(client, HOUSEHOLD);
    expect(entry?.ingredients).toEqual(['Artikel 1400', 'Artikel 3']);
  });

  it('reads only the articles the recipes use, in chunks of at most 100 ids', async () => {
    const articles = Array.from({ length: 300 }, (_, index) => article(index));
    const used = Array.from({ length: 250 }, (_, index) => `a-${index}`);
    const client = fakeClient({
      tables: { articles, recipes: [recipe('r1', used.slice(0, 200)), recipe('r2', used)] },
    });
    const index = await loadRecipeIndex(client, HOUSEHOLD);
    expect(index.find((entry) => entry.id === 'r2')?.ingredients).toHaveLength(250);
    expect(client.selects.filter((select) => select.table === 'articles')).toHaveLength(3);
  });

  it('leaves out an article of another household; a recipe without ingredients has none', async () => {
    const client = fakeClient({
      tables: {
        articles: [article(1, 'h2')],
        recipes: [recipe('r-leer', []), recipe('r-fremd', ['a-1'])],
      },
    });
    const index = await loadRecipeIndex(client, HOUSEHOLD);
    expect(index.map((entry) => entry.ingredients)).toEqual([[], []]);
    expect(client.selects.filter((select) => select.table === 'articles')).toHaveLength(1);
  });
});
