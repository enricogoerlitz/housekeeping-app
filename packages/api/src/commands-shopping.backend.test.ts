// Shopping commands (spec 0003): which write path each one takes, what is shown
// before and after the server answered, rejection, undo, and the store queue offline and online.
import {
  addDays,
  entryIdsOnList,
  groupItems,
  originSummary,
  sectionDraft,
  summarizeItem,
  updateIngredientRow,
  type Id,
  type ShoppingItem,
} from '@housekeeping/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, TODAY, withBackend } from './backend-test-helpers';
import { resolveArticle } from './commands-articles';
import { assignArticleArea } from './commands-household';
import { saveRecipeSection } from './commands-recipes';
import {
  addIngredientToList,
  addPlannedToList,
  addShoppingItemFromText,
  adjustItemCount,
  ARTICLE_GONE_MESSAGE,
  clearCheckedItems,
  clearShoppingList,
  ITEM_NOTE_MAX_LENGTH,
  pantryCheckRows,
  removeShoppingItem,
  setItemChecked,
  setItemNote,
  setItemNotAvailable,
  type PantryCheckRow,
} from './commands-shopping';
import {
  AREA_NAME_MAX_LENGTH,
  createArea,
  createStore,
  fullAreaOrder,
  moveStoreArea,
  setStoreAreaHidden,
} from './commands-stores';
import { NADJA } from './seed/demo';
import { indexById } from './queries';
import { getData, OfflineError, snapshot } from './store';
import { articleName, itemsOf, recipeById as recipe } from './test-helpers';
import { TransportError } from './transport';

const fx = withBackend();

const articleNamed = (name: string) => getData().articles.find((article) => article.name === name);
const itemOf = (name: string) =>
  getData().items.find((item) => item.articleId === articleNamed(name)?.id && !item.checked);
const entryIdsOf = (rows: readonly PantryCheckRow[]) => [
  ...new Set(rows.flatMap((row) => row.contributions.map((contribution) => contribution.entryId))),
];

