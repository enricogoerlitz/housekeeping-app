import { describe, expect, it } from 'vitest';

import { contentsInBook } from './collections';
import { parseAmount } from './amounts';
import {
  changedSections,
  copyIngredientsFrom,
  fillPageDraft,
  pageDraft,
  pageDraftChanged,
  pageEditorReducer,
  pageSections,
  validatePageDraft,
  withNewContents,
  withSection,
  type PageDraft,
  type PageEditorState,
} from './page-editor';
import { newIngredientRow, sectionPatch, type SectionPatchContext } from './recipe-editor';
import {
  grillabend,
  grillabendRecipes,
  grillRecipesById,
  hummus,
  makeRecipe,
  mangoCurry,
} from './test-fixtures';
import type { CollectionContent } from './collections';
import type { Recipe } from './types';

const grillContents = contentsInBook(grillabend, {
  recipesById: grillRecipesById,
  collectionRecipes: grillabendRecipes,
});

const apfelkuchen = makeRecipe({
  id: 'rec-apfelkuchen',
  title: 'Apfelkuchen',
  servings: 2,
  updatedAt: '2026-11-26T09:00:00Z',
  ingredients: [
    {
      id: 'i-mehl',
      articleId: 'art-mehl',
      amount: { text: '200 g', qty: 200, unit: 'g' },
      shoppingRule: 'recipeAmount',
    },
  ],
});

const zimtRow = {
  ...newIngredientRow('neu-zimt'),
  amountText: '1 TL',
  article: { kind: 'article' as const, articleId: 'art-zimt' },
};

function edited(): PageDraft {
  const page = pageDraft(apfelkuchen, []);
  const withTitle = withSection(page, { ...page.head, title: 'Omas Apfelkuchen' });
  return withSection(withTitle, {
    ...withTitle.ingredients,
    rows: [...withTitle.ingredients.rows, zimtRow],
  });
}

const context = (): SectionPatchContext => ({
  articles: [],
  createArticle: () => {
    throw new Error('no new article expected');
  },
  newId: () => 'new-id',
  entries: [],
});

describe('the page draft (spec 0037, REQ-001)', () => {
  it('AC-001: a recipe opens all its sections at once, a collection its own', () => {
    expect(pageSections(pageDraft(apfelkuchen, [])).map((draft) => draft.section)).toEqual([
      'head',
      'classification',
      'ingredients',
      'steps',
      'notes',
      'links',
    ]);
    expect(
      pageSections(pageDraft(grillabend, grillContents)).map((draft) => draft.section),
    ).toEqual(['head', 'contents', 'ingredients', 'notes', 'links']);
  });

  it('AC-006: remembers the updated_at of the recipe when the edit mode opened', () => {
    expect(pageDraft(apfelkuchen, []).seenUpdatedAt).toBe('2026-11-26T09:00:00Z');
    expect(pageDraft(mangoCurry, []).seenUpdatedAt).toBeUndefined();
  });

  it('AC-003: title and a new ingredient are the changed sections, nothing else', () => {
    const page = edited();
    expect(pageDraftChanged(page)).toBe(true);
    expect(changedSections(page).map((draft) => draft.section)).toEqual(['head', 'ingredients']);
    const head = changedSections(page)[0];
    if (head?.section !== 'head') throw new Error('head expected');
    // AC-006: only the changed fields go out, so Nadja's other fields stay.
    expect(sectionPatch(apfelkuchen, head, context()).recipe).toEqual({
      title: 'Omas Apfelkuchen',
    });
  });

  it('AC-005: an untouched page has nothing to discard', () => {
    expect(pageDraftChanged(pageDraft(apfelkuchen, []))).toBe(false);
    expect(pageDraftChanged(pageDraft(grillabend, grillContents))).toBe(false);
    const page = pageDraft(apfelkuchen, []);
    expect(pageDraftChanged(withSection(page, { ...page.notes, notes: 'Mit Sahne' }))).toBe(true);
  });

  it('AC-005: a changed "Enthält" counts, also while its portions are invalid', () => {
    const page = pageDraft(grillabend, grillContents);
    const contents = page.contents;
    if (!contents) throw new Error('contents expected');
    const [first, ...rest] = contents.rows;
    if (!first) throw new Error('row expected');
    expect(pageDraftChanged(withSection(page, { ...contents, rows: rest }))).toBe(true);
    expect(
      pageDraftChanged(
        withSection(page, { ...contents, rows: [{ ...first, servings: 'x' }, ...rest] }),
      ),
    ).toBe(true);
  });

  it('AC-004: the problems of every section and rows without article keep "Speichern" back', () => {
    const page = edited();
    const broken = withSection(withSection(page, { ...page.head, title: ' ' }), {
      ...page.ingredients,
      rows: [...page.ingredients.rows, { ...newIngredientRow('orange'), name: 'Bockshornklee' }],
    });
    expect(validatePageDraft(broken).map((problem) => problem.message)).toEqual([
      'Titel fehlt',
      'Erst für jede Zutat einen Artikel wählen',
    ]);
    expect(validatePageDraft(edited())).toEqual([]);
  });

  it('a duplicate pasted row also waits for "Weglassen" or "Trotzdem hinzufügen"', () => {
    const page = pageDraft(apfelkuchen, []);
    const duplicate = { ...zimtRow, key: 'dup', duplicate: true };
    const next = withSection(page, { ...page.ingredients, rows: [duplicate] });
    expect(validatePageDraft(next).map((problem) => problem.field)).toEqual(['ingredients']);
  });
});

