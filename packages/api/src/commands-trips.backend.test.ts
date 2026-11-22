// Trips (spec 0022, REQ-003 to REQ-005, REQ-015) on the diff path against the fake server: a trip
// with its people and packing list in one call, changed fields only, people added and removed,
// deleting with the packing list, and the refusals.
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { removeMember } from './commands-household';
import { setPacked } from './commands-packing';
import { createTrip, removeTrip, updateTrip } from './commands-trips';
import { ENRICO, NADJA } from './seed/demo';
import { getData, snapshot } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const sommer = { from: '2027-01-01', to: '2027-01-07', note: 'Sommer' };

const bagId = (name: string) => {
  const found = getData().packingBags.find((bag) => bag.name === name);
  if (!found) throw new Error(`fixture: ${name}`);
  return found.id;
};
const tripOf = (id: string) => getData().trips.find((trip) => trip.id === id);
const peopleOf = (id: string) => tripOf(id)?.members.map((member) => member.memberId);
const listOf = (tripId: string) => {
  const listBags = getData().packingListBags.filter((bag) => bag.tripId === tripId);
  const items = getData().packingItems.filter((item) =>
    listBags.some((bag) => bag.id === item.listBagId),
  );
  return { listBags, items };
};

describe('creating a trip (REQ-003)', () => {
  it('AC-008: trip, both people and the packing list in one call; it reaches the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createTrip({
      memberIds: [ENRICO, NADJA],
      ...sommer,
      bagIds: [bagId('Strand'), bagId('Kulturbeutel')],
    });
    const { listBags, items } = listOf(id);
    expect(listBags.map((bag) => [bag.name, bag.memberId])).toEqual([
      ['Strand', undefined],
      ['Kulturbeutel', NADJA],
    ]);
    expect(items).toHaveLength(21);
    expect(items.find((item) => item.name === 'T-Shirts')?.quantity).toBe(7);
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    const ops = (fx.calls[0]?.args[1] ?? []) as { kind: string; table: string }[];
    expect(ops.slice(0, 3).map((op) => `${op.kind} ${op.table}`)).toEqual([
      'insert trips',
      'insert trip_members',
      'insert trip_members',
    ]);
    expect(fx.server.rows(H, 'trip_members').filter((row) => row.trip_id === id)).toHaveLength(2);
    expect(fx.nadjaData(nadja).trips.find((trip) => trip.id === id)?.note).toBe('Sommer');
  });

  it('AC-009: a trip of some people is one trip with one packing list', async () => {
    await fx.startEnrico();
    const id = createTrip({
      memberIds: [ENRICO],
      ...sommer,
      bagIds: [bagId('Strand'), bagId('Kulturbeutel')],
    });
    expect(peopleOf(id)).toEqual([ENRICO]);
    expect(listOf(id).listBags.map((bag) => bag.name)).toEqual(['Strand', 'Kulturbeutel']);
  });

  it('AC-010: nobody chosen or "Bis" before "Von" writes nothing', async () => {
    await fx.startEnrico();
    const before = getData().trips;
    expect(() => createTrip({ memberIds: [], ...sommer })).toThrow('Wähle, wer unterwegs ist.');
    expect(() => createTrip({ memberIds: [ENRICO], from: '2027-01-04', to: '2027-01-01' })).toThrow(
      '„Bis“ liegt vor „Von“.',
    );
    expect(getData().trips).toBe(before);
    expect(fx.calls).toEqual([]);
  });

  it('AC-010 (Fehler): refused by the server: neither trip nor packing list, and the hint', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const before = getData().packingItems.length;
    fx.server.failNext('apply_changes', new TransportError('permanent', '23514', 400));
    const id = createTrip({ memberIds: [ENRICO, NADJA], ...sommer, bagIds: [bagId('Strand')] });
    await fx.settle();
    expect(tripOf(id)).toBeUndefined();
    expect(getData().packingItems).toHaveLength(before);
    expect(fx.server.row(H, 'trips', id)).toBeUndefined();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });
});

