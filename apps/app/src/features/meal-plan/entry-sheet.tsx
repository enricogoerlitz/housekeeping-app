import {
  movePlanEntry,
  NOTE_MAX_LENGTH,
  removePlanEntry,
  saveEntry,
  updatePlanEntry,
  useActivitiesById,
  useHousehold,
  useMembers,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
  useShoppingItems,
  useToday,
  WRITE_REJECTED_MESSAGE,
  type EntryFields,
} from '@housekeeping/api';
import {
  showsRoute,
  canMarkNotDone,
  checkEntryNote,
  checkEntryText,
  entryListShare,
  formatShortDate,
  isSelectableMoveDay,
  MAX_ENTRY_TEXT,
  monthPickerStart,
  moveBounds,
  offersReminder,
  planEntryCalendarEvent,
  planEntryPhoto,
  reminderAfterStart,
  startOfWeek,
  TIME_FIELD_WORDS,
  variantRows,
  weekDates,
  weekdayShort,
  type DropTarget,
  type Id,
  type ISODate,
  type TimeOfDay,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  Row,
  Sheet,
  Stack,
  SwitchRow,
  Text,
  TextField,
  TimeField,
  toast,
} from '@housekeeping/ui';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AddToCalendar, appLink } from '@/features/calendar/add-to-calendar';
import { useMoveEntry } from '@/features/calendar/move-entry';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';
import { useOpenActivity } from '@/features/activities/navigation';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet, type RouteTarget } from '@/features/restaurants/route-sheet';
import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';

import { EntryPhoto } from './entry-photo';
import { entryTitle } from './labels';
import { EaterPicker, PortionFields, usePortions } from './plan-fields';
import { ReminderBlock, useReminderForm } from './reminder-block';
import { entryReminderLabels, ReminderBell } from './reminder-bell';
import { errorMessage } from '@/features/shell/error-message';

/** The example in "Zusatz", fitting the kind of entry (review 0003, browser click-through). */
const NOTE_EXAMPLE: Record<MealPlanEntry['kind'], string> = {
  recipe: 'z. B. doppelte Menge',
  leftovers: 'z. B. mit Salat',
  text: 'z. B. mit Salat',
  restaurant: 'z. B. Tisch draußen',
  activity: 'z. B. Hohenschönhausen',
};

