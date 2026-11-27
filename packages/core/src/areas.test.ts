import { describe, expect, it } from 'vitest';

import {
  areaDeleteQuestion,
  areaMergeQuestion,
  areaSortPatches,
  articleCountsByArea,
  moveInOrder,
  nextAreaSort,
  orderAnnouncement,
  storeAreaSummary,
  storeOrderIndex,
  validateAreaName,
} from './areas';
import type { Area, Article } from './types';

const getraenke: Area = { id: 'area-getraenke', name: 'Getränke', sort: 0 };
const kuehlung: Area = { id: 'area-kuehlung', name: 'Kühlung', sort: 1 };
const areas = [getraenke, kuehlung];

function article(id: string, areaId?: string): Article {
  return {
    id,
    name: id,
    synonyms: [],
    diet: 'unknown',
    isPantry: false,
    needsReview: false,
    createdAt: '',
    areaId,
  };
}

describe('validateAreaName', () => {
  it('AC-052: a new name is fine', () => {
    expect(validateAreaName('Backzutaten', areas)).toBeUndefined();
  });

  it('AC-052: "getränke" next to "Getränke" is taken', () => {
    expect(validateAreaName('getränke', areas)).toEqual({
      kind: 'taken',
      existing: getraenke,
      message: 'Gibt es schon: Getränke',
    });
    expect(validateAreaName('  GETRAENKE ', areas)?.kind).toBe('taken');
  });

  it('AC-052: renaming "Kühlregal" to "Getränke" is taken; keeping the own name is fine', () => {
    const kuehlregal: Area = { ...kuehlung, name: 'Kühlregal' };
    expect(validateAreaName('Getränke', [getraenke, kuehlregal], kuehlregal.id)?.message).toBe(
      'Gibt es schon: Getränke',
    );
    expect(validateAreaName('kühlregal', [getraenke, kuehlregal], kuehlregal.id)).toBeUndefined();
  });

  it('AC-052: an empty name is missing', () => {
    expect(validateAreaName('   ', areas)).toEqual({ kind: 'missing', message: 'Name fehlt' });
  });

  it('80 characters are fine, 81 too long', () => {
    expect(validateAreaName('a'.repeat(80), areas)).toBeUndefined();
    expect(validateAreaName('a'.repeat(81), areas)?.kind).toBe('tooLong');
  });

  it('only the areas passed in are compared (another household may have the name)', () => {
    expect(validateAreaName('Keller', areas)).toBeUndefined();
  });
});

describe('moveInOrder', () => {
  const order = ['obst', 'brot', 'kuehl', 'getraenke', 'tk'];

  it('AC-046: dragging "Getränke" from position 4 to the first place', () => {
    expect(moveInOrder(order, 'getraenke', 0)).toEqual([
      'getraenke',
      'obst',
      'brot',
      'kuehl',
      'tk',
    ]);
  });

  it('AC-046: three times "nach oben" from position 4 also reaches position 1', () => {
    let moved = order;
    for (let step = 0; step < 3; step++) {
      moved = moveInOrder(moved, 'getraenke', moved.indexOf('getraenke') - 1);
    }
    expect(moved.indexOf('getraenke')).toBe(0);
    expect(moved).toEqual(['getraenke', 'obst', 'brot', 'kuehl', 'tk']);
  });

  it('moves down, and clamps beyond the ends', () => {
    expect(moveInOrder(order, 'obst', 2)).toEqual(['brot', 'kuehl', 'obst', 'getraenke', 'tk']);
    expect(moveInOrder(order, 'getraenke', -1)[0]).toBe('getraenke');
    expect(moveInOrder(order, 'obst', 99).at(-1)).toBe('obst');
  });

  it('leaves the order unchanged for an unknown entry and never mutates the input', () => {
    const copy = [...order];
    expect(moveInOrder(order, 'unbekannt', 0)).toEqual(order);
    moveInOrder(order, 'tk', 0);
    expect(order).toEqual(copy);
  });
});

describe('orderAnnouncement', () => {
  it('AC-046: says the new position', () => {
    expect(orderAnnouncement('Getränke', 0, 14)).toBe('Getränke, Position 1 von 14');
    expect(orderAnnouncement('Tierbedarf', 13, 14)).toBe('Tierbedarf, Position 14 von 14');
  });
});

describe('areaSortPatches', () => {
  const five: Area[] = [
    { id: 'a', name: 'A', sort: 0 },
    { id: 'b', name: 'B', sort: 1 },
    { id: 'c', name: 'C', sort: 2 },
    { id: 'd', name: 'D', sort: 3 },
    { id: 'getraenke', name: 'Getränke', sort: 4 },
  ];

  it('AC-053: "Getränke" from position 5 to the first place changes only the moved sorts', () => {
    const order = moveInOrder(
      five.map((area) => area.id),
      'getraenke',
      0,
    );
    expect(areaSortPatches(five, order)).toEqual([
      { id: 'getraenke', sort: 0 },
      { id: 'a', sort: 1 },
      { id: 'b', sort: 2 },
      { id: 'c', sort: 3 },
      { id: 'd', sort: 4 },
    ]);
  });

  it('AC-053: an unchanged order needs no patch', () => {
    expect(areaSortPatches(five, ['a', 'b', 'c', 'd', 'getraenke'])).toEqual([]);
  });

  it('areas missing from the order follow it in their sort; unknown ids are ignored', () => {
    expect(areaSortPatches(five, ['c', 'x'])).toEqual([
      { id: 'c', sort: 0 },
      { id: 'a', sort: 1 },
      { id: 'b', sort: 2 },
    ]);
  });
});

