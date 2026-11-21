// Shopping commands in backend mode (spec 0003): which write path each one takes, what is shown
// before and after the server answered, rejection, undo, and the store queue offline and online.
import { describe, expect, it } from 'vitest';

import { originSummary, summarizeItem } from '@housekeeping/core';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  addIngredientToList,
  addPlannedToList,
  addShoppingItemFromText,
  adjustItemCount,
  clearCheckedItems,
  clearShoppingList,
  createStore,
  moveStoreArea,
  pantryCheckRows,
  removeShoppingItem,
  setItemNote,
  setItemNotAvailable,
  setStoreAreaHidden,
} from './commands-shopping';
import { NADJA } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const articleNamed = (name: string) => getData().articles.find((article) => article.name === name);
const itemOf = (name: string) =>
  getData().items.find((item) => item.articleId === articleNamed(name)?.id && !item.checked);

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
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.calls[0]?.args[1]).toEqual([
      ...milk.contributions.map((contribution) => ({
        kind: 'delete',
        table: 'shopping_contributions',
        id: contribution.id,
      })),
      { kind: 'delete', table: 'shopping_items', id: milk.id },
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
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(3).fill('applyChanges'));
    expect(fx.calls.map((call) => (call.args[1] as { kind: string; table: string }[])[0])).toEqual([
      expect.objectContaining({ kind: 'insert', table: 'stores' }),
      expect.objectContaining({ kind: 'patch', table: 'stores' }),
      expect.objectContaining({ kind: 'patch', table: 'stores' }),
    ]);
    expect(fx.server.row(H, 'stores', storeId)).toMatchObject({ hidden_area_ids: [area.id] });
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

  it('AC-019: offline, ±, Zusatz, entfernen and leeren are refused with the offline hint', async () => {
    const engine = await fx.startEnrico();
    const milk = itemOf('Milch');
    if (!milk) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    const before = getData();
    expect(() => adjustItemCount(milk.id, 1)).toThrow(OfflineError);
    expect(() => adjustItemCount(milk.id, 1)).toThrow('Offline – zum Bearbeiten brauchst du Netz');
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
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
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