describe('a collection has a time (spec 0037, REQ-005)', () => {
  it('AC-016: the head of a collection saves 90 minutes', () => {
    const page = pageDraft(grillabend, grillContents);
    const next = withSection(page, { ...page.head, totalMinutes: '90' });
    const [head] = changedSections(next);
    if (head?.section !== 'head') throw new Error('head expected');
    expect(sectionPatch(grillabend, head, context()).recipe).toEqual({ totalMinutes: 90 });
  });

  it('AC-016: an impossible time of a collection is a problem', () => {
    const page = pageDraft(grillabend, grillContents);
    const next = withSection(page, { ...page.head, totalMinutes: 'lang' });
    expect(validatePageDraft(next).map((problem) => problem.message)).toEqual([
      '0 bis 10000 Minuten',
    ]);
  });
});

describe('"+ Rezept" while editing a collection', () => {
  it('rows put in meanwhile join the draft; rows of the draft stay as edited', () => {
    const page = pageDraft(grillabend, grillContents);
    const contents = page.contents;
    if (!contents) throw new Error('contents expected');
    const [first, ...rest] = contents.rows;
    if (!first) throw new Error('row expected');
    const editedPage = withSection(page, {
      ...contents,
      rows: [{ ...first, servings: '9' }, ...rest],
    });
    const added: CollectionContent = {
      row: { id: 'cr-hummus', collectionId: grillabend.id, recipeId: hummus.id, sort: 2 },
      recipe: hummus,
    };
    const next = withNewContents(editedPage, [...grillContents, added]);
    expect(next.contents?.rows.map((row) => [row.id, row.servings])).toEqual([
      ['cr-kartoffelsalat', '9'],
      ['cr-grillgemuese', '8'],
      ['cr-hummus', ''],
    ]);
    // The new row is stored already: it is no change of the page.
    expect(pageDraftChanged(withNewContents(page, [...grillContents, added]))).toBe(false);
    expect(withNewContents(pageDraft(apfelkuchen, []), [added]).contents).toBeUndefined();
  });

  it('a row removed in the draft does not come back', () => {
    const page = pageDraft(grillabend, grillContents);
    const contents = page.contents;
    if (!contents) throw new Error('contents expected');
    const removed = withSection(page, { ...contents, rows: contents.rows.slice(1) });
    expect(withNewContents(removed, grillContents).contents?.rows).toHaveLength(1);
  });
});

