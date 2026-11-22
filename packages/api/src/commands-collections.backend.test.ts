// Collections (spec 0009, T4): every action is one apply_changes or one RPC against the fake
// server, which refuses like the database (kind, contained once, foreign or deleted recipes,
// limit 50). Seed: "Grillabend" for 6 with Nudelsalat (übernimmt) and Gemischter Salat (8 Port.),
// planned next Saturday evening and the day before yesterday; "Sommerfest" is empty.
import {
  averageRating,
  collectionContentLabel,
  collectionContents,
  contentsDraft,
  moveContent,
  deletedNotice,
  removeContent,
  sectionDraft,
  setContentServings,
  setContentVariant,
  type HeadDraft,
} from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { createEngine, onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, TODAY, withBackend } from './backend-test-helpers';
import {
  addRecipeToCollection,
  addRecipesToCollection,
  createCollection,
  saveCollectionContents,
} from './commands-collections';
import { createAndPlanRecipe, splitForEaters } from './commands-plan';
import {
  createRecipe,
  deleteRecipe,
  rateRecipe,
  saveRecipeSection,
  toggleFavorite,
} from './commands-recipes';
import { pantryCheckRows } from './commands-shopping';
import { indexById } from './queries';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { createMemoryStorage } from './storage';
import { getData, OfflineError, snapshot } from './store';
import type { ChangeOp } from './transport';

const fx = withBackend();

const GRILLABEND = 'rec-grillabend';
const SOMMERFEST = 'rec-sommerfest';
const NUDELSALAT = 'rec-nudelsalat';
const SALAT = 'rec-gemischter-salat';
const DAL = 'rec-linsen-dal';

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const recipe = (id: string) => getData().recipes.find((candidate) => candidate.id === id);
const rowsOf = (collectionId: string) =>
  getData().collectionRecipes.filter((row) => row.collectionId === collectionId);
const contentsOf = (collectionId: string) => {
  const collection = recipe(collectionId);
  if (!collection) throw new Error(`fixture: ${collectionId} missing`);
  return collectionContents(collection, getData().collectionRecipes, indexById(getData().recipes));
};
const labelsOf = (collectionId: string) => contentsOf(collectionId).map(collectionContentLabel);

function rejections() {
  const messages: string[] = [];
  const stop = onWriteRejected((message) => messages.push(message));
  return { messages, stop };
}

