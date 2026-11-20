// Shopping commands in backend mode (spec 0003): which write path each one takes, what is shown
// before and after the server answered, rejection, undo, and the store queue offline and online.
import { describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  addIngredientToList,
  addPlannedToList,
  addShoppingItemFromText,
  clearCheckedItems,
  createShoppingList,
  createStore,
  moveStoreArea,
  pantryCheckRows,
  removeShoppingItem,
  setItemNotAvailable,
  setListStore,
  setStoreAreaHidden,
} from './commands-shopping';
import { getData, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const articleNamed = (name: string) => getData().articles.find((article) => article.name === name);
const itemOf = (name: string) =>
  getData().items.find((item) => item.articleId === articleNamed(name)?.id && !item.checked);
const list = () => getData().household.defaultListId;

describe('adding to the list', () => {
  it('online: one add_shopping_contributions call; the returned item is shown at once', async () => {
    await fx.startEnrico();
    const added = addShoppingItemFromText(list(), '2 Spülmittel');
    expect(added).toMatchObject({ articleName: 'Spülmittel', createdArticle: false });
    const shown = getData().items.find((item) => item.id === added?.itemId);
    expect(shown?.contributions.at(-1)).toMatchObject({ count: 2, source: { kind: 'manual' } });

    expect(fx.calls.map((call) => call.fn)).toEqual(['addShoppingContributions']);
    const [listId, entries] = fx.calls[0]?.args ?? [];
    expect(listId).toBe(list());
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
      list_id: list(),
    });
  });

  it('online: a new name creates the article on the server in the same call', async () => {
    await fx.startEnrico();
    const added = addShoppingItemFromText(list(), 'Mangochutney');
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
    const added = addShoppingItemFromText(list(), 'Brot');
    expect(added?.itemId).toBe(bread.id);
    expect(getData().items.find((item) => item.id === bread.id)).toMatchObject({ checked: false });
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', bread.id)).toMatchObject({ checked: false });
    expect(getData().items.find((item) => item.id === bread.id)?.contributions).toHaveLength(1);
  });

  it('AC-013: an item added on one device appears on the other', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const added = addShoppingItemFromText(list(), 'Spülmittel');
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).items.some((item) => item.id === added?.itemId)).toBe(true);
  });

  it('AC-019: a rejected add disappears again and says so', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    fx.server.failNext(
      'add_shopping_contributions',
      new TransportError('permanent', 'list_not_found', 404),
    );
    const added = addShoppingItemFromText(list(), 'Spülmittel');
    expect(getData().items.some((item) => item.id === added?.itemId)).toBe(true);
    await fx.settle();
    expect(getData().items.some((item) => item.id === added?.itemId)).toBe(false);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('offline: adding goes into the store queue, is shown as pending and sent once online', async () => {
    const engine = await fx.startEnrico();
    engine.setSimulatedOffline(true);
    const added = addShoppingItemFromText(list(), 'Mangochutney');
    expect(added).toMatchObject({ articleName: 'Mangochutney', createdArticle: true });
    const shown = getData().items.find((item) => item.id === added?.itemId);
    expect(shown).toMatchObject({ pendingSync: true });
    expect(await fx.storage.get('queue')).toEqual([
      expect.objectContaining({ kind: 'add', listId: list(), clientItemId: added?.itemId }),
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
    const added = addShoppingItemFromText(list(), 'Milch');
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
    expect(addShoppingItemFromText(list(), '   ')).toBeNull();
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
    const done = getData().items.filter((item) => item.listId === list() && item.checked);
    expect(done.length).toBeGreaterThan(0);
    const restore = snapshot();
    expect(clearCheckedItems(list())).toBe(done.length);
    expect(getData().items.some((item) => item.listId === list() && item.checked)).toBe(false);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'clearCheckedItems', args: [list()] }]);
    expect(fx.server.row(H, 'shopping_items', done[0]?.id ?? '')).toBeUndefined();

    restore();
    expect(getData().items.filter((item) => item.listId === list() && item.checked)).toHaveLength(
      done.length,
    );
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['clearCheckedItems', 'restoreClearedItems']);
    expect(fx.calls[1]?.args[0]).toBe(list());
    for (const item of done) {
      expect(fx.server.row(H, 'shopping_items', item.id)).toMatchObject({ checked: true });
    }
    expect(getData().items.filter((item) => item.listId === list() && item.checked)).toHaveLength(
      done.length,
    );
  });

  it('nothing checked: clearing sends nothing', async () => {
    await fx.startEnrico();
    expect(clearCheckedItems('list-drogerie')).toBe(0);
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
    expect(addPlannedToList(list(), rows)).toBe(rows.length);
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
    addPlannedToList(list(), rows);
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

describe('lists and stores (diff path)', () => {
  it('create list, choose its store, create a store and order its areas: one patch each', async () => {
    await fx.startEnrico();
    const listId = createShoppingList('Baumarkt');
    setListStore(listId, 'store-rewe');
    const storeId = createStore('Aldi');
    const area = getData().areas[3];
    if (!area) throw new Error('fixture');
    moveStoreArea(storeId, area.id, 0);
    setStoreAreaHidden(storeId, area.id, true);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(5).fill('applyChanges'));
    expect(fx.calls.map((call) => (call.args[1] as { kind: string; table: string }[])[0])).toEqual([
      expect.objectContaining({ kind: 'insert', table: 'shopping_lists' }),
      expect.objectContaining({ kind: 'patch', table: 'shopping_lists' }),
      expect.objectContaining({ kind: 'insert', table: 'stores' }),
      expect.objectContaining({ kind: 'patch', table: 'stores' }),
      expect.objectContaining({ kind: 'patch', table: 'stores' }),
    ]);
    expect(fx.server.row(H, 'shopping_lists', listId)).toMatchObject({ store_id: 'store-rewe' });
    expect(fx.server.row(H, 'stores', storeId)).toMatchObject({ hidden_area_ids: [area.id] });
  });
});
