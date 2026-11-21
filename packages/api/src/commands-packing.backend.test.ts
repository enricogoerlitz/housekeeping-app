// Commands for Reisetaschen and Packlisten (spec 0012, task 6) against the fake server: each one
// is one call (apply_changes, or set_packing_items_packed through the store queue); offline only
// packing works (ADR-0013).
import { bagItemsOf, orderedBags, type Id } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { onWriteRejected } from './backend';
import { H, withBackend } from './backend-test-helpers';
import {
  addBagToPackingList,
  addPackingBagItem,
  addPackingItem,
  createPackingBag,
  deletePackingBag,
  duplicatePackingBag,
  movePackingBagItem,
  packAll,
  removeBagFromPackingList,
  removePackingBagItem,
  removePackingItem,
  renamePackingBag,
  resetPackingList,
  setPacked,
  setPackingBagMember,
  updatePackingBagItem,
} from './commands-packing';
import { removeAbsences } from './commands-household';
import { ENRICO, NADJA } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const bag = (name: string) => {
  const found = getData().packingBags.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`fixture: ${name}`);
  return found;
};
const mallorca = () => {
  const found = getData().absences.find((absence) => absence.note === 'Urlaub Mallorca');
  if (!found) throw new Error('fixture: Urlaub Mallorca');
  return found;
};
const listBag = (name: string) => {
  const found = getData().packingListBags.find(
    (candidate) => candidate.absenceId === mallorca().id && candidate.name === name,
  );
  if (!found) throw new Error(`fixture: list bag ${name}`);
  return found;
};
const itemsOf = (listBagId: Id) =>
  getData().packingItems.filter((item) => item.listBagId === listBagId);
const writes = () => fx.calls.map((call) => call.fn);