describe('spec 0009: creating a collection (REQ-001, E12)', () => {
  it('AC-001, AC-002: "Grillabend" is one insert of kind collection without course; Nadja sees it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createCollection({ title: '  Raclette-Abend ' });
    expect(recipe(id)).toMatchObject({ kind: 'collection', title: 'Raclette-Abend' });
    expect(recipe(id)?.course).toBeUndefined();
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      {
        kind: 'insert',
        table: 'recipes',
        row: expect.objectContaining({ id, kind: 'collection', course: null }),
      },
    ]);
    expect(fx.server.row(H, 'recipes', id)).toMatchObject({ kind: 'collection', course: null });
    expect(fx.nadjaData(nadja).recipes.find((candidate) => candidate.id === id)).toMatchObject({
      kind: 'collection',
    });
  });

  it('AC-002: createRecipe with kind "collection" creates a collection, without kind a recipe', async () => {
    await fx.startEnrico();
    const collection = createRecipe({ title: 'Raclette-Abend', kind: 'collection' });
    const plain = createRecipe({ title: 'Kräuterbutter' });
    expect(recipe(collection)?.kind).toBe('collection');
    expect(recipe(plain)).toMatchObject({ kind: 'recipe', course: 'main' });
    await fx.settle();
    expect(fx.server.row(H, 'recipes', plain)).toMatchObject({ kind: 'recipe', course: 'main' });
  });

  it('AC-003: an empty title creates nothing and says "Titel fehlt"', async () => {
    await fx.startEnrico();
    const before = getData();
    expect(() => createCollection({ title: '   ' })).toThrow('Titel fehlt');
    expect(getData()).toBe(before);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('spec 0009: contained recipes (REQ-003, E12)', () => {
  it('AC-006: two recipes go in with one call, taking the portions of the collection', async () => {
    await fx.startEnrico();
    expect(addRecipesToCollection(SOMMERFEST, [NUDELSALAT, SALAT])).toBe(2);
    expect(labelsOf(SOMMERFEST)).toEqual([
      'Nudelsalat · 6 Port. (wie Sammlung)',
      'Gemischter Salat · 6 Port. (wie Sammlung)',
    ]);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      {
        kind: 'insert',
        table: 'collection_recipes',
        row: expect.objectContaining({
          collection_id: SOMMERFEST,
          recipe_id: NUDELSALAT,
          servings: null,
          variant_id: null,
          sort: 0,
        }),
      },
      {
        kind: 'insert',
        table: 'collection_recipes',
        row: expect.objectContaining({ recipe_id: SALAT, sort: 1 }),
      },
    ]);
    expect(
      fx.server.rows(H, 'collection_recipes').filter((row) => row.collection_id === SOMMERFEST),
    ).toHaveLength(2);
  });

  it('AC-010: a recipe already contained is not added again; nothing new sends nothing', async () => {
    await fx.startEnrico();
    expect(addRecipesToCollection(GRILLABEND, [NUDELSALAT])).toBe(0);
    expect(addRecipesToCollection(GRILLABEND, [NUDELSALAT, DAL])).toBe(1);
    await fx.settle();
    expect(fx.calls).toHaveLength(1);
    expect(opsOf(0)).toEqual([
      {
        kind: 'insert',
        table: 'collection_recipes',
        row: expect.objectContaining({ recipe_id: DAL, sort: 2 }),
      },
    ]);
  });

  it('AC-009: a collection never goes into a collection, a recipe is no container; the server refuses too', async () => {
    await fx.startEnrico();
    expect(() => addRecipesToCollection(GRILLABEND, [SOMMERFEST])).toThrow(
      'Eine Sammlung enthält nur Rezepte',
    );
    expect(() => addRecipesToCollection(NUDELSALAT, [DAL])).toThrow('Sammlung nicht gefunden');
    expect(() => addRecipeToCollection(SOMMERFEST, { collectionId: GRILLABEND })).toThrow(
      'Eine Sammlung enthält nur Rezepte',
    );
    await fx.settle();
    expect(fx.calls).toEqual([]);
    const row = (id: string, collectionId: string, recipeId: string) => ({
      kind: 'insert' as const,
      table: 'collection_recipes',
      row: { id, collection_id: collectionId, recipe_id: recipeId, sort: 9 },
    });
    const transport = fx.server.transport(NADJA);
    for (const [collectionId, recipeId] of [
      [GRILLABEND, SOMMERFEST],
      [NUDELSALAT, DAL],
      [GRILLABEND, GRILLABEND],
    ] as const) {
      await expect(
        transport.applyChanges(H, [row(crypto.randomUUID(), collectionId, recipeId)]),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'collection_recipe_kind_invalid' });
    }
    expect(fx.server.rows(H, 'collection_recipes')).toHaveLength(2);
  });

  it('AC-008: from the recipe page into an existing collection (one row at the end) or a new one (one call)', async () => {
    const engine = await fx.startEnrico();
    expect(addRecipeToCollection(DAL, { collectionId: GRILLABEND })).toEqual({
      collectionId: GRILLABEND,
      title: 'Grillabend',
    });
    const created = addRecipeToCollection(DAL, { newTitle: ' Sommerbuffet ' });
    expect(created.title).toBe('Sommerbuffet');
    expect(recipe(created.collectionId)).toMatchObject({ kind: 'collection' });
    expect(rowsOf(created.collectionId).map((row) => row.recipeId)).toEqual([DAL]);
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'insert',
        table: 'collection_recipes',
        row: expect.objectContaining({ collection_id: GRILLABEND, recipe_id: DAL, sort: 2 }),
      }),
    ]);
    expect(
      (fx.calls[1]?.args[1] as ChangeOp[]).map((op) => (op.kind === 'insert' ? op.table : op.kind)),
    ).toEqual(['recipes', 'collection_recipes']);
    expect(() => addRecipeToCollection(DAL, { newTitle: '' })).toThrow('Titel fehlt');
  });

  it('E15: more than 50 recipes are refused before sending ("Höchstens 50 Rezepte je Sammlung")', async () => {
    await fx.startEnrico();
    const ids = Array.from({ length: 49 }, (_, index) =>
      createRecipe({ title: `Rezept ${index + 1}` }),
    );
    expect(addRecipesToCollection(GRILLABEND, ids.slice(0, 48))).toBe(48);
    expect(() => addRecipesToCollection(GRILLABEND, ids.slice(48))).toThrow(
      'Höchstens 50 Rezepte je Sammlung',
    );
    await fx.settle();
    expect(rowsOf(GRILLABEND)).toHaveLength(50);
    expect(
      fx.server.rows(H, 'collection_recipes').filter((r) => r.collection_id === GRILLABEND),
    ).toHaveLength(50);
  });
});

