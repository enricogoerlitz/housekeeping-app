import { describe, expect, it } from 'vitest';

import {
  addedToCollectionLabel,
  collectionChoices,
  contentsChanges,
  contentsDraft,
  contentsRowsGone,
  moveContent,
  NEW_ENTRY_KINDS,
  newCollectionRecipes,
  newEntryTakesIngredients,
  newEntryTitleProblem,
  newRecipe,
  recipePickerRows,
  removeContent,
  savableContents,
  setContentServings,
  setContentVariant,
  takeOverLabel,
  validateContentsDraft,
} from './collection-editor';
import { collectionContentLabel, collectionContents, contentsInBook } from './collections';
import {
  grillabend,
  grillabendRecipes,
  grillArticlesById,
  grillgemuese,
  grillRecipes,
  grillRecipesById,
  hummus,
  kartoffelsalat,
  makeCollection,
  makeRecipe,
  tzatziki,
} from './test-fixtures';
import type { CollectionRecipe, Id, Recipe } from './types';

const book = { recipesById: grillRecipesById, collectionRecipes: grillabendRecipes };
const draft = () => contentsDraft(grillabend, contentsInBook(grillabend, book));

let ids = 0;
const newId = (): Id => `new-${++ids}`;

describe('window "Neu" (REQ-001)', () => {
  it('AC-001, AC-002: chips "Rezept · Sammlung"; only a recipe takes pasted ingredients', () => {
    expect(NEW_ENTRY_KINDS).toEqual([
      { value: 'recipe', label: 'Rezept' },
      { value: 'collection', label: 'Sammlung' },
    ]);
    expect(newEntryTakesIngredients('recipe')).toBe(true);
    expect(newEntryTakesIngredients('collection')).toBe(false);
  });

  it('AC-003: an empty title is "Titel fehlt"; at most 200 characters', () => {
    expect(newEntryTitleProblem('   ')).toBe('Titel fehlt');
    expect(newEntryTitleProblem('x'.repeat(201))).toBe('Höchstens 200 Zeichen');
    expect(newEntryTitleProblem(' Grillabend ')).toBeUndefined();
  });

  it('AC-002: "Raclette-Abend" as collection has no course; a recipe gets "Hauptgericht"', () => {
    const created = '2026-11-20T18:00:00.000Z';
    const raclette = newRecipe({
      id: 'col-raclette',
      kind: 'collection',
      title: ' Raclette-Abend ',
      servings: 2,
      createdAt: created,
    });
    expect(raclette).toEqual({
      id: 'col-raclette',
      kind: 'collection',
      title: 'Raclette-Abend',
      servings: 2,
      tags: [],
      variants: [],
      ingredients: [],
      steps: [],
      favoriteOf: [],
      ratings: {},
      cookedCount: 0,
      createdAt: created,
      links: [],
      videos: [],
    });
    const recipe = newRecipe({
      id: 'rec-x',
      kind: 'recipe',
      title: 'Rösti',
      servings: 2,
      createdAt: created,
    });
    expect(recipe).toMatchObject({ kind: 'recipe', course: 'main', links: [] });
  });
});

