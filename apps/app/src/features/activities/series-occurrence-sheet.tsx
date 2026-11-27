import {
  cancelOccurrence,
  deleteActivitySeries,
  editActivitySeries,
  moveOccurrence,
  restoreOccurrence,
  useActivity,
  useActivitySeries,
  useActivitySeriesExceptions,
  useHousehold,
  useMembers,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import {
  formatPickerDate,
  MAX_REMINDER_TEXT,
  monthPickerStart,
  peopleLabel,
  planEntryCalendarEvent,
  reminderTextCounter,
  repeatRule,
  SERIES_REMINDER_DAY_OPTIONS,
  seriesPlanEntries,
  seriesReminderDraft,
  seriesReminderSave,
  seriesRuleLabel,
  TIME_FIELD_WORDS,
  withNote,
  type ActivitySeries,
  type SeriesReminderDraft,
  type ISODate,
  type Id,
  type RepeatDraft,
  type TimeOfDay,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  Icon,
  Row,
  Sheet,
  Stack,
  SwitchRow,
  Text,
  TextField,
  TimeField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { AddToCalendar, appLink } from '@/features/calendar/add-to-calendar';
import { EaterPicker } from '@/features/meal-plan/plan-fields';
import { confirmFirst } from '@/features/shell/confirm-dialog';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';

import { useActivityIcon } from './activity-photo';
import { useOpenActivity } from './navigation';
import { RepeatFields } from './series-fields';

type Mode = 'view' | 'move' | 'edit';

/** The fields of "Rhythmus" for an existing series. */
function repeatOf(series: ActivitySeries): RepeatDraft {
  const { rule } = series;
  const day = Number(series.startsOn.slice(8, 10));
  if (rule.type === 'weekly') {
    return {
      kind: 'weekly',
      every: rule.every,
      weekdays: rule.weekdays,
      monthDay: day,
      until: series.endsOn,
    };
  }
  if (rule.type === 'monthly') {
    return { kind: 'monthly', every: 1, weekdays: [], monthDay: rule.day, until: series.endsOn };
  }
  return { kind: 'yearly', every: 1, weekdays: [], monthDay: day, until: series.endsOn };
}

/**
 * A Termin of a series in the calendar (spec 0041, REQ-003): when, rhythm and who is "dabei";
 * "Termin verschieben", "Termin absagen" (AC-008), "Serie bearbeiten" for the Termine from today
 * on (AC-009), "Serie löschen" and the activity's page. Every change needs the network.
 */
export function SeriesOccurrenceSheet(props: { seriesId: Id; on: ISODate; onClose: () => void }) {
  const series = useActivitySeries().find((candidate) => candidate.id === props.seriesId);
  const exceptions = useActivitySeriesExceptions();
  const activity = useActivity(series?.activityId);
  const icon = useActivityIcon(activity);
  const membersById = useMembersById();
  const household = useHousehold();
  const online = useOnlineOnly();
  const openActivity = useOpenActivity();
  const [mode, setMode] = useState<Mode>('view');
  if (!series) return null;
  const exception = exceptions.find(
    (candidate) => candidate.seriesId === series.id && candidate.on === props.on,
  );
  const date = exception?.movedTo ?? props.on;
  const slotId = exception?.slotId ?? series.slotId;
  const startsAt = exception?.startsAt ?? series.startsAt;
  const slotName = household.mealSlots.find((slot) => slot.id === slotId)?.name ?? '';
  const name = withNote(activity?.name ?? 'Aktivität', series.note ?? '');
  const people = peopleLabel(series.eaterIds, series.guests, membersById);
  const rhythm = `${seriesRuleLabel(series.rule, series.startsOn)}, ${
    series.endsOn ? `bis ${formatPickerDate(series.endsOn)}` : 'dauerhaft'
  }`;
  // Spec 0059, REQ-001: this Termin as the calendar shows it, with the reminder of its series.
  const termin = seriesPlanEntries([series], exceptions, date, date).find(
    (entry) => entry.series?.on === props.on,
  );

  const run = (action: () => void, message: string) => {
    try {
      action();
    } catch (caught) {
      toast.show({ message: errorMessage(caught, FAILED_MESSAGE) });
      return;
    }
    toast.show({ message });
    props.onClose();
  };

  const cancel = () =>
    confirmFirst({
      title: `Termin am ${formatPickerDate(date)} absagen?`,
      message: 'Nur dieser Termin fällt weg, die anderen der Serie bleiben.',
      confirmLabel: 'Absagen',
      testID: 'occurrence-cancel-confirm',
      onConfirm: () => run(() => cancelOccurrence(series.id, props.on), 'Termin abgesagt'),
    });
  const remove = () =>
    confirmFirst({
      title: `Serie „${name}“ löschen?`,
      message: 'Alle Termine der Serie verschwinden aus dem Kalender, auch vergangene.',
      confirmLabel: 'Löschen',
      testID: 'series-delete-confirm',
      onConfirm: () => run(() => deleteActivitySeries(series.id), 'Serie gelöscht'),
    });

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={mode === 'move' ? 'Termin verschieben' : mode === 'edit' ? 'Serie bearbeiten' : name}
      size="m"
      testID="occurrence-sheet"
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 8 }}>
          {online.hint}
        </Text>
      ) : null}
      {mode === 'move' ? (
        <MoveForm
          series={series}
          on={props.on}
          date={date}
          slotId={slotId}
          startsAt={startsAt}
          disabled={online.disabled}
          onBack={() => setMode('view')}
          onMoved={props.onClose}
        />
      ) : mode === 'edit' ? (
        <EditForm
          series={series}
          disabled={online.disabled}
          onBack={() => setMode('view')}
          onSaved={props.onClose}
        />
      ) : (
        <Stack gap={14}>
          <Stack gap={6}>
            <Row gap={8}>
              <Icon name={icon} size={18} color="muted" />
              <Text testID="occurrence-when">
                {[formatPickerDate(date), slotName, startsAt].filter(Boolean).join(' · ')}
              </Text>
            </Row>
            <Row gap={8}>
              <Icon name="repeat" size={18} color="muted" />
              <Text
                variant="small"
                color="muted"
                testID="occurrence-rhythm"
                style={{ flexShrink: 1 }}
              >
                {rhythm}
              </Text>
            </Row>
            {people ? (
              <Row gap={8}>
                <Icon name="users" size={18} color="muted" />
                <Text variant="small" color="muted" testID="occurrence-people">
                  {people}
                </Text>
              </Row>
            ) : null}
            {exception?.movedTo ? (
              <Text variant="small" color="muted" testID="occurrence-moved">
                {`Verschoben vom ${formatPickerDate(props.on)}`}
              </Text>
            ) : null}
            {series.reminder ? (
              <Row gap={8}>
                <Icon name="alarm-clock" size={18} color="muted" />
                <Text variant="small" color="muted" testID="occurrence-reminder">
                  {reminderLine(series.reminder)}
                </Text>
              </Row>
            ) : null}
          </Stack>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button
              label="Termin verschieben"
              icon="calendar-days"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setMode('move')}
              testID="occurrence-move"
            />
            <Button
              label="Termin absagen"
              icon="calendar-off"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={cancel}
              testID="occurrence-cancel"
            />
            <Button
              label="Serie bearbeiten"
              icon="pencil"
              variant="secondary"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setMode('edit')}
              testID="series-edit"
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {exception?.movedTo ? (
              <Button
                label="Verschieben zurücknehmen"
                icon="undo"
                variant="link"
                disabled={online.disabled}
                onPress={() =>
                  run(() => restoreOccurrence(series.id, props.on), 'Termin wieder am alten Tag')
                }
                testID="occurrence-restore"
              />
            ) : null}
            {activity ? (
              <Button
                label="Aktivität öffnen"
                icon="chevron-right"
                variant="link"
                onPress={() => {
                  props.onClose();
                  openActivity(activity.id);
                }}
                testID="occurrence-open-activity"
              />
            ) : null}
            <Button
              label="Serie löschen"
              icon="trash"
              variant="link"
              disabled={online.disabled}
              hint={online.hint}
              onPress={remove}
              testID="series-delete"
            />
          </View>
          {termin ? (
            <AddToCalendar
              event={planEntryCalendarEvent({
                entry: termin,
                title: name,
                slotName,
                location: activity?.address ?? activity?.placeName,
                link: appLink({ screen: 'calendar', day: date }),
              })}
              testID="occurrence-calendar"
            />
          ) : null}
        </Stack>
      )}
    </Sheet>
  );
}