describe('adding to the list', () => {
  it('online: one add_shopping_contributions call; the returned item is shown at once', async () => {
    await fx.startEnrico();
    const added = addShoppingItemFromText('2 Spülmittel');
    expect(added).toMatchObject({ articleName: 'Spülmittel', createdArticle: false });
    const shown = getData().items.find((item) => item.id === added?.itemId);
    expect(shown?.contributions.at(-1)).toMatchObject({ count: 2, source: { kind: 'manual' } });

    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    const [householdId, entries] = fx.calls[0]?.args ?? [];
    expect(householdId).toBe(H);
    expect(entries).toEqual([
      expect.objectContaining({
        client_article_id: articleNamed('Spülmittel')?.id,
        article_name: 'Spülmittel',
        name_key: 'spuelmittel',
        contributions: [expect.objectContaining({ count: 2, source: { kind: 'manual' } })],
      }),
    ]);
    await fx.settle();
    expect(getData().items.find((item) => item.id === added?.itemId)).toBeDefined();
    expect(fx.server.row(H, 'shopping_items', added?.itemId ?? '')).toMatchObject({
      household_id: H,
    });
  });

  it('online: a new name creates the article on the server in the same call', async () => {
    await fx.startEnrico();
    const added = addShoppingItemFromText('Mangochutney');
    expect(added?.createdArticle).toBe(true);
    expect(articleNamed('Mangochutney')).toBeDefined();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    expect(fx.server.rows(H, 'articles').some((row) => row.name === 'Mangochutney')).toBe(true);
    expect(articleNamed('Mangochutney')).toBeDefined();
  });

  it('online: adding a checked article reopens its item at once, like the server does', async () => {
    await fx.startEnrico();
    const bread = getData().items.find(
      (item) => item.articleId === articleNamed('Brot')?.id && item.checked,
    );
    if (!bread) throw new Error('fixture');
    const added = addShoppingItemFromText('Brot');
    expect(added?.itemId).toBe(bread.id);
    expect(getData().items.find((item) => item.id === bread.id)).toMatchObject({ checked: false });
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', bread.id)).toMatchObject({ checked: false });
    expect(getData().items.find((item) => item.id === bread.id)?.contributions).toHaveLength(1);
  });

  it('AC-013: an item added on one device appears on the other', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const added = addShoppingItemFromText('Spülmittel');
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).items.some((item) => item.id === added?.itemId)).toBe(true);
  });

  it('AC-019: a rejected add disappears again and says so', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    fx.server.failNext(
      'add_shopping_contributions',
      new TransportError('permanent', 'invalid_entries', 400),
    );
    const added = addShoppingItemFromText('Spülmittel');
    expect(getData().items.some((item) => item.id === added?.itemId)).toBe(true);
    await fx.settle();
    expect(getData().items.some((item) => item.id === added?.itemId)).toBe(false);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('offline: adding goes into the store queue, is shown as pending and sent once online', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    const added = addShoppingItemFromText('Mangochutney');
    expect(added).toMatchObject({ articleName: 'Mangochutney', createdArticle: true });
    const shown = getData().items.find((item) => item.id === added?.itemId);
    expect(shown).toMatchObject({ pendingSync: true });
    expect(await fx.storage.get('queue')).toEqual([
      expect.objectContaining({ kind: 'add', householdId: H, clientItemId: added?.itemId }),
    ]);
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);

    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    expect(fx.server.row(H, 'shopping_items', added?.itemId ?? '')).toBeDefined();
    expect(getData().items.find((item) => item.id === added?.itemId)?.pendingSync).toBeUndefined();
    expect(await fx.storage.get('queue')).toEqual([]);
  });

  it('offline: a name already open on the list returns that item and adds up there', async () => {
    const engine = await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    const added = addShoppingItemFromText('Milch');
    expect(added).toEqual({ itemId: milk.id, articleName: 'Milch', createdArticle: false });
    expect(itemOf('Milch')?.contributions).toHaveLength(milk.contributions.length + 1);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(
      fx.server.rows(H, 'shopping_contributions').filter((row) => row.item_id === milk.id),
    ).toHaveLength(milk.contributions.length + 1);
  });

  it('empty input changes nothing and sends nothing', async () => {
    await fx.startEnrico();
    expect(addShoppingItemFromText('   ')).toBeNull();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('store actions (queue)', () => {
  it('"nicht da" offline stays local and pending, online it is sent', async () => {
    const engine = await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    setItemNotAvailable(milk.id, true);
    expect(itemOf('Milch')).toMatchObject({ notAvailable: true, pendingSync: true });
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);

    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(fx.calls).toEqual([{ fn: 'setItemNotAvailable', args: [milk.id, true] }]);
    expect(fx.server.row(H, 'shopping_items', milk.id)).toMatchObject({ not_available: true });
    expect(itemOf('Milch')?.pendingSync).toBeUndefined();
  });
});

describe('removing and clearing', () => {
  it('removing an item deletes it with its contributions in one call', async () => {
    await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    removeShoppingItem(milk.id);
    expect(getData().items.some((item) => item.id === milk.id)).toBe(false);
    await fx.settle();
    // One remove_item_contributions call, so the undo can restore the place (spec 0025).
    expect(fx.calls.map((call) => call.fn)).toEqual(['removeItemContributions']);
    expect(fx.calls[0]?.args).toEqual([
      milk.id,
      milk.contributions.map((contribution) => contribution.id),
    ]);
    expect(fx.server.row(H, 'shopping_items', milk.id)).toBeUndefined();
  });

  it('"Erledigt leeren" uses its RPC; undo puts the server\'s items back checked', async () => {
    await fx.startEnrico();
    const done = getData().items.filter((item) => item.checked);
    expect(done.length).toBeGreaterThan(0);
    const restore = snapshot();
    expect(clearCheckedItems()).toBe(done.length);
    expect(getData().items.some((item) => item.checked)).toBe(false);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'clearCheckedItems', args: [H] }]);
    expect(fx.server.row(H, 'shopping_items', done[0]?.id ?? '')).toBeUndefined();

    restore();
    expect(getData().items.filter((item) => item.checked)).toHaveLength(done.length);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['clearCheckedItems', 'restoreClearedItems']);
    expect(fx.calls[1]?.args[0]).toBe(H);
    for (const item of done) {
      expect(fx.server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: true });
    }
    expect(getData().items.filter((item) => item.checked)).toHaveLength(done.length);
  });

  it('nothing checked: clearing sends nothing', async () => {
    await fx.startEnrico();
    expect(clearCheckedItems()).toBeGreaterThan(0);
    await fx.settle();
    fx.clearCalls();
    expect(clearCheckedItems()).toBe(0);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('from the meal plan', () => {
  const lasagneRows = () => {
    const entry = getData().planEntries.find(
      (candidate) =>
        candidate.kind === 'recipe' &&
        getData().recipes.find((recipe) => recipe.id === candidate.recipeId)?.ingredients.length,
    );
    if (!entry) throw new Error('fixture');
    return pantryCheckRows([entry.id]).filter((row) => row.articleId);
  };

  it('AC-020: the pantry check is one call; a server error leaves none of the rows', async () => {
    await fx.startEnrico();
    const rows = lasagneRows().slice(0, 10);
    expect(rows.length).toBeGreaterThan(1);
    const before = getData().items;
    fx.server.failNext('add_shopping_contributions', new TransportError('permanent', '23503', 409));
    expect(addPlannedToList(rows)).toBe(rows.length);
    expect(getData().items).not.toBe(before);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    expect(fx.calls[0]?.args[1]).toHaveLength(rows.length);
    expect(getData().items).toEqual(before);
  });

  it('spec 0007: an article deleted meanwhile on another device (23503): back, with its hint, no retry', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const before = getData().items;
    fx.server.failNext('add_shopping_contributions', new TransportError('permanent', '23503', 409));
    addShoppingItemFromText('Milch');
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    expect(getData().items).toEqual(before);
    expect(messages).toEqual([ARTICLE_GONE_MESSAGE]);
    stop();
  });

  it('pantry check: undo removes exactly the added contributions', async () => {
    await fx.startEnrico();
    const rows = lasagneRows().slice(0, 3);
    const restore = snapshot();
    addPlannedToList(rows);
    await fx.settle();
    const sent = (fx.calls[0]?.args[1] ?? []) as { contributions: { id: string }[] }[];
    const ids = sent.flatMap((entry) => entry.contributions.map((contribution) => contribution.id));
    expect(ids.every((id) => fx.server.row(H, 'shopping_contributions', id))).toBe(true);

    restore();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'addShoppingContributions',
      'removeContributions',
    ]);
    expect(fx.calls[1]?.args[0]).toEqual(ids);
    expect(ids.some((id) => fx.server.row(H, 'shopping_contributions', id))).toBe(false);
  });

  it('pantry check with more than 200 contributions: undo is one removeContributions call', async () => {
    await fx.startEnrico();
    // 5 articles with 50 contributions each, as from a week of many dishes.
    const rows = lasagneRows()
      .slice(0, 5)
      .map((row) => ({
        ...row,
        contributions: Array.from({ length: 50 }, () => row.contributions.slice(0, 1)).flat(),
      }));
    expect(rows).toHaveLength(5);
    const listBefore = getData().items;
    const serverBefore = fx.server.rows(H, 'shopping_contributions');
    const restore = snapshot();
    addPlannedToList(rows);
    await fx.settle();
    restore();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'addShoppingContributions',
      'removeContributions',
    ]);
    expect(fx.calls[1]?.args[0]).toHaveLength(250);
    expect(fx.server.rows(H, 'shopping_contributions')).toEqual(serverBefore);
    expect(getData().items).toEqual(listBefore);
  });

  describe('"+ Aus Kalender" again (spec 0031, REQ-027)', () => {
    const openAmounts = (rows: readonly { articleId: Id }[]) =>
      rows.map((row) => {
        const open = getData().items.find(
          (item) => item.articleId === row.articleId && !item.checked,
        );
        return open ? summarizeItem(open).amount : undefined;
      });
    const serverContributions = (articleId: Id) => {
      const items = fx.server
        .rows(H, 'shopping_items')
        .filter((row) => row.article_id === articleId && row.checked !== true)
        .map((row) => String(row.id));
      return fx.server
        .rows(H, 'shopping_contributions')
        .filter((row) => items.includes(String(row.item_id)));
    };

    it('AC-064: taken over again, the list keeps the same amounts, one call', async () => {
      await fx.startEnrico();
      const rows = lasagneRows();
      addPlannedToList(rows);
      await fx.settle();
      const once = openAmounts(rows);
      const onServer = rows.map((row) => serverContributions(row.articleId).length);
      const calls = fx.calls.length;

      expect(addPlannedToList(pantryCheckRows(entryIdsOf(rows)))).toBe(rows.length);
      expect(openAmounts(rows)).toEqual(once);
      await fx.settle();
      expect(fx.calls.slice(calls).map((call) => call.fn)).toEqual(['applyChanges']);
      expect(openAmounts(rows)).toEqual(once);
      expect(rows.map((row) => serverContributions(row.articleId).length)).toEqual(onServer);
    });

    it('AC-064: an article left out this time stays on the list', async () => {
      await fx.startEnrico();
      const rows = lasagneRows();
      addPlannedToList(rows);
      await fx.settle();
      const once = openAmounts(rows);

      addPlannedToList(pantryCheckRows(entryIdsOf(rows)).slice(1));
      await fx.settle();
      expect(openAmounts(rows)).toEqual(once);
    });

    it('AC-064: undo brings back the contributions as they were', async () => {
      await fx.startEnrico();
      const rows = lasagneRows();
      addPlannedToList(rows);
      await fx.settle();
      const listBefore = getData().items;
      // The same contributions come back (ids, items, amounts), stamped anew by the server.
      const serverContents = () =>
        fx.server
          .rows(H, 'shopping_contributions')
          .map(({ created_at: _created, updated_at: _updated, ...row }) => row)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const serverBefore = serverContents();

      const restore = snapshot();
      addPlannedToList(pantryCheckRows(entryIdsOf(rows)));
      await fx.settle();
      expect(serverContents()).not.toEqual(serverBefore);
      restore();
      await fx.settle();
      expect(getData().items).toEqual(listBefore);
      expect(serverContents()).toEqual(serverBefore);
    });

    it('AC-065: the checked Hackfleisch comes back as an open item with the planned amount', async () => {
      await fx.startEnrico();
      const rows = lasagneRows();
      const [first] = rows;
      if (!first) throw new Error('fixture');
      addPlannedToList(rows);
      await fx.settle();
      const itemId = itemOf(articleName(first.articleId) ?? '')?.id ?? '';
      setItemChecked(itemId, true);
      await fx.settle();
      expect(getData().items.find((item) => item.id === itemId)?.checked).toBe(true);

      addPlannedToList(pantryCheckRows(entryIdsOf(rows)).slice(0, 1));
      await fx.settle();
      const open = getData().items.find(
        (item) => item.articleId === first.articleId && !item.checked,
      );
      expect(open && summarizeItem(open).amount).toBe(first.amount);
      expect(serverContributions(first.articleId)).toHaveLength(first.contributions.length);
    });
  });

  it('"Ist alle": one call; undo sends removeContributions', async () => {
    await fx.startEnrico();
    const recipe = getData().recipes.find((candidate) =>
      candidate.ingredients.some((ingredient) => ingredient.articleId),
    );
    const ingredient = recipe?.ingredients.find((candidate) => candidate.articleId);
    if (!recipe || !ingredient) throw new Error('fixture');
    const restore = snapshot();
    const added = addIngredientToList(recipe.id, ingredient.id);
    expect(getData().items.some((item) => item.id === added?.itemId)).toBe(true);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    restore();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'addShoppingContributions',
      'removeContributions',
    ]);
  });
});

