import type { ChoreInput } from '@housekeeping/api';
import {
  monthName,
  parseISODate,
  seasonLabel,
  seasonMonths,
  validateChoreDraft,
  weekdayShortName,
  type Assignment,
  type Chore,
  type Id,
  type ISODate,
  type Member,
  type Recurrence,
} from '@housekeeping/core';
import { Chip, ChoiceChips, Row, Stack, SwitchRow, Text, TextField } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { DateChips } from './date-chips';
import { Stepper } from './stepper';

// The chore form (spec 0011, REQ-009): one form for „Neue Aufgabe“ and „Bearbeiten“, its rhythm
// and assignment parts also under „Mehr Angaben“ in „Was hast du erledigt?“.

type RhythmKind = 'once' | 'weekly' | 'monthly' | 'months' | 'flexible' | 'asNeeded';
type AssignmentKind = Assignment['type'];
type Effort = '1' | '2' | '3';

const RHYTHMS: { value: RhythmKind; label: string }[] = [
  { value: 'once', label: 'Einmalig' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'months', label: 'Alle n Monate' },
  { value: 'flexible', label: 'Flexibel' },
  { value: 'asNeeded', label: 'Bei Bedarf' },
];

const ASSIGNMENTS: { value: AssignmentKind; label: string }[] = [
  { value: 'fixed', label: 'Fest' },
  { value: 'rotating', label: 'Abwechselnd' },
  { value: 'anyone', label: 'Egal' },
  { value: 'together', label: 'Zu zweit' },
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export interface ChoreDraft {
  title: string;
  room: string;
  rhythm: RhythmKind;
  onceDate?: ISODate;
  weekdays: number[];
  everyWeeks: number;
  monthDay: number;
  everyMonths: number;
  everyDays: number;
  assignment: AssignmentKind;
  fixedMemberId: Id;
  effort: Effort;
  seasonOn: boolean;
  seasonFrom: number;
  seasonTo: number;
  /**
   * Whether rhythm or assignment were changed in the form. Untouched, the chore keeps its stored
   * value, so saving a new title neither moves the date nor hands the turn on.
   */
  touched: { rhythm: boolean; assignment: boolean };
}

export interface ChoreDraftErrors {
  title?: string;
  weekdays?: string;
}

/** A new chore: weekly, alternating, 1 point, all year (spec 0003, AC-036). */
export function newChoreDraft(today: ISODate, meId: Id, rhythm: RhythmKind = 'weekly'): ChoreDraft {
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
    touched: { rhythm: false, assignment: false },
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

/** The form filled with a stored chore („Bearbeiten“). */
export function choreDraftFrom(chore: Chore, today: ISODate, meId: Id): ChoreDraft {
  const draft = newChoreDraft(today, meId);
  const { recurrence, assignment } = chore;
  const season = seasonBounds(chore.activeMonths ?? []);
  return {
    ...draft,
    title: chore.title,
    room: chore.room ?? '',
    rhythm:
      recurrence.type === 'everyMonths'
        ? 'months'
        : recurrence.type === 'once'
          ? 'once'
          : recurrence.type,
    onceDate: recurrence.type === 'once' ? recurrence.date : undefined,
    weekdays: recurrence.type === 'weekly' ? recurrence.weekdays : [],
    everyWeeks: recurrence.type === 'weekly' ? recurrence.every : draft.everyWeeks,
    monthDay: recurrence.type === 'monthly' ? recurrence.day : draft.monthDay,
    everyMonths: recurrence.type === 'everyMonths' ? recurrence.every : draft.everyMonths,
    everyDays: recurrence.type === 'flexible' ? recurrence.everyDays : draft.everyDays,
    assignment: assignment.type,
    fixedMemberId: assignment.type === 'fixed' ? assignment.memberId : meId,
    effort: String(chore.effort) as Effort,
    seasonOn: season !== undefined,
    seasonFrom: season?.from ?? draft.seasonFrom,
    seasonTo: season?.to ?? draft.seasonTo,
  };
}

function recurrenceOf(draft: ChoreDraft): Recurrence {
  switch (draft.rhythm) {
    case 'once':
      return { type: 'once', date: draft.onceDate };
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

/** What the api commands take; an untouched rhythm or assignment keeps the stored one. */
export function choreInputOf(draft: ChoreDraft, members: Member[], stored?: Chore): ChoreInput {
  return {
    title: draft.title,
    room: draft.room,
    recurrence: stored && !draft.touched.rhythm ? stored.recurrence : recurrenceOf(draft),
    assignment:
      stored && !draft.touched.assignment ? stored.assignment : assignmentOf(draft, members),
    effort: Number(draft.effort) as 1 | 2 | 3,
    activeMonths: draft.seasonOn ? seasonMonths(draft.seasonFrom, draft.seasonTo) : [],
  };
}

/** Just the rhythm and assignment, for „Mehr Angaben“ in „Was hast du erledigt?“. */
export function plannedInputOf(
  draft: ChoreDraft,
  members: Member[],
): Pick<ChoreInput, 'recurrence' | 'assignment'> {
  return { recurrence: recurrenceOf(draft), assignment: assignmentOf(draft, members) };
}

export type DraftUpdate = (patch: Partial<ChoreDraft>, part?: 'rhythm' | 'assignment') => void;

/** The form's state; `update` marks the part it changes as touched. */
export function useChoreDraft(initial: () => ChoreDraft): [ChoreDraft, DraftUpdate, () => void] {
  const [draft, setDraft] = useState(initial);
  const update: DraftUpdate = (patch, part) =>
    setDraft((current) => ({
      ...current,
      ...patch,
      touched: part ? { ...current.touched, [part]: true } : current.touched,
    }));
  return [draft, update, () => setDraft(initial())];
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <Stack gap={8}>
      <Text variant="smallStrong">{props.label}</Text>
      {props.children}
    </Stack>
  );
}

/** Rhythm chips and the details of the chosen rhythm. `prefix` keeps test ids apart. */
export function RhythmField(props: {
  draft: ChoreDraft;
  update: DraftUpdate;
  today: ISODate;
  weekdayError?: string;
  prefix?: string;
}) {
  const { draft, update } = props;
  const id = (name: string) => `${props.prefix ?? ''}${name}`;
  const set = (patch: Partial<ChoreDraft>) => update(patch, 'rhythm');
  const toggleWeekday = (day: number) =>
    set({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((entry) => entry !== day)
        : [...draft.weekdays, day],
    });
  return (
    <Field label="Rhythmus">
      <Row wrap gap={8}>
        {RHYTHMS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={draft.rhythm === option.value}
            onPress={() => set({ rhythm: option.value })}
            testID={id(`rec-${option.value}`)}
          />
        ))}
      </Row>
      {draft.rhythm === 'once' ? (
        <DateChips
          today={props.today}
          value={draft.onceDate}
          onChange={(onceDate) => set({ onceDate })}
          noneLabel="Ohne Datum"
          testIDPrefix={id('once-date')}
        />
      ) : null}
      {draft.rhythm === 'weekly' ? (
        <Stack gap={10}>
          <Row wrap gap={6}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day}
                label={weekdayShortName(day)}
                selected={draft.weekdays.includes(day)}
                onPress={() => toggleWeekday(day)}
                testID={id(`wd-${day}`)}
              />
            ))}
          </Row>
          {props.weekdayError ? (
            <Text variant="small" color="warn" testID={id('wd-error')}>
              {props.weekdayError}
            </Text>
          ) : null}
          <Stepper
            label="Wochen"
            value={draft.everyWeeks}
            min={1}
            max={8}
            onChange={(everyWeeks) => set({ everyWeeks })}
            format={(value) => (value === 1 ? 'jede Woche' : `alle ${value} Wochen`)}
            testID={id('weeks')}
          />
        </Stack>
      ) : null}
      {draft.rhythm === 'monthly' ? (
        <Stepper
          label="Tag im Monat"
          value={draft.monthDay}
          min={1}
          max={31}
          onChange={(monthDay) => set({ monthDay })}
          format={(value) => `am ${value}.`}
          testID={id('month-day')}
        />
      ) : null}
      {draft.rhythm === 'months' ? (
        <Stepper
          label="Monate"
          value={draft.everyMonths}
          min={2}
          max={12}
          onChange={(everyMonths) => set({ everyMonths })}
          format={(value) => (value === 12 ? 'jährlich' : `alle ${value} Monate`)}
          testID={id('months')}
        />
      ) : null}
      {draft.rhythm === 'flexible' ? (
        <Stack gap={6}>
          <Stepper
            label="Tage"
            value={draft.everyDays}
            min={1}
            max={90}
            onChange={(everyDays) => set({ everyDays })}
            format={(value) => `etwa alle ${value} Tage`}
            testID={id('days')}
          />
          <Text variant="small" color="muted">
            Die Uhr startet nach jeder Erledigung neu.
          </Text>
        </Stack>
      ) : null}
      {draft.rhythm === 'asNeeded' ? (
        <Text variant="small" color="muted">
          Wird nie fällig. Du findest sie unter „Alle“ und bei „Was anderes erledigt?“.
        </Text>
      ) : null}
    </Field>
  );
}

