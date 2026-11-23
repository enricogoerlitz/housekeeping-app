import { describe, expect, it } from 'vitest';

import { contentsInBook } from './collections';
import { addIngredientRows, newIngredientRow, sectionDraft } from './recipe-editor';
import {
  openSectionDraft,
  savableOpenDraft,
  sectionEditorReducer,
  sectionSaveNotice,
  validateOpenDraft,
  type OpenDraft,
  type SectionEditorState,
} from './section-editor';
import { grillabend, grillabendRecipes, grillRecipesById, mangoCurry } from './test-fixtures';

const contents = contentsInBook(grillabend, {
  recipesById: grillRecipesById,
  collectionRecipes: grillabendRecipes,
});
const notes = (text: string): OpenDraft => ({ ...sectionDraft(mangoCurry, 'notes'), notes: text });
const untitled: OpenDraft = { ...sectionDraft(mangoCurry, 'head'), title: '' };

describe('the open draft of a section', () => {
  it('opens a recipe section from the recipe and "Enthält" from the contents', () => {
    expect(openSectionDraft(mangoCurry, [], 'steps')).toEqual(sectionDraft(mangoCurry, 'steps'));
    const open = openSectionDraft(grillabend, contents, 'contents');
    expect(open.section).toBe('contents');
    expect(open.section === 'contents' && open.rows).toHaveLength(contents.length);
  });

  it('AC-026: checks a recipe section and "Enthält" with their own rules', () => {
    expect(validateOpenDraft(untitled).map((problem) => problem.field)).toEqual(['title']);
    const contentsOpen = openSectionDraft(grillabend, contents, 'contents');
    if (contentsOpen.section !== 'contents') throw new Error('contents expected');
    const first = contentsOpen.rows[0];
    if (!first) throw new Error('row expected');
    const broken = { ...contentsOpen, rows: [{ ...first, servings: 'viele' }] };
    expect(validateOpenDraft(broken).map((problem) => problem.field)).toEqual(['servings']);
    expect(validateOpenDraft(notes('Mit Koriander'))).toEqual([]);
  });

  it('E7: leaving saves the valid part of either kind', () => {
    expect(savableOpenDraft(notes('Mit Koriander'))).toEqual(notes('Mit Koriander'));
    const contentsOpen = openSectionDraft(grillabend, contents, 'contents');
    expect(savableOpenDraft(contentsOpen)).toEqual(contentsOpen);
  });
});

describe('sectionSaveNotice (spec 0023, REQ-006)', () => {
  const sent = addIngredientRows(sectionDraft(mangoCurry, 'ingredients'), [
    {
      ...newIngredientRow('neu-1'),
      name: 'Limette',
      article: { kind: 'article', articleId: 'art-limette' },
    },
    {
      ...newIngredientRow('neu-2'),
      name: 'Koriander',
      article: { kind: 'article', articleId: 'art-koriander' },
    },
    { ...newIngredientRow('orange'), name: 'Bockshornklee' },
  ]);

  it('AC-032: "2 Zutaten gespeichert · 1 braucht noch einen Artikel" when rows stay open', () => {
    const reopened = {
      ...sectionDraft(mangoCurry, 'ingredients'),
      rows: [
        ...sectionDraft(mangoCurry, 'ingredients').rows,
        { ...newIngredientRow('orange'), name: 'Bockshornklee' },
      ],
    };
    expect(sectionSaveNotice(sent, reopened)).toBe(
      '2 Zutaten gespeichert · 1 braucht noch einen Artikel',
    );
  });

  it('says nothing when nothing stays open or the section is no ingredients section', () => {
    expect(sectionSaveNotice(sent, undefined)).toBeUndefined();
    expect(sectionSaveNotice(notes('x'), undefined)).toBeUndefined();
  });
});

describe('sectionEditorReducer (spec 0031, AC-027)', () => {
  const closed: SectionEditorState = {};

  it('the pen marks the section for opening; the next render opens it from the recipe', () => {
    const opening = sectionEditorReducer(closed, { type: 'edit', section: 'notes' });
    expect(opening).toEqual({ opening: 'notes' });
    expect(sectionEditorReducer(opening, { type: 'opened', draft: notes('') })).toEqual({
      draft: notes(''),
    });
  });

  it('the pen of the open section changes nothing', () => {
    const open: SectionEditorState = { draft: notes('a') };
    expect(sectionEditorReducer(open, { type: 'edit', section: 'notes' })).toBe(open);
  });

  it('typing keeps the attempt and clears the error and the notice', () => {
    const state: SectionEditorState = {
      draft: untitled,
      attempted: true,
      error: 'Offline',
      notice: 'x',
    };
    expect(sectionEditorReducer(state, { type: 'change', draft: notes('b') })).toEqual({
      draft: notes('b'),
      attempted: true,
      error: undefined,
      notice: undefined,
    });
  });

  it('AC-026: "Fertig" with problems keeps the draft open and shows them', () => {
    expect(sectionEditorReducer({ draft: untitled }, { type: 'invalid', draft: untitled })).toEqual(
      {
        draft: untitled,
        attempted: true,
      },
    );
  });

  it('a failed save keeps the draft with the reason', () => {
    expect(
      sectionEditorReducer(
        { draft: notes('a') },
        { type: 'failed', draft: notes('a'), error: 'Offline' },
      ),
    ).toEqual({ draft: notes('a'), error: 'Offline' });
  });

  it('AC-032: a save that leaves rows open shows them with the notice, otherwise closes', () => {
    const reopened = sectionDraft(mangoCurry, 'ingredients');
    expect(
      sectionEditorReducer(
        { draft: notes('a') },
        { type: 'saved', reopened, notice: '1 Zutat gespeichert' },
      ),
    ).toEqual({ draft: reopened, notice: '1 Zutat gespeichert' });
    expect(sectionEditorReducer({ draft: notes('a') }, { type: 'saved' })).toEqual({});
  });

  it('"Abbrechen" closes without saving', () => {
    expect(sectionEditorReducer({ draft: notes('a'), error: 'x' }, { type: 'close' })).toEqual({});
  });

  it('E7: a refusal opens the refused draft when nothing is open', () => {
    const sent = notes('Neu');
    expect(sectionEditorReducer(closed, { type: 'refused', sent, leftOpen: undefined })).toEqual({
      draft: sent,
    });
  });

  it('E7, AC-032: a refusal replaces the draft the save left open', () => {
    const sent = sectionDraft(mangoCurry, 'ingredients');
    const leftOpen = sectionDraft(mangoCurry, 'ingredients');
    expect(
      sectionEditorReducer({ draft: leftOpen, notice: 'n' }, { type: 'refused', sent, leftOpen }),
    ).toEqual({
      draft: sent,
    });
  });

  it('E7: a section opened or changed since a refusal stays as it is', () => {
    const open: SectionEditorState = { draft: notes('anders') };
    expect(
      sectionEditorReducer(open, { type: 'refused', sent: notes('Neu'), leftOpen: undefined }),
    ).toBe(open);
  });
});