describe('stores (diff path)', () => {
  it('create a store and order its areas: one patch each', async () => {
    await fx.startEnrico();
    const storeId = createStore('Aldi');
    const area = getData().areas[3];
    if (!area) throw new Error('fixture');
    moveStoreArea(storeId, area.id, 0);
    setStoreAreaHidden(storeId, area.id, true);
    await fx.settle();
    // The store comes from create_store (spec 0025), its order from patches.
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'createStore',
      'applyChanges',
      'applyChanges',
    ]);
    expect(
      fx.calls.slice(1).map((call) => (call.args[1] as { kind: string; table: string }[])[0]),
    ).toEqual([
      expect.objectContaining({ kind: 'patch', table: 'stores' }),
      expect.objectContaining({ kind: 'patch', table: 'stores' }),
    ]);
    expect(fx.server.row(H, 'stores', storeId)).toMatchObject({ hidden_area_ids: [area.id] });
  });

  it('AC-024: "Deko" becomes an area of the household (one insert, last in order); the article goes under it', async () => {
    await fx.startEnrico();
    const lastSort = Math.max(...getData().areas.map((area) => area.sort));
    const areaId = createArea('  Deko ');
    assignArticleArea('art-geschenkpapier', areaId);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'assignArticleArea']);
    expect(fx.server.row(H, 'areas', areaId)).toMatchObject({ name: 'Deko', sort: lastSort + 1 });
    expect(fx.server.row(H, 'articles', 'art-geschenkpapier')).toMatchObject({ area_id: areaId });
    expect(articleNamed('Geschenkpapier')?.areaId).toBe(areaId);
  });

  it('AC-024: an existing name (any case) is reused; empty, too long and offline are refused', async () => {
    const engine = await fx.startEnrico();
    const existing = getData().areas[0];
    if (!existing) throw new Error('fixture');
    const before = getData();
    expect(createArea(` ${existing.name.toUpperCase()} `)).toBe(existing.id);
    expect(() => createArea('   ')).toThrow('Name fehlt');
    expect(() => createArea('x'.repeat(AREA_NAME_MAX_LENGTH + 1))).toThrow(
      `Höchstens ${AREA_NAME_MAX_LENGTH} Zeichen`,
    );
    engine.setSimulatedOffline(true);
    expect(() => createArea('Deko')).toThrow(OfflineError);
    expect(getData()).toBe(before);
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);
  });
});

