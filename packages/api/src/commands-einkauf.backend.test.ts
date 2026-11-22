// Spec 0025 "Einkauf": the amount "von Hand", ✕ per origin, removing at the same place, checking on
// the list (store action with onList), exact names, deleting an article with its checked item and
// a new store that copies another.
import { AMOUNT_NOT_RECOGNIZED, originSummary, summarizeItem } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { createArticle, deleteArticle } from './commands-articles';
import {
  addShoppingItemFromText,
  removeItemOrigin,
  removeShoppingItem,
  setItemChecked,
  setManualAmount,
} from './commands-shopping';
import { createStore } from './commands-stores';
import { getData, OfflineError, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const articleNamed = (name: string) => getData().articles.find((article) => article.name === name);
const itemOf = (name: string) =>
  getData().items.find((item) => item.articleId === articleNamed(name)?.id);
const need = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('fixture');
  return value;
};

describe('"Von Hand" (REQ-003)', () => {
  it('AC-009: "1 Kasten" replaces the manual amount, one set_manual_amount call, also for Nadja', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    addShoppingItemFromText('2 Kasten Bier');
    await fx.settle();
    const bier = need(itemOf('Bier'));
    fx.clearCalls();

    expect(setManualAmount(bier.id, '1 Kasten')).toEqual({ removed: false });
    expect(summarizeItem(need(itemOf('Bier'))).amount).toBe('1 Kasten');
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['setManualAmount']);
    expect(fx.calls[0]?.args).toEqual([bier.id, { qty: 1, unit: 'Kasten' }]);
    const nadjaItem = fx.nadjaData(nadja).items.find((item) => item.id === bier.id);
    expect(summarizeItem(need(nadjaItem)).amount).toBe('1 Kasten');
  });

  it('AC-010: Möhren keep the origin "Lasagne", "von Hand" becomes 1 kg', async () => {
    await fx.startEnrico();
    const moehren = need(itemOf('Möhren'));
    expect(originSummary(moehren)).toContain('von Hand: 500 g');
    setManualAmount(moehren.id, '1 kg');
    await fx.settle();
    const after = need(itemOf('Möhren'));
    expect(originSummary(after)).toContain('von Hand: 1 kg');
    expect(after.contributions.filter((c) => c.source.kind === 'recipe')).toEqual(
      moehren.contributions.filter((c) => c.source.kind === 'recipe'),
    );
  });

  it('AC-012: "viel" is refused before anything is sent', async () => {
    await fx.startEnrico();
    const moehren = need(itemOf('Möhren'));
    expect(() => setManualAmount(moehren.id, 'viel')).toThrow(AMOUNT_NOT_RECOGNIZED);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-009: an empty "Von Hand" on an item with nothing else removes it; undo brings it back', async () => {
    await fx.startEnrico();
    const paper = need(itemOf('Geschenkpapier'));
    const undo = snapshot();
    expect(setManualAmount(paper.id, '')).toEqual({ removed: true });
    expect(itemOf('Geschenkpapier')).toBeUndefined();
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', paper.id)).toBeUndefined();
    undo();
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', paper.id)).toMatchObject({
      created_at: paper.createdAt,
    });
  });

  it('AC-013: an item removed on another device: null, no error', async () => {
    await fx.startEnrico();
    expect(setManualAmount('gone', '2')).toBeNull();
  });

  it('offline: "Von Hand" needs the network', async () => {
    const engine = await fx.startEnrico();
    const milk = need(itemOf('Milch'));
    engine.setSimulatedOffline(true);
    expect(() => setManualAmount(milk.id, '3')).toThrow(OfflineError);
  });
});

describe('✕ per origin and removing (REQ-003, REQ-005)', () => {
  it('AC-010: ✕ at "Lasagne" leaves "von Hand"; undo puts the origin back', async () => {
    await fx.startEnrico();
    const moehren = need(itemOf('Möhren'));
    const lasagne = moehren.contributions.filter((c) => c.source.kind === 'recipe');
    expect(lasagne.length).toBeGreaterThan(0);
    const undo = snapshot();
    expect(
      removeItemOrigin(
        moehren.id,
        lasagne.map((c) => c.id),
      ),
    ).toEqual({ removed: false });
    expect(originSummary(need(itemOf('Möhren')))).toBe('von Hand: 500 g');
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['removeItemContributions']);
    undo();
    await fx.settle();
    expect(
      need(itemOf('Möhren'))
        .contributions.map((c) => c.id)
        .sort(),
    ).toEqual(moehren.contributions.map((c) => c.id).sort());
  });

  it('AC-011: ✕ at the only origin removes the item; undo puts it back at the same place', async () => {
    await fx.startEnrico();
    const reibe = need(
      getData().items.find(
        (item) =>
          item.contributions.length === 1 && item.contributions[0]?.source.kind === 'recipe',
      ),
    );
    const undo = snapshot();
    expect(removeItemOrigin(reibe.id, [need(reibe.contributions[0]).id])).toEqual({
      removed: true,
    });
    expect(getData().items.some((item) => item.id === reibe.id)).toBe(false);
    await fx.settle();
    undo();
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', reibe.id)).toMatchObject({
      created_at: reibe.createdAt,
    });
  });

  it('AC-020: removing "Zahnpasta" and "Rückgängig" bring it back with its created_at', async () => {
    await fx.startEnrico();
    const zahnpasta = need(itemOf('Zahnpasta'));
    const undo = snapshot();
    removeShoppingItem(zahnpasta.id);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['removeItemContributions']);
    undo();
    await fx.settle();
    // The place on the list is created_at (groupItems); pgTAP proves the order in the database.
    expect(fx.server.row(H, 'shopping_items', zahnpasta.id)).toMatchObject({
      created_at: zahnpasta.createdAt,
    });
    expect(itemOf('Zahnpasta')?.createdAt).toBe(zahnpasta.createdAt);
  });

  it('AC-041: the server refuses: the item comes back and the hint is shown', async () => {
    await fx.startEnrico();
    const milk = need(itemOf('Milch'));
    fx.server.failNext(
      'remove_item_contributions',
      new TransportError('permanent', 'invalid_value'),
    );
    removeShoppingItem(milk.id);
    await fx.settle();
    expect(itemOf('Milch')).toBeDefined();
  });
});

