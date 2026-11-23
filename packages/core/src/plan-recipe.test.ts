import { describe, expect, it } from 'vitest';

import {
  defaultPlanChoice,
  eatersForDay,
  pagePlanChoice,
  planButtonLabel,
  refreshPlanEaters,
  plannedNotice,
  addedNotice,
  planWeek,
  weekDays,
  weekOffsetFor,
  withPlanDay,
} from './plan-recipe';
import { enrico, nadja } from './test-fixtures';
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
    expect(defaultPlanChoice(today, slots, [enrico, nadja])).toEqual({
      date: today,
      slotId: 'slot-abend',
      eaterIds: [enrico.id, nadja.id],
      guests: 0,
      cookId: undefined,
    });
  });

  it('AC-034, spec 0023 AC-053: the days Mo to So of the shown week, with their date', () => {
    expect(weekDays('2026-11-16')).toEqual([
      { date: '2026-11-16', label: 'Mo', detail: '16.11.' },
      { date: '2026-11-17', label: 'Di', detail: '17.11.' },
      { date: '2026-11-18', label: 'Mi', detail: '18.11.' },
      { date: '2026-11-19', label: 'Do', detail: '19.11.' },
      { date: '2026-11-20', label: 'Fr', detail: '20.11.' },
      { date: '2026-11-21', label: 'Sa', detail: '21.11.' },
      { date: '2026-11-22', label: 'So', detail: '22.11.' },
    ]);
  });

  it('AC-034: the button names day and Tageszeit', () => {
    expect(planButtonLabel('2026-11-21', 'Abend')).toBe('Am Sa 21.11. Abend einplanen');
  });

  it('AC-025 (0018): the notice names weekday, date and Tageszeit', () => {
    expect(plannedNotice('2026-11-25', 'Abend', '2026-11-22')).toBe('Eingeplant: Mi 25.11., Abend');
  });

  it('AC-018 (0024): in another year the notice names the year', () => {
    expect(plannedNotice('2027-01-15', 'Mittag', '2026-11-22')).toBe(
      'Eingeplant: Fr 15.1.2027, Mittag',
    );
  });

  it('AC-021 (0024): an activity opens on the first Tageszeit', () => {
    const vormittag = { id: 'vormittag', name: 'Vormittag', sort: 0 };
    const abend = { id: 'abend', name: 'Abend', sort: 2 };
    expect(defaultPlanChoice(today, [abend, vormittag], [], 'first').slotId).toBe('vormittag');
    expect(defaultPlanChoice(today, [abend, vormittag], []).slotId).toBe('abend');
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
    expect(planButtonLabel('2026-11-25', 'Mittag')).toBe('Am Mi 25.11. Mittag einplanen');
  });

  it('AC-027 (0030): a trip never changes who is preselected, with or without a day', () => {
    expect(eatersForDay([enrico, nadja])).toEqual([enrico.id, nadja.id]);
    expect(defaultPlanChoice(today, slots, [enrico, nadja]).eaterIds).toEqual([
      enrico.id,
      nadja.id,
    ]);
  });

  it('AC-037: without a day it is "Vormerken" and "Vorgemerkt"', () => {
    expect(planButtonLabel(null, 'Abend')).toBe('Vormerken');
    expect(plannedNotice(null, 'Abend', '2026-11-22')).toBe('Vorgemerkt');
  });

  it('AC-036, AC-027 (0030): another day sets "Wer isst mit?" back to everyone; guests, slot and cook stay', () => {
    const choice = {
      ...defaultPlanChoice(today, slots, [enrico, nadja]),
      eaterIds: [nadja.id],
      guests: 2,
      cookId: enrico.id,
      slotId: 'slot-mittag',
    };
    expect(withPlanDay(choice, '2026-11-28', [enrico, nadja])).toEqual({
      date: '2026-11-28',
      slotId: 'slot-mittag',
      eaterIds: [enrico.id, nadja.id],
      guests: 2,
      cookId: enrico.id,
    });
    expect(withPlanDay(choice, null, [enrico, nadja]).eaterIds).toEqual([enrico.id, nadja.id]);
  });

  it('AC-035: paging moves the chosen day by whole weeks, so it stays in the shown week', () => {
    const choice = defaultPlanChoice(today, slots, [enrico, nadja]);
    const next = pagePlanChoice(choice, 1, [enrico, nadja]);
    expect(next.date).toBe('2026-11-27');
    expect(next.eaterIds).toEqual([enrico.id, nadja.id]);
    expect(pagePlanChoice(choice, -2, [enrico, nadja]).date).toBe('2026-11-06');
    // Without a day ("Vormerken") paging changes nothing.
    const later = withPlanDay(choice, null, [enrico, nadja]);
    expect(pagePlanChoice(later, 1, [enrico, nadja])).toBe(later);
  });

  it('a household without Tageszeiten has no slot to preselect', () => {
    expect(defaultPlanChoice(today, [], [enrico]).slotId).toBeUndefined();
  });
});

describe('spec 0023 REQ-013: the plan window', () => {
  it('AC-053: on Sunday 22.11. the week 47 with "So 22.11." and its button', () => {
    expect(planWeek('2026-11-22', 0).label).toBe('KW 47 · 16.–22. Nov');
    expect(planButtonLabel('2026-11-22', 'Abend')).toBe('Am So 22.11. Abend einplanen');
  });

  it('AC-054: "Anderes Datum …" 14.2.2027 shows its week', () => {
    const offset = weekOffsetFor('2026-11-22', '2027-02-14');
    expect(planWeek('2026-11-22', offset).label).toBe('KW 6 · 8.–14. Feb');
    expect(planButtonLabel('2027-02-14', 'Abend')).toBe('Am So 14.2. Abend einplanen');
    expect(weekOffsetFor('2026-11-22', '2026-11-16')).toBe(0);
    expect(weekOffsetFor('2026-11-22', '2026-11-15')).toBe(-1);
  });

  it('AC-055: members arriving after the window opened are chosen while untouched', () => {
    const opened = defaultPlanChoice(today, slots, []);
    expect(opened.eaterIds).toEqual([]);
    const later = refreshPlanEaters(opened, false, [enrico, nadja]);
    expect(later.eaterIds).toEqual([enrico.id, nadja.id]);
  });

  it('AC-056: a choice made by hand stays when members change', () => {
    const chosen = {
      ...defaultPlanChoice(today, slots, [enrico, nadja]),
      eaterIds: [enrico.id],
    };
    expect(refreshPlanEaters(chosen, true, [enrico, nadja])).toBe(chosen);
  });

  it('returns the same choice when nothing changes', () => {
    const choice = defaultPlanChoice(today, slots, [enrico, nadja]);
    expect(refreshPlanEaters(choice, false, [enrico, nadja])).toBe(choice);
  });
});
