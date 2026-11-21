import { describe, expect, it } from 'vitest';

import { historyGroups } from './chore-history';
import { enrico } from './test-fixtures';
import type { ChoreEvent } from './types';

const today = '2026-11-20';

function event(id: string, doneOn: string, partial: Partial<ChoreEvent> = {}): ChoreEvent {
  return {
    id,
    choreId: 'c',
    title: 'Bad putzen',
    kind: 'done',
    doneOn,
    doneBy: enrico.id,
    ...partial,
  };
}

const events = [
  event('mo16', '2026-11-16'),
  event('fr20', '2026-11-20'),
  event('so01', '2026-11-01'),
  event('mi18', '2026-11-18'),
  event('fr30', '2026-10-30'),
  event('so15', '2026-11-15'),
];

const outline = (months: ReturnType<typeof historyGroups>) =>
  months.flatMap((month) => [
    ...(month.yearDivider ? [`[${month.yearDivider}]`] : []),
    month.title,
    ...month.weeks.map((week) => `${week.title} (${week.rows.length})`),
  ]);

describe('REQ-010: the history by month and week', () => {
  it('AC-056: months, weeks cut to the month, no empty weeks', () => {
    expect(outline(historyGroups(events, today))).toEqual([
      'November 2026',
      'KW 47 · 16.–22. Nov (3)',
      'KW 46 · 9.–15. Nov (1)',
      'KW 44 · 1. Nov (1)',
      'Oktober 2026',
      'KW 44 · 26.–31. Okt (1)',
    ]);
  });

  it('AC-057: a year divider only before another year', () => {
    const months = historyGroups([...events, event('dez25', '2025-12-12')], today);
    expect(outline(months).slice(-3)).toEqual([
      '[2025]',
      'Dezember 2025',
      'KW 50 · 8.–14. Dez (1)',
    ]);
    expect(months.filter((month) => month.yearDivider !== undefined)).toHaveLength(1);
  });

  it('AC-057: the divider stands once per other year, before its newest month', () => {
    const months = historyGroups(
      [event('a', '2025-12-12'), event('b', '2025-11-03'), event('c', '2024-06-01')],
      today,
    );
    expect(outline(months)).toEqual([
      '[2025]',
      'Dezember 2025',
      'KW 50 · 8.–14. Dez (1)',
      'November 2025',
      'KW 45 · 3.–9. Nov (1)',
      '[2024]',
      'Juni 2024',
      'KW 22 · 1.–2. Jun (1)',
    ]);
  });

  it('AC-058: rows newest first with the day "Fr 20."', () => {
    const [november] = historyGroups(events, today);
    const rows = november?.weeks[0]?.rows ?? [];
    expect(rows.map((row) => [row.event.id, row.dayLabel])).toEqual([
      ['fr20', 'Fr 20.'],
      ['mi18', 'Mi 18.'],
      ['mo16', 'Mo 16.'],
    ]);
  });

  it('the same day: the later booking first; stable keys for months and weeks', () => {
    const sameDay = [
      event('early', today, { createdAt: '2026-11-20T08:00:00.000Z' }),
      event('late', today, { createdAt: '2026-11-20T18:00:00.000Z' }),
    ];
    const [november] = historyGroups(sameDay, today);
    expect(november?.key).toBe('2026-11');
    expect(november?.weeks[0]?.key).toBe('2026-11-16');
    expect(november?.weeks[0]?.rows.map((row) => row.event.id)).toEqual(['late', 'early']);
  });

  it('AC-061: no entries, no groups', () => {
    expect(historyGroups([], today)).toEqual([]);
  });
});