/** Who does it: fixed (with the person), alternating, anyone, both. */
export function AssignmentField(props: {
  draft: ChoreDraft;
  update: DraftUpdate;
  members: Member[];
  prefix?: string;
}) {
  const { draft } = props;
  const id = (name: string) => `${props.prefix ?? ''}${name}`;
  const set = (patch: Partial<ChoreDraft>) => props.update(patch, 'assignment');
  return (
    <Field label="Zuständigkeit">
      <Row wrap gap={8}>
        {ASSIGNMENTS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={draft.assignment === option.value}
            onPress={() => set({ assignment: option.value })}
            testID={id(`as-${option.value}`)}
          />
        ))}
      </Row>
      {draft.assignment === 'fixed' ? (
        <Row wrap gap={8}>
          {props.members.map((member) => (
            <Chip
              key={member.id}
              label={member.name}
              icon="user"
              selected={draft.fixedMemberId === member.id}
              onPress={() => set({ fixedMemberId: member.id })}
              testID={id(`as-member-${member.id}`)}
            />
          ))}
        </Row>
      ) : (
        <Text variant="small" color="muted">
          {draft.assignment === 'rotating'
            ? 'Dran ist, wer nach der Person kommt, die zuletzt erledigt hat.'
            : draft.assignment === 'anyone'
              ? 'Wer es zuerst macht.'
              : 'Braucht euch beide und zählt für beide.'}
        </Text>
      )}
    </Field>
  );
}

