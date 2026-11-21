import { useNotificationSettings } from '@housekeeping/api';
import {
  choreTimeHint,
  formatTime,
  monthName,
  parseTimeInput,
  seasonLabel,
  seasonMonths,
  weekdayShortName,
  type Assignment,
  type ChoreDraft,
  type ChoreDraftErrors,
  type ChoreDraftPart,
  type ChoreEffortChoice,
  type ChoreRhythm,
  type ISODate,
  type Member,
  type TimeOfDay,
} from '@housekeeping/core';
import {
  Chip,
  ChoiceChips,
  Row,
  Stack,
  SwitchRow,
  Text,
  TextField,
  TimeField,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { DateChips } from './date-chips';
import { Stepper } from './stepper';

// The chore form (spec 0011, REQ-009): one form for „Neue Aufgabe“ and „Bearbeiten“, its rhythm
// and assignment parts also under „Mehr Angaben“ in „Was hast du erledigt?“. The form's state and
// its mapping to a chore live in core (chore-form.ts).

const RHYTHMS: { value: ChoreRhythm; label: string }[] = [
  { value: 'once', label: 'Einmalig' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'months', label: 'Alle n Monate' },
  { value: 'flexible', label: 'Flexibel' },
  { value: 'asNeeded', label: 'Bei Bedarf' },
];

const ASSIGNMENTS: { value: Assignment['type']; label: string }[] = [
  { value: 'fixed', label: 'Fest' },
  { value: 'rotating', label: 'Abwechselnd' },
  { value: 'anyone', label: 'Egal' },
  { value: 'together', label: 'Zu zweit' },
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export type DraftUpdate = (patch: Partial<ChoreDraft>, part?: ChoreDraftPart) => void;

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
        onValueChange={(seasonOn) => update({ seasonOn }, 'season')}
        testID="season"
      />
      {draft.seasonOn ? (
        <Stack gap={8}>
          <Stepper
            label="Von"
            value={draft.seasonFrom}
            min={1}
            max={12}
            onChange={(seasonFrom) => update({ seasonFrom }, 'season')}
            format={(value) => `ab ${monthLabel(value)}`}
            testID="season-from"
          />
          <Stepper
            label="Bis"
            value={draft.seasonTo}
            min={1}
            max={12}
            onChange={(seasonTo) => update({ seasonTo }, 'season')}
            format={(value) => `bis ${monthLabel(value)}`}
            testID="season-to"
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * „Uhrzeit“ of a chore (spec 0013, REQ-007): typed text, read with core `parseTimeInput` on save.
 * It is not part of the core draft; the sheets add it to the chore's fields.
 */
export interface ChoreTime {
  text: string;
  error: string | undefined;
  setText: (text: string) => void;
  /** Reads the text; an invalid time shows its error and returns ok: false. */
  read: () => { ok: true; time: TimeOfDay | undefined } | { ok: false };
  reset: () => void;
}

export function useChoreTime(initial: TimeOfDay | undefined): ChoreTime {
  const start = initial ? formatTime(initial) : '';
  const [text, setTextState] = useState(start);
  const [error, setError] = useState<string>();
  return {
    text,
    error,
    setText: (next) => {
      setTextState(next);
      setError(undefined);
    },
    read: () => {
      const result = parseTimeInput(text);
      if (!result.ok) {
        setError(result.error);
        return { ok: false };
      }
      return { ok: true, time: result.time };
    },
    reset: () => {
      setTextState(start);
      setError(undefined);
    },
  };
}

/**
 * The field „Uhrzeit (optional)“ with ✕ and, with a time, whether the own setting „Aufgaben mit
 * Uhrzeit“ reminds (AC-022, Offene Frage 3 d). Offline it is greyed out with the hint.
 */
function ChoreTimeField(props: { time: ChoreTime; offlineHint?: string }) {
  const settings = useNotificationSettings();
  const { time } = props;
  // Without the settings row yet, the server's default counts: chore reminders are on (D36).
  const reminds = settings?.choreRemindersEnabled ?? true;
  return (
    <TimeField
      label="Uhrzeit (optional)"
      placeholder="z. B. 19:00"
      value={time.text}
      onChangeText={time.setText}
      onClear={() => time.setText('')}
      clearLabel="Uhrzeit entfernen"
      emptyLabel="keine Uhrzeit"
      error={time.error}
      hint={props.offlineHint ?? (time.text.trim() ? choreTimeHint(reminds) : undefined)}
      disabled={props.offlineHint !== undefined}
      testID="chore-due-time"
    />
  );
}

/** The whole form: title, room, rhythm, assignment, time, effort, season. */
export function ChoreFormFields(props: {
  draft: ChoreDraft;
  update: DraftUpdate;
  errors: ChoreDraftErrors;
  onClearError: (field: keyof ChoreDraftErrors) => void;
  onSubmit: () => void;
  today: ISODate;
  members: Member[];
  time: ChoreTime;
  /** Offline: the time is greyed out with this hint (the other fields stay as they were). */
  offlineHint?: string;
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
      <ChoreTimeField time={props.time} offlineHint={props.offlineHint} />
      <Field label="Aufwand">
        <ChoiceChips<ChoreEffortChoice>
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
