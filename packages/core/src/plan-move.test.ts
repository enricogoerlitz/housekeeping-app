import { describe, expect, it } from 'vitest';

import {
  blockedText,
  dropOutcome,
  isSelectableMoveDay,
  moveBounds,
  moveTargetLabel,
  moveToastText,
  travellersOn,
} from './plan-move';
import type { Absence, MealPlanEntry } from './types';

// Today in the spec's examples: Sunday, 22 November 2026; the week after runs from 23 to 29.11.
const today = '2026-11-22';

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: '2026-11-25',
    slotId: 'abend',
    kind: 'recipe',
    eaterIds: ['enrico', 'nadja'],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

const lasagne = entry({ id: 'lasagne', recipeId: 'recipe-lasagne' });
const halloumi = entry({ id: 'halloumi', date: null, recipeId: 'recipe-halloumi' });
const lasagneLeftovers = entry({
  id: 'reste',
  kind: 'leftovers',
  date: '2026-11-27',
  slotId: 'mittag',
  leftoversOfEntryId: 'lasagne',
});

describe('dropOutcome: where a dropped entry lands', () => {
  it('AC-001: a field of the week sets day and Tageszeit', () => {
    expect(
      dropOutcome(lasagne, { kind: 'slot', date: '2026-11-27', slotId: 'abend' }, [lasagne]),
    ).toEqual({ kind: 'move', date: '2026-11-27', slotId: 'abend' });
  });

  it('AC-002: another day and another Tageszeit in the week', () => {
    expect(
      dropOutcome(lasagne, { kind: 'slot', date: '2026-11-26', slotId: 'mittag' }, [lasagne]),
    ).toEqual({ kind: 'move', date: '2026-11-26', slotId: 'mittag' });
  });

  it('AC-003: dropping on the old place changes nothing', () => {
    expect(
      dropOutcome(lasagne, { kind: 'slot', date: '2026-11-25', slotId: 'abend' }, [lasagne]),
    ).toEqual({ kind: 'same' });
    expect(dropOutcome(lasagne, { kind: 'day', date: '2026-11-25' }, [lasagne])).toEqual({
      kind: 'same',
    });
    expect(dropOutcome(halloumi, { kind: 'parked' }, [halloumi])).toEqual({ kind: 'same' });
  });

  it('AC-006: an empty Tageszeit of another day takes the entry', () => {
    expect(
      dropOutcome(lasagne, { kind: 'slot', date: '2026-11-28', slotId: 'mittag' }, [lasagne]),
    ).toEqual({ kind: 'move', date: '2026-11-28', slotId: 'mittag' });
  });

  it('AC-007: a day of the month keeps the Tageszeit', () => {
    expect(dropOutcome(lasagne, { kind: 'day', date: '2026-11-30' }, [lasagne])).toEqual({
      kind: 'move',
      date: '2026-11-30',
      slotId: 'abend',
    });
  });

  it('AC-008: a day of the year in the next month keeps the Tageszeit', () => {
    expect(dropOutcome(lasagne, { kind: 'day', date: '2026-12-12' }, [lasagne])).toEqual({
      kind: 'move',
      date: '2026-12-12',
      slotId: 'abend',
    });
  });

  it('AC-011: a parked entry dropped on a field of the week gets day and Tageszeit', () => {
    expect(
      dropOutcome(halloumi, { kind: 'slot', date: '2026-11-26', slotId: 'mittag' }, [halloumi]),
    ).toEqual({ kind: 'move', date: '2026-11-26', slotId: 'mittag' });
  });

  it('AC-012: a parked entry dropped on a day keeps its Tageszeit', () => {
    expect(dropOutcome(halloumi, { kind: 'day', date: '2026-11-27' }, [halloumi])).toEqual({
      kind: 'move',
      date: '2026-11-27',
      slotId: 'abend',
    });
  });

  it('AC-013: "Vormerken" takes the day and keeps the Tageszeit', () => {
    expect(dropOutcome(lasagne, { kind: 'parked' }, [lasagne])).toEqual({
      kind: 'move',
      date: null,
      slotId: 'abend',
    });
  });
});

