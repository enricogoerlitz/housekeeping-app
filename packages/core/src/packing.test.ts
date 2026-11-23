import { describe, expect, it } from 'vitest';

import {
  addableBags,
  bagChipOrder,
  bagFullProblem,
  bagItemLabel,
  bagItemSortChanges,
  bagItemsOf,
  bagSummary,
  copyName,
  duplicateBag,
  findBagByName,
  nextSort,
  orderedBags,
  packingCards,
  packingItemLabel,
  packingLineProblem,
  packingNameSuggestions,
  packingProgress,
  packingSaveProblem,
  packingSections,
  packQuantity,
  parsePackingLine,
  planAddBagToList,
  planAddPackingItem,
  planPackingList,
  recalcPerDay,
  saveLabel,
  sourceBag,
  startsInLabel,
  stripeHasPackingList,
  tripDays,
  tripDeleteDialog,
  tripHeader,
  tripPreview,
  validateBagName,
} from './packing';
import {
  enrico,
  kulturbeutel,
  nadja,
  packingBagItems,
  packingBags,
  strand,
  technik,
  trip,
  wintersport,
} from './test-fixtures';
import { tripStripes } from './trips';
import type { Id, PackingBag, PackingItem, PackingListBag } from './types';

function idGenerator(prefix = 'new'): () => Id {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function listBag(partial: Partial<PackingListBag> & Pick<PackingListBag, 'id' | 'tripId'>) {
  return { name: 'Strand', sort: 0, ...partial } satisfies PackingListBag;
}

function packingItem(
  partial: Partial<PackingItem> & Pick<PackingItem, 'id' | 'listBagId'>,
): PackingItem {
  return { name: partial.id, packed: false, packSeq: 0, sort: 0, ...partial };
}

/** `total` items in the list bag, the first `packed` of them packed. */
function itemsOf(listBagId: Id, total: number, packed = 0): PackingItem[] {
  return Array.from({ length: total }, (_, index) =>
    packingItem({
      id: `${listBagId}-i${index + 1}`,
      listBagId,
      sort: index,
      packed: index < packed,
      packSeq: index < packed ? 1 : 0,
    }),
  );
}

const mallorca = trip(
  'abs-mallorca',
  [enrico.id, nadja.id],
  '2027-01-01',
  '2027-01-07',
  'Urlaub Mallorca',
);

describe('Reisetaschen: input', () => {
  it('AC-003: "2 Badehose" is Badehose with 2, "Sonnenbrille" has no quantity, empty is nothing', () => {
    expect(parsePackingLine('2 Badehose')).toEqual({ name: 'Badehose', quantity: 2 });
    expect(parsePackingLine('Sonnenbrille')).toEqual({ name: 'Sonnenbrille' });
    expect(parsePackingLine('')).toBeUndefined();
    expect(parsePackingLine('   ')).toBeUndefined();
  });

  it('AC-003: a quantity may carry "x" or "×"; outside 1…99 the number belongs to the name', () => {
    expect(parsePackingLine('2× Badehose')).toEqual({ name: 'Badehose', quantity: 2 });
    expect(parsePackingLine('2×Badehose')).toEqual({ name: 'Badehose', quantity: 2 });
    expect(parsePackingLine(' 3 x  Socken ')).toEqual({ name: 'Socken', quantity: 3 });
    expect(parsePackingLine('2X Badehose')).toEqual({ name: 'Badehose', quantity: 2 });
    expect(parsePackingLine('100 Socken')).toEqual({ name: '100 Socken' });
    expect(parsePackingLine('0 Socken')).toEqual({ name: '0 Socken' });
    expect(parsePackingLine('2 xylophon')).toEqual({ name: 'xylophon', quantity: 2 });
    expect(parsePackingLine('2xylophon')).toEqual({ name: '2xylophon' });
    expect(parsePackingLine('2')).toEqual({ name: '2' });
  });

  it('decision 13: names up to 120 characters, at most 100 Packstücke per Reisetasche', () => {
    expect(packingLineProblem({ name: 'a'.repeat(120) })).toBeUndefined();
    expect(packingLineProblem({ name: 'a'.repeat(121) })).toBe('Höchstens 120 Zeichen');
    expect(bagFullProblem(99)).toBeUndefined();
    expect(bagFullProblem(100)).toBe('Höchstens 100 Packstücke je Reisetasche');
  });

  it('AC-003, AC-004: labels "Badehose 2×", "Sonnenbrille", "T-Shirts · 1 je Tag"', () => {
    const [shirts, badehose, brille] = bagItemsOf(strand.id, packingBagItems);
    expect(badehose && bagItemLabel(badehose)).toBe('Badehose 2×');
    expect(brille && bagItemLabel(brille)).toBe('Sonnenbrille');
    expect(shirts && bagItemLabel(shirts)).toBe('T-Shirts · 1 je Tag');
  });

  it('AC-001: "12 Packstücke", "1 Packstück"', () => {
    expect(bagSummary(bagItemsOf(strand.id, packingBagItems).length)).toBe('12 Packstücke');
    expect(bagSummary(bagItemsOf(wintersport.id, packingBagItems).length)).toBe('18 Packstücke');
    expect(bagSummary(1)).toBe('1 Packstück');
    expect(bagSummary(0)).toBe('0 Packstücke');
  });

  it('AC-005: "Sonn" in Strand suggests Sonnencreme from Wintersport, not names of Strand', () => {
    expect(packingNameSuggestions('Sonn', strand.id, packingBagItems)).toEqual(['Sonnencreme']);
    expect(packingNameSuggestions('', strand.id, packingBagItems)).toEqual([]);
  });

  it('AC-005: word starts first, then names that contain it; no duplicates, at most five', () => {
    const items = [
      ['Taschenhandwärmer', 'a'],
      ['Handtuch', 'a'],
      ['Ladekabel Handy', 'a'],
      ['Handschuhe', 'a'],
      ['handtuch', 'b'],
      ['Handcreme', 'b'],
      ['Handgepäckwaage', 'b'],
      ['Handseife', 'own'],
    ].map(([name, bagId], index) => ({
      id: `x${index}`,
      bagId: bagId ?? '',
      name: name ?? '',
      perDay: false,
      sort: index,
    }));
    expect(packingNameSuggestions('hand', 'own', items)).toEqual([
      'Handcreme',
      'Handgepäckwaage',
      'Handschuhe',
      'Handtuch',
      'Ladekabel Handy',
    ]);
    expect(packingNameSuggestions('HÄNDE', 'own', items)).toEqual([]);
    expect(packingNameSuggestions('wärm', 'own', items)).toEqual(['Taschenhandwärmer']);
  });
});

describe('Reisetaschen: names, copies and order', () => {
  it('AC-007: "Name fehlt", and "strand" next to Strand is "Gibt es schon: Strand"', () => {
    expect(validateBagName('  ', packingBags)).toEqual({ kind: 'missing', message: 'Name fehlt' });
    expect(validateBagName('strand', packingBags)).toEqual({
      kind: 'taken',
      existing: strand,
      message: 'Gibt es schon: Strand',
    });
    expect(validateBagName('Strand', packingBags, strand.id)).toBeUndefined();
    expect(validateBagName('Camping', packingBags)).toBeUndefined();
    expect(validateBagName('a'.repeat(61), packingBags)).toEqual({
      kind: 'tooLong',
      message: 'Höchstens 60 Zeichen',
    });
  });

  it('AC-013: "+ Neue" with an existing name finds that bag', () => {
    expect(findBagByName(' technik ', packingBags)).toBe(technik);
    expect(findBagByName('Camping', packingBags)).toBeUndefined();
  });

  it('AC-008: copies are "Strand (Kopie)", then "Strand (Kopie 2)", never over 60 characters', () => {
    expect(copyName('Strand', packingBags)).toBe('Strand (Kopie)');
    const withCopy = [...packingBags, { id: 'c', name: 'Strand (Kopie)', sort: 4 }];
    expect(copyName('Strand', withCopy)).toBe('Strand (Kopie 2)');
    expect(copyName('Strand', [...withCopy, { id: 'd', name: 'strand (kopie 2)', sort: 5 }])).toBe(
      'Strand (Kopie 3)',
    );
    const long = 'L'.repeat(58);
    expect(copyName(long, packingBags)).toBe(`${'L'.repeat(52)} (Kopie)`);
  });

  it('AC-008: duplicating keeps the items, quantities and order, new ids, at the end of the page', () => {
    const shuffled = [...packingBagItems].reverse();
    const copy = duplicateBag(kulturbeutel, shuffled, packingBags, idGenerator());
    expect(copy.bag).toEqual({
      id: 'new-1',
      name: 'Kulturbeutel (Kopie)',
      memberId: nadja.id,
      sort: 4,
    });
    const original = bagItemsOf(kulturbeutel.id, packingBagItems);
    expect(copy.items).toHaveLength(9);
    expect(copy.items.map((item) => [item.name, item.quantity, item.perDay])).toEqual(
      original.map((item) => [item.name, item.quantity, item.perDay]),
    );
    expect(copy.items.every((item) => item.bagId === 'new-1')).toBe(true);
    expect(copy.items.map((item) => item.sort)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(copy.items.map((item) => item.id)).size).toBe(9);
  });

  it('decision 11: same sort values are ordered by id; a new row goes to the end', () => {
    const items = [
      { id: 'b', bagId: 's', name: 'B', perDay: false, sort: 1 },
      { id: 'a', bagId: 's', name: 'A', perDay: false, sort: 1 },
      { id: 'z', bagId: 's', name: 'Z', perDay: false, sort: 0 },
      { id: 'o', bagId: 'other', name: 'O', perDay: false, sort: 0 },
    ];
    expect(bagItemsOf('s', items).map((item) => item.id)).toEqual(['z', 'a', 'b']);
    expect(nextSort(bagItemsOf('s', items))).toBe(2);
    expect(nextSort([])).toBe(0);
    expect(orderedBags([technik, strand, kulturbeutel, wintersport])).toEqual(packingBags);
  });

  it('AC-006: dragging "Strandtuch" above "Sonnenbrille" changes only the moved rows', () => {
    const items = bagItemsOf(strand.id, packingBagItems);
    expect(bagItemSortChanges(items, 'bag-strand-4', 2)).toEqual([
      { id: 'bag-strand-4', sort: 2 },
      { id: 'bag-strand-3', sort: 3 },
    ]);
    expect(bagItemSortChanges(items, 'bag-strand-4', 3)).toEqual([]);
  });

  it('AC-006: after equal sort values only the rows whose value changes are written', () => {
    const items = [
      { id: 'a', bagId: 's', name: 'A', perDay: false, sort: 0 },
      { id: 'b', bagId: 's', name: 'B', perDay: false, sort: 0 },
      { id: 'c', bagId: 's', name: 'C', perDay: false, sort: 0 },
    ];
    // c keeps sort 0 and stays first because a and b move behind it.
    expect(bagItemSortChanges(items, 'c', 0)).toEqual([
      { id: 'a', sort: 1 },
      { id: 'b', sort: 2 },
    ]);
  });
});

describe('Packliste: creating', () => {
  it('AC-011, AC-014: days include the first and the last; "je Tag" at most 9999', () => {
    expect(tripDays('2027-01-01', '2027-01-07')).toBe(7);
    expect(tripDays('2027-01-01', '2027-01-04')).toBe(4);
    expect(tripDays('2027-01-01', '2027-01-01')).toBe(1);
    expect(packQuantity(1, 7)).toBe(7);
    expect(packQuantity(99, 365)).toBe(9999);
  });

  it('AC-011: Strand and Kulturbeutel at a household trip are 21 Packstücke, T-Shirts 7×', () => {
    const plan = planPackingList({
      trip: mallorca,
      bagIds: [kulturbeutel.id, strand.id],
      bags: packingBags,
      bagItems: packingBagItems,
      newId: idGenerator(),
    });
    expect(plan.listBags).toEqual([
      { id: 'new-1', tripId: mallorca.id, bagId: strand.id, name: 'Strand', sort: 0 },
      {
        id: 'new-14',
        tripId: mallorca.id,
        bagId: kulturbeutel.id,
        name: 'Kulturbeutel',
        memberId: nadja.id,
        sort: 1,
      },
    ]);
    expect(plan.items).toHaveLength(21);
    expect(plan.items.find((item) => item.name === 'T-Shirts')).toEqual({
      id: 'new-2',
      listBagId: 'new-1',
      name: 'T-Shirts',
      quantity: 7,
      perDay: 1,
      packed: false,
      packSeq: 0,
      sort: 0,
      bagItemId: expect.any(String),
      fromBag: true,
    });
    expect(plan.items.find((item) => item.name === 'Badehose')).toMatchObject({
      quantity: 2,
      perDay: undefined,
    });
    expect(plan.items.find((item) => item.name === 'Sonnenbrille')?.quantity).toBeUndefined();
    expect(plan.items.filter((item) => item.listBagId === 'new-14')).toHaveLength(9);
    expect(saveLabel(plan.items.length)).toBe('Speichern · 21 Packstücke');
  });

  it('AC-012: without a chosen bag there is no packing list and the button says "Speichern"', () => {
    const plan = planPackingList({
      trip: mallorca,
      bagIds: [],
      bags: packingBags,
      bagItems: packingBagItems,
      newId: idGenerator(),
    });
    expect(plan).toEqual({ listBags: [], items: [] });
    expect(saveLabel(0)).toBe('Speichern');
    expect(saveLabel(1)).toBe('Speichern · 1 Packstück');
  });

  it('AC-009: one trip of Enrico and Vera gets one list with every chosen bag, also one "für" Nadja', () => {
    const plan = planPackingList({
      trip: trip('t', [enrico.id, 'm-vera'], '2027-01-01', '2027-01-04'),
      bagIds: [strand.id, kulturbeutel.id],
      bags: packingBags,
      bagItems: packingBagItems,
      newId: idGenerator(),
    });
    expect(plan.listBags.map((bag) => [bag.tripId, bag.name, bag.memberId])).toEqual([
      ['t', 'Strand', undefined],
      ['t', 'Kulturbeutel', nadja.id],
    ]);
    expect(plan.items.find((item) => item.name === 'T-Shirts')?.quantity).toBe(4);
  });

  it('a chosen bag that no longer exists is left out', () => {
    const plan = planPackingList({
      trip: mallorca,
      bagIds: ['gone', technik.id],
      bags: packingBags,
      bagItems: packingBagItems,
      newId: idGenerator(),
    });
    expect(plan.listBags.map((bag) => bag.name)).toEqual(['Technik']);
  });

  it('decision 13: a save that writes more than 190 rows is stopped beforehand', () => {
    expect(packingSaveProblem(190)).toBeUndefined();
    expect(packingSaveProblem(191)).toBe(
      'Zu viele Packstücke auf einmal – bitte weniger Reisetaschen wählen',
    );
  });

  it('AC-012: the bag used last comes first; never used ones follow in page order', () => {
    const trips = [
      trip('hamburg', [nadja.id], '2026-10-12', '2026-10-14', 'Dienstreise Hamburg'),
      trip('sommer', [enrico.id, nadja.id], '2026-08-01', '2026-08-14', 'Sommerurlaub'),
    ];
    const listBags = [
      listBag({ id: 'l1', tripId: 'sommer', bagId: strand.id }),
      listBag({ id: 'l2', tripId: 'sommer', bagId: technik.id, name: 'Technik' }),
      listBag({ id: 'l3', tripId: 'hamburg', bagId: technik.id, name: 'Technik' }),
      listBag({ id: 'l4', tripId: 'hamburg', name: 'Gelöscht' }),
    ];
    expect(bagChipOrder(packingBags, listBags, trips).map((bag) => bag.name)).toEqual([
      'Technik',
      'Strand',
      'Wintersport',
      'Kulturbeutel',
    ]);
    expect(bagChipOrder(packingBags, [], trips)).toEqual(packingBags);
  });
});

describe('Packliste: extending', () => {
  const attached = [
    listBag({ id: 'l-strand', tripId: mallorca.id, bagId: strand.id, sort: 0 }),
    listBag({ id: 'l-other', tripId: 'other', bagId: technik.id, name: 'Technik' }),
  ];

  it('AC-033: all bags except those already attached are offered', () => {
    expect(addableBags(packingBags, attached, mallorca.id).map((bag) => bag.name)).toEqual([
      'Wintersport',
      'Kulturbeutel',
      'Technik',
    ]);
  });

  it('AC-033: adding "Kleidung" at a 7-day trip appends 6 open Packstücke, Socken 7×', () => {
    const kleidung: PackingBag = { id: 'bag-kleidung', name: 'Kleidung', sort: 4 };
    const items = ['Socken', 'Hosen', 'Pullover', 'Unterhosen', 'Jacke', 'Schlafanzug'].map(
      (name, index) => ({
        id: `k${index}`,
        bagId: kleidung.id,
        name,
        quantity: index === 0 ? 1 : undefined,
        perDay: index === 0,
        sort: index,
      }),
    );
    const plan = planAddBagToList({
      trip: mallorca,
      bag: kleidung,
      bagItems: items,
      listBags: attached,
      newId: idGenerator(),
    });
    expect(plan.listBags).toEqual([
      { id: 'new-1', tripId: mallorca.id, bagId: kleidung.id, name: 'Kleidung', sort: 1 },
    ]);
    expect(plan.items).toHaveLength(6);
    expect(plan.items.every((item) => !item.packed && item.listBagId === 'new-1')).toBe(true);
    expect(plan.items[0]).toMatchObject({ name: 'Socken', quantity: 7, perDay: 1 });
  });

  it('AC-031: "Schnorchel" goes open to the end of Strand, the template stays', () => {
    const existing = itemsOf('l-strand', 9, 4);
    const result = planAddPackingItem({
      listBag: attached[0] as PackingListBag,
      line: { name: 'Schnorchel' },
      items: existing,
      newId: idGenerator(),
    });
    expect(result).toEqual({
      item: {
        id: 'new-1',
        listBagId: 'l-strand',
        name: 'Schnorchel',
        quantity: undefined,
        perDay: undefined,
        packed: false,
        packSeq: 0,
        sort: 9,
        fromBag: false,
      },
    });
  });

  it('AC-032: "auch in der Reisetasche speichern" also appends it to the template', () => {
    const result = planAddPackingItem({
      listBag: attached[0] as PackingListBag,
      line: { name: 'Schnorchel', quantity: 2 },
      items: itemsOf('l-strand', 9, 4),
      alsoInBag: bagItemsOf(strand.id, packingBagItems),
      newId: idGenerator(),
    });
    expect(result.bagItem).toEqual({
      id: 'new-2',
      bagId: strand.id,
      name: 'Schnorchel',
      quantity: 2,
      perDay: false,
      sort: 12,
    });
    expect(result.item.quantity).toBe(2);
  });

  it('decision 18: "auch in der Reisetasche" exists only while the template does', () => {
    expect(sourceBag(attached[0] as PackingListBag, packingBags)).toBe(strand);
    expect(sourceBag(listBag({ id: 'x', tripId: 'a' }), packingBags)).toBeUndefined();
    expect(
      sourceBag(listBag({ id: 'x', tripId: 'a', bagId: 'gone' }), packingBags),
    ).toBeUndefined();
  });
});

describe('Reise-Fenster', () => {
  const listBags = [
    listBag({
      id: 'l-kultur',
      tripId: mallorca.id,
      name: 'Kulturbeutel',
      memberId: nadja.id,
      sort: 1,
    }),
    listBag({ id: 'l-strand', tripId: mallorca.id, bagId: strand.id, sort: 0 }),
    listBag({ id: 'l-other', tripId: 'other', name: 'Technik' }),
  ];

  it('AC-016, AC-020: one section per bag with "4/9", open in template order, packed at the end', () => {
    const items = [
      ...itemsOf('l-strand', 9, 4),
      ...itemsOf('l-kultur', 21, 8),
      ...itemsOf('l-other', 3),
    ].reverse();
    const sections = packingSections(listBags, items, mallorca.id);
    expect(sections.map((section) => `${section.listBag.name} ${section.counter}`)).toEqual([
      'Strand 4/9',
      'Kulturbeutel 8/21',
    ]);
    const [strandSection] = sections;
    expect(strandSection?.open.map((item) => item.sort)).toEqual([4, 5, 6, 7, 8]);
    expect(strandSection?.packed.map((item) => item.sort)).toEqual([0, 1, 2, 3]);
    expect(strandSection).toMatchObject({ packedCount: 4, total: 9 });
    expect(sections[1]?.listBag.memberId).toBe(nadja.id);
  });

  it('AC-003: a trip without bags has no sections', () => {
    expect(packingSections(listBags, [], 'hamburg')).toEqual([]);
  });

  it('AC-016, AC-017: progress counts Packstücke, not quantities', () => {
    const items = [...itemsOf('l-strand', 9, 4), ...itemsOf('l-kultur', 21, 8)];
    expect(packingProgress(items)).toEqual({ packed: 12, total: 30, label: '12 von 30 gepackt' });
    const three = [
      packingItem({ id: 'T-Shirts', listBagId: 'l', quantity: 7, perDay: 1, packed: true }),
      packingItem({ id: 'Badehose', listBagId: 'l', quantity: 2 }),
      packingItem({ id: 'Sonnenbrille', listBagId: 'l' }),
    ];
    expect(packingProgress(three).label).toBe('1 von 3 gepackt');
  });

  it('AC-037: labels of the packing list are "T-Shirts 7×" and "Sonnenbrille"', () => {
    expect(
      packingItemLabel(packingItem({ id: 'T-Shirts', listBagId: 'l', quantity: 7, perDay: 1 })),
    ).toBe('T-Shirts 7×');
    expect(packingItemLabel(packingItem({ id: 'Sonnenbrille', listBagId: 'l' }))).toBe(
      'Sonnenbrille',
    );
  });

  it('AC-016: header "(E)(N) · Fr 1.1. – Do 7.1. · 7 Tage" with the note as title', () => {
    const [stripe] = tripStripes([mallorca], [enrico, nadja]);
    expect(stripe && tripHeader(stripe, [enrico, nadja])).toEqual({
      title: 'Urlaub Mallorca',
      memberIds: [enrico.id, nadja.id],
      period: 'Fr 1.1. – Do 7.1.',
      duration: '7 Tage',
      subtitle: 'Fr 1.1. – Do 7.1. · 7 Tage',
    });
    const [oneDay] = tripStripes(
      [trip('d', [nadja.id], '2026-12-28', '2026-12-28')],
      [enrico, nadja],
    );
    expect(oneDay && tripHeader(oneDay, [enrico, nadja])).toEqual({
      title: 'unterwegs',
      memberIds: [nadja.id],
      period: 'Mo 28.12.',
      duration: '1 Tag',
      subtitle: 'Mo 28.12. · 1 Tag',
    });
  });

  it('AC-016: "beginnt in 12 Tagen", morgen, heute, "läuft bis Do 7.1.", "vorbei"', () => {
    const { from, to } = mallorca;
    expect(startsInLabel(from, to, '2026-12-20')).toBe('beginnt in 12 Tagen');
    expect(startsInLabel(from, to, '2026-12-31')).toBe('beginnt morgen');
    expect(startsInLabel(from, to, '2027-01-01')).toBe('beginnt heute');
    expect(startsInLabel(from, to, '2027-01-02')).toBe('läuft bis Do 7.1.');
    expect(startsInLabel(from, to, '2027-01-07')).toBe('läuft bis Do 7.1.');
    expect(startsInLabel(from, to, '2027-01-08')).toBe('vorbei');
  });
});

describe('Dauer ändern und Reise löschen', () => {
  it('AC-037: a shorter trip makes open "je Tag" 5×, packed stay 7×, fixed unchanged', () => {
    const shirts = packingItem({ id: 'T-Shirts', listBagId: 'l', quantity: 7, perDay: 1 });
    const socks = packingItem({
      id: 'Socken',
      listBagId: 'l',
      quantity: 7,
      perDay: 1,
      packed: true,
    });
    const badehose = packingItem({ id: 'Badehose', listBagId: 'l', quantity: 2 });
    const next = recalcPerDay([shirts, socks, badehose], tripDays('2027-01-01', '2027-01-05'));
    expect(next.map(packingItemLabel)).toEqual(['T-Shirts 5×', 'Socken 7×', 'Badehose 2×']);
    expect(next[1]).toBe(socks);
    expect(next[2]).toBe(badehose);
  });

  describe('the trip window shows the period set, before "Speichern" (spec 0031, REQ-029)', () => {
    const saved = { from: '2026-12-12', to: '2026-12-19' };
    const socks = packingItem({ id: 'Socken', listBagId: 'l', quantity: 8, perDay: 1 });

    it('AC-068: Mallorca 12.–19.12., the end moved to 15.12. → "4 Tage", Socken 4', () => {
      const preview = tripPreview(saved, { from: '2026-12-12', to: '2026-12-15' }, [socks]);
      expect(preview.duration).toBe('4 Tage');
      expect(preview.items.map(packingItemLabel)).toEqual(['Socken 4×']);
    });

    it('AC-068: nothing changed shows the saved trip', () => {
      const items = [socks];
      const preview = tripPreview(saved, undefined, items);
      expect(preview).toEqual({ duration: '8 Tage', items });
      expect(preview.items).toBe(items);
    });

    it('AC-068: an end before the start keeps the saved quantities', () => {
      const items = [socks];
      const preview = tripPreview(saved, { from: '2026-12-12', to: '2026-12-10' }, items);
      expect(preview).toEqual({ duration: '8 Tage', items });
    });
  });

  it('AC-016, AC-017: deleting a trip with a packing list names it; without one there is no dialog', () => {
    const listBags = [
      listBag({ id: 'l1', tripId: mallorca.id }),
      listBag({ id: 'l2', tripId: mallorca.id }),
    ];
    const items = [...itemsOf('l1', 21), ...itemsOf('l2', 9)];
    expect(tripDeleteDialog(mallorca.id, listBags, items)).toBe(
      'Die Packliste mit 30 Packstücken wird mit gelöscht.',
    );
    expect(tripDeleteDialog(mallorca.id, listBags.slice(1, 2), itemsOf('l2', 1))).toBe(
      'Die Packliste mit 1 Packstück wird mit gelöscht.',
    );
    expect(tripDeleteDialog('hamburg', listBags, items)).toBeUndefined();
  });
});

describe('Übersicht und Kalender', () => {
  const members = [enrico, nadja];
  const week = trip(
    'abs-mallorca',
    [enrico.id, nadja.id],
    '2026-11-30',
    '2026-12-04',
    'Urlaub Mallorca',
  );
  const hamburg = trip('hamburg', [nadja.id], '2026-12-28', '2026-12-29', 'Dienstreise Hamburg');
  const listBags = [listBag({ id: 'l1', tripId: week.id })];
  const items = itemsOf('l1', 30, 12);
  const cards = (
    shownDay: string,
    trips = [week, hamburg],
    bags = listBags,
    rows = items,
    today = shownDay,
  ) =>
    packingCards({
      shownDay,
      today,
      trips: tripStripes(trips, members),
      listBags: bags,
      items: rows,
    });

  it('AC-013 (0030): a draft has no packing card', () => {
    expect(cards('2026-11-23', [{ ...week, draft: true }, hamburg])).toEqual([]);
  });

  it('AC-042: no card two weeks before, from 7 days before "beginnt in 7 Tagen"', () => {
    expect(cards('2026-11-16')).toEqual([]);
    expect(cards('2026-11-23')).toEqual([
      {
        tripId: week.id,
        title: 'Urlaub Mallorca',
        memberIds: [],
        packed: 12,
        total: 30,
        progressLabel: '12/30 gepackt',
        startsIn: 'beginnt in 7 Tagen',
      },
    ]);
    expect(cards('2026-11-22').map((card) => card.startsIn)).toEqual([]);
  });

  it('AC-043: in the week with days of the trip there is a card, in the week after none', () => {
    expect(cards('2026-12-05').map((card) => card.startsIn)).toEqual(['vorbei']);
    expect(cards('2026-12-07')).toEqual([]);
  });

  it('spec 0020 AC-043: the section of the shown day counts, not the calendar week', () => {
    const mallorca = trip('mallorca', [enrico.id], '2026-12-04', '2026-12-10', 'Urlaub Mallorca');
    const bags = [listBag({ id: 'lm', tripId: mallorca.id })];
    const shown = (day: string) =>
      cards(day, [mallorca], bags, itemsOf('lm', 3), '2026-11-22').map((card) => card.startsIn);
    expect(shown('2026-11-28')).toEqual(['beginnt in 12 Tagen']);
    expect(shown('2026-12-11')).toHaveLength(1);
    // Mo 7.–Do 10.12. lie in the calendar week of Sa 12.12., but not in its section.
    expect(shown('2026-12-12')).toEqual([]);
  });

  it('AC-044: a fully packed list says "alles gepackt ✓"', () => {
    expect(cards('2026-11-30', [week], listBags, itemsOf('l1', 30, 30))[0]?.progressLabel).toBe(
      'alles gepackt ✓',
    );
  });

  it('AC-045: one card per packing list, none for "Dienstreise Hamburg" without one', () => {
    const enricoTrip = trip('a-e', [enrico.id], '2027-01-01', '2027-01-04');
    const nadjaTrip = trip('a-n', [nadja.id], '2027-01-01', '2027-01-07');
    const bags = [listBag({ id: 'le', tripId: 'a-n' }), listBag({ id: 'ln', tripId: 'a-e' })];
    const result = cards('2026-12-28', [nadjaTrip, hamburg, enricoTrip], bags, [
      ...itemsOf('le', 3),
      ...itemsOf('ln', 2, 1),
    ]);
    expect(result.map((card) => [card.tripId, card.memberIds, card.progressLabel])).toEqual([
      ['a-e', [enrico.id], '1/2 gepackt'],
      ['a-n', [nadja.id], '0/3 gepackt'],
    ]);
  });

  it('AC-020 (0018): the card counts "beginnt in n Tagen" from today, not from the shown day', () => {
    const mallorca = trip('abs-m', [enrico.id], '2026-12-04', '2026-12-11');
    const bags = [listBag({ id: 'lm', tripId: mallorca.id })];
    const shown = cards('2026-11-27', [mallorca], bags, itemsOf('lm', 3), '2026-11-22');
    expect(shown.map((card) => card.startsIn)).toEqual(['beginnt in 12 Tagen']);
  });

  it('AC-046: a stripe with a packing list carries the bag icon, one without does not', () => {
    const stripes = tripStripes([week, hamburg], members);
    expect(stripes.map((stripe) => stripeHasPackingList(stripe, listBags))).toEqual([true, false]);
  });
});
