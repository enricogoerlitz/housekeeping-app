import { describe, expect, it } from 'vitest';

import {
  blockedText,
  dragSourceKey,
  dragTargetText,
  dropOutcome,
  moveTargetKey,
  parseDragSourceKey,
  parseMoveTargetKey,
  isSelectableMoveDay,
  moveBounds,
  moveTargetLabel,
  moveToastText,
  planMove,
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

  it('AC-022: a reminder now in the past adds "Erinnerung liegt in der Vergangenheit"', () => {
    expect(
      moveToastText({
        title: 'Lasagne',
        date: '2026-11-25',
        slotName: 'Abend',
        today,
        reminderPast: true,
      }),
    ).toBe('Lasagne → Mi 25.11., Abend · Erinnerung liegt in der Vergangenheit');
    expect(
      moveToastText({
        title: 'Lasagne',
        date: '2026-11-27',
        slotName: 'Abend',
        today,
        travellerNames: ['Nadja'],
        reminderPast: true,
      }),
    ).toBe(
      'Lasagne → Fr 27.11., Abend · Nadja ist dann auf Reise · Erinnerung liegt in der Vergangenheit',
    );
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

describe('planMove: what a move does and says (REQ-004, REQ-005)', () => {
  const members = [
    { id: 'enrico', name: 'Enrico' },
    { id: 'nadja', name: 'Nadja' },
  ];
  const slots = [
    { id: 'mittag', name: 'Mittag' },
    { id: 'abend', name: 'Abend' },
  ];
  // 12:00 in Berlin on `today`.
  const now = new Date('2026-11-22T11:00:00Z');
  const base = {
    members,
    slots,
    title: 'Lasagne',
    today,
    absences: [],
    now,
    timeZone: 'Europe/Berlin',
  };

  it('AC-019: "Anderes Datum …" keeps the Tageszeit and names the year', () => {
    expect(
      planMove({
        ...base,
        entry: lasagne,
        target: { kind: 'day', date: '2027-01-08' },
        entries: [lasagne],
      }),
    ).toEqual({
      kind: 'move',
      date: '2027-01-08',
      slotId: 'abend',
      message: 'Lasagne → Fr 8.1.2027, Abend',
    });
  });

  it('AC-016: the toast names the eaters travelling on the target day', () => {
    const nadjaAway: Absence = {
      id: 'a1',
      memberId: 'nadja',
      from: '2026-11-27',
      to: '2026-11-29',
    };
    expect(
      planMove({
        ...base,
        absences: [nadjaAway],
        entry: lasagne,
        target: { kind: 'slot', date: '2026-11-27', slotId: 'mittag' },
        entries: [lasagne],
      }),
    ).toEqual({
      kind: 'move',
      date: '2026-11-27',
      slotId: 'mittag',
      message: 'Lasagne → Fr 27.11., Mittag · Nadja ist dann auf Reise',
    });
  });

  it('AC-013: "Vormerken" says "vorgemerkt"', () => {
    expect(
      planMove({ ...base, entry: lasagne, target: { kind: 'parked' }, entries: [lasagne] }),
    ).toEqual({ kind: 'move', date: null, slotId: 'abend', message: 'Lasagne vorgemerkt' });
  });

  it('AC-015: a target behind the leftovers is refused with the reason', () => {
    expect(
      planMove({
        ...base,
        entry: lasagne,
        target: { kind: 'day', date: '2026-11-28' },
        entries: [lasagne, lasagneLeftovers],
      }),
    ).toEqual({ kind: 'blocked', message: 'Reste von Lasagne stehen schon am Fr 27.11.' });
  });

  it('AC-003: the old place changes nothing and says nothing', () => {
    expect(
      planMove({
        ...base,
        entry: lasagne,
        target: { kind: 'day', date: '2026-11-25' },
        entries: [lasagne],
      }),
    ).toEqual({ kind: 'same' });
  });

  describe('a reminder moves along (spec 0017, REQ-006)', () => {
    // Spec 0017, AC-022: today is Wednesday, 25.11., 12:00; "Lasagne" on Saturday, 28.11., in the
    // evening reminds "Am Vortag" at 18:00.
    const wednesday = {
      ...base,
      today: '2026-11-25',
      now: new Date('2026-11-25T11:00:00Z'),
    };
    const reminding = entry({
      id: 'lasagne',
      date: '2026-11-28',
      recipeId: 'recipe-lasagne',
      reminder: { offsetDays: 1, at: '18:00' },
    });

    it('AC-022: moved to tonight, the toast adds that the reminder lies in the past', () => {
      expect(
        planMove({
          ...wednesday,
          entry: reminding,
          target: { kind: 'slot', date: '2026-11-25', slotId: 'abend' },
          entries: [reminding],
        }),
      ).toEqual({
        kind: 'move',
        date: '2026-11-25',
        slotId: 'abend',
        message: 'Lasagne → Mi 25.11., Abend · Erinnerung liegt in der Vergangenheit',
      });
    });

    it('AC-021: moved to a later day, the reminder still lies ahead and nothing is added', () => {
      expect(
        planMove({
          ...wednesday,
          entry: reminding,
          target: { kind: 'slot', date: '2026-11-29', slotId: 'mittag' },
          entries: [reminding],
        }),
      ).toMatchObject({ message: 'Lasagne → So 29.11., Mittag' });
    });

    it('AC-022: a reminder later today is not in the past', () => {
      const sameDay = { ...reminding, reminder: { offsetDays: 0, at: '17:00' } };
      expect(
        planMove({
          ...wednesday,
          entry: sameDay,
          target: { kind: 'day', date: '2026-11-25' },
          entries: [sameDay],
        }),
      ).toMatchObject({ message: 'Lasagne → Mi 25.11., Abend' });
    });

    it('AC-023: "Vormerken" clears the reminder and says only "vorgemerkt"', () => {
      expect(
        planMove({
          ...wednesday,
          entry: reminding,
          target: { kind: 'parked' },
          entries: [reminding],
        }),
      ).toMatchObject({ message: 'Lasagne vorgemerkt' });
    });

    it('AC-022: without a reminder nothing is added, even on a past day', () => {
      const plain = { ...reminding, reminder: undefined };
      expect(
        planMove({
          ...wednesday,
          entry: plain,
          target: { kind: 'day', date: '2026-11-24' },
          entries: [plain],
        }),
      ).toMatchObject({ message: 'Lasagne → Di 24.11., Abend' });
    });
  });
});

describe('drag keys: what the calendar registers as sources and targets', () => {
  it('AC-001: a field of the week, a day and "Vorgemerkt" round-trip through their key', () => {
    const targets = [
      { kind: 'slot', date: '2026-11-27', slotId: 'abend' },
      { kind: 'day', date: '2026-11-30' },
      { kind: 'parked' },
    ] as const;
    for (const target of targets) {
      expect(parseMoveTargetKey(moveTargetKey(target))).toEqual(target);
    }
    expect(moveTargetKey({ kind: 'slot', date: '2026-11-27', slotId: 'abend' })).toBe(
      'slot:2026-11-27:abend',
    );
  });

  it('AC-028: an entry and the start day of a trip round-trip through their key', () => {
    expect(parseDragSourceKey(dragSourceKey({ kind: 'entry', entryId: 'lasagne' }))).toEqual({
      kind: 'entry',
      entryId: 'lasagne',
    });
    expect(parseDragSourceKey(dragSourceKey({ kind: 'trip', date: '2026-12-07' }))).toEqual({
      kind: 'trip',
      date: '2026-12-07',
    });
  });

  it('rejects keys that are no source or target of the calendar', () => {
    for (const key of [
      '',
      'week:2026-11-23',
      'day:27.11.',
      'slot:2026-11-27',
      'slot:2026-11-27:',
    ]) {
      expect(parseMoveTargetKey(key)).toBeNull();
    }
    for (const key of ['', 'entry:', 'trip:morgen', 'day:2026-11-27']) {
      expect(parseDragSourceKey(key)).toBeNull();
    }
  });
});

describe('dragTargetText: the label on the dragged entry', () => {
  const slots = [
    { id: 'mittag', name: 'Mittag' },
    { id: 'abend', name: 'Abend' },
  ];

  it('AC-001: a field of the week names day and Tageszeit', () => {
    expect(
      dragTargetText({
        entry: lasagne,
        target: { kind: 'slot', date: '2026-11-27', slotId: 'abend' },
        entries: [lasagne],
        slots,
        title: 'Lasagne',
      }),
    ).toEqual({ allowed: true, label: 'Fr 27.11. · Abend' });
  });

  it('AC-007: a day of the month keeps the Tageszeit of the entry', () => {
    expect(
      dragTargetText({
        entry: lasagne,
        target: { kind: 'day', date: '2026-11-30' },
        entries: [lasagne],
        slots,
        title: 'Lasagne',
      }),
    ).toEqual({ allowed: true, label: 'Mo 30.11. · Abend' });
  });

  it('AC-013: "Vorgemerkt" says "Vormerken"', () => {
    expect(
      dragTargetText({
        entry: lasagne,
        target: { kind: 'parked' },
        entries: [lasagne],
        slots,
        title: 'Lasagne',
      }),
    ).toEqual({ allowed: true, label: 'Vormerken' });
  });

  it('AC-003: the old place is allowed and named as it is', () => {
    expect(
      dragTargetText({
        entry: lasagne,
        target: { kind: 'day', date: '2026-11-25' },
        entries: [lasagne],
        slots,
        title: 'Lasagne',
      }),
    ).toEqual({ allowed: true, label: 'Mi 25.11. · Abend' });
  });

  it('AC-015: a refused target is not allowed and says why', () => {
    expect(
      dragTargetText({
        entry: lasagne,
        target: { kind: 'day', date: '2026-11-28' },
        entries: [lasagne, lasagneLeftovers],
        slots,
        title: 'Lasagne',
      }),
    ).toEqual({ allowed: false, label: 'Reste von Lasagne stehen schon am Fr 27.11.' });
    expect(
      dragTargetText({
        entry: lasagneLeftovers,
        target: { kind: 'day', date: '2026-12-03' },
        entries: [lasagne, lasagneLeftovers],
        slots,
        title: 'Reste von Lasagne',
      }),
    ).toEqual({ allowed: false, label: 'Reste gehen bis sieben Tage nach dem Gericht' });
  });
});