describe("the household's shopping list (spec 0006, ADR-0012)", () => {
  const nadja = () => fx.server.transport(NADJA);
  const serverItems = () => fx.server.rows(H, 'shopping_items');
  const serverContributions = (itemId: string) =>
    fx.server.rows(H, 'shopping_contributions').filter((row) => row.item_id === itemId);

  it('ADR-0012: the server has no list to insert, delete or point an item at', async () => {
    await fx.startEnrico();
    await expect(
      nadja().applyChanges(H, [
        {
          kind: 'insert',
          table: 'shopping_lists',
          row: { id: crypto.randomUUID(), name: 'Drogerie' },
        },
      ]),
    ).rejects.toMatchObject({ kind: 'permanent', code: 'invalid_change' });
    await expect(
      nadja().applyChanges(H, [
        {
          kind: 'patch',
          table: 'shopping_items',
          id: serverItems()[0]?.id ?? '',
          changes: { list_id: crypto.randomUUID() },
        },
      ]),
    ).rejects.toMatchObject({ kind: 'permanent', code: 'invalid_change' });
    expect(fx.server.rows(H, 'shopping_lists')).toEqual([]);
  });

  it('AC-014 / AC-017: every tap is one adjust_item_count call; taps on two devices both count', async () => {
    await fx.startEnrico();
    const other = await fx.startNadja();
    const milk = itemOf('Zahnpasta');
    if (!milk) throw new Error('fixture');
    expect(adjustItemCount(milk.id, 1)).toEqual({ count: 2, removed: false });
    await nadja().adjustItemCount(milk.id, 1);
    expect(itemOf('Zahnpasta') && summarizeItem(itemOf('Zahnpasta') ?? milk).amount).toBe('2×');
    await fx.settle(other);
    expect(fx.calls).toEqual([{ fn: 'adjustItemCount', args: [milk.id, 1] }]);
    expect(summarizeItem(itemOf('Zahnpasta') ?? milk).amount).toBe('3×');
    const onNadja = fx.nadjaData(other).items.find((item) => item.id === milk.id);
    expect(onNadja && summarizeItem(onNadja).amount).toBe('3×');
  });

  it('AC-014: + on an item from the plan adds a share "von Hand" on the server', async () => {
    await fx.startEnrico();
    const fromPlan = getData().items.find(
      (item) =>
        !item.checked &&
        item.contributions.length === 1 &&
        item.contributions[0]?.source.kind === 'recipe' &&
        item.contributions[0]?.count === 1 &&
        item.contributions[0]?.qty === undefined,
    );
    if (!fromPlan) throw new Error('fixture');
    adjustItemCount(fromPlan.id, 1);
    await fx.settle();
    expect(serverContributions(fromPlan.id)).toEqual([
      expect.objectContaining({ id: fromPlan.contributions[0]?.id, count: 1 }),
      expect.objectContaining({ source: { kind: 'manual' }, count: 1 }),
    ]);
    const shown = getData().items.find((item) => item.id === fromPlan.id);
    expect(shown && originSummary(shown)).toMatch(/: 1× · von Hand: 1×$/);
  });

  it('AC-015: − on 1× removes the item; undo restores it with its contributions', async () => {
    await fx.startEnrico();
    const milk = itemOf('Zahnpasta');
    if (!milk) throw new Error('fixture');
    const undo = snapshot();
    expect(adjustItemCount(milk.id, -1)).toEqual({ count: 0, removed: true });
    expect(itemOf('Zahnpasta')).toBeUndefined();
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', milk.id)).toBeUndefined();

    undo();
    expect(itemOf('Zahnpasta')?.id).toBe(milk.id);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['adjustItemCount', 'restoreClearedItems']);
    expect(fx.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked: false });
    expect(serverContributions(milk.id).map((row) => row.id)).toEqual(
      milk.contributions.map((contribution) => contribution.id),
    );
    expect(itemOf('Zahnpasta')?.contributions).toEqual(milk.contributions);
  });

  it('AC-015: − that the server finds not removing (someone tapped +) is not undone', async () => {
    await fx.startEnrico();
    const milk = itemOf('Zahnpasta');
    if (!milk) throw new Error('fixture');
    await nadja().adjustItemCount(milk.id, 1);
    const undo = snapshot();
    adjustItemCount(milk.id, -1);
    await fx.settle();
    expect(serverContributions(milk.id)).toEqual([expect.objectContaining({ count: 1 })]);
    undo();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['adjustItemCount']);
    expect(summarizeItem(itemOf('Zahnpasta') ?? milk).amount).toBe('1×');
  });

  it('AC-027: + on an item someone removed meanwhile changes nothing and reports nothing', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    await nadja().applyChanges(H, [
      ...milk.contributions.map((contribution) => ({
        kind: 'delete' as const,
        table: 'shopping_contributions',
        id: contribution.id,
      })),
      { kind: 'delete', table: 'shopping_items', id: milk.id },
    ]);
    adjustItemCount(milk.id, 1);
    await fx.settle();
    expect(itemOf('Milch')).toBeUndefined();
    expect(messages).toEqual([]);
    stop();
  });

  it('AC-030 (0019): offline "+" on "Milch 1×" shows 2× as pending and sends it once online', async () => {
    const engine = await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    const count = milk.contributions.reduce((sum, part) => sum + (part.count ?? 0), 0);
    engine.setSimulatedOffline(true);
    expect(adjustItemCount(milk.id, 1)).toEqual({ count: count + 1, removed: false });
    const shown = itemOf('Milch');
    expect(shown?.id).toBe(milk.id);
    expect(shown?.pendingSync).toBe(true);
    expect(shown?.contributions.reduce((sum, part) => sum + (part.count ?? 0), 0)).toBe(count + 1);
    expect(await fx.storage.get('queue')).toEqual([
      expect.objectContaining({ kind: 'add', householdId: H }),
    ]);
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);

    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    const counts = fx.server
      .rows(H, 'shopping_contributions')
      .filter((row) => row.item_id === milk.id)
      .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
    expect(counts).toBe(count + 1);
    expect(await fx.storage.get('queue')).toEqual([]);
  });

  it('AC-031 (0019): an item deleted elsewhere before the "+" is sent comes back as a new one', async () => {
    const engine = await fx.startEnrico();
    const nadja = await fx.startNadja();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    adjustItemCount(milk.id, 1);
    fx.server.deleteRow(H, 'shopping_items', milk.id);
    await fx.settle(nadja);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    const milks = fx.server
      .rows(H, 'shopping_items')
      .filter((row) => row.article_id === milk.articleId);
    expect(milks).toHaveLength(1);
    expect(milks[0]?.id).not.toBe(milk.id);
  });

  it('AC-019: offline, ±, Zusatz, entfernen and leeren are refused with the offline hint', async () => {
    const engine = await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    const before = getData();
    // Spec 0019: "+" goes through the store queue offline (AC-030); "−" stays online (AC-031).
    expect(() => adjustItemCount(milk.id, -1)).toThrow(OfflineError);
    expect(() => adjustItemCount(milk.id, -1)).toThrow('Offline – zum Bearbeiten brauchst du Netz');
    expect(() => setItemNote(milk.id, 'laktosefrei')).toThrow(OfflineError);
    expect(() => removeShoppingItem(milk.id)).toThrow(OfflineError);
    expect(() => clearShoppingList()).toThrow(OfflineError);
    expect(() => clearCheckedItems()).toThrow(OfflineError);
    expect(getData()).toBe(before);
    await fx.settle(engine);
    expect(fx.calls).toEqual([]);
    expect(await fx.storage.get('queue')).toEqual([]);
  });

  it('AC-021: the note is one apply_changes call patching every contribution; null clears it', async () => {
    await fx.startEnrico();
    const other = await fx.startNadja();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    adjustItemCount(milk.id, 1);
    addShoppingItemFromText('Milch (Bio)');
    await fx.settle();
    fx.clearCalls();
    const contributions = itemOf('Milch')?.contributions ?? [];
    expect(contributions.length).toBeGreaterThan(1);

    setItemNote(milk.id, 'laktosefrei');
    await fx.settle(other);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.calls[0]?.args[1]).toEqual(
      contributions.map((contribution) => ({
        kind: 'patch',
        table: 'shopping_contributions',
        id: contribution.id,
        changes: { note: 'laktosefrei' },
      })),
    );
    const onNadja = fx.nadjaData(other).items.find((item) => item.id === milk.id);
    expect(onNadja && summarizeItem(onNadja).notes).toEqual(['laktosefrei']);

    setItemNote(milk.id, null);
    await fx.settle();
    expect(serverContributions(milk.id).every((row) => row.note === null)).toBe(true);
    expect(summarizeItem(itemOf('Milch') ?? milk).notes).toEqual([]);
  });

  it('AC-022: the server refuses a note longer than 200 characters', async () => {
    await fx.startEnrico();
    const milk = itemOf('Milch');
    const contribution = milk?.contributions[0];
    if (!contribution) throw new Error('fixture');
    await expect(
      nadja().applyChanges(H, [
        {
          kind: 'patch',
          table: 'shopping_contributions',
          id: contribution.id,
          changes: { note: 'x'.repeat(201) },
        },
      ]),
    ).rejects.toMatchObject({ kind: 'permanent', code: '23514' });
  });

  it('AC-035: "Liste leeren" is one clear_shopping_list call; undo brings back open and checked', async () => {
    await fx.startEnrico();
    const other = await fx.startNadja();
    const before = getData().items;
    const open = before.filter((item) => !item.checked);
    const done = before.filter((item) => item.checked);
    expect(open.length).toBeGreaterThan(0);
    expect(done.length).toBeGreaterThan(0);
    const undo = snapshot();
    expect(clearShoppingList()).toBe(before.length);
    expect(getData().items).toEqual([]);
    await fx.settle(other);
    expect(fx.calls).toEqual([{ fn: 'clearShoppingList', args: [H] }]);
    expect(serverItems()).toEqual([]);
    expect(fx.nadjaData(other).items).toEqual([]);

    undo();
    await fx.settle(other);
    expect(fx.calls.map((call) => call.fn)).toEqual(['clearShoppingList', 'restoreClearedItems']);
    for (const item of open) {
      expect(fx.server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: false });
    }
    for (const item of done) {
      expect(fx.server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: true });
    }
    expect(
      getData()
        .items.map((item) => item.id)
        .sort(),
    ).toEqual(before.map((item) => item.id).sort());
    expect(fx.nadjaData(other).items).toHaveLength(before.length);
  });

  it('AC-037: undo after Nadja added "Zahnpasta" again gives one row with both contributions', async () => {
    await fx.startEnrico();
    const milk = itemOf('Zahnpasta');
    const article = articleNamed('Zahnpasta');
    if (!milk || !article) throw new Error('fixture');
    const undo = snapshot();
    clearShoppingList();
    await fx.settle();
    const nadjaContribution = crypto.randomUUID();
    await nadja().addShoppingContributions(H, [
      {
        client_item_id: crypto.randomUUID(),
        client_article_id: article.id,
        article_name: 'Zahnpasta',
        name_key: 'zahnpasta',
        contributions: [
          {
            id: nadjaContribution,
            source: { kind: 'manual' },
            count: 1,
            qty: null,
            unit: null,
            note: null,
          },
        ],
      },
    ]);
    undo();
    await fx.settle();
    const milks = serverItems().filter((row) => row.article_id === article.id && !row.checked);
    expect(milks).toHaveLength(1);
    const contributionIds = fx.server
      .rows(H, 'shopping_contributions')
      .filter((row) => row.item_id === milks[0]?.id)
      .map((row) => row.id)
      .sort();
    expect(contributionIds).toEqual(
      [nadjaContribution, ...milk.contributions.map((contribution) => contribution.id)].sort(),
    );
    expect(summarizeItem(itemOf('Zahnpasta') ?? milk).amount).toBe('2×');
    expect(
      getData().items.filter((item) => item.articleId === article.id && !item.checked),
    ).toHaveLength(1);
  });

  it('AC-038: clearing the list of an unknown or foreign household is refused (not_member)', async () => {
    await fx.startEnrico();
    await expect(nadja().clearShoppingList(crypto.randomUUID())).rejects.toMatchObject({
      kind: 'permanent',
      code: 'not_member',
    });
    expect(serverItems().length).toBeGreaterThan(0);
  });

  it('AC-025: removing an item is one call; undo puts it back with its contributions', async () => {
    await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    const undo = snapshot();
    removeShoppingItem(milk.id);
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', milk.id)).toBeUndefined();
    undo();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'removeItemContributions',
      'restoreClearedItems',
    ]);
    expect(fx.server.row(H, 'shopping_items', milk.id)).toBeDefined();
    expect(itemOf('Milch')?.contributions).toEqual(milk.contributions);
  });

  it('AC-058: the pantry check for a recipe sends its contributions without a plan entry', async () => {
    await fx.startEnrico();
    const rows = pantryCheckRows([], [{ recipeId: 'rec-mango-curry', portions: 4 }]).filter(
      (row) => row.name === 'Kokosmilch',
    );
    expect(addPlannedToList(rows)).toBe(1);
    await fx.settle();
    const [entry] = (fx.calls[0]?.args[1] ?? []) as { contributions: { source: unknown }[] }[];
    expect(entry?.contributions[0]?.source).toEqual({
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      label: 'Mango-Curry',
    });
  });
});