describe('the edit mode state (spec 0037, REQ-001)', () => {
  const page = edited();
  const open = pageEditorReducer({}, { type: 'open', draft: pageDraft(apfelkuchen, []) });

  it('AC-002: opening shows the draft without problems', () => {
    expect(open).toEqual({ draft: pageDraft(apfelkuchen, []) });
  });

  it('AC-003: saving, then closed', () => {
    const changed = pageEditorReducer(open, { type: 'change', draft: page });
    const saving = pageEditorReducer(changed, { type: 'saving' });
    expect(saving).toEqual({ draft: page, saving: true });
    expect(pageEditorReducer(saving, { type: 'close' })).toEqual({});
  });

  it('AC-004: a refusal keeps the draft open with the message', () => {
    const saving: PageEditorState = { draft: page, saving: true };
    expect(pageEditorReducer(saving, { type: 'failed', error: 'Hat nicht geklappt' })).toEqual({
      draft: page,
      error: 'Hat nicht geklappt',
    });
  });

  it('a save with problems shows them, typing clears the message', () => {
    const invalid = pageEditorReducer(open, { type: 'invalid' });
    expect(invalid.attempted).toBe(true);
    const typed = pageEditorReducer({ ...invalid, error: 'x' }, { type: 'change', draft: page });
    expect(typed).toEqual({ draft: page, attempted: true });
  });

  it('changes while closed or saving are ignored', () => {
    expect(pageEditorReducer({}, { type: 'change', draft: page })).toEqual({});
    const saving: PageEditorState = { draft: page, saving: true };
    expect(pageEditorReducer(saving, { type: 'change', draft: edited() })).toBe(saving);
  });
});

describe('a draft from outside, e.g. "Mit KI ausfüllen" (spec 0040 hooks in here)', () => {
  let next = 0;
  const newId = () => `id-${++next}`;

  it('fills head, rows marked new, steps, notes and links without saving', () => {
    const page = pageDraft(apfelkuchen, []);
    const filled = fillPageDraft(
      page,
      {
        title: 'Apfelkuchen mit Streuseln',
        servings: 8,
        totalMinutes: 70,
        ingredients: [
          {
            ...newIngredientRow('k1'),
            amountText: '100 g',
            name: 'Butter',
            article: { kind: 'new', name: 'Butter' },
          },
        ],
        steps: ['Teig kneten', 'Backen'],
        notes: 'Warm servieren',
        links: [{ url: 'https://example.org/apfelkuchen' }],
      },
      newId,
    );
    expect(filled.head).toMatchObject({
      title: 'Apfelkuchen mit Streuseln',
      servings: '8',
      totalMinutes: '70',
    });
    expect(filled.ingredients.rows.map((row) => row.key)).toEqual(['i-mehl', 'k1']);
    expect(filled.steps?.steps.map((step) => step.text)).toEqual(['Teig kneten', 'Backen']);
    expect(filled.notes.notes).toBe('Warm servieren');
    expect(filled.links.links).toEqual([{ url: 'https://example.org/apfelkuchen' }]);
    expect(changedSections(filled).map((draft) => draft.section)).toEqual([
      'head',
      'ingredients',
      'steps',
      'notes',
      'links',
    ]);
  });

  it('leaves out what is not given; a collection takes no steps; a link is there once', () => {
    const page = pageDraft(grillabend, grillContents);
    const filled = fillPageDraft(
      page,
      { steps: ['Kohle anzünden'], links: [{ url: 'https://a.de' }, { url: 'https://a.de' }] },
      newId,
    );
    expect(filled.steps).toBeUndefined();
    expect(filled.head).toEqual(page.head);
    expect(filled.links.links).toEqual([{ url: 'https://a.de' }]);
  });
});

