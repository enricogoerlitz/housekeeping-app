import { describe, expect, it } from 'vitest';

import type { AbsenceStripe } from './absences';
import {
  dateRangeLabel,
  dayA11yLabel,
  dayKinds,
  dayMonthLabel,
  dayMonthLongLabel,
  daySheetContent,
  dragRange,
  entryKindRole,
  entryLineLabel,
  formatPickerDate,
  monthGrid,
  monthPickerStart,
  monthTitle,
  overflow,
  periodContains,
  periodStart,
  rangeLabel,
  shiftPeriod,
  switchView,
  weekRangeLabel,
  yearMonths,
} from './calendar';
import { collectionEntryLabel } from './collections';
import {
  grillabend,
  grillabendRecipes,
  grillRecipesById,
  kartoffelsalat,
  makeCollection,
} from './test-fixtures';
import type { MealPlanEntry, MealSlot } from './types';

// Today in the spec's examples: Friday, 20 November 2026 (KW 47).
const today = '2026-11-20';

function entry(kind: MealPlanEntry['kind']): MealPlanEntry {
  return {
    id: kind,
    date: today,
    slotId: 'abend',
    kind,
    eaterIds: [],
    guests: 0,
    portions: 1,
    variants: [],
    sort: 0,
  };
}

describe('week labels and paging', () => {
  it('AC-005: "KW 47 · 16.–22. Nov", one step forward and two back', () => {
    const week = periodStart('week', today);
    expect(week).toBe('2026-11-16');
    expect(weekRangeLabel(week)).toBe('KW 47 · 16.–22. Nov');
    expect(weekRangeLabel(shiftPeriod('week', week, 1))).toBe('KW 48 · 23.–29. Nov');
    expect(weekRangeLabel(shiftPeriod('week', week, -1))).toBe('KW 46 · 9.–15. Nov');
  });

  it('AC-006: KW 53 runs over the turn of the year, the next week is KW 1 of 2027', () => {
    expect(weekRangeLabel('2026-12-28')).toBe('KW 53 · 28. Dez – 3. Jan');
    const next = shiftPeriod('week', '2026-12-28', 1);
    expect(next).toBe('2027-01-04');
    expect(weekRangeLabel(next)).toBe('KW 1 · 4.–10. Jan');
  });

  it('names a week across two months with both months', () => {
    expect(weekRangeLabel('2026-11-30')).toBe('KW 49 · 30. Nov – 6. Dez');
  });
});

