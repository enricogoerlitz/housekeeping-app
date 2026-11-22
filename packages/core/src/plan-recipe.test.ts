import { describe, expect, it } from 'vitest';

import {
  defaultPlanChoice,
  eatersForDay,
  pagePlanChoice,
  planButtonLabel,
  plannedNotice,
  addedNotice,
  planWeek,
  weekDays,
  withPlanDay,
} from './plan-recipe';
import { enrico, nadja, trip } from './test-fixtures';
import type { MealSlot } from './types';

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

  it('spec 0016: the notice after adding names the date, with the year when it is not this one', () => {
    expect(addedNotice('Lasagne', '2026-11-28', '2026-11-22')).toBe('„Lasagne“ steht am Sa 28.11.');
    expect(addedNotice('Lasagne', '2027-01-16', '2026-11-22')).toBe(
      '„Lasagne“ steht am Sa 16.1.2027',
    );
    expect(addedNotice('Shakshuka', null, '2026-11-22')).toBe('„Shakshuka“ ist vorgemerkt');
  });

  it('AC-035: weeks page without limit, forward and back', () => {
    expect(planWeek(today, 1)).toEqual({ start: '2026-11-23', label: 'KW 48 · 23.–29. Nov' });
    expect(planWeek(today, -1).label).toBe('KW 46 · 9.–15. Nov');
    expect(planWeek(today, 6).label).toBe('KW 53 · 28. Dez – 3. Jan');
    expect(planButtonLabel('2026-11-25', 'Mittag')).toBe('Am Mi Mittag einplanen');
  });

  it('AC-036: members travelling on the chosen day are not preselected', () => {
    const trips = [trip('a1', [nadja.id], '2026-11-28', '2026-11-28')];
    expect(eatersForDay([enrico, nadja], '2026-11-28', trips)).toEqual([enrico.id]);
    expect(eatersForDay([enrico, nadja], '2026-11-27', trips)).toEqual([enrico.id, nadja.id]);
    expect(eatersForDay([enrico, nadja], null, trips)).toEqual([enrico.id, nadja.id]);
    const household = [trip('a2', [enrico.id, nadja.id], today, today)];
    expect(defaultPlanChoice(today, slots, [enrico, nadja], household).eaterIds).toEqual([]);
  });

  it('AC-037: without a day it is "Vormerken" and "Vorgemerkt"', () => {
    expect(planButtonLabel(null, 'Abend')).toBe('Vormerken');
    expect(plannedNotice(null, 'Abend')).toBe('Vorgemerkt');
  });

  it('AC-036: another day sets "Wer isst mit?" back to those present; guests, slot and cook stay', () => {
    const trips = [trip('a1', [nadja.id], '2026-11-28', '2026-11-28')];
    const choice = {
      ...defaultPlanChoice(today, slots, [enrico, nadja], trips),
      eaterIds: [nadja.id],
      guests: 2,
      cookId: enrico.id,
      slotId: 'slot-mittag',
    };
    expect(withPlanDay(choice, '2026-11-28', [enrico, nadja], trips)).toEqual({
      date: '2026-11-28',
      slotId: 'slot-mittag',
      eaterIds: [enrico.id],
      guests: 2,
      cookId: enrico.id,
    });
    // "Ohne Tag vormerken": nobody travels without a day.
    expect(withPlanDay(choice, null, [enrico, nadja], trips).eaterIds).toEqual([
      enrico.id,
      nadja.id,
    ]);
  });

  it('AC-035: paging moves the chosen day by whole weeks, so it stays in the shown week', () => {
    const trips = [trip('a1', [nadja.id], '2026-11-27', '2026-11-27')];
    const choice = defaultPlanChoice(today, slots, [enrico, nadja], trips);
    const next = pagePlanChoice(choice, 1, [enrico, nadja], trips);
    expect(next.date).toBe('2026-11-27');
    expect(next.eaterIds).toEqual([enrico.id]);
    expect(pagePlanChoice(choice, -2, [enrico, nadja], trips).date).toBe('2026-11-06');
    // Without a day ("Vormerken") paging changes nothing.
    const later = withPlanDay(choice, null, [enrico, nadja], trips);
    expect(pagePlanChoice(later, 1, [enrico, nadja], trips)).toBe(later);
  });

  it('a household without Tageszeiten has no slot to preselect', () => {
    expect(defaultPlanChoice(today, [], [enrico], []).slotId).toBeUndefined();
  });
});