describe('moveBounds: leftovers stay behind their dish (spec 0010, REQ-011)', () => {
  const entries = [lasagne, lasagneLeftovers];

  it('AC-015: a dish with leftovers on Fri cannot go to Fri–Sun, but to Thu and back to 20.11.', () => {
    const bounds = moveBounds(lasagne, entries);
    expect(isSelectableMoveDay(bounds, '2026-11-26')).toBe(true);
    expect(isSelectableMoveDay(bounds, '2026-11-20')).toBe(true);
    expect(isSelectableMoveDay(bounds, '2026-11-27')).toBe(false);
    expect(isSelectableMoveDay(bounds, '2026-11-28')).toBe(false);
    expect(isSelectableMoveDay(bounds, '2026-11-29')).toBe(false);
    expect(isSelectableMoveDay(bounds, '2026-11-19')).toBe(false);
  });

  it('AC-015: dropping the dish on Saturday is refused with the leftovers day', () => {
    const outcome = dropOutcome(lasagne, { kind: 'day', date: '2026-11-28' }, entries);
    expect(outcome).toEqual({
      kind: 'blocked',
      reason: { kind: 'leftovers-planned', leftoversDate: '2026-11-27' },
    });
    if (outcome.kind !== 'blocked') throw new Error('expected blocked');
    expect(blockedText(outcome.reason, 'Lasagne')).toBe(
      'Reste von Lasagne stehen schon am Fr 27.11.',
    );
  });

  it('AC-015: leftovers more than seven days after the dish are refused', () => {
    const outcome = dropOutcome(
      lasagneLeftovers,
      { kind: 'slot', date: '2026-12-03', slotId: 'mittag' },
      entries,
    );
    expect(outcome).toEqual({ kind: 'blocked', reason: { kind: 'too-far' } });
    if (outcome.kind !== 'blocked') throw new Error('expected blocked');
    expect(blockedText(outcome.reason, 'Lasagne')).toBe(
      'Reste gehen bis sieben Tage nach dem Gericht',
    );
    expect(dropOutcome(lasagneLeftovers, { kind: 'day', date: '2026-12-02' }, entries)).toEqual({
      kind: 'move',
      date: '2026-12-02',
      slotId: 'mittag',
    });
  });

  it('AC-015: leftovers on or before the day of their dish are refused', () => {
    for (const date of ['2026-11-25', '2026-11-24']) {
      const outcome = dropOutcome(lasagneLeftovers, { kind: 'day', date }, entries);
      expect(outcome).toEqual({
        kind: 'blocked',
        reason: { kind: 'before-dish', dishDate: '2026-11-25' },
      });
      if (outcome.kind !== 'blocked') throw new Error('expected blocked');
      expect(blockedText(outcome.reason, 'Lasagne')).toBe('Reste stehen immer nach ihrem Gericht');
    }
  });

  it('AC-015: a dish moved more than seven days before its leftovers is refused', () => {
    expect(dropOutcome(lasagne, { kind: 'day', date: '2026-11-19' }, entries)).toEqual({
      kind: 'blocked',
      reason: { kind: 'too-far' },
    });
  });

  it('AC-015: with several leftovers the dish stays before the first and within 7 days of the last', () => {
    const later = entry({
      id: 'reste-2',
      kind: 'leftovers',
      date: '2026-11-30',
      leftoversOfEntryId: 'lasagne',
    });
    const bounds = moveBounds(lasagne, [...entries, later]);
    expect(bounds.earliest?.date).toBe('2026-11-23');
    expect(bounds.latest?.date).toBe('2026-11-26');
    expect(isSelectableMoveDay(bounds, '2026-11-22')).toBe(false);
    expect(isSelectableMoveDay(bounds, '2026-11-23')).toBe(true);
  });

  it('REQ-004: a dish with planned leftovers cannot be parked', () => {
    expect(moveBounds(lasagne, entries).parked).toEqual({
      kind: 'leftovers-planned',
      leftoversDate: '2026-11-27',
    });
    expect(dropOutcome(lasagne, { kind: 'parked' }, entries)).toEqual({
      kind: 'blocked',
      reason: { kind: 'leftovers-planned', leftoversDate: '2026-11-27' },
    });
  });

  it('open question 6: leftovers can be parked, and a dish whose leftovers are parked too', () => {
    expect(dropOutcome(lasagneLeftovers, { kind: 'parked' }, entries)).toEqual({
      kind: 'move',
      date: null,
      slotId: 'mittag',
    });
    const parkedLeftovers = { ...lasagneLeftovers, date: null };
    expect(dropOutcome(lasagne, { kind: 'parked' }, [lasagne, parkedLeftovers])).toEqual({
      kind: 'move',
      date: null,
      slotId: 'abend',
    });
  });

  it('open question 6: leftovers of a parked dish may go to any day', () => {
    const parkedDish = { ...lasagne, date: null };
    const bounds = moveBounds(lasagneLeftovers, [parkedDish, lasagneLeftovers]);
    expect(bounds).toEqual({});
    expect(isSelectableMoveDay(bounds, '2027-03-01')).toBe(true);
  });

  it('leftovers whose dish no longer exists have no bounds', () => {
    expect(moveBounds(lasagneLeftovers, [lasagneLeftovers])).toEqual({});
  });

  it('an entry without leftovers can go anywhere, also into the past', () => {
    const bounds = moveBounds(lasagne, [lasagne, halloumi]);
    expect(bounds).toEqual({});
    expect(isSelectableMoveDay(bounds, '2020-01-01')).toBe(true);
  });

  it('AC-021: with leftovers on 27.11. the 27th and all later days are not selectable', () => {
    const bounds = moveBounds(lasagne, entries);
    expect(isSelectableMoveDay(bounds, '2026-11-26')).toBe(true);
    expect(isSelectableMoveDay(bounds, '2026-11-27')).toBe(false);
    expect(isSelectableMoveDay(bounds, '2027-01-08')).toBe(false);
  });
});

