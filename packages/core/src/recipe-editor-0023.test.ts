import { describe, expect, it } from 'vitest';

import { amountScalingHint } from './amounts';
import {
  addPastedRows,
  ingredientRowOf,
  keepDuplicateRow,
  newIngredientRow,
  openRows,
  pastedSaveNotice,
  placeIngredientRow,
  removeIngredient,
  savablePart,
  sectionDraft,
  sectionPatch,
  stepTimerProblem,
  parseStepTimer,
  validateSectionDraft,
  type IngredientRow,
  type LinksDraft,
} from './recipe-editor';
import { articles, mangoCurry } from './test-fixtures';
import type { Article, Id } from './types';

const context = {
  articles,
  createArticle: (): Article => {
    throw new Error('no new articles here');
  },
  newId: () => 'new-id',
  entries: [],
};

function pasted(key: string, articleId: Id, amountText = '', variantId?: Id): IngredientRow {
  return {
    ...newIngredientRow(key),
    amountText,
    article: { kind: 'article', articleId },
    ...(variantId === undefined ? {} : { variantId }),
  };
}

describe('REQ-006: pasted duplicates', () => {
  it('AC-019: "400 ml Kokosmilch" again is a duplicate, "1 Möhren" is not', () => {
    const draft = addPastedRows(sectionDraft(mangoCurry, 'ingredients'), [
      pasted('p1', 'art-kokosmilch', '400 ml'),
      pasted('p2', 'art-moehren', '1'),
    ]);
    const rows = draft.rows.slice(-2);
    expect(rows.map((row) => row.duplicate ?? false)).toEqual([true, false]);
    expect(openRows(draft, articles).map((row) => row.key)).toEqual(['p1']);
  });

  it('AC-019: a duplicate is not saved, also not when leaving the page', () => {
    const base = sectionDraft(mangoCurry, 'ingredients');
    const draft = addPastedRows(base, [pasted('p1', 'art-kokosmilch', '400 ml')]);
    const patch = sectionPatch(mangoCurry, draft, context);
    expect(patch.recipe).toEqual({});
    expect(patch.open.map((row) => row.key)).toEqual(['p1']);
    const left = savablePart(draft);
    expect(left.section === 'ingredients' && left.rows.map((row) => row.key)).not.toContain('p1');
  });

  it('AC-020: "Trotzdem hinzufügen" saves it a second time', () => {
    const draft = keepDuplicateRow(
      addPastedRows(sectionDraft(mangoCurry, 'ingredients'), [
        pasted('p1', 'art-kokosmilch', '400 ml'),
      ]),
      'p1',
    );
    const patch = sectionPatch(mangoCurry, draft, context);
    expect(
      patch.recipe.ingredients?.filter((ingredient) => ingredient.articleId === 'art-kokosmilch'),
    ).toHaveLength(2);
  });

  it('AC-021: the same article further up in the same text is a duplicate', () => {
    const empty = { ...mangoCurry, ingredients: [], variants: [] };
    const draft = addPastedRows(sectionDraft(empty, 'ingredients'), [
      pasted('z1', 'art-moehren', '1'),
      pasted('z2', 'art-moehren', '2'),
    ]);
    expect(draft.rows.map((row) => row.duplicate ?? false)).toEqual([false, true]);
  });

  it('another variant is no duplicate', () => {
    const draft = addPastedRows(sectionDraft(mangoCurry, 'ingredients'), [
      pasted('p1', 'art-kokosmilch', '400 ml', 'v-tofu'),
    ]);
    expect(draft.rows.at(-1)?.duplicate ?? false).toBe(false);
  });
});

describe('REQ-006: the notice after "Fertig"', () => {
  const orange = (key: string): IngredientRow => newIngredientRow(key);
  const duplicate = (key: string): IngredientRow => ({
    ...pasted(key, 'art-kokosmilch'),
    duplicate: true,
  });

  it('AC-018: "5 Zutaten gespeichert · 2 brauchen noch einen Artikel"', () => {
    expect(pastedSaveNotice(5, [orange('a'), orange('b')])).toBe(
      '5 Zutaten gespeichert · 2 brauchen noch einen Artikel',
    );
  });

  it('AC-019: "1 Zutat gespeichert · 1 steht schon im Rezept"', () => {
    expect(pastedSaveNotice(1, [duplicate('a')])).toBe(
      '1 Zutat gespeichert · 1 steht schon im Rezept',
    );
  });

  it('without anything saved it starts with "2 Zutaten brauchen …"', () => {
    expect(pastedSaveNotice(0, [orange('a'), orange('b'), duplicate('c')])).toBe(
      '2 Zutaten brauchen noch einen Artikel · 1 steht schon im Rezept',
    );
    expect(pastedSaveNotice(0, [orange('a')])).toBe('1 Zutat braucht noch einen Artikel');
    expect(pastedSaveNotice(0, [duplicate('a'), duplicate('b')])).toBe(
      '2 Zutaten stehen schon im Rezept',
    );
    expect(pastedSaveNotice(3, [])).toBeUndefined();
  });
});

