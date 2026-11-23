import {
  assignmentLabel,
  choreDayLabel,
  choreTurnText,
  recurrenceLabel,
  type Chore,
  type ChoreAway,
  type ChoreEvent,
  type ISODate,
} from '@housekeeping/core';
import type { IconName } from '@housekeeping/ui';

function effortLabel(effort: number): string {
  return effort === 1 ? '1 Punkt' : `${effort} Punkte`;
}

/** "Fr 27.11.", in another year "Mi 20.1.2027" (spec 0026, AC-019). */
export function dayWithDate(iso: ISODate, today: ISODate): string {
  return choreDayLabel(iso, today);
}

/**
 * The first line of an opened chore: "wöchentlich Fr · Enrico · 2 Punkte" (AC-049); alternating
 * with whose turn it is, standing in for someone away: "abwechselnd, dran: Nadja (für Enrico,
 * unterwegs)" (spec 0026, AC-045).
 */
export function choreFacts(chore: Chore, today: ISODate, away: ChoreAway): string {
  const assignment = assignmentLabel(chore.assignment, [...away.members]);
  const turn = choreTurnText(chore, today, away);
  return [
    recurrenceLabel(chore.recurrence),
    turn ? `${assignment}, ${turn}` : assignment,
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