describe('texts while and after moving', () => {
  it('AC-001: the label at the dragged entry and the toast', () => {
    expect(moveTargetLabel('2026-11-27', 'Abend')).toBe('Fr 27.11. · Abend');
    expect(moveToastText({ title: 'Lasagne', date: '2026-11-27', slotName: 'Abend', today })).toBe(
      'Lasagne → Fr 27.11., Abend',
    );
  });

  it('AC-007: the toast after a drop on a day of the month', () => {
    expect(moveToastText({ title: 'Lasagne', date: '2026-11-30', slotName: 'Abend', today })).toBe(
      'Lasagne → Mo 30.11., Abend',
    );
  });

  it('AC-013: parking says "vorgemerkt"; the target is called "Vormerken"', () => {
    expect(moveToastText({ title: 'Lasagne', date: null, slotName: 'Abend', today })).toBe(
      'Lasagne vorgemerkt',
    );
    expect(moveTargetLabel(null, 'Abend')).toBe('Vormerken');
  });

  it('AC-019: a day in another year carries the year', () => {
    expect(moveToastText({ title: 'Lasagne', date: '2027-01-08', slotName: 'Abend', today })).toBe(
      'Lasagne → Fr 8.1.2027, Abend',
    );
  });

  it('AC-016: the toast names who is travelling then', () => {
    expect(
      moveToastText({
        title: 'Lasagne',
        date: '2026-11-27',
        slotName: 'Abend',
        today,
        travellerNames: ['Nadja'],
      }),
    ).toBe('Lasagne → Fr 27.11., Abend · Nadja ist dann auf Reise');
    expect(
      moveToastText({
        title: 'Lasagne',
        date: '2026-11-27',
        slotName: 'Abend',
        today,
        travellerNames: ['Enrico', 'Nadja'],
      }),
    ).toBe('Lasagne → Fr 27.11., Abend · Enrico und Nadja sind dann auf Reise');
  });
});

describe('travellersOn', () => {
  const nadjaAway: Absence = { id: 'a1', memberId: 'nadja', from: '2026-11-27', to: '2026-11-29' };

  it('AC-016: eaters who are travelling on the target day, in the order of the eaters', () => {
    expect(travellersOn(['enrico', 'nadja'], '2026-11-27', [nadjaAway])).toEqual(['nadja']);
    expect(travellersOn(['enrico', 'nadja'], '2026-11-29', [nadjaAway])).toEqual(['nadja']);
    expect(travellersOn(['enrico', 'nadja'], '2026-11-30', [nadjaAway])).toEqual([]);
  });

  it('AC-016: a trip of the whole household covers every eater', () => {
    const household: Absence = { id: 'a2', from: '2026-11-27', to: '2026-11-27' };
    expect(travellersOn(['enrico', 'nadja'], '2026-11-27', [household])).toEqual([
      'enrico',
      'nadja',
    ]);
  });

  it('AC-016: a parked entry has nobody travelling', () => {
    expect(travellersOn(['enrico', 'nadja'], null, [nadjaAway])).toEqual([]);
  });
});
