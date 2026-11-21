import { validateChoreDraft, seasonMonths, type ChoreDraftErrors } from './chores';
import { parseISODate } from './dates';
import type { Assignment, Chore, Id, ISODate, Member, Recurrence } from './types';

// The chore form (spec 0011, REQ-009): one form for „Neue Aufgabe“ and „Bearbeiten“, its rhythm
// and assignment parts also under „Mehr Angaben“ in „Was hast du erledigt?“. Here: the form's
// state and how it maps to a chore and back.

export type ChoreRhythm = 'once' | 'weekly' | 'monthly' | 'months' | 'flexible' | 'asNeeded';
export type ChoreEffortChoice = '1' | '2' | '3';

/** A part of the form that, untouched, keeps the stored value of the chore. */
export type ChoreDraftPart = 'rhythm' | 'assignment' | 'season';

export interface ChoreDraft {
  title: string;
  room: string;
  rhythm: ChoreRhythm;
  onceDate?: ISODate;
  weekdays: number[];
  everyWeeks: number;
  monthDay: number;
  everyMonths: number;
  everyDays: number;
  assignment: Assignment['type'];
  fixedMemberId: Id;
  effort: ChoreEffortChoice;
  seasonOn: boolean;
  /** Months 1–12, both inclusive; `to` before `from` runs across the turn of the year. */
  seasonFrom: number;
  seasonTo: number;
  /**
   * Whether rhythm, assignment or season were changed in the form. Untouched, the chore keeps its
   * stored value, so saving a new title neither moves the date, hands the turn on nor narrows a
   * season the form cannot show (e.g. „Januar, März“).
   */
  touched: Record<ChoreDraftPart, boolean>;
}

/** What the chore commands take from the form (structurally the api's ChoreInput). */
export interface ChoreFields {
  title: string;
  room: string;
  recurrence: Recurrence;
  assignment: Assignment;
  effort: 1 | 2 | 3;
  /** Empty = all year. */
  activeMonths: number[];
}

/** A new chore: weekly, alternating, 1 point, all year (spec 0003, AC-036). */
export function newChoreDraft(
  today: ISODate,
  meId: Id,
  rhythm: ChoreRhythm = 'weekly',
): ChoreDraft {
  return {
    title: '',
    room: '',
    rhythm,
    weekdays: [],
    everyWeeks: 1,
    monthDay: parseISODate(today).getDate(),
    everyMonths: 3,
    everyDays: 14,
    assignment: 'rotating',
    fixedMemberId: meId,
    effort: '1',
    seasonOn: false,
    seasonFrom: 4,
    seasonTo: 9,
    touched: { rhythm: false, assignment: false, season: false },
  };
}

/** The first and last month of a season, also across the turn of the year (Oktober–März). */
function seasonBounds(months: number[]): { from: number; to: number } | undefined {
  const set = new Set(months.filter((month) => month >= 1 && month <= 12));
  if (set.size === 0 || set.size === 12) return undefined;
  const sorted = [...set].sort((a, b) => a - b);
  const from = sorted.find((month) => !set.has(month === 1 ? 12 : month - 1)) ?? sorted[0] ?? 1;
  let to = from;
  while (set.has((to % 12) + 1) && (to % 12) + 1 !== from) to = (to % 12) + 1;
  return { from, to };
}

function rhythmOf(recurrence: Recurrence): ChoreRhythm {
  return recurrence.type === 'everyMonths' ? 'months' : recurrence.type;
}

/** The form filled with a stored chore („Bearbeiten“). */
export function choreDraftFrom(chore: Chore, today: ISODate, meId: Id): ChoreDraft {
  const draft = newChoreDraft(today, meId);
  const { recurrence, assignment } = chore;
  const season = seasonBounds(chore.activeMonths ?? []);
  return {
    ...draft,
    title: chore.title,
    room: chore.room ?? '',
    rhythm: rhythmOf(recurrence),
    onceDate: recurrence.type === 'once' ? recurrence.date : undefined,
    weekdays: recurrence.type === 'weekly' ? recurrence.weekdays : [],
    everyWeeks: recurrence.type === 'weekly' ? recurrence.every : draft.everyWeeks,
    monthDay: recurrence.type === 'monthly' ? recurrence.day : draft.monthDay,
    everyMonths: recurrence.type === 'everyMonths' ? recurrence.every : draft.everyMonths,
    everyDays: recurrence.type === 'flexible' ? recurrence.everyDays : draft.everyDays,
    assignment: assignment.type,
    fixedMemberId: assignment.type === 'fixed' ? assignment.memberId : meId,
    effort: String(chore.effort) as ChoreEffortChoice,
    seasonOn: season !== undefined,
    seasonFrom: season?.from ?? draft.seasonFrom,
    seasonTo: season?.to ?? draft.seasonTo,
  };
}

function recurrenceOf(draft: ChoreDraft): Recurrence {
  switch (draft.rhythm) {
    case 'once':
      return draft.onceDate ? { type: 'once', date: draft.onceDate } : { type: 'once' };
    case 'weekly':
      return {
        type: 'weekly',
        every: draft.everyWeeks,
        weekdays: [...draft.weekdays].sort((a, b) => a - b),
      };
    case 'monthly':
      return { type: 'monthly', day: draft.monthDay };
    case 'months':
      return { type: 'everyMonths', every: draft.everyMonths };
    case 'flexible':
      return { type: 'flexible', everyDays: draft.everyDays };
    case 'asNeeded':
      return { type: 'asNeeded' };
  }
}

function assignmentOf(draft: ChoreDraft, members: Member[]): Assignment {
  switch (draft.assignment) {
    case 'fixed':
      return { type: 'fixed', memberId: draft.fixedMemberId };
    case 'rotating':
      return { type: 'rotating', memberIds: members.map((member) => member.id) };
    case 'anyone':
      return { type: 'anyone' };
    case 'together':
      return { type: 'together' };
  }
}

/** Field errors of the form: „Titel fehlt“ (AC-052), a weekly rhythm without a day. */
export function choreDraftErrors(draft: ChoreDraft): ChoreDraftErrors {
  return {
    ...validateChoreDraft(draft),
    ...(draft.rhythm === 'weekly' && draft.weekdays.length === 0
      ? { weekdays: 'Wähle mindestens einen Tag.' }
      : {}),
  };
}

/**
 * What the chore commands take (AC-050, AC-051). With `stored` („Bearbeiten“), an untouched
 * rhythm, assignment or season keeps the stored value.
 */
export function choreFieldsOf(draft: ChoreDraft, members: Member[], stored?: Chore): ChoreFields {
  const keep = (part: ChoreDraftPart) => stored !== undefined && !draft.touched[part];
  return {
    title: draft.title,
    room: draft.room,
    recurrence: stored && keep('rhythm') ? stored.recurrence : recurrenceOf(draft),
    assignment: stored && keep('assignment') ? stored.assignment : assignmentOf(draft, members),
    effort: Number(draft.effort) as 1 | 2 | 3,
    activeMonths:
      stored && keep('season')
        ? (stored.activeMonths ?? [])
        : draft.seasonOn
          ? seasonMonths(draft.seasonFrom, draft.seasonTo)
          : [],
  };
}

/** Just the rhythm and assignment, for „Mehr Angaben“ in „Was hast du erledigt?“ (AC-040). */
export function plannedFieldsOf(
  draft: ChoreDraft,
  members: Member[],
): Pick<ChoreFields, 'recurrence' | 'assignment'> {
  return { recurrence: recurrenceOf(draft), assignment: assignmentOf(draft, members) };
}