describe('spec 0009: editing "Enthält" (E12, AC-015, AC-016)', () => {
  it('AC-016: the variant of Nudelsalat and own portions are one patch with only those columns', async () => {
    await fx.startEnrico();
    const [first] = rowsOf(GRILLABEND);
    if (!first) throw new Error('fixture');
    let draft = contentsDraft({ id: GRILLABEND }, contentsOf(GRILLABEND));
    draft = setContentVariant(setContentServings(draft, first.id, '8'), first.id, 'nudelsalat-v2');
    const save = saveCollectionContents(GRILLABEND, draft);
    expect(labelsOf(GRILLABEND)[0]).toBe('Nudelsalat · mit Hähnchen · 8 Port.');
    await fx.settle();
    await expect(save?.confirmed).resolves.toBeUndefined();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      {
        kind: 'patch',
        table: 'collection_recipes',
        id: first.id,
        changes: { servings: 8, variant_id: 'nudelsalat-v2' },
      },
    ]);
  });

  it('AC-015: "übernimmt" again clears the own portions; reorder and remove go in the same call', async () => {
    await fx.startEnrico();
    const [nudel, salat] = rowsOf(GRILLABEND);
    if (!nudel || !salat) throw new Error('fixture');
    addRecipesToCollection(GRILLABEND, [DAL]);
    await fx.settle();
    fx.clearCalls();
    const dal = rowsOf(GRILLABEND).find((row) => row.recipeId === DAL);
    if (!dal) throw new Error('fixture');
    let draft = contentsDraft({ id: GRILLABEND }, contentsOf(GRILLABEND));
    draft = setContentServings(draft, salat.id, '');
    draft = moveContent(removeContent(draft, nudel.id), dal.id, 0);
    saveCollectionContents(GRILLABEND, draft);
    expect(labelsOf(GRILLABEND)).toEqual([
      'Linsen-Dal · 6 Port. (wie Sammlung)',
      'Gemischter Salat · 6 Port. (wie Sammlung)',
    ]);
    await fx.settle();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'collection_recipes', id: salat.id, changes: { servings: null } },
      { kind: 'patch', table: 'collection_recipes', id: dal.id, changes: { sort: 0 } },
      { kind: 'delete', table: 'collection_recipes', id: nudel.id },
    ]);
    expect(fx.server.row(H, 'collection_recipes', salat.id)).toMatchObject({ servings: null });
    expect(fx.server.row(H, 'recipes', NUDELSALAT)).toBeDefined();
  });

  it('AC-017: invalid portions throw "1 bis 100 Portionen" and change nothing; nothing changed sends nothing', async () => {
    await fx.startEnrico();
    const [first] = rowsOf(GRILLABEND);
    if (!first) throw new Error('fixture');
    const draft = contentsDraft({ id: GRILLABEND }, contentsOf(GRILLABEND));
    const before = getData();
    expect(() =>
      saveCollectionContents(GRILLABEND, setContentServings(draft, first.id, '0')),
    ).toThrow('1 bis 100 Portionen');
    expect(getData()).toBe(before);
    const unchanged = saveCollectionContents(GRILLABEND, draft);
    await expect(unchanged?.confirmed).resolves.toBeUndefined();
    expect(saveCollectionContents('rec-unknown', draft)).toBeNull();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('spec 0009: conflicts jump back with the general hint (Konflikttabelle, ADR-0011)', () => {
  it('23505: Nadja put the same recipe in first; Enrico’s addition is refused, after the pull it is there once', async () => {
    const engine = await fx.startEnrico();
    const { messages, stop } = rejections();
    await fx.server.transport(NADJA).applyChanges(H, [
      {
        kind: 'insert',
        table: 'collection_recipes',
        row: { id: crypto.randomUUID(), collection_id: GRILLABEND, recipe_id: DAL, sort: 5 },
      },
    ]);
    expect(addRecipesToCollection(GRILLABEND, [DAL])).toBe(1);
    await fx.settle(engine);
    await engine.pull();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(rowsOf(GRILLABEND).filter((row) => row.recipeId === DAL)).toHaveLength(1);
    stop();
  });

  it('row_not_found: portions of a recipe Nadja removed meanwhile are refused and jump back', async () => {
    const engine = await fx.startEnrico();
    const { messages, stop } = rejections();
    const [first] = rowsOf(GRILLABEND);
    if (!first) throw new Error('fixture');
    await fx.server
      .transport(NADJA)
      .applyChanges(H, [{ kind: 'delete', table: 'collection_recipes', id: first.id }]);
    const draft = setContentServings(
      contentsDraft({ id: GRILLABEND }, contentsOf(GRILLABEND)),
      first.id,
      '10',
    );
    const save = saveCollectionContents(GRILLABEND, draft);
    await fx.settle(engine);
    await expect(save?.confirmed).rejects.toMatchObject({ code: 'row_not_found' });
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    await engine.pull();
    expect(rowsOf(GRILLABEND).some((row) => row.id === first.id)).toBe(false);
    stop();
  });

  it('23503: a recipe Nadja deleted meanwhile cannot be put in; Grillabend stays as it was', async () => {
    const engine = await fx.startEnrico();
    const { messages, stop } = rejections();
    await fx.server.transport(NADJA).deleteRecipe(DAL, TODAY);
    addRecipesToCollection(GRILLABEND, [DAL]);
    await fx.settle(engine);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(rowsOf(GRILLABEND).map((row) => row.recipeId)).toEqual([NUDELSALAT, SALAT]);
    stop();
  });

  it('offline: every collection command throws OfflineError and sends nothing', async () => {
    await fx.startEnrico();
    const draft = setContentServings(
      contentsDraft({ id: GRILLABEND }, contentsOf(GRILLABEND)),
      rowsOf(GRILLABEND)[0]?.id ?? '',
      '9',
    );
    fx.environment.setOnline(false);
    expect(() => createCollection({ title: 'Raclette-Abend' })).toThrow(OfflineError);
    expect(() => addRecipesToCollection(GRILLABEND, [DAL])).toThrow(OfflineError);
    expect(() => addRecipeToCollection(DAL, { collectionId: GRILLABEND })).toThrow(OfflineError);
    expect(() => addRecipeToCollection(DAL, { newTitle: 'Neu' })).toThrow(OfflineError);
    expect(() => saveCollectionContents(GRILLABEND, draft)).toThrow(OfflineError);
    fx.environment.setOnline(true);
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(rowsOf(GRILLABEND)).toHaveLength(2);
  });
});

describe('spec 0009: planning, the list and the sections of a collection', () => {
  it('AC-021: "Sommerparty" created as a collection and planned on Saturday evening in one call', async () => {
    await fx.startEnrico();
    const { recipeId, entryId } = createAndPlanRecipe(
      { title: 'Sommerparty', kind: 'collection' },
      { date: '2026-11-21', slotId: SLOT_DINNER, eaterIds: [ENRICO, NADJA] },
    );
    expect(recipe(recipeId)?.kind).toBe('collection');
    expect(getData().planEntries.find((entry) => entry.id === entryId)).toMatchObject({
      kind: 'recipe',
      recipeId,
      portions: 2,
      variants: [],
    });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0).map((op) => (op.kind === 'insert' ? op.table : op.kind))).toEqual([
      'recipes',
      'meal_plan_entries',
    ]);
  });

  it('AC-016 (Einplanen): a collection splits into no variants, portions = eaters + guests', async () => {
    await fx.startEnrico();
    expect(splitForEaters(GRILLABEND, [ENRICO, NADJA], 1)).toMatchObject({
      portions: 3,
      variants: [],
    });
  });

  it('AC-025: from the page, own ingredients say "Grillabend", contained ones "Grillabend · Nudelsalat"', async () => {
    await fx.startEnrico();
    const rows = pantryCheckRows([], [{ recipeId: GRILLABEND, portions: 6 }]);
    const byName = (name: string) => rows.find((row) => row.name === name);
    expect(byName('Bratwurst')).toMatchObject({ amount: '12×', sources: ['Grillabend'] });
    expect(byName('Grillkohle')).toMatchObject({ amount: '1×', sources: ['Grillabend'] });
    expect(byName('Farfalle')?.sources).toEqual(['Grillabend · Nudelsalat']);
    expect(byName('Kopfsalat')?.sources).toEqual(['Grillabend · Gemischter Salat']);
    for (const row of rows) {
      for (const contribution of row.contributions) {
        expect(contribution).toMatchObject({ recipeId: GRILLABEND, entryId: '' });
      }
    }
  });

  it('AC-027 / AC-014: from the calendar the Herkunft carries the day; the factor follows the entry', async () => {
    await fx.startEnrico();
    const entry = getData().planEntries.find(
      (candidate) => candidate.recipeId === GRILLABEND && candidate.date === '2026-11-21',
    );
    if (!entry) throw new Error('fixture: Grillabend on Saturday missing');
    expect(entry.portions).toBe(3);
    const rows = pantryCheckRows([entry.id]);
    const bratwurst = rows.find((row) => row.name === 'Bratwurst');
    expect(bratwurst).toMatchObject({ amount: '6×', sources: ['Grillabend (Sa)'] });
    expect(bratwurst?.contributions[0]).toMatchObject({ recipeId: GRILLABEND, entryId: entry.id });
    expect(rows.find((row) => row.name === 'Farfalle')?.sources).toEqual([
      'Grillabend · Nudelsalat (Sa)',
    ]);
  });

  it('E13: a collection saves its head without time; "Einordnung" and steps are refused', async () => {
    await fx.startEnrico();
    const collection = recipe(GRILLABEND);
    if (!collection) throw new Error('fixture');
    const head = sectionDraft(collection, 'head') as HeadDraft;
    const save = saveRecipeSection(GRILLABEND, { ...head, servings: '10', totalMinutes: '30' });
    expect(labelsOf(GRILLABEND)).toEqual([
      'Nudelsalat · 10 Port. (wie Sammlung)',
      'Gemischter Salat · 8 Port.',
    ]);
    await fx.settle();
    await save?.confirmed;
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'recipes', id: GRILLABEND, changes: { servings: 10 } },
    ]);
    const steps = sectionDraft(recipe(NUDELSALAT) ?? collection, 'steps');
    expect(() => saveRecipeSection(GRILLABEND, steps)).toThrow(
      'Eine Sammlung hat keine Zubereitung',
    );
    const asRecipe = { ...head, kind: 'recipe' as const, totalMinutes: '30' };
    expect(() => saveRecipeSection(GRILLABEND, asRecipe)).toThrow(
      'Der Abschnitt passt nicht zur Art',
    );
  });
});

