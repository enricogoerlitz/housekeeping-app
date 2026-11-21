import {
  assignmentLabel,
  formatShortDate,
  recurrenceLabel,
  weekdayShort,
  type Chore,
  type ChoreEvent,
  type ISODate,
  type Member,
} from '@housekeeping/core';
import type { IconName } from '@housekeeping/ui';

/** Calm wording for overdue chores: never red, never "überfällig". */
export function overdueLabel(days: number): string {
  return days === 1 ? 'fällig seit gestern' : `fällig seit ${days} Tagen`;
}

export function effortLabel(effort: number): string {
  return effort === 1 ? '1 Punkt' : `${effort} Punkte`;
}

/** "Fr 27.11." */
export function dayWithDate(iso: ISODate): string {
  return `${weekdayShort(iso)} ${formatShortDate(iso)}`;
}

/** The first line of an opened chore: "wöchentlich Fr · Enrico · 2 Punkte" (AC-049). */
export function choreFacts(chore: Chore, members: Member[]): string {
  const next = members.find((member) => member.id === chore.nextAssigneeId);
  const assignment = assignmentLabel(chore.assignment, members);
  return [
    recurrenceLabel(chore.recurrence),
    // Alternating: whose turn it is (AC-040, AC-059).
    chore.assignment.type === 'rotating' && next ? `${assignment}, dran: ${next.name}` : assignment,
    effortLabel(chore.effort),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The symbol of a history entry (AC-058): done or skipped. */
export function eventIcon(event: ChoreEvent): IconName {
  return event.kind === 'skipped' ? 'arrow-right' : 'check';
}

/** "erledigt" or "übersprungen", for screen readers and the entry's window. */
export function eventKindLabel(event: ChoreEvent): string {
  return event.kind === 'skipped' ? 'übersprungen' : 'erledigt';
}

/** What the screen reader says after a tap on a chore's check box (spec 0011, Plattformen). */
export function checkAnnouncement(chore: Chore, checked: boolean): string {
  return checked ? `${chore.title} abgehakt` : 'Haken entfernt';
}
