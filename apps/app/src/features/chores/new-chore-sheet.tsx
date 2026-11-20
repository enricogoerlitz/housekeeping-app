import { createChore, useCurrentMember, useMembers, useToday } from '@housekeeping/api';
import {
  parseISODate,
  weekdayShortName,
  type Assignment,
  type ISODate,
  type Recurrence,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { DateChips } from './date-chips';
import { Stepper } from './stepper';

type RhythmKind = 'once' | 'weekly' | 'monthly' | 'months' | 'flexible';
type AssignmentKind = Assignment['type'];
type Effort = '1' | '2' | '3';

const RHYTHMS: { value: RhythmKind; label: string }[] = [
  { value: 'once', label: 'Einmalig' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'months', label: 'Alle n Monate' },
  { value: 'flexible', label: 'Flexibel' },
];

const ASSIGNMENTS: { value: AssignmentKind; label: string }[] = [
  { value: 'fixed', label: 'Fest' },
  { value: 'rotating', label: 'Abwechselnd' },
  { value: 'anyone', label: 'Egal' },
  { value: 'together', label: 'Zu zweit' },
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

function Field(props: { label: string; children: ReactNode }) {
  return (
    <Stack gap={8}>
      <Text variant="smallStrong">{props.label}</Text>
      {props.children}
    </Stack>
  );
}

/** "Neue Aufgabe": only the title is required; everything else has a sensible default. */
export function NewChoreSheet(props: { visible: boolean; onClose: () => void }) {
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();

  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('');
  const [rhythm, setRhythm] = useState<RhythmKind>('weekly');
  const [onceDate, setOnceDate] = useState<ISODate | undefined>(undefined);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [everyWeeks, setEveryWeeks] = useState(1);
  const [monthDay, setMonthDay] = useState(() => parseISODate(today).getDate());
  const [everyMonths, setEveryMonths] = useState(3);
  const [everyDays, setEveryDays] = useState(14);
  const [assignment, setAssignment] = useState<AssignmentKind>('rotating');
  const [fixedMemberId, setFixedMemberId] = useState(me.id);
  const [effort, setEffort] = useState<Effort>('1');
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [weekdayError, setWeekdayError] = useState<string | undefined>(undefined);

  const reset = () => {
    setTitle('');
    setRoom('');
    setRhythm('weekly');
    setOnceDate(undefined);
    setWeekdays([]);
    setEveryWeeks(1);
    setEveryMonths(3);
    setEveryDays(14);
    setAssignment('rotating');
    setFixedMemberId(me.id);
    setEffort('1');
    setTitleError(undefined);
    setWeekdayError(undefined);
  };

  const close = () => {
    reset();
    props.onClose();
  };

  const recurrence = (): Recurrence => {
    switch (rhythm) {
      case 'once':
        return { type: 'once', date: onceDate };
      case 'weekly':
        return { type: 'weekly', every: everyWeeks, weekdays };
      case 'monthly':
        return { type: 'monthly', day: monthDay };
      case 'months':
        return { type: 'everyMonths', every: everyMonths };
      case 'flexible':
        return { type: 'flexible', everyDays };
    }
  };

  const assignmentValue = (): Assignment => {
    switch (assignment) {
      case 'fixed':
        return { type: 'fixed', memberId: fixedMemberId };
      case 'rotating':
        return { type: 'rotating', memberIds: members.map((member) => member.id) };
      case 'anyone':
        return { type: 'anyone' };
      case 'together':
        return { type: 'together' };
    }
  };

  const save = () => {
    const trimmed = title.trim();
    const missingTitle = trimmed === '' ? 'Titel fehlt' : undefined;
    const missingDay =
      rhythm === 'weekly' && weekdays.length === 0 ? 'Wähle mindestens einen Tag.' : undefined;
    setTitleError(missingTitle);
    setWeekdayError(missingDay);
    if (missingTitle || missingDay) return;
    try {
      createChore({
        title: trimmed,
        room,
        recurrence: recurrence(),
        assignment: assignmentValue(),
        effort: Number(effort) as 1 | 2 | 3,
      });
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : 'Das hat nicht geklappt.');
      return;
    }
    toast.show({ message: `„${trimmed}“ angelegt` });
    close();
  };

  const toggleWeekday = (day: number) => {
    setWeekdayError(undefined);
    setWeekdays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day],
    );
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Neue Aufgabe"
      testID="chore-new-sheet"
      size="m"
      footer={
        <Stack gap={6}>
          {online.hint ? (
            <Text variant="small" color="warn">
              {online.hint}
            </Text>
          ) : null}
          <Button
            label="Speichern"
            icon="check"
            full
            onPress={save}
            disabled={online.disabled}
            hint={online.hint}
            testID="chore-save"
          />
        </Stack>
      }
    >
      <Stack gap={20}>
        <TextField
          label="Titel"
          placeholder="z. B. Bad putzen"
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (titleError) setTitleError(undefined);
          }}
          error={titleError}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          testID="chore-title"
        />
        <TextField
          label="Raum (optional)"
          placeholder="z. B. Bad"
          value={room}
          onChangeText={setRoom}
          testID="chore-room"
        />

        <Field label="Rhythmus">
          <Row wrap gap={8}>
            {RHYTHMS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={rhythm === option.value}
                onPress={() => setRhythm(option.value)}
                testID={`rec-${option.value}`}
              />
            ))}
          </Row>
          {rhythm === 'once' ? (
            <DateChips
              today={today}
              value={onceDate}
              onChange={setOnceDate}
              noneLabel="Ohne Datum"
              testIDPrefix="once-date"
            />
          ) : null}
          {rhythm === 'weekly' ? (
            <Stack gap={10}>
              <Row wrap gap={6}>
                {WEEKDAYS.map((day) => (
                  <Chip
                    key={day}
                    label={weekdayShortName(day)}
                    selected={weekdays.includes(day)}
                    onPress={() => toggleWeekday(day)}
                    testID={`wd-${day}`}
                  />
                ))}
              </Row>
              {weekdayError ? (
                <Text variant="small" color="warn" testID="wd-error">
                  {weekdayError}
                </Text>
              ) : null}
              <Stepper
                label="Wochen"
                value={everyWeeks}
                min={1}
                max={8}
                onChange={setEveryWeeks}
                format={(value) => (value === 1 ? 'jede Woche' : `alle ${value} Wochen`)}
                testID="weeks"
              />
            </Stack>
          ) : null}
          {rhythm === 'monthly' ? (
            <Stepper
              label="Tag im Monat"
              value={monthDay}
              min={1}
              max={31}
              onChange={setMonthDay}
              format={(value) => `am ${value}.`}
              testID="month-day"
            />
          ) : null}
          {rhythm === 'months' ? (
            <Stepper
              label="Monate"
              value={everyMonths}
              min={2}
              max={12}
              onChange={setEveryMonths}
              format={(value) => (value === 12 ? 'jährlich' : `alle ${value} Monate`)}
              testID="months"
            />
          ) : null}
          {rhythm === 'flexible' ? (
            <Stack gap={6}>
              <Stepper
                label="Tage"
                value={everyDays}
                min={1}
                max={90}
                onChange={setEveryDays}
                format={(value) => `etwa alle ${value} Tage`}
                testID="days"
              />
              <Text variant="small" color="muted">
                Die Uhr startet nach jeder Erledigung neu.
              </Text>
            </Stack>
          ) : null}
        </Field>

        <Field label="Zuständigkeit">
          <Row wrap gap={8}>
            {ASSIGNMENTS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={assignment === option.value}
                onPress={() => setAssignment(option.value)}
                testID={`as-${option.value}`}
              />
            ))}
          </Row>
          {assignment === 'fixed' ? (
            <Row wrap gap={8}>
              {members.map((member) => (
                <Chip
                  key={member.id}
                  label={member.name}
                  icon="user"
                  selected={fixedMemberId === member.id}
                  onPress={() => setFixedMemberId(member.id)}
                  testID={`as-member-${member.id}`}
                />
              ))}
            </Row>
          ) : (
            <Text variant="small" color="muted">
              {assignment === 'rotating'
                ? 'Dran ist, wer nach der Person kommt, die zuletzt erledigt hat.'
                : assignment === 'anyone'
                  ? 'Wer es zuerst macht.'
                  : 'Braucht euch beide und zählt für beide.'}
            </Text>
          )}
        </Field>

        <Field label="Aufwand">
          <ChoiceChips<Effort>
            label="Aufwand"
            value={effort}
            onChange={setEffort}
            options={[
              { value: '1', label: '1 · leicht' },
              { value: '2', label: '2 · mittel' },
              { value: '3', label: '3 · groß' },
            ]}
            testID="effort"
          />
        </Field>
      </Stack>
    </Sheet>
  );
}