function Label(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** The names of the fields in "Nicht gespeichert: Was gibt es?" (REQ-009). */
const FIELD_NAMES = { text: 'Was gibt es?', note: 'Zusatz' } as const;
type TypedField = keyof typeof FIELD_NAMES;

const zutaten = (count: number) => (count === 1 ? '1 Zutat' : `${count} Zutaten`);

/**
 * The window of one entry in the plan (spec 0021): everything chosen when planning can be changed
 * here — "Was gibt es?", "Zusatz", "Uhrzeit (optional)" of restaurants and activities, "Wer isst
 * mit?", guests, portions and variants, day and Tageszeit, "Wer kocht?" and "Erinnern". Day,
 * Tageszeit, cook and the switch, day and time of the reminder are saved at once and the window
 * stays open (REQ-010); everything else is saved in one call when it closes, however it closes
 * (REQ-009), and the shopping list follows the portions (REQ-007). An invalid field keeps it open
 * with its reason; a second ✕ closes it with what is valid. Offline it only closes.
 */
export function EntrySheet(props: {
  entryId: Id;
  weekDates: ISODate[];
  onClose: () => void;
  /** "Verschieben" first: the screen reader's way to move an entry (spec 0016, platforms). */
  moveFirst?: boolean;
}) {
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const members = useMembers();
  const household = useHousehold();
  const items = useShoppingItems();
  const online = useOnlineOnly();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const openActivity = useOpenActivity();
  const [routeOpen, setRouteOpen] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const moveEntry = useMoveEntry();
  const today = useToday();
  const current = entries.find((candidate) => candidate.id === props.entryId);
  // Removed on another device while the window is open: it stays with what was typed, and
  // closing says it did not work (AC-027); a second close closes.
  const [last, setLast] = useState(current);
  if (current && current !== last) setLast(current);
  const gone = current === undefined;
  const entry = current ?? last;
  const recipe = entry?.recipeId ? recipesById[entry.recipeId] : undefined;

  // The typed fields (REQ-008, REQ-013), saved on closing.
  const [text, setText] = useState(entry?.text ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [startsAt, setStartsAt] = useState<TimeOfDay | undefined>(entry?.startsAt);
  const [errors, setErrors] = useState<Partial<Record<TypedField, string>>>({});
  const [refused, setRefused] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A second ✕ after a hint closes with what is valid (REQ-009, AC-026).
  const hinted = useRef(false);
  const portions = usePortions(recipe?.kind === 'recipe' ? recipe : undefined, () => ({
    eaterIds: entry?.eaterIds ?? [],
    guests: entry?.guests ?? 0,
    portions: entry?.portions ?? 0,
    variants:
      recipe?.kind === 'recipe'
        ? variantRows(recipe, entry?.variants ?? [], entry?.portions ?? 0)
        : [],
  }));
  const reminder = useReminderForm({
    entryDate: entry?.date ?? today,
    slotName: household.mealSlots.find((slot) => slot.id === entry?.slotId)?.name ?? '',
    stored: entry?.reminder,
    entryId: entry?.id,
    startsAt,
  });
  // A late answer must not close a window opened after this one was closed.
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
  // Spec 0047, REQ-004: the photo on top, only where there is one.
  const photo = planEntryPhoto(entry, { recipesById, restaurantsById, activitiesById });
  const timed = entry.kind === 'restaurant' || entry.kind === 'activity';
  const eats = entry.kind === 'recipe' || entry.kind === 'restaurant';
  // "Route" only with a map link (spec 0036, AC-018; before plan Decision 11: or an address).
  const routeTarget: RouteTarget | undefined = activity
    ? showsRoute(activity)
      ? {
          name: activity.name,
          address: activity.address,
          location: activity.location,
          placeName: activity.placeName,
        }
      : undefined
    : restaurant && showsRoute(restaurant)
      ? restaurant
      : undefined;

  // Spec 0017, AC-007: not for "vorgemerkt" and not for a day that has passed (household's date).
  const remindable = offersReminder(entry.date, today);
  // A passed day offers no block, but its reminder still shows: "Erinnerung vorbei" (REQ-006).
  const pastReminder = remindable
    ? undefined
    : entryReminderLabels(entry, title, household.timeZone);

  if (routeOpen && routeTarget) {
    return <RouteSheet restaurant={routeTarget} visible onClose={() => setRouteOpen(false)} />;
  }

  /** The typed fields that changed, and the hint of each invalid one. */
  const collect = (): { fields: EntryFields; invalid: Partial<Record<TypedField, string>> } => {
    const fields: EntryFields = {};
    const invalid: Partial<Record<TypedField, string>> = {};
    if (entry.kind === 'text' && text.trim() !== (entry.text ?? '')) {
      const check = checkEntryText(text);
      if (check.ok) fields.text = text;
      else invalid.text = check.error;
    }
    if (note.trim() !== (entry.note ?? '')) {
      const check = checkEntryNote(note);
      if (check.ok) fields.note = note;
      else invalid.note = check.error;
    }
    if (timed && startsAt !== entry.startsAt) fields.startsAt = startsAt ?? null;
    const state = portions.state;
    if (eats) {
      fields.eaterIds = state.eaterIds;
      fields.guests = state.guests;
      fields.portions = state.portions;
      if (state.variants.length > 0) fields.variants = state.variants;
    } else if (entry.kind === 'activity') {
      // Spec 0041, REQ-005: "Wer ist dabei?" and "Gäste".
      fields.eaterIds = state.eaterIds;
      fields.guests = state.guests;
    }
    if (
      reminder.draft.on &&
      entry.reminder &&
      reminder.draft.text !== (entry.reminder.text ?? '')
    ) {
      fields.reminderText = reminder.draft.text;
    }
    return { fields, invalid };
  };

  const send = (fields: EntryFields, after: () => void) => {
    let saved: Promise<string | undefined>;
    if (gone) {
      setRefused(WRITE_REJECTED_MESSAGE);
      return;
    }
    try {
      saved = saveEntry(entry.id, fields);
    } catch (caught) {
      setRefused(errorMessage(caught));
      return;
    }
    setSaving(true);
    saved.then(
      (listLabel) => {
        if (!open.current) return;
        setSaving(false);
        after();
        if (listLabel) toast.show({ message: `Einkaufsliste angepasst: ${listLabel}` });
      },
      // The entry and the list sprang back; what was typed stays (AC-027).
      () => {
        if (!open.current) return;
        setSaving(false);
        setRefused(WRITE_REJECTED_MESSAGE);
      },
    );
  };

  /** Every way of closing saves (REQ-009): "Fertig" (`done`), ✕, Escape, swipe down, back. */
  const close = (how: 'done' | 'dismiss') => {
    if (online.disabled) {
      props.onClose();
      return;
    }
    if (saving) return;
    if (gone && (how === 'dismiss' || refused)) {
      props.onClose();
      return;
    }
    const { fields, invalid } = collect();
    const names = (Object.keys(invalid) as TypedField[]).map((field) => FIELD_NAMES[field]);
    if (names.length > 0 && !(how === 'dismiss' && hinted.current)) {
      hinted.current = true;
      setErrors(invalid);
      return;
    }
    send(fields, () => {
      props.onClose();
      if (names.length > 0) toast.show({ message: `Nicht gespeichert: ${names.join(', ')}` });
    });
  };

  /** Enter saves one field at once (REQ-009); the window stays open. */
  const saveField = (field: TypedField) => {
    if (online.disabled) return;
    const check = field === 'text' ? checkEntryText(text) : checkEntryNote(note);
    if (!check.ok) {
      setErrors({ ...errors, [field]: check.error });
      return;
    }
    send(field === 'text' ? { text } : { note }, () => {});
  };

  // Day chips, "Vormerken" and "Anderes Datum …" move as dragging does (spec 0016, REQ-005); the
  // window stays open with the new state (REQ-010).
  const moveTo = (target: DropTarget) => {
    if (moveEntry(entry, target) === 'moved') setPickingDate(false);
  };
  const slotOrder = household.mealSlots.map((slot) => slot.id);
  const bounds = moveBounds(entry, entries, slotOrder);
  // The week of the entry's day, after "Anderes Datum …" too (AC-029).
  const chipDates = entry.date ? weekDates(startOfWeek(entry.date)) : props.weekDates;

  const changeSlot = (slotId: Id) => {
    if (entry.date) {
      moveTo({ kind: 'slot', date: entry.date, slotId });
      return;
    }
    movePlanEntry(entry.id, null, slotId);
    toast.show({ message: `„${title}“ ist vorgemerkt` });
  };

  const share = entryListShare(items, entry.id);
  const remove = (withList: boolean) => {
    const taken = removePlanEntry(entry.id, { withList });
    setConfirmRemove(false);
    props.onClose();
    toast.show({
      message:
        taken > 0
          ? `${title} entfernt · ${zutaten(taken)} von der Liste genommen`
          : `„${title}“ entfernt`,
    });
  };
  // Without list ingredients the plain question; with them the window below (spec 0036,
  // Entscheidung 1; spec 0021, REQ-015).
  const askRemove = () =>
    share
      ? setConfirmRemove(true)
      : confirmFirst({
          title: `„${title}“ entfernen?`,
          confirmLabel: 'Entfernen',
          onConfirm: () => remove(false),
          testID: 'confirm-remove-entry',
        });

  const setField = (field: TypedField, value: string) => {
    if (field === 'text') setText(value);
    else setNote(value);
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
    setRefused(undefined);
  };

  const moveSection = (
    <View testID="entry-move-section">
      <Label>Verschieben</Label>
      <ChoiceChips
        label="Tag"
        options={chipDates.map((date) => ({
          value: date,
          label: weekdayShort(date),
          detail: formatShortDate(date),
        }))}
        // No day is chosen while the entry is "vorgemerkt".
        value={entry.date ?? ''}
        onChange={(date) => moveTo({ kind: 'day', date })}
        disabled={online.disabled}
        hint={online.hint}
        // Spec 0030, REQ-005: seven equal chips, so a move to another week never shifts them.
        fill
        testID="entry-move"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
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
      onClose={() => close('dismiss')}
      title={title}
      testID="entry-sheet"
      size="m"
      // Closing keeps the changes like "Fertig", so there is no "Abbrechen" (spec 0032).
      actions={{
        cancel: null,
        primary: {
          label: 'Fertig',
          disabled: saving,
          onPress: () => close('done'),
          testID: 'entry-done',
        },
      }}
      footer={
        refused ? (
          <Text variant="small" color="warn" testID="entry-refused">
            {refused}
          </Text>
        ) : undefined
      }
    >
      <Stack gap={20}>
        {photo ? <EntryPhoto photo={photo} name={title} /> : null}
        {props.moveFirst ? moveSection : null}
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        {entry.recipeId && entry.kind === 'recipe' ? (
          <Button
            label={recipe?.kind === 'collection' ? 'Sammlung öffnen' : 'Rezept öffnen'}
            icon="book-open"
            variant="secondary"
            testID="entry-open-recipe"
            // The entry stays open underneath: "Zurück" returns to it (spec 0019, AC-016).
            onPress={() => {
              if (entry.recipeId) openRecipe(entry.recipeId);
            }}
          />
        ) : null}
        {activity || restaurant ? (
          <Row gap={10} wrap>
            {activity ? (
              <Button
                label="Aktivität öffnen"
                icon="mountain"
                variant="secondary"
                testID="entry-open-activity"
                // The entry stays open underneath: "Zurück" returns to it (spec 0019, AC-016).
                onPress={() => openActivity(activity.id)}
              />
            ) : restaurant ? (
              <Button
                label="Restaurant öffnen"
                icon="utensils"
                variant="secondary"
                testID="entry-open-restaurant"
                onPress={() => openRestaurant(restaurant.id)}
              />
            ) : null}
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
        {entry.kind === 'text' ? (
          <TextField
            label="Was gibt es?"
            value={text}
            onChangeText={(value) => setField('text', value)}
            maxLength={MAX_ENTRY_TEXT}
            placeholder="z. B. Essen bei Oma"
            editable={!online.disabled}
            error={errors.text}
            returnKeyType="done"
            onSubmitEditing={() => saveField('text')}
            testID="entry-text-input"
          />
        ) : null}
        {eats || entry.kind === 'activity' ? (
          <EaterPicker
            label={entry.kind === 'activity' ? 'Wer ist dabei?' : undefined}
            members={members}
            eaterIds={portions.state.eaterIds}
            guests={portions.state.guests}
            onEaters={portions.setEaters}
            onGuests={portions.setGuests}
            disabled={online.disabled}
          />
        ) : null}
        {entry.kind === 'recipe' && recipe ? (
          <PortionFields
            recipe={recipe}
            state={portions.state}
            onChange={portions.setState}
            misfits={[]}
            disabled={online.disabled}
            testID="entry"
          />
        ) : null}
        {timed ? (
          <TimeField
            label="Uhrzeit (optional)"
            {...TIME_FIELD_WORDS}
            value={startsAt}
            optional
            clearLabel="Uhrzeit entfernen"
            onChange={(time) => {
              const next = time as TimeOfDay | undefined;
              if (remindable && !online.disabled) reminder.followTime(startsAt, next);
              setStartsAt(next);
              setRefused(undefined);
            }}
            hint={
              online.hint ??
              (entry.kind === 'restaurant'
                ? 'Die Uhrzeit, für die ihr reserviert habt.'
                : 'Wann es losgeht.')
            }
            disabled={online.disabled}
            testID="entry-time"
          />
        ) : null}
        <TextField
          label="Zusatz"
          value={note}
          onChangeText={(value) => setField('note', value)}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={NOTE_EXAMPLE[entry.kind]}
          editable={!online.disabled}
          error={errors.note}
          hint="Steht im Kalender in Klammern hinter dem Namen."
          returnKeyType="done"
          onSubmitEditing={() => saveField('note')}
          testID="entry-note-input"
        />
        {remindable ? (
          <ReminderBlock
            form={reminder}
            disabled={online.disabled}
            hint={online.hint}
            entryTitle={title}
            afterStart={entry.reminder ? reminderAfterStart(entry.reminder, startsAt) : false}
            testID="entry-reminder"
          />
        ) : pastReminder ? (
          <ReminderBell
            label={pastReminder.label}
            accessibilityLabel={pastReminder.accessibilityLabel}
            size="row"
            testID="entry-reminder-bell"
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
                  disabled={
                    online.disabled ||
                    (entry.date !== null && !isSelectableMoveDay(bounds, entry.date, slot.id))
                  }
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
        {canMarkNotDone(entry, today) ? (
          // Saved at once like the other switches of the window (spec 0020, REQ-008, AC-037).
          <SwitchRow
            label="Nicht gemacht"
            value={entry.notDone === true}
            disabled={online.disabled}
            onValueChange={(notDone) => updatePlanEntry(entry.id, { notDone })}
            testID="entry-not-done"
          />
        ) : null}
        {entry.date ? (
          <AddToCalendar
            event={planEntryCalendarEvent({
              entry: { ...entry, startsAt },
              title,
              slotName: household.mealSlots.find((slot) => slot.id === entry.slotId)?.name ?? '',
              location: restaurant?.address ?? activity?.address ?? activity?.placeName,
              link: appLink({ screen: 'calendar', day: entry.date, entryId: entry.id }),
            })}
            testID="entry-calendar"
          />
        ) : null}
        <Button
          label="Aus dem Plan nehmen"
          icon="trash"
          variant="ghost"
          disabled={online.disabled}
          hint={online.hint}
          testID="entry-remove"
          onPress={askRemove}
        />
      </Stack>
      {confirmRemove && share ? (
        <Sheet
          visible
          size="s"
          title={`${entryTitle(entry, recipesById, entries)} aus dem Plan nehmen?`}
          onClose={() => setConfirmRemove(false)}
          testID="entry-remove-dialog"
          footer={
            <Stack gap={8}>
              <Button
                label="Zutaten auch von der Liste nehmen"
                full
                onPress={() => remove(true)}
                testID="entry-remove-with-list"
              />
              <Button
                label="Nur aus dem Plan nehmen"
                variant="secondary"
                full
                onPress={() => remove(false)}
                testID="entry-remove-plan-only"
              />
              <Button
                label="Abbrechen"
                variant="ghost"
                full
                onPress={() => setConfirmRemove(false)}
                testID="entry-remove-cancel"
              />
            </Stack>
          }
        >
          <Text testID="entry-remove-message">
            {`Für ${share.label} stehen ${zutaten(share.articles)} auf der Einkaufsliste.`}
          </Text>
        </Sheet>
      ) : null}
    </Sheet>
  );
}