describe('spec 0009: rating and favourite of a collection (REQ-009)', () => {
  it('AC-029: Nadja gives Grillabend 4,5 and ♡; Nudelsalat keeps her 3; Enrico sees her 4,5, his own stays empty', async () => {
    const nadja = await fx.startAs(NADJA);
    await fx.server.transport(NADJA).setRecipeRating(NUDELSALAT, 3);
    await nadja.pull();
    const enrico = createEngine({
      transport: fx.server.transport(ENRICO),
      storage: createMemoryStorage(),
      userId: ENRICO,
      environment: fx.environment,
    });
    await enrico.start();
    fx.clearCalls();
    const before = recipe(NUDELSALAT);
    expect(before?.ratings[NADJA]).toBe(3);

    rateRecipe(GRILLABEND, 4.5);
    toggleFavorite(GRILLABEND);
    await fx.settle(nadja, enrico);

    expect(fx.calls).toEqual([
      { fn: 'setRecipeRating', args: [GRILLABEND, 4.5] },
      { fn: 'setRecipeFavorite', args: [GRILLABEND, true] },
    ]);
    const grillabend = recipe(GRILLABEND);
    expect(grillabend?.ratings[NADJA]).toBe(4.5);
    expect(grillabend && averageRating(grillabend)).toBe(4.5);
    expect(grillabend?.favoriteOf).toContain(NADJA);
    // The contained recipe is untouched: same ratings and favourites as before.
    expect(recipe(NUDELSALAT)?.ratings).toEqual(before?.ratings);
    expect(recipe(NUDELSALAT)?.favoriteOf).toEqual(before?.favoriteOf);

    const seen = enrico.getState()?.households[H]?.recipes ?? [];
    const seenGrillabend = seen.find((candidate) => candidate.id === GRILLABEND);
    expect(seenGrillabend?.ratings[NADJA]).toBe(4.5);
    expect(seenGrillabend?.ratings[ENRICO]).toBeUndefined();
    expect(seen.find((candidate) => candidate.id === NUDELSALAT)?.ratings[NADJA]).toBe(3);
    enrico.stop();
  });

  it('AC-030, spec 0011 AC-024: 4 stars from "Wie war\'s?" go to Grillabend alone; the contained recipes get no new rating', async () => {
    await fx.startEnrico();
    const contained = contentsOf(GRILLABEND).map((content) => content.recipe);
    expect(contained.map((candidate) => candidate.id)).toEqual([NUDELSALAT, SALAT]);
    // "Wie war's?" rates a collection like a recipe (plan E17, T4: rateRecipe, not rateActivity).
    rateRecipe(GRILLABEND, 4);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'setRecipeRating', args: [GRILLABEND, 4] }]);
    expect(recipe(GRILLABEND)?.ratings[ENRICO]).toBe(4);
    for (const before of contained) {
      expect(recipe(before.id)?.ratings).toEqual(before.ratings);
      expect(fx.server.row(H, 'recipe_ratings', `${before.id}:${ENRICO}`)?.stars).toBe(
        before.ratings[ENRICO],
      );
    }
  });
});

