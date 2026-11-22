import { firstDueOn, validateChoreDraft, seasonMonths, type ChoreDraftErrors } from './chores';
import { parseISODate } from './dates';
import type { Assignment, Chore, Id, ISODate, Member, Recurrence } from './types';

// The chore form (spec 0011, REQ-009): one form for „Neue Aufgabe“ and „Bearbeiten“, its rhythm
// and assignment parts also under „Mehr Angaben“ in „Was hast du erledigt?“. Here: the form's
// state and how it maps to a chore and back.

export type ChoreRhythm = 'once' | 'weekly' | 'monthly' | 'months' | 'flexible' | 'asNeeded';
export type ChoreEffortChoice = '1' | '2' | '3';

/**
 * A part of the form that, untouched, keeps the stored value of the chore; „Nächstes Mal“
 * (`nextDue`) follows the suggestion until it is chosen (spec 0026, REQ-002).
 */
export type ChoreDraftPart = 'rhythm' | 'assignment' | 'season' | 'nextDue';

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
  /** The day the form was opened: the suggestions count from it. */
  today: ISODate;
  /** „Nächstes Mal“ as stored or chosen; the suggestion while it is untouched (REQ-002). */
  nextDueOn?: ISODate;
  /** „Zuletzt erledigt (optional)“, only when creating (REQ-002, decision 9). */
  lastDoneOn?: ISODate;
  /** „Als Nächstes dran“ of an alternating chore (REQ-003). */
  nextAssigneeId?: Id;
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
  /** „Nächstes Mal“ (none for „Einmalig“ and „Bei Bedarf“: their date is the rhythm's). */
  nextDueOn?: ISODate;
  /** „Zuletzt erledigt“ when creating; no history entry (decision 9). */
  lastDoneOn?: ISODate;
  /** „Als Nächstes dran“ of an alternating chore. */
  nextAssigneeId?: Id;
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
    today,
    touched: { rhythm: false, assignment: false, season: false, nextDue: false },
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
    // "Später" moves next_due_on of a one-off chore, so the form shows that day (AC-002).
    onceDate: recurrence.type === 'once' ? (chore.nextDueOn ?? recurrence.date) : undefined,
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
    nextDueOn: chore.nextDueOn,
    lastDoneOn: chore.lastDoneOn,
    nextAssigneeId: chore.nextAssigneeId,
  };
}

/** Rhythms with „Nächstes Mal“ (REQ-002, AC-008). */
export function hasNextDueField(rhythm: ChoreRhythm): boolean {
  return (
    rhythm === 'weekly' || rhythm === 'monthly' || rhythm === 'months' || rhythm === 'flexible'
  );
}

/**
 * „Nächstes Mal“ shown in the form (REQ-002, AC-004 to AC-007): a day chosen in the field stays;
 * a stored chore with its rhythm untouched keeps its date; otherwise the suggestion of firstDueOn
 * from „Zuletzt erledigt“ (never before today), which follows the rhythm while it changes.
 */
export function draftNextDueOn(draft: ChoreDraft): ISODate | undefined {
  if (!hasNextDueField(draft.rhythm)) return undefined;
  if (draft.touched.nextDue && draft.nextDueOn !== undefined) return draft.nextDueOn;
  if (!draft.touched.rhythm && draft.nextDueOn !== undefined) return draft.nextDueOn;
  return firstDueOn(recurrenceOf(draft), draft.today, draft.lastDoneOn);
}

/**
 * The patch of a tap on a rhythm (REQ-004, AC-011): creating, „Bei Bedarf“ makes the assignment
 * „Egal“ unless it was chosen already.
 */
export function rhythmPatch(
  draft: ChoreDraft,
  rhythm: ChoreRhythm,
  isNew: boolean,
): Partial<ChoreDraft> {
  return isNew && rhythm === 'asNeeded' && !draft.touched.assignment
    ? { rhythm, assignment: 'anyone' }
    : { rhythm };
}

/**
 * „Als Nächstes dran“ (REQ-003, AC-009, AC-010): the chosen person, else whose turn it is, else
 * the first of the order; it survives switching to „Fest“ and back.
 */
export function draftNextAssignee(draft: ChoreDraft, rotation: readonly Id[]): Id | undefined {
  return rotation.find((id) => id === draft.nextAssigneeId) ?? rotation[0];
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
  const assignment =
    stored && keep('assignment') ? stored.assignment : assignmentOf(draft, members);
  const nextDueOn = draftNextDueOn(draft);
  return {
    title: draft.title,
    room: draft.room,
    recurrence: stored && keep('rhythm') ? stored.recurrence : recurrenceOf(draft),
    assignment,
    effort: Number(draft.effort) as 1 | 2 | 3,
    activeMonths:
      stored && keep('season')
        ? (stored.activeMonths ?? [])
        : draft.seasonOn
          ? seasonMonths(draft.seasonFrom, draft.seasonTo)
          : [],
    ...(nextDueOn !== undefined && { nextDueOn }),
    ...(stored === undefined && draft.lastDoneOn !== undefined && hasNextDueField(draft.rhythm)
      ? { lastDoneOn: draft.lastDoneOn }
      : {}),
    ...(assignment.type === 'rotating' && {
      nextAssigneeId: draftNextAssignee(draft, assignment.memberIds),
    }),
  };
}

/** Just the rhythm and assignment, for „Mehr Angaben“ in „Was hast du erledigt?“ (AC-040). */
export function plannedFieldsOf(
  draft: ChoreDraft,
  members: Member[],
): Pick<ChoreFields, 'recurrence' | 'assignment'> {
  return { recurrence: recurrenceOf(draft), assignment: assignmentOf(draft, members) };
}