/** "Erinnern 1 Woche vorher, 18:00 · Geschenk besorgen" (spec 0059, REQ-003). */
function reminderLine(reminder: NonNullable<ActivitySeries['reminder']>): string {
  const day =
    SERIES_REMINDER_DAY_OPTIONS.find((option) => option.value === reminder.offsetDays)?.label ??
    `${reminder.offsetDays} Tage vorher`;
  return `Erinnern ${day}, ${reminder.at}${reminder.text ? ` · ${reminder.text}` : ''}`;
}

/** "Erinnern" of "Serie bearbeiten" (spec 0059, REQ-003): Vorlauf, Uhrzeit and text. */
function SeriesReminderFields(props: {
  value: SeriesReminderDraft;
  onChange: (value: SeriesReminderDraft) => void;
  error: string | undefined;
  disabled: boolean;
}) {
  const { value, onChange } = props;
  return (
    <View style={{ gap: 12 }} testID="series-edit-reminder">
      <SwitchRow
        label="Erinnern"
        description="Meldet sich in der Glocke, vor jedem Termin."
        value={value.on}
        onValueChange={(on) => onChange({ ...value, on })}
        disabled={props.disabled}
        testID="series-edit-reminder-switch"
      />
      {value.on ? (
        <>
          <ChoiceChips
            label="Wann"
            options={SERIES_REMINDER_DAY_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            value={String(value.offsetDays)}
            onChange={(offset) => onChange({ ...value, offsetDays: Number(offset) })}
            disabled={props.disabled}
            testID="series-edit-reminder-day"
          />
          <TimeField
            label="Uhrzeit"
            {...TIME_FIELD_WORDS}
            value={value.at}
            onChange={(time) => {
              if (time !== undefined) onChange({ ...value, at: time as TimeOfDay });
            }}
            disabled={props.disabled}
            testID="series-edit-reminder-time"
          />
          <TextField
            label="Woran erinnern? (optional)"
            value={value.text}
            onChangeText={(text) => onChange({ ...value, text })}
            placeholder="z. B. Geschenk besorgen"
            maxLength={MAX_REMINDER_TEXT}
            error={props.error}
            hint={reminderTextCounter(value.text)}
            testID="series-edit-reminder-text"
          />
        </>
      ) : null}
    </View>
  );
}

function MoveForm(props: {
  series: ActivitySeries;
  on: ISODate;
  date: ISODate;
  slotId: Id;
  startsAt: TimeOfDay | undefined;
  disabled: boolean;
  onBack: () => void;
  onMoved: () => void;
}) {
  const today = useToday();
  const household = useHousehold();
  const [date, setDate] = useState(props.date);
  const [slotId, setSlotId] = useState(props.slotId);
  const [startsAt, setStartsAt] = useState(props.startsAt);
  const [error, setError] = useState<string | undefined>();
  const save = () => {
    try {
      moveOccurrence(props.series.id, props.on, {
        date,
        slotId: slotId === props.series.slotId ? undefined : slotId,
        startsAt: startsAt === props.series.startsAt ? undefined : startsAt,
      });
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
      return;
    }
    toast.show({ message: `Termin auf ${formatPickerDate(date)} verschoben` });
    props.onMoved();
  };
  return (
    <Stack gap={14}>
      <Text variant="smallStrong" testID="occurrence-move-date">
        {formatPickerDate(date)}
      </Text>
      <PlanDateCalendar
        month={monthPickerStart(date, today)}
        today={today}
        marked={date}
        onSelect={setDate}
        testID="occurrence-move-calendar"
      />
      <Text variant="smallStrong">Tageszeit</Text>
      <ChoiceChips
        label="Tageszeit"
        options={household.mealSlots.map((slot) => ({ value: slot.id, label: slot.name }))}
        value={slotId}
        onChange={setSlotId}
        testID="occurrence-move-slot"
      />
      <TimeField
        label="Uhrzeit (optional)"
        {...TIME_FIELD_WORDS}
        value={startsAt}
        optional
        clearLabel="Uhrzeit entfernen"
        onChange={(time) => setStartsAt(time as TimeOfDay | undefined)}
        testID="occurrence-move-time"
      />
      {error ? (
        <Text variant="small" color="warn">
          {error}
        </Text>
      ) : null}
      <Row gap={10}>
        <Button
          label="Verschieben"
          icon="check"
          disabled={props.disabled}
          onPress={save}
          testID="occurrence-move-save"
        />
        <Button
          label="Zurück"
          variant="secondary"
          onPress={props.onBack}
          testID="occurrence-move-back"
        />
      </Row>
    </Stack>
  );
}

function EditForm(props: {
  series: ActivitySeries;
  disabled: boolean;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { series } = props;
  const today = useToday();
  const household = useHousehold();
  const members = useMembers();
  const [repeat, setRepeat] = useState<RepeatDraft>(() => repeatOf(series));
  const [slotId, setSlotId] = useState(series.slotId);
  const [startsAt, setStartsAt] = useState(series.startsAt);
  const [note, setNote] = useState(series.note ?? '');
  const [eaterIds, setEaterIds] = useState(series.eaterIds);
  const [guests, setGuests] = useState(series.guests);
  const [reminder, setReminder] = useState(() => seriesReminderDraft(series.reminder));
  const [reminderError, setReminderError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    const rule = repeatRule(repeat);
    if (!rule) return;
    const checked = seriesReminderSave(reminder);
    if (!checked.ok) {
      setReminderError(checked.error);
      return;
    }
    let kind: string;
    try {
      kind = editActivitySeries(
        series.id,
        {
          rule,
          endsOn: repeat.until,
          slotId,
          startsAt,
          note,
          eaterIds,
          guests,
          reminder: checked.reminder,
        },
        today,
      ).kind;
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
      return;
    }
    toast.show({ message: kind === 'split' ? 'Serie ab heute geändert' : 'Serie geändert' });
    props.onSaved();
  };

  return (
    <Stack gap={16}>
      <Text variant="small" color="muted">
        Gilt für alle Termine ab heute; vergangene bleiben, wie sie waren.
      </Text>
      <RepeatFields
        value={repeat}
        onChange={setRepeat}
        startsOn={series.startsOn}
        today={today}
        withoutOnce
        disabled={props.disabled}
      />
      <Text variant="smallStrong">Tageszeit</Text>
      <ChoiceChips
        label="Tageszeit"
        options={household.mealSlots.map((slot) => ({ value: slot.id, label: slot.name }))}
        value={slotId}
        onChange={setSlotId}
        testID="series-edit-slot"
      />
      <TimeField
        label="Uhrzeit (optional)"
        {...TIME_FIELD_WORDS}
        value={startsAt}
        optional
        clearLabel="Uhrzeit entfernen"
        onChange={(time) => setStartsAt(time as TimeOfDay | undefined)}
        testID="series-edit-time"
      />
      <EaterPicker
        label="Wer ist dabei?"
        members={members}
        eaterIds={eaterIds}
        guests={guests}
        onEaters={setEaterIds}
        onGuests={setGuests}
        disabled={props.disabled}
      />
      <TextField
        label="Zusatz"
        value={note}
        onChangeText={setNote}
        maxLength={120}
        testID="series-edit-note"
      />
      <SeriesReminderFields
        value={reminder}
        onChange={(next) => {
          setReminder(next);
          setReminderError(undefined);
        }}
        error={reminderError}
        disabled={props.disabled}
      />
      {error ? (
        <Text variant="small" color="warn" testID="series-edit-error">
          {error}
        </Text>
      ) : null}
      <Row gap={10}>
        <Button
          label="Speichern"
          icon="check"
          disabled={props.disabled}
          onPress={save}
          testID="series-edit-save"
        />
        <Button
          label="Zurück"
          variant="secondary"
          onPress={props.onBack}
          testID="series-edit-back"
        />
      </Row>
    </Stack>
  );
}