describe('REQ-002: one ingredient from the read view', () => {
  it('AC-004: the row of a stored ingredient, changed and put back in its place', () => {
    const first = mangoCurry.ingredients[0];
    if (!first) throw new Error('fixture');
    const row = ingredientRowOf(mangoCurry, first.id);
    expect(row?.article).toEqual({ kind: 'article', articleId: first.articleId });
    const draft = placeIngredientRow(sectionDraft(mangoCurry, 'ingredients'), {
      ...(row as IngredientRow),
      amountText: '200 g',
    });
    const patch = sectionPatch(mangoCurry, draft, context);
    expect(patch.recipe.ingredients?.[0]?.amount).toEqual({ text: '200 g', qty: 200, unit: 'g' });
    expect(patch.recipe.ingredients).toHaveLength(mangoCurry.ingredients.length);
  });

  it('AC-006 undo: a removed row comes back at its index', () => {
    const second = mangoCurry.ingredients[1];
    if (!second) throw new Error('fixture');
    const row = ingredientRowOf(mangoCurry, second.id) as IngredientRow;
    const removed = removeIngredient(sectionDraft(mangoCurry, 'ingredients'), second.id);
    const back = placeIngredientRow(removed, row, 1);
    expect(back.rows.map((candidate) => candidate.key)).toEqual(
      mangoCurry.ingredients.map((ingredient) => ingredient.id),
    );
  });

  it('a group over 60 characters is a problem of the row', () => {
    const first = mangoCurry.ingredients[0];
    if (!first) throw new Error('fixture');
    const draft = placeIngredientRow(sectionDraft(mangoCurry, 'ingredients'), {
      ...(ingredientRowOf(mangoCurry, first.id) as IngredientRow),
      group: 'x'.repeat(61),
    });
    expect(validateSectionDraft(draft)).toContainEqual({
      field: 'ingredient',
      key: first.id,
      message: 'Höchstens 60 Zeichen',
    });
  });
});

describe('REQ-001: the hint under "Menge"', () => {
  it('AC-001: "1 Prise" stays, "400 ml" is scaled, nothing for an empty field', () => {
    expect(amountScalingHint('1 Prise')).toBe('Bleibt beim Umrechnen gleich');
    expect(amountScalingHint('etwas')).toBe('Bleibt beim Umrechnen gleich');
    expect(amountScalingHint('400 ml')).toBe('Wird mit den Portionen umgerechnet');
    expect(amountScalingHint('2 große')).toBe('Wird mit den Portionen umgerechnet');
    expect(amountScalingHint('  ')).toBeUndefined();
  });
});

describe('REQ-005: the timer of a step', () => {
  it('AC-015: whole minutes from 1 to 600', () => {
    expect(parseStepTimer('35')).toBe(35);
    expect(parseStepTimer(' 600 ')).toBe(600);
    expect(stepTimerProblem('35')).toBeUndefined();
  });

  it('AC-016: "0", "601" and "1,5" are refused', () => {
    for (const text of ['0', '601', '1,5', 'abc']) {
      expect(stepTimerProblem(text)).toBe('1 bis 600 Minuten');
    }
  });

  it('AC-017: an empty field is no timer', () => {
    expect(parseStepTimer(' ')).toBeUndefined();
    expect(stepTimerProblem('')).toBeUndefined();
  });
});

describe('REQ-009: the section "Links"', () => {
  const withLinks = { ...mangoCurry, links: [{ url: 'https://chefkoch.de/r/1' }] };

  it('AC-032: "Fertig" sends only the links', () => {
    const draft: LinksDraft = {
      ...sectionDraft(withLinks, 'links'),
      links: [...withLinks.links, { url: 'https://chefkoch.de/r/2', label: 'Scharf' }],
    };
    expect(sectionPatch(withLinks, draft, context).recipe).toEqual({
      links: [
        { url: 'https://chefkoch.de/r/1' },
        { url: 'https://chefkoch.de/r/2', label: 'Scharf' },
      ],
    });
  });

  it('AC-034: more than 10 links cannot be saved', () => {
    const draft: LinksDraft = {
      ...sectionDraft(withLinks, 'links'),
      links: Array.from({ length: 11 }, (_, index) => ({ url: `https://a.de/${index}` })),
    };
    expect(validateSectionDraft(draft)).toEqual([
      { field: 'links', message: 'Höchstens 10 Links' },
    ]);
    expect(savablePart(draft)).toEqual({ ...draft, links: withLinks.links });
  });

  it('nothing changed: nothing to send', () => {
    expect(sectionPatch(withLinks, sectionDraft(withLinks, 'links'), context).recipe).toEqual({});
  });
});