describe('"Enthält" (REQ-003, REQ-005)', () => {
  it('opens with the rows in their order; "übernimmt" is blank', () => {
    expect(draft().rows).toEqual([
      { id: 'cr-kartoffelsalat', recipeId: kartoffelsalat.id, servings: '' },
      { id: 'cr-grillgemuese', recipeId: grillgemuese.id, servings: '8', variantId: 'v-halloumi' },
    ]);
    expect(contentsChanges(draft())).toEqual([]);
  });

  it('AC-016: the variant "vegan" goes out alone, and the row then reads "· vegan ·"', () => {
    const next = setContentVariant(draft(), 'cr-grillgemuese', 'v-vegan');
    expect(contentsChanges(next)).toEqual([
      { type: 'patch', id: 'cr-grillgemuese', values: { variantId: 'v-vegan' } },
    ]);
    const saved = grillabendRecipes.map((row) =>
      row.id === 'cr-grillgemuese' ? { ...row, variantId: 'v-vegan' } : row,
    );
    expect(
      collectionContents(grillabend, saved, grillRecipesById).map(collectionContentLabel),
    ).toEqual(['Kartoffelsalat · 6 Port. (wie Sammlung)', 'Grillgemüse · vegan · 8 Port.']);
  });

  it('AC-015: own portions, and back to "übernimmt"', () => {
    const own = setContentServings(draft(), 'cr-kartoffelsalat', ' 10 ');
    expect(contentsChanges(own)).toEqual([
      { type: 'patch', id: 'cr-kartoffelsalat', values: { servings: 10 } },
    ]);
    const inherits = setContentServings(draft(), 'cr-grillgemuese', '');
    expect(contentsChanges(inherits)).toEqual([
      { type: 'patch', id: 'cr-grillgemuese', values: { servings: undefined } },
    ]);
  });

  it('AC-017: portions 1 to 100, else "1 bis 100 Portionen" and nothing is sent', () => {
    for (const servings of ['0', '101', '2,5', 'viel']) {
      const invalid = setContentServings(draft(), 'cr-grillgemuese', servings);
      expect(validateContentsDraft(invalid)).toEqual([
        { field: 'servings', key: 'cr-grillgemuese', message: '1 bis 100 Portionen' },
      ]);
      expect(() => contentsChanges(invalid)).toThrow();
    }
    expect(validateContentsDraft(setContentServings(draft(), 'cr-grillgemuese', '100'))).toEqual(
      [],
    );
  });

  it('removing takes the row out; the recipe itself is no change', () => {
    const next = removeContent(draft(), 'cr-kartoffelsalat');
    expect(next.rows.map((row) => row.id)).toEqual(['cr-grillgemuese']);
    expect(contentsChanges(next)).toEqual([{ type: 'delete', id: 'cr-kartoffelsalat' }]);
  });

  it('moving sends a new sort only for rows whose place changed', () => {
    const three: CollectionRecipe[] = [
      ...grillabendRecipes,
      { id: 'cr-tzatziki', collectionId: grillabend.id, recipeId: tzatziki.id, sort: 2 },
    ];
    const start = contentsDraft(
      grillabend,
      collectionContents(grillabend, three, grillRecipesById),
    );
    const moved = moveContent(start, 'cr-tzatziki', 1);
    expect(moved.rows.map((row) => row.id)).toEqual([
      'cr-kartoffelsalat',
      'cr-tzatziki',
      'cr-grillgemuese',
    ]);
    expect(contentsChanges(moved)).toEqual([
      { type: 'patch', id: 'cr-tzatziki', values: { sort: 1 } },
      { type: 'patch', id: 'cr-grillgemuese', values: { sort: 2 } },
    ]);
    // Removing alone keeps the order: no new sort for the rest.
    expect(contentsChanges(removeContent(start, 'cr-kartoffelsalat'))).toEqual([
      { type: 'delete', id: 'cr-kartoffelsalat' },
    ]);
    expect(moveContent(start, 'cr-tzatziki', 9).rows.at(-1)?.id).toBe('cr-tzatziki');
  });

  it('a variant the recipe no longer has is shown and saved as the default', () => {
    const rows = grillabendRecipes.map((row) =>
      row.id === 'cr-grillgemuese' ? { ...row, variantId: 'v-gone' } : row,
    );
    const stale = contentsDraft(grillabend, collectionContents(grillabend, rows, grillRecipesById));
    expect(stale.rows[1]?.variantId).toBeUndefined();
    expect(contentsChanges(stale)).toEqual([
      { type: 'patch', id: 'cr-grillgemuese', values: { variantId: undefined } },
    ]);
  });

  it('E15: at most 20 removed at once: "Höchstens 20 Rezepte auf einmal entfernen"', () => {
    const recipes = Array.from({ length: 21 }, (_, index) =>
      makeRecipe({ id: `rec-${index}`, title: `Rezept ${index}` }),
    );
    const rows = recipes.map((recipe, sort): CollectionRecipe => ({
      id: `cr-${sort}`,
      collectionId: grillabend.id,
      recipeId: recipe.id,
      sort,
    }));
    const byId = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
    let big = contentsDraft(grillabend, collectionContents(grillabend, rows, byId));
    for (const row of rows.slice(0, 20)) big = removeContent(big, row.id);
    expect(validateContentsDraft(big)).toEqual([]);
    big = removeContent(big, 'cr-20');
    expect(validateContentsDraft(big)).toEqual([
      { field: 'removed', message: 'Höchstens 20 Rezepte auf einmal entfernen' },
    ]);
  });
});