const openItem = (name: string): ShoppingItem | undefined =>
  itemsOf().find((item) => !item.checked && articleName(item.articleId) === name);

describe('shopping list commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-028: "2 Käse (Gouda oder Emmentaler)" becomes Käse with 2× and the note', () => {
    clearShoppingList();
    const added = addShoppingItemFromText('2 Käse (Gouda oder Emmentaler)');
    expect(added).toMatchObject({ articleName: 'Käse', createdArticle: false });
    const item = itemsOf().find((candidate) => candidate.id === added?.itemId);
    expect(item && summarizeItem(item)).toMatchObject({
      amount: '2×',
      notes: ['Gouda oder Emmentaler'],
    });
  });

  it('AC-029: "Milch" twice gives one row with 2×; an empty field changes nothing', () => {
    const first = addShoppingItemFromText('Joghurt');
    const second = addShoppingItemFromText('joghurt');
    expect(second?.itemId).toBe(first?.itemId);
    const items = itemsOf().filter((item) => articleName(item.articleId) === 'Joghurt');
    expect(items).toHaveLength(1);
    expect(items[0] && summarizeItem(items[0]).amount).toBe('2×');

    const before = getData();
    expect(addShoppingItemFromText('   ')).toBeNull();
    expect(getData()).toEqual(before);
  });

  it('creates an article without area and with unknown diet for a new name', () => {
    const added = addShoppingItemFromText('Drachenfrucht-Sirup');
    expect(added?.createdArticle).toBe(true);
    const article = getData().articles.find((a) => a.name === 'Drachenfrucht-Sirup');
    expect(article).toMatchObject({ diet: 'unknown', isPantry: false, synonyms: [] });
    expect(article?.areaId).toBeUndefined();
    expect(resolveArticle(' Drachenfrucht-Sirup ').created).toBe(false);
  });

  it('AC-023: "Ist alle" puts Kreuzkümmel on the list, and the snapshot undoes it', () => {
    const curry = recipe('rec-mango-curry');
    const cumin = curry.ingredients.find(
      (ingredient) => articleName(ingredient.articleId) === 'Kreuzkümmel',
    );
    if (!cumin) throw new Error('Kreuzkümmel missing');
    const undo = snapshot();

    const added = addIngredientToList(curry.id, cumin.id);
    expect(added?.articleName).toBe('Kreuzkümmel');
    expect(itemsOf().some((item) => item.articleId === cumin.articleId)).toBe(true);

    undo();
    expect(itemsOf().some((item) => item.articleId === cumin.articleId)).toBe(false);
  });

  it('"Ist alle" carries the ingredient\'s default shopping note onto the list', () => {
    const pizza = recipe('rec-pizza-margherita');
    const mozzarella = pizza.ingredients.find(
      (ingredient) => articleName(ingredient.articleId) === 'Mozzarella',
    );
    if (!mozzarella) throw new Error('Mozzarella missing');
    const added = addIngredientToList(pizza.id, mozzarella.id);
    const item = itemsOf().find((candidate) => candidate.id === added?.itemId);
    expect(item?.contributions.map((contribution) => contribution.note)).toContain('Fior di Latte');
  });

  it('"Ist alle" for an unknown recipe or ingredient does nothing', () => {
    expect(addIngredientToList('rec-weg', 'x')).toBeNull();
    expect(addIngredientToList('rec-mango-curry', 'x')).toBeNull();
  });

  it('AC-033: an area assigned to an article applies on the list', () => {
    const data = getData();
    const store = data.stores.find((candidate) => candidate.id === 'store-rewe');
    const listItems = itemsOf();
    const before = groupItems(listItems, indexById(data.articles), data.areas, store);
    expect(before.find((group) => group.key === 'none')?.items.map((i) => i.articleId)).toContain(
      'art-geschenkpapier',
    );

    assignArticleArea('art-geschenkpapier', 'area-haushalt');
    const after = getData();
    const groups = groupItems(listItems, indexById(after.articles), after.areas, store);
    expect(groups.find((group) => group.key === 'none')).toBeUndefined();
    expect(
      groups.find((group) => group.title === 'Haushalt & Reinigung')?.items.map((i) => i.articleId),
    ).toEqual(['art-geschenkpapier']);
  });

  it('AC-034: moving "Getränke" to the front makes it the first area of Rewe Südstadt', () => {
    moveStoreArea('store-rewe', 'area-getraenke', 0);
    const store = getData().stores.find((candidate) => candidate.id === 'store-rewe');
    expect(store && fullAreaOrder(store)[0]).toBe('area-getraenke');
    expect(store?.areaOrder.filter((id) => id === 'area-getraenke')).toHaveLength(1);
  });
});

