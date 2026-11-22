import { useNotificationSettings } from '@housekeeping/api';
import {
  choreRemindHint,
  draftNextAssignee,
  draftNextDueOn,
  hasNextDueField,
  monthName,
  rhythmPatch,
  seasonLabel,
  seasonMonths,
  TIME_FIELD_WORDS,
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

/**
 * Rhythm chips and the details of the chosen rhythm. `prefix` keeps test ids apart. With `dates`
 * (the chore form) also „Nächstes Mal“ and, creating, „Zuletzt erledigt (optional)“ (spec 0026,
 * REQ-002); `isNew`: „Bei Bedarf“ makes the assignment „Egal“ (REQ-004).
 */
export function RhythmField(props: {
  draft: ChoreDraft;
  update: DraftUpdate;
  today: ISODate;
  weekdayError?: string;
  prefix?: string;
  isNew?: boolean;
  dates?: boolean;
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
            onPress={() => set(rhythmPatch(draft, option.value, props.isNew ?? false))}
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
          min={props.today}
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
      {props.dates && hasNextDueField(draft.rhythm) ? (
        <Stack gap={12}>
          {props.isNew ? (
            <Field label="Zuletzt erledigt (optional)">
              <DateChips
                today={props.today}
                past
                value={draft.lastDoneOn}
                onChange={(lastDoneOn) => update({ lastDoneOn })}
                noneLabel="Ohne Datum"
                max={props.today}
                testIDPrefix={id('last-done')}
              />
            </Field>
          ) : null}
          <Field label={draft.rhythm === 'flexible' ? 'Nächstes Mal etwa' : 'Nächstes Mal'}>
            <DateChips
              today={props.today}
              value={draftNextDueOn(draft)}
              onChange={(nextDueOn) => {
                if (nextDueOn) update({ nextDueOn }, 'nextDue');
              }}
              min={props.today}
              testIDPrefix={id('next-due')}
            />
          </Field>
        </Stack>
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
      {draft.assignment === 'rotating' ? (
        <Field label="Als Nächstes dran">
          <Row wrap gap={8}>
            {props.members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                icon="user"
                selected={
                  draftNextAssignee(
                    draft,
                    props.members.map((entry) => entry.id),
                  ) === member.id
                }
                onPress={() => props.update({ nextAssigneeId: member.id })}
                testID={id(`next-${member.id}`)}
              />
            ))}
          </Row>
        </Field>
      ) : null}
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
 * „Uhrzeit“ of a chore (spec 0013, REQ-007; chosen from hour and minute, spec 0027 REQ-007) with
 * its switch „Erinnern“ (spec 0027, REQ-009). It is not part of the core draft; the sheets add it
 * to the chore's fields.
 */
export interface ChoreTime {
  value: TimeOfDay | undefined;
  set: (time: TimeOfDay | undefined) => void;
  remind: boolean;
  setRemind: (remind: boolean) => void;
  reset: () => void;
}

export function useChoreTime(initial: TimeOfDay | undefined, initialRemind = true): ChoreTime {
  const [value, setValue] = useState(initial);
  const [remind, setRemind] = useState(initialRemind);
  return {
    value,
    // Without a time „Erinnern“ is on, so a time chosen again reminds (AC-038).
    set: (time) => {
      setValue(time);
      if (time === undefined) setRemind(true);
    },
    remind,
    setRemind,
    reset: () => {
      setValue(initial);
      setRemind(initialRemind);
    },
  };
}

/**
 * The field „Uhrzeit (optional)“ with ✕ and, with a time, the switch „Erinnern“ for the whole
 * household; its hint says whether it reminds and whether the own setting „Aufgaben mit Uhrzeit“
 * keeps it from you (AC-035, AC-037). Offline both are greyed out with the hint.
 */
function ChoreTimeField(props: { time: ChoreTime; offlineHint?: string }) {
  const settings = useNotificationSettings();
  const { time } = props;
  const offline = props.offlineHint !== undefined;
  // Without the settings row yet, the server's default counts: chore reminders are on (D36).
  const ownOn = settings?.choreRemindersEnabled ?? true;
  return (
    <Stack gap={4}>
      <TimeField
        label="Uhrzeit (optional)"
        accessibilityName="Uhrzeit"
        {...TIME_FIELD_WORDS}
        value={time.value}
        onChange={time.set}
        optional
        clearLabel="Uhrzeit entfernen"
        hint={props.offlineHint}
        disabled={offline}
        testID="chore-due-time"
      />
      {time.value ? (
        <SwitchRow
          label="Erinnern"
          description={choreRemindHint(time.remind, ownOn)}
          value={time.remind}
          onValueChange={time.setRemind}
          disabled={offline}
          testID="chore-remind"
        />
      ) : null}
    </Stack>
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
  /** „Neue Aufgabe“: „Zuletzt erledigt“ and „Bei Bedarf“ → „Egal“ (spec 0026). */
  isNew?: boolean;
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
        isNew={props.isNew}
        dates
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
