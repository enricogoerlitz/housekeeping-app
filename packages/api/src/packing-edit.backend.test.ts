// Spec 0022 against the fake server: changing a Packstück of the packing list (REQ-009), "+
// Packstück" with "je Tag" (REQ-010), "+ Neue Reisetasche" in the trip window (REQ-011) and
// adopting changes of a Reisetasche (REQ-012), each one call, with the refusals.
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import {
  addPackingBagItem,
  addPackingItem,
  adoptBagChanges,
  attachNewBag,
  removePackingBagItem,
  setPacked,
  updatePackingBagItem,
  updatePackingItem,
} from './commands-packing';
import { createTrip } from './commands-trips';
import { ENRICO, NADJA } from './seed/demo';
import { getData, snapshot } from './store';

const fx = withBackend();

const bag = (name: string) => {
  const found = getData().packingBags.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`fixture: ${name}`);
  return found;
};
const mallorca = () => {
  const found = getData().trips.find((trip) => trip.note === 'Urlaub Mallorca');
  if (!found) throw new Error('fixture: Urlaub Mallorca');
  return found;
};
const listBagOf = (tripId: string, name: string) => {
  const found = getData().packingListBags.find(
    (candidate) => candidate.tripId === tripId && candidate.name === name,
  );
  if (!found) throw new Error(`fixture: list bag ${name}`);
  return found;
};
const itemOf = (listBagId: string, name: string) => {
  const found = getData().packingItems.find(
    (item) => item.listBagId === listBagId && item.name === name,
  );
  if (!found) throw new Error(`fixture: ${name}`);
  return found;
};

describe('changing a Packstück of the packing list (REQ-009)', () => {
  it('AC-028: packed "T-Shirts 7×" set to 2 je Tag is "T-Shirts 14×", still packed; the Reisetasche stays', async () => {
    const engine = await fx.startEnrico();
    const strand = listBagOf(mallorca().id, 'Strand');
    const shirts = itemOf(strand.id, 'T-Shirts');
    setPacked(shirts.id, true);
    await fx.settle(engine);
    fx.clearCalls();
    updatePackingItem(shirts.id, { name: 'T-Shirts', count: 2, perDay: true });
    expect(itemOf(strand.id, 'T-Shirts')).toMatchObject({ quantity: 14, perDay: 2, packed: true });
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.server.row(H, 'packing_items', shirts.id)).toMatchObject({
      quantity: 14,
      per_day: 2,
      packed: true,
    });
    const template = getData().packingBagItems.find(
      (item) => item.bagId === bag('Strand').id && item.name === 'T-Shirts',
    );
    expect(template).toMatchObject({ quantity: 1, perDay: true });
  });

  it('AC-029: "Badehose 3×" with "Auch in der Reisetasche ändern" changes the template, not "Sommerurlaub"', async () => {
    const engine = await fx.startEnrico();
    const sommer = createTrip({
      memberIds: [ENRICO],
      from: '2027-07-01',
      to: '2027-07-07',
      note: 'Sommerurlaub',
      bagIds: [bag('Strand').id],
    });
    await fx.settle(engine);
    const strand = listBagOf(mallorca().id, 'Strand');
    updatePackingItem(itemOf(strand.id, 'Badehose').id, {
      name: 'Badehose',
      count: 3,
      perDay: false,
      alsoInBag: true,
    });
    await fx.settle(engine);
    expect(itemOf(strand.id, 'Badehose').quantity).toBe(3);
    expect(
      getData().packingBagItems.find(
        (item) => item.bagId === bag('Strand').id && item.name === 'Badehose',
      )?.quantity,
    ).toBe(3);
    expect(itemOf(listBagOf(sommer, 'Strand').id, 'Badehose').quantity).toBe(2);
  });

  it('AC-030: an empty name is refused; a Packstück removed meanwhile gives the hint', async () => {
    const engine = await fx.startEnrico();
    const strand = listBagOf(mallorca().id, 'Strand');
    const buch = itemOf(strand.id, 'Buch');
    expect(() => updatePackingItem(buch.id, { name: ' ', perDay: false })).toThrow('Name fehlt');
    fx.server.deleteRow(H, 'packing_items', buch.id);
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    updatePackingItem(buch.id, { name: 'Roman', perDay: false });
    await fx.settle(engine);
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(getData().packingItems.some((item) => item.id === buch.id)).toBe(false);
    stop();
  });

  it('AC-030: Nadja packs meanwhile → after renaming "Sneakersocken 7×" is packed', async () => {
    const engine = await fx.startEnrico();
    const nadja = await fx.startNadja();
    const strand = listBagOf(mallorca().id, 'Strand');
    const shirts = itemOf(strand.id, 'T-Shirts');
    await fx.server
      .transport(NADJA)
      .setPackingItemsPacked(H, [{ item_id: shirts.id, packed: true, seen_pack_seq: 0 }]);
    updatePackingItem(shirts.id, { name: 'Sneakersocken', count: 1, perDay: true });
    await fx.settle(engine);
    await fx.settle(nadja);
    expect(fx.server.row(H, 'packing_items', shirts.id)).toMatchObject({
      name: 'Sneakersocken',
      quantity: 7,
      packed: true,
    });
  });
});