describe('changing a trip (REQ-004)', () => {
  it('AC-011: "Bis" earlier sends only to_on; open "je Tag" 5× at once, packed ones stay 7×', async () => {
    const engine = await fx.startEnrico();
    const id = createTrip({
      memberIds: [ENRICO, NADJA],
      ...sommer,
      bagIds: [bagId('Wintersport')],
    });
    await fx.settle(engine);
    const socks = listOf(id).items.find((item) => item.name === 'Socken');
    if (!socks) throw new Error('fixture');
    setPacked(socks.id, true);
    await fx.settle(engine);
    fx.clearCalls();
    updateTrip(id, { to: '2027-01-05' });
    const quantity = (name: string) =>
      listOf(id).items.find((item) => item.name === name)?.quantity;
    expect([quantity('Skiunterwäsche'), quantity('Socken'), quantity('Handschuhe')]).toEqual([
      5, 7, 2,
    ]);
    await fx.settle(engine);
    expect(fx.calls).toEqual([
      {
        fn: 'applyChanges',
        args: [H, [{ kind: 'patch', table: 'trips', id, changes: { to_on: '2027-01-05' } }]],
      },
    ]);
    expect([quantity('Skiunterwäsche'), quantity('Socken')]).toEqual([5, 7]);
  });

  it('AC-012: removing Nadja keeps the packing list with everything packed', async () => {
    const engine = await fx.startEnrico();
    const id = createTrip({
      memberIds: [ENRICO, NADJA],
      ...sommer,
      bagIds: [bagId('Strand'), bagId('Kulturbeutel')],
    });
    await fx.settle(engine);
    for (const item of listOf(id).items.slice(0, 5)) setPacked(item.id, true);
    await fx.settle(engine);
    fx.clearCalls();
    updateTrip(id, { memberIds: [ENRICO] });
    await fx.settle(engine);
    const ops = (fx.calls[0]?.args[1] ?? []) as { kind: string; table: string }[];
    expect(ops.map((op) => `${op.kind} ${op.table}`)).toEqual(['delete trip_members']);
    expect(peopleOf(id)).toEqual([ENRICO]);
    expect(listOf(id).items).toHaveLength(21);
    expect(listOf(id).items.filter((item) => item.packed)).toHaveLength(5);
    expect(listOf(id).listBags.find((bag) => bag.name === 'Kulturbeutel')?.memberId).toBe(NADJA);

    updateTrip(id, { memberIds: [NADJA, ENRICO] });
    await fx.settle(engine);
    expect(peopleOf(id)?.sort()).toEqual([ENRICO, NADJA].sort());
  });

  it('AC-014: only the changed note is sent, so Nadja\'s new "Bis" stays', async () => {
    const engine = await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createTrip({ memberIds: [ENRICO, NADJA], ...sommer });
    await fx.settle(engine);
    await fx.settle(nadja);
    const row = fx.server.row(H, 'trips', id);
    if (!row) throw new Error('fixture');
    fx.server.insertRows(H, { trips: [{ ...row, to_on: '2027-01-06' }] });
    updateTrip(id, { note: 'Mallorca mit Oma' });
    await fx.settle(engine);
    expect(fx.server.row(H, 'trips', id)).toMatchObject({
      note: 'Mallorca mit Oma',
      to_on: '2027-01-06',
    });
  });

  it('AC-010: the last person cannot be removed; an unknown trip is refused', async () => {
    await fx.startEnrico();
    const id = createTrip({ memberIds: [ENRICO], ...sommer });
    expect(() => updateTrip(id, { memberIds: [] })).toThrow('Wähle, wer unterwegs ist.');
    expect(() => updateTrip(id, { from: '2027-01-09' })).toThrow('„Bis“ liegt vor „Von“.');
    expect(() => updateTrip('gone', { note: 'x' })).toThrow('Diese Reise gibt es nicht mehr.');
  });
});

describe('deleting a trip (REQ-005)', () => {
  it('AC-016: the trip goes with its packing list as one delete; the Reisetaschen stay', async () => {
    const engine = await fx.startEnrico();
    const bags = getData().packingBags.length;
    const id = createTrip({ memberIds: [ENRICO], ...sommer, bagIds: [bagId('Strand')] });
    await fx.settle(engine);
    fx.clearCalls();
    removeTrip(id);
    expect(tripOf(id)).toBeUndefined();
    expect(listOf(id).items).toEqual([]);
    await fx.settle(engine);
    expect(fx.calls[0]?.args[1]).toEqual([{ kind: 'delete', table: 'trips', id }]);
    expect(fx.server.rows(H, 'trip_members').filter((row) => row.trip_id === id)).toEqual([]);
    expect(fx.server.rows(H, 'packing_list_bags').filter((row) => row.trip_id === id)).toEqual([]);
    expect(getData().packingBags).toHaveLength(bags);
  });

  it('AC-017: "Rückgängig" brings the trip with its people back', async () => {
    const engine = await fx.startEnrico();
    const id = createTrip({ memberIds: [ENRICO, NADJA], ...sommer });
    await fx.settle(engine);
    const restore = snapshot();
    removeTrip(id);
    await fx.settle(engine);
    restore();
    await fx.settle(engine);
    expect(fx.server.row(H, 'trips', id)).toBeDefined();
    expect(fx.server.rows(H, 'trip_members').filter((row) => row.trip_id === id)).toHaveLength(2);
    expect(peopleOf(id)?.sort()).toEqual([ENRICO, NADJA].sort());
  });
});

describe('somebody leaves the household (AC-044)', () => {
  it('AC-044: her own trip goes with its list; the shared one stays a trip of Enrico', async () => {
    const engine = await fx.startEnrico();
    const shared = createTrip({ memberIds: [ENRICO, NADJA], ...sommer, bagIds: [bagId('Strand')] });
    const yoga = createTrip({
      memberIds: [NADJA],
      from: '2027-02-12',
      to: '2027-02-13',
      note: 'Yoga-Wochenende',
      bagIds: [bagId('Kulturbeutel')],
    });
    await fx.settle(engine);
    await removeMember(NADJA);
    await fx.settle(engine);
    expect(peopleOf(shared)).toEqual([ENRICO]);
    expect(listOf(shared).items).toHaveLength(12);
    expect(tripOf(yoga)).toBeUndefined();
    expect(listOf(yoga).items).toEqual([]);
  });
});
