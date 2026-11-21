// Stores and areas (spec 0007, REQ-008 to REQ-010): each command is one change to the server —
// apply_changes, or merge_areas for moving any number of articles.
import { describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, withBackend } from './backend-test-helpers';
import { setOffline } from './commands-household';
import {
  addAreaToStore,
  createArea,
  createStore,
  deleteArea,
  deleteStore,
  fullAreaOrder,
  mergeAreas,
  moveArea,
  renameArea,
  renameStore,
  setDefaultStore,
  setStoreAreaHidden,
} from './commands-stores';
import { getData, OfflineError, snapshot } from './store';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const area = (name: string) => {
  const found = getData().areas.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`area ${name} missing`);
  return found;
};
const store = (id: string) => {
  const found = getData().stores.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`store ${id} missing`);
  return found;
};
const orderNames = (ids: string[]) =>
  ids.map((id) => getData().areas.find((candidate) => candidate.id === id)?.name);

describe('stores', () => {
  it('AC-043: a new store gets every area in the order without store, none hidden', async () => {
    await fx.startEnrico();
    const id = createStore('dm');
    await fx.settle();
    const sorted = [...getData().areas].sort((a, b) => a.sort - b.sort).map((entry) => entry.id);
    expect(store(id)).toMatchObject({ name: 'dm', areaOrder: sorted, hiddenAreaIds: [] });
    expect(() => createStore('  ')).toThrow('Name fehlt');
  });

  it('AC-044: renaming and "Als Standard" are patches; Standard moves to the new store', async () => {
    await fx.startEnrico();
    setDefaultStore('store-rewe');
    renameStore('store-dm', ' Aldi Nordstadt ');
    setDefaultStore('store-dm');
    await fx.settle();
    const ops = fx.calls.flatMap((call) => call.args[1] as ChangeOp[]);
    expect(ops).toContainEqual({
      kind: 'patch',
      table: 'stores',
      id: 'store-dm',
      changes: { name: 'Aldi Nordstadt' },
    });
    expect(ops.at(-1)).toEqual({
      kind: 'patch',
      table: 'households',
      id: H,
      changes: { default_store_id: 'store-dm' },
    });
    expect(getData().household.defaultStoreId).toBe('store-dm');
    expect(() => renameStore('store-dm', '')).toThrow('Name fehlt');
    expect(() => renameStore('store-dm', 'x'.repeat(81))).toThrow('Höchstens 80 Zeichen');
  });

  it('AC-045: deleting the default store leaves the household without one', async () => {
    await fx.startEnrico();
    setDefaultStore('store-rewe');
    await fx.settle();
    fx.clearCalls();
    deleteStore('store-rewe');
    expect(getData().household.defaultStoreId).toBeUndefined();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.server.row(H, 'stores', 'store-rewe')).toBeUndefined();
    expect(getData().stores.some((candidate) => candidate.id === 'store-rewe')).toBe(false);
    expect(getData().household.defaultStoreId).toBeUndefined();
  });
});

describe('walking order of a store', () => {
  it('AC-047: hiding and showing again keeps the place in the order', async () => {
    await fx.startEnrico();
    const before = fullAreaOrder(store('store-rewe'));
    const getraenke = area('Getränke').id;
    setStoreAreaHidden('store-rewe', getraenke, true);
    setStoreAreaHidden('store-rewe', getraenke, false);
    await fx.settle();
    expect(fullAreaOrder(store('store-rewe'))).toEqual(before);
    expect(store('store-rewe').hiddenAreaIds).not.toContain(getraenke);
  });

  it('AC-048: "+ Bereich hinzufügen" with a new name creates the area last, in one change', async () => {
    await fx.startEnrico();
    const id = addAreaToStore('store-rewe', { name: 'Backzutaten' });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0).map((op) => [op.kind, 'table' in op ? op.table : ''])).toEqual([
      ['insert', 'areas'],
      ['patch', 'stores'],
    ]);
    expect(fullAreaOrder(store('store-rewe')).at(-1)).toBe(id);
    expect(fullAreaOrder(store('store-dm')).at(-1)).toBe(id);
    expect(fx.server.row(H, 'areas', id)).toMatchObject({ name: 'Backzutaten' });
  });

  it('AC-049: "+ Bereich hinzufügen" with a hidden area shows it again, no new area', async () => {
    await fx.startEnrico();
    const tier = area('Tierbedarf').id;
    expect(store('store-rewe').hiddenAreaIds).toContain(tier);
    const count = getData().areas.length;
    expect(addAreaToStore('store-rewe', { areaId: tier })).toBe(tier);
    await fx.settle();
    expect(store('store-rewe').hiddenAreaIds).not.toContain(tier);
    expect(getData().areas).toHaveLength(count);
  });
});