describe('nextAreaSort', () => {
  it('AC-052: a new area goes to the end of the order without store', () => {
    expect(nextAreaSort(areas)).toBe(2);
    expect(nextAreaSort([{ id: 'x', name: 'X', sort: 7 }, getraenke])).toBe(8);
  });

  it('starts at 0 without areas', () => {
    expect(nextAreaSort([])).toBe(0);
  });
});

describe('articleCountsByArea', () => {
  it('AC-054: counts the articles of each area and those without', () => {
    const articles = [
      article('1', 'area-getraenke'),
      article('2', 'area-getraenke'),
      article('3', 'area-kuehlung'),
      article('4'),
      article('5', 'area-geloescht'),
    ];
    const counts = articleCountsByArea(articles, areas);
    expect(counts.byArea.get('area-getraenke')).toBe(2);
    expect(counts.byArea.get('area-kuehlung')).toBe(1);
    expect(counts.withoutArea).toBe(2);
  });

  it('AC-056: an empty area counts 0', () => {
    expect(articleCountsByArea([], areas).byArea.get('area-getraenke')).toBe(0);
    expect(articleCountsByArea([], areas).withoutArea).toBe(0);
  });
});

describe('storeOrderIndex', () => {
  // Walking order a b c d e with c hidden: the visible order is a b d e.
  const order = ['a', 'b', 'c', 'd', 'e'];
  const hidden = ['c'];

  it('AC-046: moving a visible area to the top is index 0 of the whole order', () => {
    expect(storeOrderIndex(order, hidden, 'd', 0)).toBe(0);
    expect(moveInOrder(order, 'd', storeOrderIndex(order, hidden, 'd', 0))).toEqual([
      'd',
      'a',
      'b',
      'c',
      'e',
    ]);
  });

  it('AC-047: a hidden area keeps its place between the visible ones it stood between', () => {
    // "b" one down in the visible order (a d b e): it goes behind d, the hidden c stays after a.
    const index = storeOrderIndex(order, hidden, 'b', 2);
    expect(moveInOrder(order, 'b', index)).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('AC-046: to the end of the visible order is the end of the whole order', () => {
    expect(moveInOrder(order, 'a', storeOrderIndex(order, hidden, 'a', 3))).toEqual([
      'b',
      'c',
      'd',
      'e',
      'a',
    ]);
  });

  it('clamps an index outside the visible order and ignores an unknown area', () => {
    expect(storeOrderIndex(order, hidden, 'e', -3)).toBe(0);
    expect(moveInOrder(order, 'b', storeOrderIndex(order, hidden, 'b', 99))).toEqual([
      'a',
      'c',
      'd',
      'e',
      'b',
    ]);
    expect(storeOrderIndex(order, hidden, 'x', 1)).toBe(1);
  });

  it('with every other area hidden the area stays where it is', () => {
    expect(storeOrderIndex(['a', 'b'], ['a'], 'b', 0)).toBe(1);
  });
});

describe('storeAreaSummary', () => {
  it('AC-042: "n Bereiche · m ausgeblendet", hidden only when there are some', () => {
    expect(storeAreaSummary(['a', 'b', 'c'], ['b'])).toBe('2 Bereiche · 1 ausgeblendet');
    expect(storeAreaSummary(['a'], [])).toBe('1 Bereich');
    expect(storeAreaSummary([], [])).toBe('Keine Bereiche');
  });

  it('ignores hidden ids that are not in the walking order', () => {
    expect(storeAreaSummary(['a', 'b'], ['gone'])).toBe('2 Bereiche');
  });
});

describe('areaMergeQuestion', () => {
  it('AC-054: "Drogerie in Drogerie & Hygiene zusammenlegen? 12 Artikel ziehen um."', () => {
    expect(areaMergeQuestion('Drogerie', 'Drogerie & Hygiene', 12)).toEqual({
      title: 'Drogerie in Drogerie & Hygiene zusammenlegen?',
      message: '12 Artikel ziehen um.',
    });
  });

  it('AC-054: one and no article', () => {
    expect(areaMergeQuestion('A', 'B', 1).message).toBe('1 Artikel zieht um.');
    expect(areaMergeQuestion('A', 'B', 0).message).toBe('Es ziehen keine Artikel um.');
  });
});

describe('areaDeleteQuestion', () => {
  it('AC-055: "Tierbedarf löschen?" with where the articles go', () => {
    expect(areaDeleteQuestion('Tierbedarf', 12)).toEqual({
      title: 'Tierbedarf löschen?',
      message: '12 Artikel stehen danach unter ‚Ohne Bereich‘.',
    });
    expect(areaDeleteQuestion('Tierbedarf', 1).message).toBe(
      '1 Artikel steht danach unter ‚Ohne Bereich‘.',
    );
  });

  it('spec 0036, Entscheidung 1: an empty area is asked about too, without an article count', () => {
    expect(areaDeleteQuestion('Tierbedarf', 0)).toEqual({
      title: 'Tierbedarf löschen?',
      message: 'Der Bereich ist leer.',
    });
  });
});
