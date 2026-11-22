import {
  movePlanEntry,
  NOTE_MAX_LENGTH,
  removePlanEntry,
  saveEntryFields,
  setReservation,
  snapshot,
  updatePlanEntry,
  useActivitiesById,
  useHousehold,
  useMembers,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
  useToday,
} from '@housekeeping/api';
import {
  asksForPushPermission,
  DEFAULT_REMIND_MINUTES,
  formatTime,
  isSelectableMoveDay,
  monthPickerStart,
  moveBounds,
  householdClock,
  offersReminder,
  parseTimeInput,
  REMIND_CHOICES,
  remindLabel,
  type DropTarget,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type TimeOfDay,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  Menu,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  TimeField,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { hasPlace } from '@/features/activities/labels';
import { useMoveEntry } from '@/features/calendar/move-entry';
import { PlanDateCalendar } from '@/features/calendar/plan-date-calendar';
import { useEnsureDevicePush } from '@/features/notifications/use-device-push';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet, type RouteTarget } from '@/features/restaurants/route-sheet';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { dayLabel, entryTitle } from './labels';
import { ReminderBlock, useReminderForm } from './reminder-block';

function Label(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/**
 * Actions for one entry in the plan: open the recipe, restaurant or activity, the Zusatz and
 * "Route" of an activity, "Route", "Reserviert um" and "Erinnern … vorher" of a restaurant (spec
 * 0013, REQ-008), move, change the cook, remove. "Fertig" saves the typed Zusatz and time and
 * closes once the server took them; on a refusal the window stays open with the typed text and
 * the general hint (spec 0018, REQ-003). "Erinnern" (spec 0017, REQ-002) sends switch, day and time
 * at once; "Fertig" sends its text the same way. Offline it only closes.
 */
export function EntrySheet(props: {
  entryId: Id;
  weekDates: ISODate[];
  onClose: () => void;
  /** "Verschieben" first: the screen reader's way to move an entry (spec 0016, platforms). */
  moveFirst?: boolean;
}) {
  const router = useRouter();
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const members = useMembers();
  const household = useHousehold();
  const online = useOnlineOnly();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const [routeOpen, setRouteOpen] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const moveEntry = useMoveEntry();
  const today = useToday();
  const entry = entries.find((candidate) => candidate.id === props.entryId);
  const reservation = useReservationDraft(entry);
  const note = useNoteDraft(entry);
  const reminder = useReminderForm({
    entryDate: entry?.date ?? today,
    slotName: household.mealSlots.find((slot) => slot.id === entry?.slotId)?.name ?? '',
    stored: entry?.reminder,
    entryId: entry?.id,
  });
  const [saving, setSaving] = useState(false);
  // A late answer must not close a window opened after this one was closed with ✕.
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    [],
  );
  if (!entry) return null;
  const title = entryTitle(entry, recipesById, entries, restaurantsById, activitiesById);
  const activity =
    entry.kind === 'activity' && entry.activityId ? activitiesById[entry.activityId] : undefined;
  const restaurant =
    entry.kind === 'restaurant' && entry.restaurantId
      ? restaurantsById[entry.restaurantId]
      : undefined;
  // "Route" only where there is a place (plan, Decision 11): a map link or an address.
  const routeTarget: RouteTarget | undefined = activity
    ? hasPlace(activity)
      ? {
          name: activity.name,
          address: activity.address,
          location: activity.location,
          placeName: activity.placeName,
        }
      : undefined
    : restaurant && (restaurant.location || restaurant.address)
      ? restaurant
      : undefined;

  // Spec 0017, AC-007: not for "vorgemerkt" and not for a day that has passed (household's date).
  const remindable = offersReminder(
    entry.date,
    householdClock(new Date(), household.timeZone).date,
  );

  if (routeOpen && routeTarget) {
    return <RouteSheet restaurant={routeTarget} visible onClose={() => setRouteOpen(false)} />;
  }

  const done = () => {
    if (online.disabled) {
      props.onClose();
      return;
    }
    if (saving) return;
    if (entry.kind === 'restaurant' && !reservation.save('tap')) return;
    // Closing is the success here; a toast before the server answered could be wrong (AC-009).
    if (entry.kind === 'activity' && !note.save({ notify: false })) return;
    if (remindable && !reminder.save()) return;
    setSaving(true);
    Promise.all([reservation.pending(), note.pending(), reminder.pending()]).then(
      () => {
        if (open.current) props.onClose();
      },
      // The refusal's hint comes from onWriteRejected; the typed text stays (AC-009).
      () => {
        if (open.current) setSaving(false);
      },
    );
  };

  // Day chips, "Vormerken" and "Anderes Datum …" move as dragging does (spec 0016, REQ-005).
  const moveTo = (target: DropTarget) => {
    if (moveEntry(entry, target) === 'moved') props.onClose();
  };
  const bounds = moveBounds(entry, entries);

  const changeSlot = (slotId: Id) => {
    if (entry.date) {
      moveTo({ kind: 'slot', date: entry.date, slotId });
      return;
    }
    movePlanEntry(entry.id, null, slotId);
    toast.show({ message: `„${title}“ ist vorgemerkt` });
    props.onClose();
  };

  const remove = () => {
    const restore = snapshot();
    removePlanEntry(entry.id);
    props.onClose();
    toast.show({
      message: `„${title}“ entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const moveSection = (
    <View testID="entry-move-section">
      <Label>Verschieben</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {props.weekDates.map((date) => (
          <Chip
            key={date}
            label={dayLabel(date)}
            selected={entry.date === date}
            disabled={online.disabled}
            testID={`entry-move-${date}`}
            onPress={() => moveTo({ kind: 'day', date })}
          />
        ))}
        <Chip
          label="Vormerken"
          icon="bookmark"
          selected={entry.date === null}
          disabled={online.disabled}
          testID="entry-move-later"
          onPress={() => moveTo({ kind: 'parked' })}
        />
        <Chip
          label="Anderes Datum …"
          icon="calendar-days"
          selected={pickingDate}
          disabled={online.disabled}
          testID="entry-move-other"
          onPress={() => setPickingDate(!pickingDate)}
        />
      </View>
      {pickingDate ? (
        <View style={{ marginTop: 12 }}>
          <PlanDateCalendar
            month={monthPickerStart(entry.date, today)}
            today={today}
            marked={entry.date}
            isDisabled={(date) => online.disabled || !isSelectableMoveDay(bounds, date)}
            onSelect={(date) => moveTo({ kind: 'day', date })}
            testID="entry-move-date"
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={title}
      testID="entry-sheet"
      size="m"
      footer={<Button label="Fertig" full disabled={saving} onPress={done} testID="entry-done" />}
    >
      <Stack gap={20}>
        {props.moveFirst ? moveSection : null}
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        {entry.recipeId && entry.kind === 'recipe' ? (
          <Button
            label={
              recipesById[entry.recipeId]?.kind === 'collection'
                ? 'Sammlung öffnen'
                : 'Rezept öffnen'
            }
            icon="book-open"
            variant="secondary"
            testID="entry-open-recipe"
            onPress={() => {
              const recipeId = entry.recipeId;
              props.onClose();
              if (recipeId) openRecipe(recipeId);
            }}
          />
        ) : null}
        {activity ? (
          <Row gap={10} wrap>
            <Button
              label="Aktivität öffnen"
              icon="mountain"
              variant="secondary"
              testID="entry-open-activity"
              onPress={() => {
                props.onClose();
                router.push({ pathname: '/kalender/aktivitaet/[id]', params: { id: activity.id } });
              }}
            />
            {routeTarget ? (
              <Button
                label="Route"
                icon="map-pin"
                variant="secondary"
                testID="entry-route"
                onPress={() => setRouteOpen(true)}
              />
            ) : null}
          </Row>
        ) : null}
        {entry.kind === 'activity' ? <NoteField draft={note} disabled={online.disabled} /> : null}
        {entry.restaurantId && entry.kind === 'restaurant' ? (
          <Row gap={10} wrap>
            <Button
              label="Restaurant öffnen"
              icon="utensils"
              variant="secondary"
              testID="entry-open-restaurant"
              onPress={() => {
                const restaurantId = entry.restaurantId;
                props.onClose();
                if (restaurantId) openRestaurant(restaurantId);
              }}
            />
            {routeTarget ? (
              <Button
                label="Route"
                icon="map-pin"
                variant="secondary"
                testID="entry-route"
                onPress={() => setRouteOpen(true)}
              />
            ) : null}
          </Row>
        ) : null}
        {entry.kind === 'restaurant' ? (
          <ReservationFields
            entry={entry}
            draft={reservation}
            disabled={online.disabled}
            hint={online.hint}
          />
        ) : null}
        {remindable ? (
          <ReminderBlock
            form={reminder}
            disabled={online.disabled}
            hint={online.hint}
            onOpenSettings={() => {
              props.onClose();
              router.push('/einstellungen/benachrichtigungen');
            }}
            testID="entry-reminder"
          />
        ) : null}
        {props.moveFirst ? null : moveSection}
        {household.mealSlots.length > 1 ? (
          <View>
            <Label>Tageszeit</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {household.mealSlots.map((slot) => (
                <Chip
                  key={slot.id}
                  label={slot.name}
                  selected={entry.slotId === slot.id}
                  disabled={online.disabled}
                  testID={`entry-slot-${slot.id}`}
                  onPress={() => changeSlot(slot.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {entry.kind === 'restaurant' || entry.kind === 'activity' ? null : (
          <View>
            <Label>Wer kocht?</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {members.map((member) => (
                <Chip
                  key={member.id}
                  label={member.name}
                  icon="chef-hat"
                  selected={entry.cookId === member.id}
                  disabled={online.disabled}
                  testID={`entry-sheet-cook-${member.id}`}
                  onPress={() =>
                    updatePlanEntry(entry.id, {
                      cookId: entry.cookId === member.id ? undefined : member.id,
                    })
                  }
                />
              ))}
            </View>
          </View>
        )}
        <Button
          label="Aus dem Plan nehmen"
          icon="trash"
          variant="ghost"
          disabled={online.disabled}
          hint={online.hint}
          testID="entry-remove"
          onPress={remove}
        />
      </Stack>
    </Sheet>
  );
}

interface NoteDraft {
  note: string;
  error: string | undefined;
  changed: boolean;
  setNote: (note: string) => void;
  /**
   * Sends the typed Zusatz if it changed; false (with the error shown) when it cannot. `notify`
   * (default true) shows "Zusatz gespeichert" at once, as "Zusatz speichern" and Enter do.
   */
  save: (options?: { notify?: boolean }) => boolean;
  /** Resolves once the server took what was sent last, rejects when it refused it. */
  pending: () => Promise<void>;
}

/** The typed Zusatz of an activity entry: saved with "Zusatz speichern", Enter and "Fertig". */
function useNoteDraft(entry: MealPlanEntry | undefined): NoteDraft {
  const stored = entry?.note ?? '';
  const [note, setNoteState] = useState(stored);
  const [error, setError] = useState<string>();
  const sent = useRef<Promise<void>>(Promise.resolve());
  const changed = note.trim() !== stored;

  return {
    note,
    error,
    changed,
    setNote: (next) => {
      setNoteState(next);
      if (error) setError(undefined);
    },
    save: ({ notify = true } = {}) => {
      if (!entry || !changed) return true;
      try {
        sent.current = saveEntryFields(entry.id, { note });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
        return false;
      }
      if (notify) toast.show({ message: note.trim() ? 'Zusatz gespeichert' : 'Zusatz entfernt' });
      return true;
    },
    pending: () => sent.current,
  };
}

/** The Zusatz of an activity in the plan, "Eislaufen (Hohenschönhausen)" (AC-013). */
function NoteField(props: { draft: NoteDraft; disabled: boolean }) {
  const { draft } = props;
  const save = () => {
    if (!props.disabled) draft.save();
  };

  return (
    <View style={{ gap: 8 }}>
      <TextField
        label="Zusatz"
        value={draft.note}
        onChangeText={draft.setNote}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="z. B. Hohenschönhausen"
        editable={!props.disabled}
        error={draft.error}
        hint="Steht im Plan in Klammern hinter dem Namen."
        returnKeyType="done"
        onSubmitEditing={save}
        testID="entry-note-input"
      />
      {draft.changed ? (
        <Button
          label="Zusatz speichern"
          icon="check"
          size="sm"
          variant="secondary"
          disabled={props.disabled}
          onPress={save}
          testID="entry-note-save"
        />
      ) : null}
    </View>
  );
}

interface ReservationDraft {
  text: string;
  error: string | undefined;
  setText: (text: string) => void;
  /**
   * Saves the typed time if it changed; false (with the error shown) when it cannot. Only Enter
   * and "Fertig" ask for this device's permission, leaving the field does not (AC-007).
   */
  save: (gesture: 'tap' | 'enter' | 'blur') => boolean;
  clear: () => void;
  /** Resolves once the server took the time sent last, rejects when it refused it. */
  pending: () => Promise<void>;
}

/**
 * The typed "Reserviert um" of a restaurant entry: saved on Enter, when the field loses focus and
 * with "Fertig" (AC-027); ✕ removes it at once. Only five-minute steps (Decision 4). The browser's
 * permission is asked only on Enter and "Fertig" (AC-007): a time saved on blur is asked for when
 * "Fertig" or Enter confirms it.
 */
function useReservationDraft(entry: MealPlanEntry | undefined): ReservationDraft {
  const stored = entry?.reservedAt;
  const [text, setTextState] = useState(stored ? formatTime(stored) : '');
  const [error, setError] = useState<string>();
  // What was sent last: blur and "Fertig" come one after the other, before the next render.
  const saved = useRef<TimeOfDay | null | undefined>(stored);
  const sent = useRef<Promise<void>>(Promise.resolve());
  // The time last confirmed with Enter or "Fertig" (or the stored one): blur saves without asking.
  const confirmed = useRef<TimeOfDay | undefined>(stored);
  const ensureDevicePush = useEnsureDevicePush();

  const write = (
    time: TimeOfDay | undefined,
    gesture: 'tap' | 'enter' | 'blur',
    notify = false,
  ): boolean => {
    if (!entry) return true;
    // Asked first, inside the tap or key press (spec 0013, AC-007, Decision 26).
    if (asksForPushPermission({ kind: 'time', gesture, before: confirmed.current, after: time })) {
      ensureDevicePush();
    }
    if (gesture !== 'blur') confirmed.current = time;
    if (time === saved.current) return true;
    let taken: Promise<void>;
    try {
      taken = saveEntryFields(entry.id, { reservedAt: time ?? null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
      return false;
    }
    saved.current = time;
    // Refused: the entry sprang back, so the next "Fertig" sends the typed time again (AC-009).
    sent.current = taken.catch((refusal: unknown) => {
      if (saved.current === time) saved.current = null;
      throw refusal;
    });
    const notice = () =>
      toast.show({ message: time ? `Reserviert um ${formatTime(time)}` : 'Reservierung entfernt' });
    // "Fertig" ('tap') closes as its success. Leaving the field comes right before "Fertig", so
    // its notice waits for the server (spec 0018, AC-009); Enter and ✕ say it at once as before.
    if (gesture === 'blur') sent.current.then(notice, () => {});
    else if (gesture === 'enter' || notify) notice();
    // Only "Fertig" waits for it; the hint of a refusal comes from onWriteRejected.
    sent.current.catch(() => {});
    return true;
  };

  return {
    text,
    error,
    setText: (next) => {
      setTextState(next);
      setError(undefined);
    },
    save: (gesture) => {
      const result = parseTimeInput(text);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      return write(result.time, gesture);
    },
    clear: () => {
      setTextState('');
      setError(undefined);
      write(undefined, 'tap', true);
    },
    pending: () => sent.current,
  };
}

/**
 * "Reserviert um 19:30 ✕" and, with a time, "Erinnern 2 h vorher ▾" (spec 0013, D43, AC-027,
 * AC-029). Offline both are greyed out with the hint.
 */
function ReservationFields(props: {
  entry: MealPlanEntry;
  draft: ReservationDraft;
  disabled: boolean;
  hint: string | undefined;
}) {
  const { entry, draft } = props;
  const remind = entry.remindMinutesBefore ?? DEFAULT_REMIND_MINUTES;
  return (
    <View style={{ gap: 12 }}>
      <TimeField
        label="Reserviert um"
        placeholder="z. B. 19:30"
        value={draft.text}
        onChangeText={draft.setText}
        onBlur={() => {
          if (!props.disabled) draft.save('blur');
        }}
        onSubmitEditing={() => {
          if (!props.disabled) draft.save('enter');
        }}
        onClear={draft.clear}
        clearLabel="Reservierung entfernen"
        emptyLabel="keine Reservierung"
        error={draft.error}
        hint={props.hint ?? 'Die Uhrzeit, für die ihr reserviert habt.'}
        disabled={props.disabled}
        testID="entry-reserved-at"
      />
      {entry.reservedAt ? (
        <Menu<string>
          label={`Erinnern ${remindLabel(remind)}`}
          accessibilityLabel={`Erinnern: ${remindLabel(remind)}`}
          icon="bell"
          value={String(remind)}
          options={REMIND_CHOICES.map((minutes) => ({
            value: String(minutes),
            label: remindLabel(minutes),
            disabled: props.disabled,
            hint: props.hint,
          }))}
          onChange={(value) => {
            const minutes = REMIND_CHOICES.find((choice) => String(choice) === value);
            if (minutes === undefined || minutes === remind) return;
            try {
              setReservation(entry.id, { remindMinutesBefore: minutes });
            } catch {
              toast.show({ message: 'Hat nicht geklappt – bitte noch einmal versuchen' });
              return;
            }
            toast.show({ message: `Erinnerung ${remindLabel(minutes)}` });
          }}
          testID="entry-remind"
        />
      ) : null}
    </View>
  );
}