describe('checking on the list (REQ-006)', () => {
  it('AC-022, AC-025: a swipe checks with onList; the server marks it, Nadja sees it checked', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const milk = need(itemOf('Milch'));
    setItemChecked(milk.id, true, { onList: true });
    await fx.settle(nadja);
    expect(fx.calls.map((call) => [call.fn, call.args[3]])).toEqual([['setItemChecked', true]]);
    expect(fx.server.row(H, 'shopping_items', milk.id)).toMatchObject({
      checked: true,
      checked_on_list: true,
    });
    expect(fx.nadjaData(nadja).items.find((item) => item.id === milk.id)).toMatchObject({
      checked: true,
      checkedOnList: true,
    });
  });

  it('AC-024: offline it is checked at once and pending; with the network it reaches the server', async () => {
    const engine = await fx.startEnrico();
    const milk = need(itemOf('Milch'));
    engine.setSimulatedOffline(true);
    setItemChecked(milk.id, true, { onList: true });
    expect(itemOf('Milch')).toMatchObject({ checked: true, pendingSync: true });
    expect(await fx.storage.get('queue')).toEqual([
      expect.objectContaining({ kind: 'check', itemId: milk.id, onList: true }),
    ]);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(fx.server.row(H, 'shopping_items', milk.id)).toMatchObject({ checked_on_list: true });
  });
});

describe('exact names (REQ-009)', () => {
  it('AC-034: "2 Mozzarella (Fior di Latte)" is that article without a Zusatz', async () => {
    await fx.startEnrico();
    createArticle({ name: 'Mozzarella (Fior di Latte)' });
    await fx.settle();
    const added = addShoppingItemFromText('2 Mozzarella (Fior di Latte)');
    expect(added?.articleName).toBe('Mozzarella (Fior di Latte)');
    const item = need(itemOf('Mozzarella (Fior di Latte)'));
    expect(item.contributions.at(-1)).toMatchObject({ count: 2 });
    expect(item.contributions.at(-1)?.note).toBeUndefined();
  });
});

describe('deleting an article (REQ-014)', () => {
  it('AC-047: an article only checked on the list goes with its item', async () => {
    await fx.startEnrico();
    const added = need(addShoppingItemFromText('Drachenfrucht') ?? undefined);
    await fx.settle();
    setItemChecked(added.itemId, true);
    await fx.settle();
    const item = need(itemOf('Drachenfrucht'));
    expect(item.checked).toBe(true);
    deleteArticle(item.articleId);
    expect(itemOf('Drachenfrucht')).toBeUndefined();
    await fx.settle();
    expect(fx.server.row(H, 'shopping_items', item.id)).toBeUndefined();
    expect(fx.server.row(H, 'articles', item.articleId)).toBeUndefined();
  });
});

describe('a new store (REQ-015)', () => {
  it('AC-050: "Reihenfolge übernehmen von …" copies order and hidden areas once', async () => {
    await fx.startEnrico();
    const source = need(getData().stores[0]);
    const id = createStore('Rossmann', source.id);
    expect(getData().stores.find((store) => store.id === id)).toMatchObject({
      areaOrder: source.areaOrder,
      hiddenAreaIds: source.hiddenAreaIds,
    });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['createStore']);
    expect(fx.server.row(H, 'stores', id)).toMatchObject({
      name: 'Rossmann',
      area_order: source.areaOrder,
      hidden_area_ids: source.hiddenAreaIds,
    });
  });

  it('AC-051: without a choice "Wie die Bereiche": the areas in their order, nothing hidden', async () => {
    await fx.startEnrico();
    const id = createStore('Lidl');
    await fx.settle();
    const sorted = [...getData().areas].sort((a, b) => a.sort - b.sort).map((area) => area.id);
    expect(fx.server.row(H, 'stores', id)).toMatchObject({
      area_order: sorted,
      hidden_area_ids: [],
    });
  });
});