describe('month grid', () => {
  it('AC-011: January 2027 starts on Monday, 28 December, and ends on Sunday, 31 January', () => {
    const grid = monthGrid('2027-01-15');
    expect(grid[0]?.[0]).toBe('2026-12-28');
    expect(grid[0]?.[4]).toBe('2027-01-01');
    expect(grid[grid.length - 1]?.[6]).toBe('2027-01-31');
    expect(grid).toHaveLength(5);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it('February 2021 fills exactly four weeks; a month starting on Sunday needs six', () => {
    expect(monthGrid('2021-02-01')).toHaveLength(4);
    expect(monthGrid('2026-11-01')).toHaveLength(6);
    expect(monthGrid('2026-11-01')[0]?.[0]).toBe('2026-10-26');
  });

  it('pages months and years without a limit and names them', () => {
    expect(monthTitle(periodStart('month', today))).toBe('November 2026');
    expect(shiftPeriod('month', '2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftPeriod('month', '2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftPeriod('year', '2027-01-01', -3)).toBe('2024-01-01');
    expect(yearMonths(2027)).toEqual([
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
      '2027-07-01',
      '2027-08-01',
      '2027-09-01',
      '2027-10-01',
      '2027-11-01',
      '2027-12-01',
    ]);
  });
});

describe('switching the view', () => {
  it('AC-014: week → month shows the month that holds most days of the week', () => {
    expect(switchView('week', 'month', '2026-11-30', today)).toBe('2026-12-01');
    expect(switchView('week', 'month', '2026-12-28', today)).toBe('2026-12-01');
    expect(switchView('week', 'month', '2027-01-25', today)).toBe('2027-01-01');
  });

  it('AC-014: month → week shows the week with today, else the week with the first', () => {
    expect(switchView('month', 'week', '2027-01-01', today)).toBe('2026-12-28');
    expect(switchView('month', 'week', '2026-11-01', today)).toBe('2026-11-16');
  });

  it('month → year shows its year; year → month the month with today or January', () => {
    expect(switchView('month', 'year', '2027-03-01', today)).toBe('2027-01-01');
    expect(switchView('year', 'month', '2026-01-01', today)).toBe('2026-11-01');
    expect(switchView('year', 'month', '2027-01-01', today)).toBe('2027-01-01');
    expect(switchView('year', 'week', '2026-01-01', today)).toBe('2026-11-16');
    expect(switchView('week', 'year', '2026-12-28', today)).toBe('2026-01-01');
  });

  it('"Heute" leads to the period with today in every view', () => {
    expect(periodContains('week', '2026-11-16', today)).toBe(true);
    expect(periodContains('week', '2026-11-23', today)).toBe(false);
    expect(periodContains('month', '2026-11-01', today)).toBe(true);
    expect(periodContains('year', '2027-01-01', today)).toBe(false);
    expect(periodStart('year', today)).toBe('2026-01-01');
  });
});

describe('kinds and dots', () => {
  it('AC-009: free text and leftovers count as recipes', () => {
    expect(entryKindRole(entry('recipe'), {})).toBe('recipe');
    expect(entryKindRole(entry('text'), {})).toBe('recipe');
    expect(entryKindRole(entry('leftovers'), {})).toBe('recipe');
    expect(entryKindRole(entry('restaurant'), {})).toBe('restaurant');
    expect(entryKindRole(entry('activity'), {})).toBe('activity');
  });

  it('AC-011: one dot per kind, activity before recipe', () => {
    expect(dayKinds(['recipe', 'activity', 'recipe'])).toEqual(['activity', 'recipe']);
  });

  it('AC-013: at most three dots: activity, recipe, restaurant before the chore', () => {
    expect(dayKinds(['chore', 'restaurant', 'recipe', 'activity'])).toEqual([
      'activity',
      'recipe',
      'restaurant',
    ]);
    expect(dayKinds([])).toEqual([]);
  });
});

describe('"+n weitere"', () => {
  it('AC-012: five entries show three and "+2 weitere"', () => {
    expect(overflow(['a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['a', 'b', 'c'], more: 2 });
  });

  it('AC-013: exactly three entries show all three and nothing more', () => {
    expect(overflow(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], more: 0 });
    expect(overflow([])).toEqual({ shown: [], more: 0 });
  });
});

describe('date labels', () => {
  it('AC-008, AC-011, AC-021: day heads and the add window title', () => {
    expect(dayMonthLabel('2026-11-16')).toBe('Mo 16. Nov');
    expect(dayMonthLabel('2027-01-02')).toBe('Sa 2. Jan');
    expect(dayMonthLongLabel('2027-01-01')).toBe('Fr 1. Januar');
  });

  it('AC-015: ranges within a month, across months and of one day', () => {
    expect(dateRangeLabel('2027-01-01', '2027-01-04')).toBe('1.–4. Jan');
    expect(dateRangeLabel('2027-08-09', '2027-08-23')).toBe('9.–23. Aug');
    expect(dateRangeLabel('2026-12-28', '2027-01-03')).toBe('28. Dez – 3. Jan');
    expect(dateRangeLabel('2027-01-01', '2027-01-01')).toBe('1. Jan');
  });

  it('AC-042: the date fields show weekday and full date', () => {
    expect(formatPickerDate('2027-01-01')).toBe('Fr 1.1.2027');
    expect(formatPickerDate('2026-12-28')).toBe('Mo 28.12.2026');
  });
});

describe('Sammlungen in the calendar (spec 0009, REQ-007)', () => {
  const recipesById = { [grillabend.id]: grillabend, [kartoffelsalat.id]: kartoffelsalat };

  it('AC-022: an entry of a collection has the role "Sammlung", a recipe stays "Rezept"', () => {
    expect(entryKindRole({ ...entry('recipe'), recipeId: grillabend.id }, recipesById)).toBe(
      'collection',
    );
    expect(entryKindRole({ ...entry('recipe'), recipeId: kartoffelsalat.id }, recipesById)).toBe(
      'recipe',
    );
    expect(entryKindRole({ ...entry('recipe'), recipeId: 'rec-gone' }, recipesById)).toBe('recipe');
  });

  it('AC-022, AC-024: the row reads "Grillabend · 2 Rezepte", without recipes no count', () => {
    expect(collectionEntryLabel('Grillabend', 2)).toBe('Grillabend · 2 Rezepte');
    expect(collectionEntryLabel('Sommerfest', 0)).toBe('Sommerfest');
  });

  it('AC-022, AC-024: entryLineLabel counts the recipes of a planned collection', () => {
    const sommerfest = makeCollection({ id: 'col-sommerfest', title: 'Sommerfest' });
    const book = {
      recipesById: { ...grillRecipesById, [sommerfest.id]: sommerfest },
      collectionRecipes: grillabendRecipes,
    };
    const planned = (recipeId: string) => ({ ...entry('recipe'), recipeId });
    expect(entryLineLabel(planned(grillabend.id), 'Grillabend', book)).toBe(
      'Grillabend · 2 Rezepte',
    );
    expect(entryLineLabel(planned(sommerfest.id), 'Sommerfest', book)).toBe('Sommerfest');
    expect(entryLineLabel(planned(kartoffelsalat.id), 'Kartoffelsalat', book)).toBe(
      'Kartoffelsalat',
    );
    // Leftovers of a collection and free text stay their title.
    expect(
      entryLineLabel({ ...entry('leftovers'), recipeId: grillabend.id }, 'Reste von Samstag', book),
    ).toBe('Reste von Samstag');
    expect(entryLineLabel(entry('text'), 'Essen bei Oma', book)).toBe('Essen bei Oma');
  });

  it('AC-022: leftovers that point at a collection are no collection', () => {
    expect(entryKindRole({ ...entry('leftovers'), recipeId: grillabend.id }, recipesById)).toBe(
      'recipe',
    );
  });
});

// Spec 0016: today is Sunday, 22 November 2026.
describe('spec 0016: day window, range drag and changing the view', () => {
  const today0016 = '2026-11-22';
  const slots: MealSlot[] = [
    { id: 'abend', name: 'Abend', sort: 2 },
    { id: 'vormittag', name: 'Vormittag', sort: 0 },
    { id: 'mittag', name: 'Mittag', sort: 1 },
  ];
  const planned = (
    id: string,
    kind: MealPlanEntry['kind'],
    date: string | null,
    slotId: string,
    sort = 0,
  ): MealPlanEntry => ({ ...entry(kind), id, date, slotId, sort });
  const bouldern = planned('bouldern', 'activity', '2026-11-27', 'vormittag');
  const lasagne = planned('lasagne', 'recipe', '2026-11-27', 'abend');
  const trattoria = planned('trattoria', 'restaurant', '2026-11-27', 'abend');
  const dal = planned('dal', 'recipe', '2026-11-27', 'abend', 1);
  const elsewhere = planned('elsewhere', 'recipe', '2026-11-28', 'abend');
  const parked = planned('parked', 'recipe', null, 'abend');
  const hamburg: AbsenceStripe = {
    key: 'm|2026-11-27|2026-11-29|Hamburg',
    absenceIds: ['a1'],
    memberIds: ['nadja'],
    household: false,
    from: '2026-11-27',
    to: '2026-11-29',
    note: 'Hamburg',
  };

  it('AC-022: the day window shows the day, its week, its trips and every Tageszeit', () => {
    const content = daySheetContent({
      date: '2026-11-27',
      entries: [trattoria, dal, lasagne, bouldern, elsewhere, parked],
      slots,
      stripes: [hamburg],
    });
    expect(content.title).toBe('Fr 27. November');
    expect(content.week).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    expect(content.stripes).toEqual([hamburg]);
    expect(content.slots.map((group) => group.slot.name)).toEqual(['Vormittag', 'Mittag', 'Abend']);
    expect(content.slots.map((group) => group.entries.map((item) => item.id))).toEqual([
      ['bouldern'],
      [],
      ['lasagne', 'dal', 'trattoria'],
    ]);
    expect(content.empty).toBe(false);
  });

  it('AC-026: an empty day says "Noch nichts geplant" and still lists every Tageszeit', () => {
    const content = daySheetContent({
      date: '2026-12-01',
      entries: [lasagne, parked],
      slots,
      stripes: [hamburg],
    });
    expect(content.empty).toBe(true);
    expect(content.emptyText).toBe('Noch nichts geplant');
    expect(content.stripes).toEqual([]);
    expect(content.slots.map((group) => [group.slot.id, group.entries.length])).toEqual([
      ['vormittag', 0],
      ['mittag', 0],
      ['abend', 0],
    ]);
  });

  it('AC-028: a drag from the 7th to the 11th December covers five days', () => {
    const range = dragRange('2026-12-07', '2026-12-11');
    expect(range).toEqual({ from: '2026-12-07', to: '2026-12-11' });
    expect(rangeLabel(range.from, range.to)).toBe('Mo 7.12. – Fr 11.12. · 5 Tage');
  });

  it('AC-029: backwards and over the end of a month', () => {
    const back = dragRange('2027-01-04', '2027-01-01', 2027);
    expect(back).toEqual({ from: '2027-01-01', to: '2027-01-04' });
    expect(rangeLabel(back.from, back.to)).toBe('Fr 1.1. – Mo 4.1. · 4 Tage');
    expect(dragRange('2027-01-29', '2027-02-02', 2027)).toEqual({
      from: '2027-01-29',
      to: '2027-02-02',
    });
  });

  it('AC-029: in the year view the drag ends at the edge of the year', () => {
    expect(dragRange('2027-12-30', '2028-01-03', 2027)).toEqual({
      from: '2027-12-30',
      to: '2027-12-31',
    });
    expect(dragRange('2027-01-02', '2026-12-28', 2027)).toEqual({
      from: '2027-01-01',
      to: '2027-01-02',
    });
    // Without a year (month view) the range runs on into the next year.
    expect(dragRange('2026-12-30', '2027-01-02')).toEqual({ from: '2026-12-30', to: '2027-01-02' });
  });

  it('AC-028: a single day is "1 Tag"', () => {
    expect(dragRange('2026-12-07', '2026-12-07')).toEqual({ from: '2026-12-07', to: '2026-12-07' });
    expect(rangeLabel('2026-12-07', '2026-12-07')).toBe('Mo 7.12. · 1 Tag');
  });

  it('AC-027: with a chosen day, month and week show that day', () => {
    expect(switchView('year', 'month', '2027-01-01', today0016, '2027-01-08')).toBe('2027-01-01');
    expect(switchView('month', 'week', '2027-01-01', today0016, '2027-01-08')).toBe('2027-01-04');
    expect(switchView('month', 'year', '2027-01-01', today0016, '2027-01-08')).toBe('2027-01-01');
    // Without a chosen day the rules of spec 0010 stay.
    expect(switchView('year', 'month', '2027-01-01', today0016)).toBe('2027-01-01');
    expect(switchView('year', 'month', '2026-01-01', today0016)).toBe('2026-11-01');
  });

  it('AC-019: "Anderes Datum …" starts with the month of the entry, a parked one with today', () => {
    expect(monthPickerStart('2026-11-25', today0016)).toBe('2026-11-01');
    expect(monthPickerStart('2027-01-08', today0016)).toBe('2027-01-01');
    expect(monthPickerStart(null, '2027-02-10')).toBe('2027-02-01');
  });

  it('platforms: a day of the year reads "Freitag, 27. November: 1 Aktivität, 1 Rezept, Nadja unterwegs"', () => {
    expect(dayA11yLabel('2026-11-27', ['activity', 'recipe'], ['Nadja'])).toBe(
      'Freitag, 27. November: 1 Aktivität, 1 Rezept, Nadja unterwegs',
    );
    expect(dayA11yLabel('2026-11-27', ['recipe', 'recipe', 'chore'], ['Enrico', 'Nadja'])).toBe(
      'Freitag, 27. November: 2 Rezepte, 1 Aufgabe, Enrico und Nadja unterwegs',
    );
    expect(dayA11yLabel('2026-12-01', [], [])).toBe('Dienstag, 1. Dezember');
  });
});
