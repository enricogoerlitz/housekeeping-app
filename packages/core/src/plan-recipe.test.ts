import { describe, expect, it } from 'vitest';

import {
  defaultPlanChoice,
  eatersForDay,
  pagePlanChoice,
  planButtonLabel,
  plannedNotice,
  planWeek,
  weekDays,
  withPlanDay,
} from './plan-recipe';
import { enrico, nadja } from './test-fixtures';
import type { Absence, MealSlot } from './types';

const today = '2026-11-20';
const slots: MealSlot[] = [
  { id: 'slot-abend', name: 'Abend', sort: 3 },
  { id: 'slot-vormittag', name: 'Vormittag', sort: 1 },
  { id: 'slot-mittag', name: 'Mittag', sort: 2 },
];

describe('plan a recipe from its page (REQ-009)', () => {
  it('AC-034: the window opens on this week, today and the last Tageszeit, with everyone', () => {
    expect(planWeek(today, 0)).toEqual({ start: '2026-11-16', label: 'KW 47 · 16.–22. Nov' });
    expect(defaultPlanChoice(today, slots, [enrico, nadja], [])).toEqual({
      date: today,
      slotId: 'slot-abend',
      eaterIds: [enrico.id, nadja.id],
      guests: 0,
      cookId: undefined,
    });
  });

  it('AC-034: the days Mo to So of the shown week', () => {
    expect(weekDays('2026-11-16')).toEqual([
      { date: '2026-11-16', label: 'Mo' },
      { date: '2026-11-17', label: 'Di' },
      { date: '2026-11-18', label: 'Mi' },
      { date: '2026-11-19', label: 'Do' },
      { date: '2026-11-20', label: 'Fr' },
      { date: '2026-11-21', label: 'Sa' },
      { date: '2026-11-22', label: 'So' },
    ]);
  });

  it('AC-034: the button names day and Tageszeit', () => {
    expect(planButtonLabel('2026-11-21', 'Abend')).toBe('Am Sa Abend einplanen');
  });

  it('AC-025 (0018): the notice names weekday, date and Tageszeit', () => {
    expect(plannedNotice('2026-11-25', 'Abend')).toBe('Eingeplant: Mi 25.11., Abend');
    expect(plannedNotice('2027-01-05', 'Mittag')).toBe('Eingeplant: Di 5.1., Mittag');
  });

  it('AC-035: weeks page without limit, forward and back', () => {
    expect(planWeek(today, 1)).toEqual({ start: '2026-11-23', label: 'KW 48 · 23.–29. Nov' });
    expect(planWeek(today, -1).label).toBe('KW 46 · 9.–15. Nov');
    expect(planWeek(today, 6).label).toBe('KW 53 · 28. Dez – 3. Jan');
    expect(planButtonLabel('2026-11-25', 'Mittag')).toBe('Am Mi Mittag einplanen');
  });

  it('AC-036: members absent on the chosen day are not preselected', () => {
    const absences: Absence[] = [
      { id: 'a1', memberId: nadja.id, from: '2026-11-28', to: '2026-11-28' },
    ];
    expect(eatersForDay([enrico, nadja], '2026-11-28', absences)).toEqual([enrico.id]);
    expect(eatersForDay([enrico, nadja], '2026-11-27', absences)).toEqual([enrico.id, nadja.id]);
    expect(eatersForDay([enrico, nadja], null, absences)).toEqual([enrico.id, nadja.id]);
    const household: Absence[] = [{ id: 'a2', from: today, to: today }];
    expect(defaultPlanChoice(today, slots, [enrico, nadja], household).eaterIds).toEqual([]);
  });

  it('AC-037: without a day it is "Vormerken" and "Vorgemerkt"', () => {
    expect(planButtonLabel(null, 'Abend')).toBe('Vormerken');
    expect(plannedNotice(null, 'Abend')).toBe('Vorgemerkt');
  });

  it('AC-036: another day sets "Wer isst mit?" back to those present; guests, slot and cook stay', () => {
    const absences: Absence[] = [
      { id: 'a1', memberId: nadja.id, from: '2026-11-28', to: '2026-11-28' },
    ];
    const choice = {
      ...defaultPlanChoice(today, slots, [enrico, nadja], absences),
      eaterIds: [nadja.id],
      guests: 2,
      cookId: enrico.id,
      slotId: 'slot-mittag',
    };
    expect(withPlanDay(choice, '2026-11-28', [enrico, nadja], absences)).toEqual({
      date: '2026-11-28',
      slotId: 'slot-mittag',
      eaterIds: [enrico.id],
      guests: 2,
      cookId: enrico.id,
    });
    // "Ohne Tag vormerken": nobody is absent without a day.
    expect(withPlanDay(choice, null, [enrico, nadja], absences).eaterIds).toEqual([
      enrico.id,
      nadja.id,
    ]);
  });

  it('AC-035: paging moves the chosen day by whole weeks, so it stays in the shown week', () => {
    const absences: Absence[] = [
      { id: 'a1', memberId: nadja.id, from: '2026-11-27', to: '2026-11-27' },
    ];
    const choice = defaultPlanChoice(today, slots, [enrico, nadja], absences);
    const next = pagePlanChoice(choice, 1, [enrico, nadja], absences);
    expect(next.date).toBe('2026-11-27');
    expect(next.eaterIds).toEqual([enrico.id]);
    expect(pagePlanChoice(choice, -2, [enrico, nadja], absences).date).toBe('2026-11-06');
    // Without a day ("Vormerken") paging changes nothing.
    const later = withPlanDay(choice, null, [enrico, nadja], absences);
    expect(pagePlanChoice(later, 1, [enrico, nadja], absences)).toBe(later);
  });

  it('a household without Tageszeiten has no slot to preselect', () => {
    expect(defaultPlanChoice(today, [], [enrico], []).slotId).toBeUndefined();
  });
});