describe('"Enthält" when leaving the page (E7, plan T8 decision 4)', () => {
  it('a valid draft is saved as it is', () => {
    const next = setContentServings(draft(), 'cr-kartoffelsalat', '10');
    expect(savableContents(next)).toBe(next);
  });

  it('a row with invalid portions keeps its stored portions, the rest is saved', () => {
    const next = setContentVariant(
      setContentServings(draft(), 'cr-grillgemuese', '0'),
      'cr-grillgemuese',
      'v-vegan',
    );
    const part = savableContents(next);
    expect(part?.rows[1]).toEqual({
      id: 'cr-grillgemuese',
      recipeId: grillgemuese.id,
      servings: '8',
      variantId: 'v-vegan',
    });
    expect(part && contentsChanges(part)).toEqual([
      { type: 'patch', id: 'cr-grillgemuese', values: { variantId: 'v-vegan' } },
    ]);
  });

  it('invalid portions of a row that inherits go back to "übernimmt"', () => {
    const part = savableContents(setContentServings(draft(), 'cr-kartoffelsalat', '101'));
    expect(part?.rows[0]?.servings).toBe('');
    expect(part && contentsChanges(part)).toEqual([]);
  });

  it('E15: more than 20 removed at once saves nothing', () => {
    const recipes = Array.from({ length: 21 }, (_, index) =>
      makeRecipe({ id: `rec-${index}`, title: `Rezept ${index}` }),
    );
    const rows = recipes.map((recipe, sort): CollectionRecipe => ({
      id: `cr-${sort}`,
      collectionId: grillabend.id,
      recipeId: recipe.id,
      sort,
    }));
    const byId = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
    let big = contentsDraft(grillabend, collectionContents(grillabend, rows, byId));
    for (const row of rows) big = removeContent(big, row.id);
    expect(savableContents(big)).toBeUndefined();
  });
});

describe('"Enthält" after a change of another device (conflict table)', () => {
  it('a row of the draft removed meanwhile on another device: the draft is out of date', () => {
    const open = setContentServings(draft(), 'cr-kartoffelsalat', '10');
    const synced = grillabendRecipes.filter((row) => row.id !== 'cr-kartoffelsalat');
    expect(contentsRowsGone(open, synced)).toBe(true);
  });

  it('nothing removed, or only rows this draft removes as well: up to date', () => {
    expect(contentsRowsGone(draft(), grillabendRecipes)).toBe(false);
    const removing = removeContent(draft(), 'cr-kartoffelsalat');
    const synced = grillabendRecipes.filter((row) => row.id !== 'cr-kartoffelsalat');
    expect(contentsRowsGone(removing, synced)).toBe(false);
  });

  it('a row added meanwhile on another device does not make the draft out of date', () => {
    const synced: CollectionRecipe[] = [
      ...grillabendRecipes,
      { id: 'cr-tzatziki', collectionId: grillabend.id, recipeId: tzatziki.id, sort: 2 },
    ];
    expect(contentsRowsGone(draft(), synced)).toBe(false);
  });
});