describe('pantry check', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  function curryEntryId(): Id {
    const entry = getData().planEntries.find(
      (candidate) =>
        candidate.recipeId === 'rec-mango-curry' && candidate.date === addDays(TODAY, 2),
    );
    if (!entry) throw new Error('planned curry missing');
    return entry.id;
  }

  it('AC-031: Mango and Kokosmilch go on the list, Reis and Kreuzkümmel start as pantry', () => {
    const entryId = curryEntryId();
    expect(entryIdsOnList(getData().items).has(entryId)).toBe(false);
    const rows = pantryCheckRows([entryId]);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Mango']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.isPantry).toBe(false);
    expect(byName['Kokosmilch']?.sources).toEqual(['Mango-Curry (So)']);
    expect(byName['Reis']?.isPantry).toBe(true);
    expect(byName['Kreuzkümmel']?.isPantry).toBe(true);
    const kept = rows.filter((row) => !row.isPantry && row.name !== 'Mango');
    addPlannedToList(kept);

    const names = itemsOf().map((item) => articleName(item.articleId));
    expect(names).toContain('Kokosmilch');
    expect(names).not.toContain('Mango');
    expect(names).not.toContain('Reis');
    expect(names).not.toContain('Kreuzkümmel');
    expect(entryIdsOnList(getData().items).has(entryId)).toBe(true);
  });

  it('carries an ingredient’s default shopping note onto the list item', () => {
    const curry = recipe('rec-mango-curry');
    const coconut = curry.ingredients.find(
      (ingredient) => articleName(ingredient.articleId) === 'Kokosmilch',
    );
    if (!coconut) throw new Error('Kokosmilch missing');
    const noted = updateIngredientRow(sectionDraft(curry, 'ingredients'), coconut.id, {
      shoppingNote: '  Bio ',
    });
    saveRecipeSection(curry.id, noted);

    const rows = pantryCheckRows([curryEntryId()]);
    const row = rows.find((candidate) => candidate.name === 'Kokosmilch');
    expect(row?.contributions.map((c) => c.note)).toEqual(['Bio']);

    clearShoppingList();
    addPlannedToList(row ? [row] : []);
    const [item] = itemsOf();
    expect(item && summarizeItem(item).notes).toEqual(['Bio']);

    const cleared = updateIngredientRow(sectionDraft(recipe(curry.id), 'ingredients'), coconut.id, {
      shoppingNote: '   ',
    });
    saveRecipeSection(curry.id, cleared);
    expect(
      recipe(curry.id).ingredients.find((i) => i.id === coconut.id)?.shoppingNote,
    ).toBeUndefined();
  });

  it('skips unknown entries and rows whose article is gone', () => {
    expect(pantryCheckRows(['plan-weg'])).toEqual([]);
    expect(
      addPlannedToList([
        {
          articleId: 'art-weg',
          name: 'Weg',
          amount: '',
          sources: [],
          isPantry: false,
          contributions: [],
        },
      ]),
    ).toBe(0);
  });

  it('AC-016: every pantry-check row has an article of the household; none is "Nicht im Katalog"', async () => {
    const curry = recipe('rec-mango-curry');
    const [first] = curry.ingredients;
    if (!first) throw new Error('fixture');
    // An article deleted on another device before this device synced.
    fx.server.deleteRow(H, 'articles', first.articleId);
    await fx.settle();
    const articles = indexById(getData().articles);
    const rows = pantryCheckRows([], [{ recipeId: curry.id, portions: 4 }]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => articles[row.articleId] !== undefined)).toBe(true);
    expect(rows.some((row) => row.articleId === first.articleId)).toBe(false);
  });
});