describe('areas', () => {
  it('AC-052: a new area comes last in the order without store; doubles are refused', async () => {
    await fx.startEnrico();
    const id = createArea('Backzutaten');
    await fx.settle();
    const sorted = [...getData().areas].sort((a, b) => a.sort - b.sort);
    expect(sorted.at(-1)?.id).toBe(id);
    expect(() => renameArea(id, 'getränke')).toThrow('Gibt es schon: Getränke');
    expect(() => renameArea(id, ' ')).toThrow('Name fehlt');
  });

  it('AC-052: renaming keeps the articles in the area', async () => {
    await fx.startEnrico();
    const kuehl = area('Kühlregal & Molkerei');
    const articles = getData().articles.filter((article) => article.areaId === kuehl.id).length;
    renameArea(kuehl.id, 'Kühlregal');
    await fx.settle();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'areas', id: kuehl.id, changes: { name: 'Kühlregal' } },
    ]);
    expect(getData().articles.filter((article) => article.areaId === kuehl.id)).toHaveLength(
      articles,
    );
  });

  it('AC-053: moving in the order without store patches the areas only, the stores stay', async () => {
    await fx.startEnrico();
    const rewe = fullAreaOrder(store('store-rewe'));
    const getraenke = area('Getränke');
    moveArea(getraenke.id, 0);
    await fx.settle();
    expect(opsOf(0).every((op) => op.kind === 'patch' && op.table === 'areas')).toBe(true);
    expect([...getData().areas].sort((a, b) => a.sort - b.sort)[0]?.id).toBe(getraenke.id);
    expect(fullAreaOrder(store('store-rewe'))).toEqual(rewe);
  });

  it('AC-054: merging is one RPC; the articles move and the source leaves every order', async () => {
    await fx.startEnrico();
    const source = area('Drogerie & Hygiene');
    const target = area('Haushalt & Reinigung');
    const moving = getData().articles.filter((article) => article.areaId === source.id).length;
    const targetPlace = fullAreaOrder(store('store-dm')).indexOf(target.id);
    expect(mergeAreas(source.id, target.id)).toBe(moving);
    expect(getData().areas.some((candidate) => candidate.id === source.id)).toBe(false);
    expect(getData().articles.some((article) => article.areaId === source.id)).toBe(false);
    expect(store('store-dm').areaOrder).not.toContain(source.id);
    await fx.settle();
    expect(fx.calls).toEqual([{ fn: 'mergeAreas', args: [source.id, target.id] }]);
    expect(fx.server.row(H, 'areas', source.id)).toBeUndefined();
    expect(orderNames(store('store-dm').areaOrder)).not.toContain('Drogerie & Hygiene');
    expect(fullAreaOrder(store('store-dm')).indexOf(target.id)).toBe(targetPlace - 1);
    expect(() => mergeAreas(target.id, target.id)).toThrow();
  });

  it('AC-055: deleting an area with articles: one change, the area leaves every order', async () => {
    await fx.startEnrico();
    const tier = area('Tierbedarf');
    deleteArea(tier.id);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    const ops = opsOf(0);
    expect(ops.filter((op) => op.kind === 'patch').map((op) => 'table' in op && op.table)).toEqual([
      'stores',
      'stores',
    ]);
    expect(ops.at(-1)).toEqual({ kind: 'delete', table: 'areas', id: tier.id });
    expect(ops.some((op) => 'table' in op && op.table === 'articles')).toBe(false);
    expect(store('store-rewe').hiddenAreaIds).not.toContain(tier.id);
    for (const article of fx.server.rows(H, 'articles')) {
      expect(article.area_id).not.toBe(tier.id);
    }
  });

  it('AC-056: an empty area is deleted at once; "Rückgängig" brings it back with its place', async () => {
    await fx.startEnrico();
    const id = addAreaToStore('store-rewe', { name: 'Deko' });
    await fx.settle();
    const order = fullAreaOrder(store('store-rewe'));
    fx.clearCalls();
    const restore = snapshot();
    deleteArea(id);
    await fx.settle();
    expect(fx.server.row(H, 'areas', id)).toBeUndefined();
    restore();
    await fx.settle();
    expect(fx.server.row(H, 'areas', id)).toMatchObject({ name: 'Deko' });
    expect(fullAreaOrder(store('store-rewe'))).toEqual(order);
  });

  it('a refused merge jumps back; offline nothing is sent', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const source = area('Tierbedarf');
    const target = area('Sonstiges');
    fx.server.failNext('merge_areas', new TransportError('permanent', 'area_not_found', 500));
    mergeAreas(source.id, target.id);
    await fx.settle();
    expect(area('Tierbedarf').id).toBe(source.id);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
    setOffline(true);
    expect(() => renameArea(source.id, 'Tiere')).toThrow(OfflineError);
    expect(() => deleteStore('store-dm')).toThrow(OfflineError);
  });
});