describe('window "Rezepte zu „Grillabend““ (REQ-003)', () => {
  const raclette = makeCollection({ id: 'col-raclette', title: 'Raclette-Abend' });
  const recipes: Recipe[] = [...grillRecipes, raclette];
  const picker = (query: string, selected: ReadonlySet<Id> = new Set()) =>
    recipePickerRows(grillabend, recipes, grillabendRecipes, query, grillArticlesById, selected);

  it('AC-010: a contained recipe stands with "schon enthalten" and cannot be chosen', () => {
    const { rows } = picker('');
    expect(rows.map((row) => [row.recipe.title, row.selectable, row.note])).toEqual([
      ['Kartoffelsalat', false, 'schon enthalten'],
      ['Grillgemüse', false, 'schon enthalten'],
      ['Tzatziki', true, undefined],
      ['Hummus', true, undefined],
    ]);
  });

  it('AC-009: the search finds no collection', () => {
    expect(picker('Raclette').rows).toEqual([]);
    expect(picker('Grillabend').rows).toEqual([]);
  });

  it('E15: at 50 recipes nothing more can be chosen, a chosen one can be unticked', () => {
    const many = Array.from({ length: 48 }, (_, index) =>
      makeRecipe({ id: `rec-${index}`, title: `Rezept ${index}` }),
    );
    const rows: CollectionRecipe[] = many.map((recipe, sort) => ({
      id: `cr-${sort}`,
      collectionId: grillabend.id,
      recipeId: recipe.id,
      sort,
    }));
    const all = [...many, tzatziki, hummus, kartoffelsalat];
    const below = recipePickerRows(grillabend, all, rows, '', grillArticlesById, new Set());
    expect(below.limitReached).toBe(false);
    const full = recipePickerRows(
      grillabend,
      all,
      rows,
      '',
      grillArticlesById,
      new Set([tzatziki.id, hummus.id]),
    );
    expect(full.limitReached).toBe(true);
    const selectable = full.rows.filter((row) => row.selectable).map((row) => row.recipe.title);
    expect(selectable).toEqual(['Tzatziki', 'Hummus']);
  });

  it('AC-006: "2 Rezepte übernehmen", "1 Rezept übernehmen"', () => {
    expect(takeOverLabel(2)).toBe('2 Rezepte übernehmen');
    expect(takeOverLabel(1)).toBe('1 Rezept übernehmen');
    expect(takeOverLabel(0)).toBe('0 Rezepte übernehmen');
  });

  it('AC-006: new rows go to the end, take the portions and the default variant', () => {
    expect(
      newCollectionRecipes(grillabend.id, [tzatziki.id, hummus.id], grillabendRecipes, newId),
    ).toEqual([
      { id: 'new-1', collectionId: grillabend.id, recipeId: tzatziki.id, sort: 2 },
      { id: 'new-2', collectionId: grillabend.id, recipeId: hummus.id, sort: 3 },
    ]);
  });

  it('AC-010: a recipe already contained or chosen twice is added once', () => {
    const rows = newCollectionRecipes(
      grillabend.id,
      [kartoffelsalat.id, tzatziki.id, tzatziki.id],
      grillabendRecipes,
      newId,
    );
    expect(rows.map((row) => row.recipeId)).toEqual([tzatziki.id]);
  });

  it('E15: more than 50 recipes are refused with "Höchstens 50 Rezepte je Sammlung"', () => {
    const rows: CollectionRecipe[] = Array.from({ length: 49 }, (_, sort) => ({
      id: `cr-${sort}`,
      collectionId: grillabend.id,
      recipeId: `rec-${sort}`,
      sort,
    }));
    expect(newCollectionRecipes(grillabend.id, ['rec-a'], rows, newId)).toHaveLength(1);
    expect(() => newCollectionRecipes(grillabend.id, ['rec-a', 'rec-b'], rows, newId)).toThrow(
      'Höchstens 50 Rezepte je Sammlung',
    );
  });
});

describe('window "Zu Sammlung hinzufügen" (REQ-003)', () => {
  const raclette = makeCollection({ id: 'col-raclette', title: 'Raclette-Abend' });
  const apfel = makeCollection({ id: 'col-apfel', title: 'Äpfelfest' });
  const recipes: Recipe[] = [...grillRecipes, raclette, apfel];

  it('AC-008: all collections A–Z, recipes are not offered', () => {
    const choices = collectionChoices(tzatziki.id, recipes, grillabendRecipes);
    expect(choices.map((choice) => [choice.collection.title, choice.selectable])).toEqual([
      ['Äpfelfest', true],
      ['Grillabend', true],
      ['Raclette-Abend', true],
    ]);
    expect(addedToCollectionLabel('Grillabend')).toBe('Zu „Grillabend“ hinzugefügt');
  });

  it('AC-010: a collection that contains the recipe says "enthält es schon"', () => {
    const choices = collectionChoices(kartoffelsalat.id, recipes, grillabendRecipes);
    const grill = choices.find((choice) => choice.collection.id === grillabend.id);
    expect(grill).toMatchObject({ selectable: false, note: 'enthält es schon' });
  });

  it('E15: a full collection cannot be chosen', () => {
    const rows: CollectionRecipe[] = Array.from({ length: 50 }, (_, sort) => ({
      id: `cr-${sort}`,
      collectionId: raclette.id,
      recipeId: `rec-${sort}`,
      sort,
    }));
    const full = collectionChoices(tzatziki.id, recipes, rows).find(
      (choice) => choice.collection.id === raclette.id,
    );
    expect(full).toMatchObject({ selectable: false, note: 'Höchstens 50 Rezepte je Sammlung' });
  });
});
