import { saveAbsences, useCurrentMember, useMembers, useToday } from '@housekeeping/api';
import {
  formatPickerDate,
  inRange,
  monthGrid,
  monthTitle,
  openRangeField,
  parseISODate,
  pickRangeDate,
  shiftPeriod,
  startOfMonth,
  validateAbsenceDraft,
  type AbsenceStripe,
  type ISODate,
  type RangePick,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Chip,
  IconButton,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

const WEEKDAY_HEADS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * "Abwesenheit eintragen" and "Abwesenheit bearbeiten" (spec 0010, REQ-010; D23): who, from, to
 * and a note. All members chosen is the whole household, otherwise one absence per person.
 * Editing a stripe edits all absences it stands for, in one change.
 */
export function AbsenceSheet(props: { stripe?: AbsenceStripe; onClose: () => void }) {
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();
  const editing = props.stripe;

  const [who, setWho] = useState<string[]>(() =>
    editing
      ? editing.household
        ? members.map((member) => member.id)
        : editing.memberIds
      : [me.id],
  );
  const [range, setRange] = useState<RangePick>({
    from: editing?.from ?? today,
    to: editing?.to ?? today,
    editing: null,
  });
  const [month, setMonth] = useState<ISODate>(startOfMonth(editing?.from ?? today));
  const [note, setNote] = useState(editing?.note ?? '');

  const problems = validateAbsenceDraft({ memberIds: who, from: range.from, to: range.to });
  // While "Bis" is being chosen right after "Von", the old "Bis" is not a mistake yet (AC-042).
  const showToError = problems.toBeforeFrom && range.editing !== 'to';
  const everyone = members.length > 0 && members.every((member) => who.includes(member.id));

  const toggle = (id: string) =>
    setWho(who.includes(id) ? who.filter((candidate) => candidate !== id) : [...who, id]);
  const openField = (field: 'from' | 'to') => {
    if (range.editing === field) {
      setRange({ ...range, editing: null });
      return;
    }
    setRange(openRangeField(range, field));
    setMonth(startOfMonth(range[field]));
  };

  const save = () => {
    if (online.disabled || problems.noOne || problems.toBeforeFrom) return;
    try {
      saveAbsences({
        replaceIds: editing?.absenceIds ?? [],
        memberIds: who,
        from: range.from,
        to: range.to,
        note: note.trim() || undefined,
      });
    } catch {
      toast.show({ message: 'Hat nicht geklappt – bitte noch einmal versuchen' });
      return;
    }
    toast.show({ message: editing ? 'Abwesenheit geändert' : 'Abwesenheit eingetragen' });
    props.onClose();
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={editing ? 'Abwesenheit bearbeiten' : 'Abwesenheit eintragen'}
      testID="absence-sheet"
      size="m"
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          onPress={save}
          disabled={online.disabled || problems.noOne}
          hint={online.hint ?? (problems.noOne ? 'Wähle, wer weg ist' : undefined)}
          testID="absence-save"
        />
      }
    >
      <Stack gap={18}>
        <Stack gap={8}>
          <Text variant="smallStrong">Wer?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                selected={who.includes(member.id)}
                onPress={() => toggle(member.id)}
                testID={`absence-member-${member.id}`}
              />
            ))}
          </View>
          <Text variant="caption" color="muted" testID="absence-who-hint">
            {problems.noOne
              ? 'Wähle, wer weg ist'
              : everyone
                ? 'Alle gewählt: gilt für den ganzen Haushalt'
                : 'Alle gewählt = ganzer Haushalt'}
          </Text>
        </Stack>
        <Stack gap={8}>
          <DateField
            label="Von"
            value={range.from}
            open={range.editing === 'from'}
            onPress={() => openField('from')}
            testID="absence-from"
          />
          <DateField
            label="Bis"
            value={range.to}
            open={range.editing === 'to'}
            onPress={() => openField('to')}
            error={showToError ? '„Bis“ liegt vor „Von“' : undefined}
            testID="absence-to"
          />
          {range.editing ? (
            <RangeCalendar
              month={month}
              range={range}
              today={today}
              onMonth={setMonth}
              onPick={(date) => setRange(pickRangeDate(range, date))}
            />
          ) : null}
        </Stack>
        <TextField
          label="Notiz (optional)"
          placeholder="z. B. Urlaub Mallorca"
          value={note}
          onChangeText={setNote}
          testID="absence-note"
        />
        <Text variant="small" color="muted">
          Wer weg ist, fehlt bei „Wer isst mit?“.
        </Text>
      </Stack>
    </Sheet>
  );
}