describe('spec 0009: deleting with collections (AC-032, AC-033, E11)', () => {
  it('AC-032: deleting Grillabend takes its rows at once, the recipes stay; "Rückgängig" brings them back', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const before = rowsOf(GRILLABEND);
    const restore = snapshot();
    const deletion = deleteRecipe(GRILLABEND);
    expect(deletion?.collections).toBe(0);
    expect(deletedNotice('Grillabend', { collections: deletion?.collections ?? 0 })).toBe(
      'Grillabend gelöscht',
    );
    expect(rowsOf(GRILLABEND)).toEqual([]);
    expect(recipe(NUDELSALAT)).toBeDefined();
    await fx.settle(nadja);
    expect(
      fx.server.rows(H, 'collection_recipes').some((row) => row.collection_id === GRILLABEND),
    ).toBe(false);
    expect(fx.nadjaData(nadja).collectionRecipes).toEqual([]);
    restore();
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['deleteRecipe', 'restoreRecipe']);
    expect(recipe(GRILLABEND)?.kind).toBe('collection');
    expect(rowsOf(GRILLABEND)).toEqual(before);
    expect(fx.nadjaData(nadja).collectionRecipes).toEqual(before);
  });

  it('AC-033: deleting Nudelsalat takes it out of two collections; the hint counts them; undo puts it back', async () => {
    const engine = await fx.startEnrico();
    addRecipeToCollection(NUDELSALAT, { newTitle: 'Sommerbuffet' });
    await fx.settle(engine);
    fx.clearCalls();
    const rows = getData().collectionRecipes.filter((row) => row.recipeId === NUDELSALAT);
    expect(rows).toHaveLength(2);
    const restore = snapshot();
    const deletion = deleteRecipe(NUDELSALAT);
    expect(deletion?.collections).toBe(2);
    expect(deletedNotice('Nudelsalat', { collections: deletion?.collections ?? 0 })).toBe(
      'Nudelsalat gelöscht · auch aus 2 Sammlungen entfernt',
    );
    expect(labelsOf(GRILLABEND)).toEqual(['Gemischter Salat · 8 Port.']);
    await fx.settle(engine);
    expect(
      fx.server.rows(H, 'collection_recipes').some((row) => row.recipe_id === NUDELSALAT),
    ).toBe(false);
    restore();
    await fx.settle(engine);
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(
      getData()
        .collectionRecipes.filter((row) => row.recipeId === NUDELSALAT)
        .sort(byId),
    ).toEqual([...rows].sort(byId));
  });
});