const monthLabel = (month: number) => monthName(month - 1);

/** „Saison“: all year, or only from one month to another (AC-050). */
function SeasonField(props: { draft: ChoreDraft; update: DraftUpdate }) {
  const { draft, update } = props;
  const label = draft.seasonOn ? seasonLabel(seasonMonths(draft.seasonFrom, draft.seasonTo)) : '';
  return (
    <Stack gap={4}>
      <SwitchRow
        label="Nur in einer Saison"
        description={draft.seasonOn ? label || 'ganzjährig' : 'ganzjährig'}
        value={draft.seasonOn}
        onValueChange={(seasonOn) => update({ seasonOn })}
        testID="season"
      />
      {draft.seasonOn ? (
        <Stack gap={8}>
          <Stepper
            label="Von"
            value={draft.seasonFrom}
            min={1}
            max={12}
            onChange={(seasonFrom) => update({ seasonFrom })}
            format={(value) => `ab ${monthLabel(value)}`}
            testID="season-from"
          />
          <Stepper
            label="Bis"
            value={draft.seasonTo}
            min={1}
            max={12}
            onChange={(seasonTo) => update({ seasonTo })}
            format={(value) => `bis ${monthLabel(value)}`}
            testID="season-to"
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

/** The whole form: title, room, rhythm, assignment, effort, season. */
export function ChoreFormFields(props: {
  draft: ChoreDraft;
  update: DraftUpdate;
  errors: ChoreDraftErrors;
  onClearError: (field: keyof ChoreDraftErrors) => void;
  onSubmit: () => void;
  today: ISODate;
  members: Member[];
  autoFocus?: boolean;
}) {
  const { draft, update } = props;
  return (
    <Stack gap={20}>
      <TextField
        label="Titel"
        placeholder="z. B. Bad putzen"
        value={draft.title}
        onChangeText={(title) => {
          update({ title });
          props.onClearError('title');
        }}
        error={props.errors.title}
        autoFocus={props.autoFocus}
        returnKeyType="done"
        onSubmitEditing={props.onSubmit}
        testID="chore-title"
      />
      <TextField
        label="Raum (optional)"
        placeholder="z. B. Bad"
        value={draft.room}
        onChangeText={(room) => update({ room })}
        testID="chore-room"
      />
      <RhythmField
        draft={draft}
        update={(patch, part) => {
          update(patch, part);
          props.onClearError('weekdays');
        }}
        today={props.today}
        weekdayError={props.errors.weekdays}
      />
      <AssignmentField draft={draft} update={update} members={props.members} />
      <Field label="Aufwand">
        <ChoiceChips<Effort>
          label="Aufwand"
          value={draft.effort}
          onChange={(effort) => update({ effort })}
          options={[
            { value: '1', label: '1 · leicht' },
            { value: '2', label: '2 · mittel' },
            { value: '3', label: '3 · groß' },
          ]}
          testID="effort"
        />
      </Field>
      <SeasonField draft={draft} update={update} />
    </Stack>
  );
}
