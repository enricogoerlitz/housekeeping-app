import {
  createTrip,
  updateTrip,
  useCurrentMember,
  useMembers,
  usePackingBagItems,
  usePackingBags,
  useToday,
} from '@housekeeping/api';
import {
  tripWhoHint,
  formatPickerDate,
  monthTitle,
  openRangeField,
  pickRangeDate,
  planPackingList,
  saveLabel,
  startOfMonth,
  validateTripDraft,
  type TripStripe,
  type Id,
  type ISODate,
  type RangePick,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Chip,
  MonthCalendar,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
  useTheme,
  expandableA11y,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { messageOf } from '@/features/packing/packing-labels';
import { useOnlineOnly } from '@/features/shell/offline';

import { TripBagChips } from './trip-bag-chips';

const WEEKDAY_HEADS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/**
 * "Reise eintragen" and "Reise bearbeiten" (spec 0010, REQ-010; spec 0022, REQ-003, REQ-004):
 * who, from, to and a note of one trip. Entering one also offers the Reisetaschen; "Speichern ·
 * 21 Packstücke" creates the trip, its people and its packing list in one call. Editing keeps the
 * packing list, whoever is on the trip.
 * `initialRange` fills "Von" and "Bis" of a new one, e.g. the day of the day window (spec 0016,
 * AC-032) or the days drawn over the grid (AC-028).
 */
export function TripSheet(props: {
  stripe?: TripStripe;
  initialRange?: { from: ISODate; to: ISODate };
  /** The cursor starts in "Notiz", after a trip was drawn over the days (spec 0016, REQ-007). */
  focusNote?: boolean;
  onClose: () => void;
}) {
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();
  const editing = props.stripe;

  const [who, setWho] = useState<string[]>(() => (editing ? editing.memberIds : [me.id]));
  const [range, setRange] = useState<RangePick>({
    from: editing?.from ?? props.initialRange?.from ?? today,
    to: editing?.to ?? props.initialRange?.to ?? today,
    editing: null,
  });
  const [month, setMonth] = useState<ISODate>(
    startOfMonth(editing?.from ?? props.initialRange?.from ?? today),
  );
  const [note, setNote] = useState(editing?.note ?? '');
  const [bagIds, setBagIds] = useState<Id[]>([]);
  const bags = usePackingBags();
  const bagItems = usePackingBagItems();

  const problems = validateTripDraft({ memberIds: who, from: range.from, to: range.to });
  // While "Bis" is being chosen right after "Von", the old "Bis" is not a mistake yet (AC-042).
  const showToError = problems.toBeforeFrom && range.editing !== 'to';

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

  // The Packstücke of the new packing list, for the button.
  const newItemCount =
    editing || bagIds.length === 0
      ? 0
      : planPackingList({
          trip: { id: 'draft', from: range.from, to: range.to },
          bagIds,
          bags,
          bagItems,
          newId: () => 'draft',
        }).items.length;

  const save = () => {
    if (online.disabled || problems.noOne || problems.toBeforeFrom) return;
    const fields = {
      memberIds: who,
      from: range.from,
      to: range.to,
      note: note.trim(),
    };
    try {
      if (editing) updateTrip(editing.tripId, fields);
      else createTrip({ ...fields, bagIds });
    } catch (failure) {
      toast.show({ message: messageOf(failure) });
      return;
    }
    toast.show({ message: editing ? 'Reise geändert' : 'Reise eingetragen' });
    props.onClose();
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={editing ? 'Reise bearbeiten' : 'Reise eintragen'}
      testID="trip-sheet"
      size="m"
      footer={
        <Button
          label={saveLabel(newItemCount)}
          icon="check"
          full
          onPress={save}
          disabled={online.disabled || problems.noOne}
          hint={online.hint ?? (problems.noOne ? 'Wähle, wer unterwegs ist' : undefined)}
          testID="trip-save"
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
                testID={`trip-member-${member.id}`}
              />
            ))}
          </View>
          <Text variant="caption" color="muted" testID="trip-who-hint">
            {tripWhoHint(who, members)}
          </Text>
        </Stack>
        <Stack gap={8}>
          <DateField
            label="Von"
            value={range.from}
            open={range.editing === 'from'}
            onPress={() => openField('from')}
            testID="trip-from"
          />
          <DateField
            label="Bis"
            value={range.to}
            open={range.editing === 'to'}
            onPress={() => openField('to')}
            error={showToError ? '„Bis“ liegt vor „Von“' : undefined}
            testID="trip-to"
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
          autoFocus={props.focusNote}
          testID="trip-note"
        />
        {editing ? null : (
          <TripBagChips selected={bagIds} onChange={setBagIds} disabled={online.disabled} />
        )}
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
        {...expandableA11y(
          `${props.label}: ${formatPickerDate(props.value)}`,
          props.open,
          Platform.OS,
        )}
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
 * The month calendar in the trip window: starts with the field's month, ‹ › page without a
 * limit, the range from "Von" to "Bis" is marked across months and years (AC-042).
 */
function RangeCalendar(props: {
  month: ISODate;
  range: RangePick;
  today: ISODate;
  onMonth: (month: ISODate) => void;
  onPick: (date: ISODate) => void;
}) {
  const { range } = props;
  return (
    <MonthCalendar
      month={props.month}
      onMonthChange={props.onMonth}
      onSelect={props.onPick}
      title={monthTitle(props.month)}
      weekdayLabels={WEEKDAY_HEADS}
      previousLabel="Voriger Monat"
      nextLabel="Nächster Monat"
      dayLabel={formatPickerDate}
      marked={{ from: range.from, to: range.to }}
      focusDate={range.editing === 'to' ? range.to : range.from}
      today={props.today}
      hint={range.editing === 'from' ? 'Wähle „Von“' : 'Wähle „Bis“'}
      testID="range"
    />
  );
}

/** Avatars of a stripe for list rows: the house for the whole household. */
export function TripWho(props: { stripe: TripStripe }) {
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