describe("the household's shopping list: local effect (spec 0006, ADR-0012)", () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it("REQ-001: the list is the household's items; there is no list row", () => {
    const data = getData();
    expect(data).not.toHaveProperty('lists');
    expect(data.household).not.toHaveProperty('defaultListId');
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('AC-023 / REQ-001: "Ist alle" lands in the household\'s items', () => {
    const curry = recipe('rec-mango-curry');
    const cumin = curry.ingredients.find(
      (ingredient) => articleName(ingredient.articleId) === 'Kreuzkümmel',
    );
    if (!cumin) throw new Error('fixture');
    const added = addIngredientToList(curry.id, cumin.id);
    expect(itemsOf().some((item) => item.id === added?.itemId)).toBe(true);
  });
});

describe('+ and − (REQ-003)', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  /** An open item with one contribution from the plan, counted 1×. */
  function fromPlanOnce(): ShoppingItem {
    const item = itemsOf().find(
      (candidate) =>
        !candidate.checked &&
        candidate.contributions.length === 1 &&
        candidate.contributions[0]?.source.kind === 'recipe' &&
        candidate.contributions[0]?.count === 1 &&
        candidate.contributions[0]?.qty === undefined,
    );
    if (!item) throw new Error('fixture: no item 1× from the plan');
    return item;
  }
  const current = (id: Id) => getData().items.find((item) => item.id === id);

  it('AC-014: + adds a share "von Hand" next to the plan', () => {
    const item = fromPlanOnce();
    const label =
      item.contributions[0]?.source.kind === 'recipe' ? item.contributions[0].source.label : '';
    expect(adjustItemCount(item.id, 1)).toEqual({ count: 2, removed: false });
    const after = current(item.id);
    expect(after && summarizeItem(after).amount).toBe('2×');
    expect(after && originSummary(after)).toBe(`${label}: 1× · von Hand: 1×`);
  });

  it('AC-015: − takes the share "von Hand" first, then removes the item; the snapshot brings it back', () => {
    const item = fromPlanOnce();
    adjustItemCount(item.id, 1);
    expect(adjustItemCount(item.id, -1)).toEqual({ count: 1, removed: false });
    expect(current(item.id)?.contributions).toEqual(item.contributions);

    const undo = snapshot();
    expect(adjustItemCount(item.id, -1)).toEqual({ count: 0, removed: true });
    expect(current(item.id)).toBeUndefined();
    undo();
    expect(current(item.id)).toEqual(item);
  });

  it('AC-018: an item with a quantity has no + and −; an unknown item neither', () => {
    const carrots = openItem('Möhren');
    if (!carrots) throw new Error('fixture');
    const before = getData();
    expect(adjustItemCount(carrots.id, 1)).toBeNull();
    expect(adjustItemCount('item-weg', -1)).toBeNull();
    expect(getData()).toEqual(before);
  });

  it('+ stops at 99×', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    for (let count = 2; count <= 99; count += 1) adjustItemCount(milk.id, 1);
    expect(current(milk.id) && summarizeItem(current(milk.id) as ShoppingItem).amount).toBe('99×');
    expect(adjustItemCount(milk.id, 1)).toBeNull();
  });
});