describe('Reisetaschen (REQ-001)', () => {
  it('AC-003: a new bag and typed lines, one call each; an empty line sends nothing', async () => {
    await fx.startEnrico();
    const id = createPackingBag({ name: '  Camping ' });
    const badehose = addPackingBagItem(id, '2 Badehose');
    const brille = addPackingBagItem(id, 'Sonnenbrille');
    expect(addPackingBagItem(id, '   ')).toBeUndefined();
    await fx.settle();
    expect(writes()).toEqual(['applyChanges', 'applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'packing_bags', id)).toMatchObject({ name: 'Camping', sort: 4 });
    expect(bagItemsOf(id, getData().packingBagItems)).toEqual([
      expect.objectContaining({ id: badehose, name: 'Badehose', quantity: 2, perDay: false }),
      expect.objectContaining({ id: brille, name: 'Sonnenbrille', quantity: undefined }),
    ]);
  });

  it('AC-007: "strand" next to "Strand" and an empty name are refused before sending', async () => {
    await fx.startEnrico();
    expect(() => createPackingBag({ name: 'strand' })).toThrow('Gibt es schon: Strand');
    expect(() => createPackingBag({ name: '  ' })).toThrow('Name fehlt');
    expect(() => renamePackingBag(bag('Technik').id, 'STRAND')).toThrow('Gibt es schon: Strand');
    await fx.settle();
    expect(writes()).toEqual([]);
  });

  it('AC-007: the same name created on another device meanwhile → "Gibt es schon: Camping"', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    await fx.server
      .transport(NADJA)
      .applyChanges(H, [
        { kind: 'insert', table: 'packing_bags', row: { id: 'bag-nadja', name: 'camping' } },
      ]);
    const id = createPackingBag({ name: 'Camping' });
    await fx.settle();
    expect(messages).toEqual(['Gibt es schon: Camping']);
    expect(getData().packingBags.some((candidate) => candidate.id === id)).toBe(false);
    stop();
  });

  it('AC-004 / AC-006: "je Tag" and the order reach Nadja', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const strand = bag('Strand');
    const items = bagItemsOf(strand.id, getData().packingBagItems);
    const shorts = items.find((item) => item.name === 'Shorts');
    const last = items[items.length - 1];
    if (!shorts || !last) throw new Error('fixture');
    updatePackingBagItem(shorts.id, { perDay: true, quantity: 1 });
    movePackingBagItem(last.id, 0);
    await fx.settle(nadja);
    expect(writes()).toEqual(['applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'packing_bag_items', shorts.id)).toMatchObject({
      per_day: true,
      quantity: 1,
    });
    const onNadja = bagItemsOf(strand.id, fx.nadjaData(nadja).packingBagItems);
    expect(onNadja[0]?.id).toBe(last.id);
    expect(onNadja.map((item) => item.id)).toEqual(
      bagItemsOf(strand.id, getData().packingBagItems).map((item) => item.id),
    );
  });

  it('AC-008: duplicating gives "Strand (Kopie)" with the same Packstücke in one call', async () => {
    await fx.startEnrico();
    const id = duplicatePackingBag(bag('Strand').id);
    await fx.settle();
    expect(writes()).toEqual(['applyChanges']);
    expect(getData().packingBags.find((candidate) => candidate.id === id)?.name).toBe(
      'Strand (Kopie)',
    );
    const strip = (items: ReturnType<typeof bagItemsOf>) =>
      items.map((item) => [item.name, item.quantity, item.perDay]);
    expect(strip(bagItemsOf(id, getData().packingBagItems))).toEqual(
      strip(bagItemsOf(bag('Strand').id, getData().packingBagItems)),
    );
    expect(fx.server.rows(H, 'packing_bag_items').filter((row) => row.bag_id === id)).toHaveLength(
      12,
    );
  });

  it('AC-009: deleting sends one delete, the packing list stays; undo links it again', async () => {
    await fx.startEnrico();
    const strand = bag('Strand');
    const section = listBag('Strand');
    const packedBefore = itemsOf(section.id).filter((item) => item.packed).length;
    const restore = snapshot();
    deletePackingBag(strand.id);
    expect(getData().packingBags.some((candidate) => candidate.id === strand.id)).toBe(false);
    expect(listBag('Strand').bagId).toBeUndefined();
    await fx.settle();
    expect(fx.calls[0]?.args[1]).toEqual([
      { kind: 'delete', table: 'packing_bags', id: strand.id },
    ]);
    expect(itemsOf(section.id).filter((item) => item.packed)).toHaveLength(packedBefore);
    expect(fx.server.row(H, 'packing_list_bags', section.id)).toMatchObject({ bag_id: null });

    restore();
    await fx.settle();
    expect(writes()).toEqual(['applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'packing_bags', strand.id)).toMatchObject({ name: 'Strand' });
    expect(
      fx.server.rows(H, 'packing_bag_items').filter((r) => r.bag_id === strand.id),
    ).toHaveLength(12);
    expect(fx.server.row(H, 'packing_list_bags', section.id)).toMatchObject({
      bag_id: strand.id,
    });
    expect(listBag('Strand').bagId).toBe(strand.id);
  });

  it('"für" a member and removing a Packstück of a bag', async () => {
    await fx.startEnrico();
    const technik = bag('Technik');
    setPackingBagMember(technik.id, ENRICO);
    const first = bagItemsOf(technik.id, getData().packingBagItems)[0];
    if (!first) throw new Error('fixture');
    removePackingBagItem(first.id);
    await fx.settle();
    expect(fx.server.row(H, 'packing_bags', technik.id)).toMatchObject({ member_id: ENRICO });
    expect(fx.server.row(H, 'packing_bag_items', first.id)).toBeUndefined();
  });
});

describe('Packliste ergänzen und kürzen (REQ-007)', () => {
  it('AC-031 / AC-032: a Packstück at the end, with and without the template', async () => {
    await fx.startEnrico();
    const section = listBag('Strand');
    const template = bagItemsOf(bag('Strand').id, getData().packingBagItems).length;
    const schnorchel = addPackingItem(section.id, 'Schnorchel');
    const flossen = addPackingItem(section.id, '2 Flossen', { alsoInBag: true });
    await fx.settle();
    expect(writes()).toEqual(['applyChanges', 'applyChanges']);
    const items = [...itemsOf(section.id)].sort((a, b) => a.sort - b.sort);
    expect(items.slice(-2).map((item) => [item.id, item.packed])).toEqual([
      [schnorchel, false],
      [flossen, false],
    ]);
    const templateItems = bagItemsOf(bag('Strand').id, getData().packingBagItems);
    expect(templateItems).toHaveLength(template + 1);
    expect(templateItems[templateItems.length - 1]).toMatchObject({ name: 'Flossen', quantity: 2 });
  });

  it('AC-033: adding "Wintersport" computes "Socken · 1 je Tag" as 7×', async () => {
    await fx.startEnrico();
    const id = addBagToPackingList(mallorca().id, bag('Wintersport').id);
    await fx.settle();
    expect(writes()).toEqual(['applyChanges']);
    expect(itemsOf(id)).toHaveLength(18);
    expect(itemsOf(id).find((item) => item.name === 'Socken')).toMatchObject({
      quantity: 7,
      perDay: 1,
      packed: false,
    });
    expect(fx.server.rows(H, 'packing_items').find((row) => row.name === 'Socken')).toMatchObject({
      quantity: 7,
    });
  });

  it('AC-034: removing a bag from the packing list and undo brings back its packed state', async () => {
    await fx.startEnrico();
    const section = listBag('Kulturbeutel');
    const before = itemsOf(section.id);
    const packed = before.filter((item) => item.packed);
    expect(packed.length).toBe(2);
    const restore = snapshot();
    removeBagFromPackingList(section.id);
    expect(itemsOf(section.id)).toEqual([]);
    await fx.settle();
    expect(fx.calls[0]?.args[1]).toEqual([
      { kind: 'delete', table: 'packing_list_bags', id: section.id },
    ]);
    expect(getData().packingBags.some((candidate) => candidate.name === 'Kulturbeutel')).toBe(true);

    restore();
    await fx.settle();
    expect(writes()).toEqual(['applyChanges', 'applyChanges']);
    expect(itemsOf(section.id)).toHaveLength(before.length);
    for (const item of packed) {
      expect(fx.server.row(H, 'packing_items', item.id)).toMatchObject({
        packed: true,
        packed_by: item.packedBy,
        pack_seq: item.packSeq,
      });
    }
  });

  it('AC-035: removing a Packstück and undo', async () => {
    await fx.startEnrico();
    const item = itemsOf(listBag('Strand').id).find((candidate) => candidate.packed);
    if (!item) throw new Error('fixture');
    const restore = snapshot();
    removePackingItem(item.id);
    expect(getData().packingItems.some((candidate) => candidate.id === item.id)).toBe(false);
    await fx.settle();
    expect(fx.server.row(H, 'packing_items', item.id)).toBeUndefined();
    restore();
    await fx.settle();
    expect(writes()).toEqual(['applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'packing_items', item.id)).toMatchObject({ packed: true });
    expect(getData().packingItems.find((candidate) => candidate.id === item.id)).toMatchObject({
      packed: true,
    });
  });
});

describe('Packen (REQ-004 to REQ-006)', () => {
  it('AC-020: packing one Packstück goes through the store queue', async () => {
    await fx.startEnrico();
    const item = itemsOf(listBag('Strand').id).find((candidate) => !candidate.packed);
    if (!item) throw new Error('fixture');
    setPacked(item.id, true);
    expect(getData().packingItems.find((candidate) => candidate.id === item.id)?.packed).toBe(true);
    await fx.settle();
    expect(fx.calls).toEqual([
      {
        fn: 'setPackingItemsPacked',
        args: [H, [{ item_id: item.id, packed: true, seen_pack_seq: 0 }]],
      },
    ]);
  });

  it('AC-026 / AC-027: "Alles einpacken" offline, then undo, leaves the packed ones packed', async () => {
    const engine = await fx.startEnrico();
    const section = listBag('Kulturbeutel');
    const open = itemsOf(section.id).filter((item) => !item.packed);
    expect(open).toHaveLength(7);
    engine.setSimulatedOffline(true);
    const undo = packAll(section.id);
    expect(itemsOf(section.id).every((item) => item.packed)).toBe(true);
    undo();
    expect(itemsOf(section.id).filter((item) => item.packed)).toHaveLength(2);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(writes()).toEqual([]);
  });

  it('AC-026: online, the undo after the run was sent unpacks exactly the seven', async () => {
    const engine = await fx.startEnrico();
    const nadja = await fx.startNadja();
    const section = listBag('Kulturbeutel');
    const undo = packAll(section.id);
    await fx.settle(engine);
    expect(fx.calls).toHaveLength(1);
    expect((fx.calls[0]?.args[1] as unknown[]).length).toBe(7);
    expect(
      fx.server
        .rows(H, 'packing_items')
        .filter((row) => row.list_bag_id === section.id && row.packed),
    ).toHaveLength(9);
    undo();
    await fx.settle(engine, nadja);
    expect(fx.calls).toHaveLength(2);
    expect(
      fx.server
        .rows(H, 'packing_items')
        .filter((row) => row.list_bag_id === section.id && row.packed),
    ).toHaveLength(2);
    expect(
      fx
        .nadjaData(nadja)
        .packingItems.filter((item) => item.listBagId === section.id && item.packed),
    ).toHaveLength(2);
  });

  it('AC-028 / AC-030: resetting offline in one call; packed again meanwhile stays packed', async () => {
    const engine = await fx.startEnrico();
    const packed = getData().packingItems.filter((item) => item.packed);
    const [again] = packed;
    if (!again) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    expect(resetPackingList([mallorca().id])).toBe(packed.length);
    expect(getData().packingItems.some((item) => item.packed)).toBe(false);
    const nadja = fx.server.transport(NADJA);
    await nadja.setPackingItemsPacked(H, [
      { item_id: again.id, packed: false, seen_pack_seq: again.packSeq },
    ]);
    await nadja.setPackingItemsPacked(H, [
      { item_id: again.id, packed: true, seen_pack_seq: again.packSeq + 1 },
    ]);
    engine.setSimulatedOffline(false);
    await fx.settle(engine);
    expect(writes()).toEqual(['setPackingItemsPacked']);
    expect(
      fx.server
        .rows(H, 'packing_items')
        .filter((row) => row.packed)
        .map((row) => row.id),
    ).toEqual([again.id]);
    expect(
      getData()
        .packingItems.filter((item) => item.packed)
        .map((item) => item.id),
    ).toEqual([again.id]);
  });

  it('AC-036: offline every other command throws OfflineError and sends nothing', async () => {
    const engine = await fx.startEnrico();
    const section = listBag('Strand');
    const item = itemsOf(section.id)[0];
    const bagItem = bagItemsOf(bag('Strand').id, getData().packingBagItems)[0];
    if (!item || !bagItem) throw new Error('fixture');
    engine.setSimulatedOffline(true);
    const online: (() => unknown)[] = [
      () => createPackingBag({ name: 'Camping' }),
      () => renamePackingBag(bag('Strand').id, 'Meer'),
      () => setPackingBagMember(bag('Strand').id, NADJA),
      () => duplicatePackingBag(bag('Strand').id),
      () => deletePackingBag(bag('Strand').id),
      () => addPackingBagItem(bag('Strand').id, 'Schnorchel'),
      () => updatePackingBagItem(bagItem.id, { name: 'Neu' }),
      () => movePackingBagItem(bagItem.id, 3),
      () => removePackingBagItem(bagItem.id),
      () => addBagToPackingList(mallorca().id, bag('Technik').id),
      () => removeBagFromPackingList(section.id),
      () => addPackingItem(section.id, 'Schnorchel'),
      () => removePackingItem(item.id),
      () => removeAbsences([mallorca().id]),
    ];
    for (const command of online) expect(command).toThrow(OfflineError);
    setPacked(item.id, !item.packed);
    packAll(section.id)();
    resetPackingList([mallorca().id]);
    await fx.settle(engine);
    expect(writes()).toEqual([]);
  });

  it('a refused packing call (server error) leaves the state as the server has it', async () => {
    await fx.startEnrico();
    const item = itemsOf(listBag('Strand').id).find((candidate) => !candidate.packed);
    if (!item) throw new Error('fixture');
    fx.server.failNext(
      'set_packing_items_packed',
      new TransportError('permanent', 'invalid_change', 400),
    );
    setPacked(item.id, true);
    await fx.settle();
    expect(fx.server.row(H, 'packing_items', item.id)).toMatchObject({ packed: false });
    expect(getData().packingItems.find((candidate) => candidate.id === item.id)?.packed).toBe(
      false,
    );
  });
});

describe('Abwesenheit löschen (REQ-008)', () => {
  it('AC-038: removing "Urlaub Mallorca" sends one delete; the packing list goes at once, bags stay', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const absenceId = mallorca().id;
    const bags = orderedBags(getData().packingBags).map((candidate) => candidate.id);
    removeAbsences([absenceId]);
    expect(getData().packingListBags.some((lb) => lb.absenceId === absenceId)).toBe(false);
    expect(getData().packingItems).toEqual([]);
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      { fn: 'applyChanges', args: [H, [{ kind: 'delete', table: 'absences', id: absenceId }]] },
    ]);
    expect(fx.nadjaData(nadja).packingItems).toEqual([]);
    expect(fx.nadjaData(nadja).packingListBags).toEqual([]);
    expect(orderedBags(getData().packingBags).map((candidate) => candidate.id)).toEqual(bags);
  });
});
