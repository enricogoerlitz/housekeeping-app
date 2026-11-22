import { describe, expect, it } from 'vitest';

import {
  adoptBagDialog,
  bagDeviationHint,
  bagDeviations,
  bagItemLabel,
  parsePackingLine,
  planAddPackingItem,
  planAdoptBag,
  planEditPackingItem,
} from './packing';
import { enrico, nadja, trip } from './test-fixtures';
import { tripStripes } from './trips';
import type { PackingBag, PackingBagItem, PackingItem, PackingListBag } from './types';

describe('"n je Tag" (REQ-010, AC-033)', () => {
  it.each([
    ['Unterhose 1 je Tag', { name: 'Unterhose', quantity: 1, perDay: true }],
    ['Unterhose 1 pro Tag', { name: 'Unterhose', quantity: 1, perDay: true }],
    ['Unterhose 1/Tag', { name: 'Unterhose', quantity: 1, perDay: true }],
    ['Socken 2 / tag', { name: 'Socken', quantity: 2, perDay: true }],
    ['Socken 2x je Tag', { name: 'Socken', quantity: 2, perDay: true }],
    ['2 T-Shirts pro Tag', { name: 'T-Shirts', quantity: 2, perDay: true }],
    ['Kontaktlinsen je Tag', { name: 'Kontaktlinsen', quantity: 1, perDay: true }],
  ])('AC-033: „%s“ is recognised', (line, expected) => {
    expect(parsePackingLine(line)).toEqual(expected);
  });

  it.each([
    'Tagesrucksack',
    'Proviant für 2 Tage',
    'Unterhose 0 je Tag',
    'Unterhose 100 je Tag',
    'Socken 1 je Woche',
    '2 Socken 1 je Tag',
    'je Tag',
  ])('AC-033: „%s“ stays a name', (line) => {
    expect(parsePackingLine(line)).toEqual({ name: line });
  });

  it('AC-031: "Unterhose 1 je Tag" becomes "Unterhose · 1 je Tag", a fixed quantity stays', () => {
    expect(parsePackingLine('2 Badehose')).toEqual({ name: 'Badehose', quantity: 2 });
    expect(parsePackingLine('Proviant für 2 Tage')).toEqual({ name: 'Proviant für 2 Tage' });
  });
});

const strand: PackingBag = { id: 'bag-strand', name: 'Strand', sort: 0 };
const bagItem = (
  id: string,
  name: string,
  quantity?: number,
  perDay = false,
  sort = 0,
): PackingBagItem => ({ id, bagId: strand.id, name, quantity, perDay, sort });
const listBag = (id: string, tripId: string): PackingListBag => ({
  id,
  tripId,
  bagId: strand.id,
  name: 'Strand',
  sort: 0,
});
const item = (partial: Partial<PackingItem> & Pick<PackingItem, 'id' | 'name'>): PackingItem => ({
  listBagId: 'lb-m',
  packed: false,
  packSeq: 0,
  sort: 0,
  fromBag: true,
  ...partial,
});

const members = [enrico, nadja];
const mallorca = trip('t-m', [enrico.id, nadja.id], '2026-12-04', '2026-12-10', 'Urlaub Mallorca');
const ostsee = trip('t-o', [enrico.id], '2026-05-01', '2026-05-07', 'Ostsee');
const stripes = tripStripes([mallorca, ostsee], members);