describe('Zusatz, entfernen, leeren (REQ-004, REQ-006)', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-021: the note goes on every contribution of the item; clearing it removes the brackets', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    adjustItemCount(milk.id, 1);
    addPlannedToList(
      pantryCheckRows([], [{ recipeId: 'rec-pfannkuchen', portions: 4 }]).filter(
        (row) => row.name === 'Milch',
      ),
    );
    setItemNote(milk.id, '  laktosefrei ');
    const noted = getData().items.find((item) => item.id === milk.id);
    expect(noted?.contributions.map((contribution) => contribution.note)).toEqual(
      noted?.contributions.map(() => 'laktosefrei'),
    );
    expect(noted && summarizeItem(noted).notes).toEqual(['laktosefrei']);

    setItemNote(milk.id, null);
    const cleared = getData().items.find((item) => item.id === milk.id);
    expect(cleared?.contributions.every((contribution) => contribution.note === undefined)).toBe(
      true,
    );
    setItemNote(milk.id, 'x');
    setItemNote(milk.id, '   ');
    expect(
      getData()
        .items.find((item) => item.id === milk.id)
        ?.contributions.every((contribution) => contribution.note === undefined),
    ).toBe(true);
  });

  it('AC-022: a note longer than 200 characters is refused and changes nothing', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    const before = getData();
    expect(ITEM_NOTE_MAX_LENGTH).toBe(200);
    expect(() => setItemNote(milk.id, 'x'.repeat(201))).toThrow('Höchstens 200 Zeichen');
    expect(getData()).toEqual(before);
    setItemNote(milk.id, 'x'.repeat(200));
    expect(openItem('Milch')?.contributions[0]?.note).toHaveLength(200);
  });

  it('AC-025: removing takes the item with all its contributions; the snapshot brings it back', () => {
    const milk = openItem('Milch');
    if (!milk) throw new Error('fixture');
    const undo = snapshot();
    removeShoppingItem(milk.id);
    expect(openItem('Milch')).toBeUndefined();
    undo();
    expect(openItem('Milch')).toEqual(milk);
  });

  it('AC-035 / AC-039: "Liste leeren" removes open and checked items; the plan is selectable again', () => {
    const all = itemsOf();
    expect(all.some((item) => item.checked)).toBe(true);
    expect(entryIdsOnList(all).size).toBeGreaterThan(0);
    const undo = snapshot();
    expect(clearShoppingList()).toBe(all.length);
    expect(itemsOf()).toEqual([]);
    expect(entryIdsOnList(getData().items).size).toBe(0);
    expect(clearShoppingList()).toBe(0);
    undo();
    expect(itemsOf()).toEqual(all);
  });

  it('"Erledigt leeren" works on the one list without naming it', () => {
    const done = itemsOf().filter((item) => item.checked);
    expect(clearCheckedItems()).toBe(done.length);
    expect(itemsOf().some((item) => item.checked)).toBe(false);
    expect(clearCheckedItems()).toBe(0);
  });
});

describe('pantry check for any recipe (REQ-010, for specs 0008/0009)', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-058: a recipe with its portions and variant, origin without a day', () => {
    const curry = recipe('rec-mango-curry');
    const tofu = curry.variants.find((variant) => variant.name === 'mit Tofu');
    if (!tofu) throw new Error('fixture');
    const rows = pantryCheckRows(
      [],
      [{ recipeId: curry.id, portions: 6, variants: [{ variantId: tofu.id, portions: 6 }] }],
    );
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Kokosmilch']).toMatchObject({ amount: '600 ml', sources: ['Mango-Curry'] });
    expect(byName['Räuchertofu']).toMatchObject({ amount: '600 g' });
    expect(byName['Hähnchenbrust']).toBeUndefined();
    expect(byName['Reis']?.isPantry).toBe(true);

    clearShoppingList();
    addPlannedToList(rows.filter((row) => row.name === 'Kokosmilch'));
    const [item] = itemsOf();
    expect(item?.contributions[0]?.source).toEqual({
      kind: 'recipe',
      recipeId: curry.id,
      label: 'Mango-Curry',
    });
    expect(entryIdsOnList(getData().items).size).toBe(0);
  });

  it('AC-059: an article open "von Hand" gets the recipe’s share in the same row', () => {
    clearShoppingList();
    addShoppingItemFromText('Mango');
    const rows = pantryCheckRows([], [{ recipeId: 'rec-mango-curry', portions: 4 }]);
    addPlannedToList(rows.filter((row) => row.name === 'Mango'));
    const mangos = itemsOf().filter((item) => articleName(item.articleId) === 'Mango');
    expect(mangos).toHaveLength(1);
    expect(mangos[0] && originSummary(mangos[0])).toBe('von Hand: 1× · Mango-Curry: 1×');
  });

  it('plan entries and chosen recipes together are one pantry check (AC-053)', () => {
    const entry = getData().planEntries.find(
      (candidate) =>
        candidate.recipeId === 'rec-mango-curry' && candidate.date === addDays(TODAY, 2),
    );
    if (!entry) throw new Error('fixture');
    const rows = pantryCheckRows([entry.id], [{ recipeId: 'rec-mango-curry', portions: 4 }]);
    expect(rows.find((row) => row.name === 'Kokosmilch')?.sources).toEqual([
      'Mango-Curry (So)',
      'Mango-Curry',
    ]);
    expect(pantryCheckRows([], [{ recipeId: 'rec-weg', portions: 4 }])).toEqual([]);
  });
});