/** "Von  Fr 1.1.2027": opens the month calendar for this field. */
function DateField(props: {
  label: string;
  value: ISODate;
  open: boolean;
  onPress: () => void;
  error?: string;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        testID={props.testID}
        accessibilityRole="button"
        accessibilityLabel={`${props.label}: ${formatPickerDate(props.value)}`}
        accessibilityState={{ expanded: props.open }}
        onPress={props.onPress}
        style={(state) => {
          const { pressed, focused } = state as { pressed: boolean; focused?: boolean };
          return [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: 46,
              paddingHorizontal: 14,
              borderRadius: theme.shape.radius.input,
              borderWidth: props.open ? 2 : 1,
              borderColor: props.error
                ? theme.colors.warnText
                : props.open
                  ? theme.colors.accent
                  : theme.colors.border,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            },
            focused ? { borderColor: theme.colors.text } : null,
          ];
        }}
      >
        <Text variant="smallStrong" color="muted" style={{ width: 36 }}>
          {props.label}
        </Text>
        <Text testID={`${props.testID}-value`}>{formatPickerDate(props.value)}</Text>
      </Pressable>
      {props.error ? (
        <Text variant="small" color="warn" testID={`${props.testID}-error`}>
          {props.error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The month calendar in the absence window: starts with the field's month, ‹ › page without a
 * limit, the range from "Von" to "Bis" is marked across months and years (AC-042).
 */
function RangeCalendar(props: {
  month: ISODate;
  range: RangePick;
  today: ISODate;
  onMonth: (month: ISODate) => void;
  onPick: (date: ISODate) => void;
}) {
  const theme = useTheme();
  const { range } = props;
  const currentMonth = props.month.slice(0, 7);
  return (
    <View
      testID="range-picker"
      style={{
        padding: 8,
        borderRadius: theme.shape.radius.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          icon="chevron-left"
          label="Voriger Monat"
          onPress={() => props.onMonth(shiftPeriod('month', props.month, -1))}
          testID="range-prev"
        />
        <Text variant="bodyStrong" testID="range-title">
          {monthTitle(props.month)}
        </Text>
        <IconButton
          icon="chevron-right"
          label="Nächster Monat"
          onPress={() => props.onMonth(shiftPeriod('month', props.month, 1))}
          testID="range-next"
        />
      </View>
      <Text variant="caption" color="muted" style={{ textAlign: 'center', marginBottom: 4 }}>
        {range.editing === 'from' ? 'Wähle „Von“' : 'Wähle „Bis“'}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_HEADS.map((head) => (
          <Text key={head} variant="caption" color="muted" style={{ flex: 1, textAlign: 'center' }}>
            {head}
          </Text>
        ))}
      </View>
      {monthGrid(props.month).map((week) => (
        <View key={week[0]} style={{ flexDirection: 'row' }}>
          {week.map((date) => {
            if (date.slice(0, 7) !== currentMonth) return <View key={date} style={{ flex: 1 }} />;
            const marked = inRange(date, range.from, range.to);
            const edge = date === range.from || date === range.to;
            return (
              <Pressable
                key={date}
                testID={`range-day-${date}`}
                accessibilityRole="button"
                accessibilityLabel={formatPickerDate(date)}
                accessibilityState={{ selected: marked }}
                onPress={() => props.onPick(date)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: edge
                      ? theme.colors.accent
                      : marked
                        ? theme.colors.accentSoft
                        : 'transparent',
                    borderWidth: date === props.today && !edge ? 1 : 0,
                    borderColor: theme.colors.accent,
                  }}
                >
                  <Text
                    variant="small"
                    style={{ color: edge ? theme.colors.onAccent : theme.colors.text }}
                  >
                    {String(parseISODate(date).getDate())}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Avatars of a stripe for list rows: the house for the whole household. */
export function AbsenceWho(props: { stripe: AbsenceStripe }) {
  const members = useMembers();
  const people = props.stripe.household
    ? members
    : members.filter((member) => props.stripe.memberIds.includes(member.id));
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {people.map((member) => (
        <Avatar key={member.id} name={member.name} color={member.color} size="s" />
      ))}
    </View>
  );
}