describe('"Aus Rezept übernehmen" (spec 0037, REQ-003)', () => {
  const pizzateig: Recipe = makeRecipe({
    id: 'rec-pizzateig',
    title: 'Pizzateig',
    servings: 2,
    ingredients: [
      {
        id: 't-mehl',
        articleId: 'art-mehl',
        amount: parseAmount('500 g'),
        shoppingRule: 'recipeAmount',
      },
      {
        id: 't-hefe',
        articleId: 'art-hefe',
        amount: parseAmount('1 Würfel'),
        shoppingRule: 'count',
      },
      {
        id: 't-wasser',
        articleId: 'art-wasser',
        amount: parseAmount('300 ml'),
        shoppingRule: 'skip',
      },
      { id: 't-salz', articleId: 'art-salz', shoppingRule: 'skip', prepNote: 'fein' },
    ],
  });
  const margherita = makeRecipe({ id: 'rec-margherita', title: 'Pizza Margherita', servings: 4 });
  let next = 0;
  const newKey = () => `copy-${++next}`;

  it('AC-010: the 4 ingredients come as copies in the group „Pizzateig“', () => {
    const draft = pageDraft(margherita, []).ingredients;
    const copied = copyIngredientsFrom(draft, pizzateig, 4, newKey);
    if (!('draft' in copied)) throw new Error('draft expected');
    expect(copied.draft.rows).toHaveLength(4);
    expect(copied.draft.rows.every((row) => row.group === 'Pizzateig')).toBe(true);
    expect(copied.draft.rows.every((row) => row.ingredientId === undefined)).toBe(true);
    expect(copied.draft.rows.map((row) => row.article)).toEqual([
      { kind: 'article', articleId: 'art-mehl' },
      { kind: 'article', articleId: 'art-hefe' },
      { kind: 'article', articleId: 'art-wasser' },
      { kind: 'article', articleId: 'art-salz' },
    ]);
    // A copy: changing the source afterwards changes nothing here.
    const source = structuredClone(pizzateig);
    const copy = copyIngredientsFrom(draft, source, 4, newKey);
    source.ingredients[0] = { ...pizzateig.ingredients[0]!, amount: parseAmount('1 kg') };
    if (!('draft' in copy)) throw new Error('draft expected');
    expect(copy.draft.rows[0]?.amountText).toBe('1000 g');
  });

  it('AC-011: 2 portions of dough become 4 portions of pizza', () => {
    const copied = copyIngredientsFrom(pageDraft(margherita, []).ingredients, pizzateig, 4, newKey);
    if (!('draft' in copied)) throw new Error('draft expected');
    expect(copied.draft.rows.map((row) => row.amountText)).toEqual([
      '1000 g',
      '2 Würfel',
      '600 ml',
      '',
    ]);
    expect(copied.draft.rows[3]).toMatchObject({ prepNote: 'fein', shoppingRule: 'skip' });
  });

  it('AC-012: a recipe without ingredients says so', () => {
    const leer = makeRecipe({ id: 'rec-leer', title: 'Pizzateig', servings: 2 });
    expect(copyIngredientsFrom(pageDraft(margherita, []).ingredients, leer, 4, newKey)).toEqual({
      problem: '„Pizzateig“ hat keine Zutaten',
    });
  });

  it('takes the base and the default variant only, never a variant id', () => {
    const own = pageDraft(grillabend, grillContents).ingredients;
    const copied = copyIngredientsFrom(own, mangoCurry, 4, newKey);
    if (!('draft' in copied)) throw new Error('draft expected');
    const rows = copied.draft.rows.slice(own.rows.length);
    expect(rows.every((row) => row.variantId === undefined && row.group === 'Mango-Curry')).toBe(
      true,
    );
    // Five base ingredients and the tofu of the default variant, not the chicken.
    expect(rows.map((row) => row.article)).toHaveLength(6);
    expect(
      rows.some(
        (row) => row.article?.kind === 'article' && row.article.articleId === 'art-haehnchen',
      ),
    ).toBe(false);
  });
});