describe('changes of a Reisetasche in upcoming packing lists (REQ-012)', () => {
  const badehose = bagItem('bi-badehose', 'Badehose', 3, false, 0);
  const socken = bagItem('bi-socken', 'Socken', 2, true, 1);
  const items = [
    item({ id: 'p-badehose', name: 'Badehose', quantity: 2, bagItemId: 'bi-badehose', sort: 0 }),
    item({ id: 'p-schnorchel', name: 'Schnorchel', sort: 1 }),
    item({
      id: 'p-socken',
      name: 'Socken',
      quantity: 7,
      perDay: 1,
      packed: true,
      packSeq: 1,
      bagItemId: 'bi-socken',
      sort: 2,
    }),
    item({ id: 'p-karten', name: 'Kartenspiel', fromBag: false, sort: 3 }),
    item({ id: 'p-ostsee', name: 'Schnorchel', listBagId: 'lb-o', sort: 0 }),
  ];
  const listBags = [listBag('lb-m', mallorca.id), listBag('lb-o', ostsee.id)];

  it('AC-037: 1 geändert, 1 entfernt; the packed Socken stay; Kartenspiel never counts', () => {
    const [deviation, ...rest] = bagDeviations({
      bag: strand,
      bagItems: [badehose, socken],
      trips: stripes,
      listBags,
      items,
      today: '2026-11-22',
    });
    expect(rest).toEqual([]);
    expect(deviation?.tripId).toBe(mallorca.id);
    expect(deviation?.added).toEqual([]);
    expect(deviation?.changed.map((change) => change.item.id)).toEqual(['p-badehose']);
    expect(deviation?.removed.map((entry) => entry.id)).toEqual(['p-schnorchel']);
    expect(deviation?.keptPacked.map((entry) => entry.id)).toEqual(['p-socken']);
    if (!deviation) throw new Error('fixture');
    expect(bagDeviationHint(deviation)).toBe(
      '„Urlaub Mallorca“ (ab Fr 4.12.) weicht ab: 1 geändert, 1 entfernt.',
    );
    expect(adoptBagDialog(deviation)).toBe(
      'Geändert: Badehose 3×. Entfernt: Schnorchel. Bleibt, weil gepackt: Socken.',
    );
  });

  it('AC-036: "Sonnencreme" new in "Strand" is appended open at the end', () => {
    const sonnencreme = bagItem('bi-sonnencreme', 'Sonnencreme', undefined, false, 2);
    const synced = [
      item({ id: 'p-badehose', name: 'Badehose', quantity: 3, bagItemId: 'bi-badehose', sort: 0 }),
      item({
        id: 'p-socken',
        name: 'Socken',
        quantity: 14,
        perDay: 2,
        bagItemId: 'bi-socken',
        sort: 1,
      }),
    ];
    const [deviation] = bagDeviations({
      bag: strand,
      bagItems: [badehose, socken, sonnencreme],
      trips: stripes,
      listBags,
      items: synced,
      today: '2026-12-02',
    });
    if (!deviation) throw new Error('no deviation');
    expect(bagDeviationHint(deviation)).toBe('„Urlaub Mallorca“ (ab Fr 4.12.) weicht ab: 1 neu.');
    expect(adoptBagDialog(deviation)).toBe('Neu: Sonnencreme.');
    let next = 0;
    const plan = planAdoptBag({ deviation, items: synced, days: 7, newId: () => `n-${++next}` });
    expect(plan.insert).toEqual([
      expect.objectContaining({
        id: 'n-1',
        listBagId: 'lb-m',
        name: 'Sonnencreme',
        packed: false,
        bagItemId: 'bi-sonnencreme',
        fromBag: true,
        sort: 2,
      }),
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it('AC-037: adopting changes the open Badehose and removes the open Schnorchel only', () => {
    const [deviation] = bagDeviations({
      bag: strand,
      bagItems: [badehose, socken],
      trips: stripes,
      listBags,
      items,
      today: '2026-11-22',
    });
    if (!deviation) throw new Error('fixture');
    const plan = planAdoptBag({ deviation, items, days: 7, newId: () => 'x' });
    expect(plan.update).toEqual([
      expect.objectContaining({ id: 'p-badehose', quantity: 3, perDay: undefined }),
    ]);
    expect(plan.deleteIds).toEqual(['p-schnorchel']);
    expect(plan.insert).toEqual([]);
  });

  it('AC-038: a past trip never shows; no deviation means no hint', () => {
    expect(
      bagDeviations({
        bag: strand,
        bagItems: [bagItem('bi-schnorchel', 'Schnorchel')],
        trips: stripes,
        listBags: [listBag('lb-o', ostsee.id)],
        items: [
          item({ id: 'p-o', name: 'Schnorchel', listBagId: 'lb-o', bagItemId: 'bi-schnorchel' }),
        ],
        today: '2026-11-22',
      }),
    ).toEqual([]);
  });
});

describe('editing a Packstück of the packing list (REQ-009)', () => {
  const socken = item({
    id: 'p-socken',
    name: 'Socken',
    quantity: 7,
    perDay: 1,
    packed: true,
    packSeq: 1,
    bagItemId: 'bi-socken',
  });

  it('AC-028: count 2 "je Tag" gives "Socken 14×", still packed', () => {
    expect(
      planEditPackingItem({ item: socken, name: 'Socken', count: 2, perDay: true, days: 7 }),
    ).toEqual({ ...socken, quantity: 14, perDay: 2 });
  });

  it('AC-030: an empty name is "Name fehlt"; "je Tag" without a count is 1', () => {
    expect(() =>
      planEditPackingItem({ item: socken, name: '  ', count: 2, perDay: false, days: 7 }),
    ).toThrow('Name fehlt');
    expect(
      planEditPackingItem({ item: socken, name: 'Socken', perDay: true, days: 7 }),
    ).toMatchObject({ quantity: 7, perDay: 1 });
    expect(
      planEditPackingItem({
        item: socken,
        name: 'Sneakersocken',
        count: 3,
        perDay: false,
        days: 7,
      }),
    ).toMatchObject({ name: 'Sneakersocken', quantity: 3, perDay: undefined, packed: true });
    expect(
      planEditPackingItem({ item: socken, name: 'Socken', perDay: false, days: 7 }),
    ).toMatchObject({ quantity: undefined, perDay: undefined });
  });
});

describe('"+ Packstück" with "je Tag" (AC-032)', () => {
  it('AC-032: "2 T-Shirts pro Tag" at a 7-day trip is "T-Shirts 14×", in the Reisetasche "2 je Tag"', () => {
    let next = 0;
    const line = parsePackingLine('2 T-Shirts pro Tag');
    if (!line) throw new Error('fixture');
    const result = planAddPackingItem({
      listBag: listBag('lb-m', mallorca.id),
      line,
      items: [],
      alsoInBag: [],
      days: 7,
      newId: () => `n-${++next}`,
    });
    expect(result.item).toMatchObject({
      name: 'T-Shirts',
      quantity: 14,
      perDay: 2,
      bagItemId: 'n-2',
      fromBag: true,
    });
    expect(result.bagItem).toMatchObject({
      id: 'n-2',
      name: 'T-Shirts',
      quantity: 2,
      perDay: true,
    });
    expect(bagItemLabel(result.bagItem ?? bagItem('x', 'x'))).toBe('T-Shirts · 2 je Tag');
  });
});