describe('"+ Packstück" and the Reisetasche with "je Tag" (REQ-010)', () => {
  it('AC-031: "Unterhose 1 je Tag" in "Strand" is "Unterhose · 1 je Tag"', async () => {
    await fx.startEnrico();
    const id = addPackingBagItem(bag('Strand').id, 'Unterhose 1 je Tag');
    const proviant = addPackingBagItem(bag('Strand').id, 'Proviant für 2 Tage');
    const items = getData().packingBagItems;
    expect(items.find((item) => item.id === id)).toMatchObject({
      name: 'Unterhose',
      quantity: 1,
      perDay: true,
    });
    expect(items.find((item) => item.id === proviant)).toMatchObject({
      name: 'Proviant für 2 Tage',
      quantity: undefined,
    });
  });

  it('AC-032: "2 T-Shirts pro Tag" is "T-Shirts 14×", in the Reisetasche "2 je Tag", linked', async () => {
    const engine = await fx.startEnrico();
    const strand = listBagOf(mallorca().id, 'Strand');
    const id = addPackingItem(strand.id, '2 Hemden pro Tag', { alsoInBag: true });
    await fx.settle(engine);
    const item = getData().packingItems.find((candidate) => candidate.id === id);
    expect(item).toMatchObject({ name: 'Hemden', quantity: 14, perDay: 2, fromBag: true });
    expect(fx.server.row(H, 'packing_items', id ?? '')).toMatchObject({ quantity: 14, per_day: 2 });
    expect(
      getData().packingBagItems.find((bagItem) => bagItem.id === item?.bagItemId),
    ).toMatchObject({
      name: 'Hemden',
      quantity: 2,
      perDay: true,
    });
  });
});

describe('"+ Neue Reisetasche" in the trip window (REQ-011)', () => {
  it('AC-034: "Camping" is created empty and attached in one call', async () => {
    const engine = await fx.startEnrico();
    fx.clearCalls();
    const listBagId = attachNewBag(mallorca().id, 'Camping');
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(bag('Camping')).toBeDefined();
    expect(getData().packingListBags.find((lb) => lb.id === listBagId)).toMatchObject({
      tripId: mallorca().id,
      bagId: bag('Camping').id,
      name: 'Camping',
    });
  });

  it('AC-035: "technik" attaches the existing "Technik" with its Packstücke; "Strand" is already attached', async () => {
    await fx.startEnrico();
    const bags = getData().packingBags.length;
    const listBagId = attachNewBag(mallorca().id, 'technik');
    expect(getData().packingBags).toHaveLength(bags);
    const technik = getData().packingBagItems.filter((item) => item.bagId === bag('Technik').id);
    expect(getData().packingItems.filter((item) => item.listBagId === listBagId)).toHaveLength(
      technik.length,
    );
    const before = getData().packingListBags;
    expect(() => attachNewBag(mallorca().id, 'Strand')).toThrow('Hängt schon an dieser Packliste');
    expect(getData().packingListBags).toBe(before);
  });
});

describe('adopting changes of a Reisetasche (REQ-012)', () => {
  it('AC-036: "Sonnencreme" new in "Strand" goes open to the end; undo takes it away', async () => {
    const engine = await fx.startEnrico();
    const strand = listBagOf(mallorca().id, 'Strand');
    addPackingBagItem(bag('Strand').id, 'Sonnencreme');
    await fx.settle(engine);
    const restore = snapshot();
    fx.clearCalls();
    const plan = adoptBagChanges(bag('Strand').id, mallorca().id);
    expect(plan?.insert.map((item) => item.name)).toEqual(['Sonnencreme']);
    await fx.settle(engine);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    const added = itemOf(strand.id, 'Sonnencreme');
    expect(fx.server.row(H, 'packing_items', added.id)).toMatchObject({
      packed: false,
      from_bag: true,
    });
    restore();
    await fx.settle(engine);
    expect(fx.server.row(H, 'packing_items', added.id)).toBeUndefined();
  });

  it('AC-037, AC-038: changed open ones follow, removed open ones go, packed ones stay (also packed meanwhile)', async () => {
    const engine = await fx.startEnrico();
    const strand = listBagOf(mallorca().id, 'Strand');
    const template = (name: string) => {
      const found = getData().packingBagItems.find(
        (item) => item.bagId === bag('Strand').id && item.name === name,
      );
      if (!found) throw new Error(`fixture ${name}`);
      return found;
    };
    updatePackingBagItem(template('Badehose').id, { quantity: 3 });
    updatePackingBagItem(template('Sonnenhut').id, { quantity: 2 });
    updatePackingBagItem(template('Shorts').id, { quantity: 4 });
    removePackingBagItem(template('Kartenspiel').id);
    await fx.settle(engine);
    const shorts = itemOf(strand.id, 'Shorts');
    // Nadja packs "Shorts" before Enrico confirms.
    await fx.server
      .transport(NADJA)
      .setPackingItemsPacked(H, [{ item_id: shorts.id, packed: true, seen_pack_seq: 0 }]);
    adoptBagChanges(bag('Strand').id, mallorca().id);
    await fx.settle(engine);
    const server = (name: string) => fx.server.row(H, 'packing_items', itemOf(strand.id, name).id);
    expect(server('Sonnenhut')).toMatchObject({ quantity: 2, packed: false });
    expect(server('Badehose')).toMatchObject({ quantity: 2, packed: true });
    expect(server('Shorts')).toMatchObject({ quantity: 3, packed: true });
    expect(
      getData().packingItems.some(
        (item) => item.listBagId === strand.id && item.name === 'Kartenspiel',
      ),
    ).toBe(false);
  });
});
