import { relativeDayLabel, type ChoreEvent, type ISODate } from '@housekeeping/core';

/** One history line, e.g. "Fenster geputzt · spontan · Enrico · heute" (AC-035, AC-037). */
export function historyLine(event: ChoreEvent, memberName: string, today: ISODate): string {
  const day = relativeDayLabel(event.doneOn, today);
  switch (event.kind) {
    case 'done':
      return `${event.title} · ${memberName} · ${day}`;
    case 'skipped':
      return `${event.title} · übersprungen · ${memberName} · ${day}`;
    case 'spontaneous':
      return `${event.title} · spontan · ${memberName} · ${day}`;
  }
}

/** Calm wording for overdue chores: never red, never "überfällig". */
export function overdueLabel(days: number): string {
  return days === 1 ? 'fällig seit gestern' : `fällig seit ${days} Tagen`;
}

export function effortLabel(effort: number): string {
  return effort === 1 ? '1 Punkt' : `${effort} Punkte`;
}
