import {
  NOTE_MAX_LENGTH,
  splitForEaters,
  useMembers,
  useMembersById,
  usePlanEntries,
} from '@housekeeping/api';
import {
  addDays,
  formatPickerDate,
  isSelectableMoveDay,
  monthPickerStart,
  moveBounds,
  TIME_FIELD_WORDS,
  type AddEntryAction,
  type AddEntryContext,
  type AddEntryState,
  type ISODate,
  type KindRole,
  type MealSlot,
  type RepeatDraft,
  type TimeOfDay,
} from '@housekeeping/core';
import { Button, Chip, ChoiceChips, Stack, Text, TextField, TimeField } from '@housekeeping/ui';
import { useState, type Dispatch } from 'react';
import { ScrollView, View } from 'react-native';

import { RepeatFields } from '@/features/activities/series-fields';
import { PlanDateCalendar } from '@/lib/plan-date-calendar';

import { KindIcon, recipeRole } from './add-entry-search';
import { dayLabel } from './labels';
import { CookPicker, EaterPicker, FieldLabel, PortionFields } from './plan-fields';
import { ReminderBlock, type ReminderForm } from './reminder-block';

// Step two of "+ Hinzufügen": day, Tageszeit, who eats, portions, time, Zusatz and "Erinnern"
// for what was chosen in step one.

/** Day chips "Einplanen" of an activity offers from today; "Anderes Datum …" reaches any day. */
const DAY_CHIPS = 14;

/**
 * "Wann?" for "Einplanen" from an activity: a day of the next two weeks, or with "Anderes Datum …"
 * any day in a month calendar (spec 0016, REQ-005, AC-020).
 */
function DayPicker(props: {
  value: ISODate | null;
  today: ISODate;
  onChange: (date: ISODate) => void;
}) {
  const [picking, setPicking] = useState(false);
  const days = Array.from({ length: DAY_CHIPS }, (_, offset) => addDays(props.today, offset));
  // A day beyond the chips is shown on the last chip, so the choice stays visible.
  const other = props.value !== null && !days.includes(props.value) ? props.value : undefined;
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel>Wann?</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        style={{ flexGrow: 0 }}
      >
        {days.map((date) => (
          <Chip
            key={date}
            label={date === props.today ? 'Heute' : dayLabel(date)}
            selected={props.value === date}
            onPress={() => props.onChange(date)}
            testID={`add-entry-day-${date}`}
          />
        ))}
        <Chip
          label={other ? formatPickerDate(other) : 'Anderes Datum …'}
          icon="calendar-days"
          selected={picking || other !== undefined}
          onPress={() => setPicking(!picking)}
          testID="add-entry-day-other"
        />
      </ScrollView>
      {picking ? (
        <PlanDateCalendar
          month={monthPickerStart(props.value, props.today)}
          today={props.today}
          marked={props.value}
          onSelect={(date) => {
            props.onChange(date);
            setPicking(false);
          }}
          testID="add-entry-date"
        />
      ) : null}
    </View>
  );
}

/** "Zusatz": in step two and in "Neue Aktivität" (spec 0021, REQ-008). */
export function ZusatzField(props: { state: AddEntryState; dispatch: Dispatch<AddEntryAction> }) {
  return (
    <TextField
      label="Zusatz"
      value={props.state.note}
      onChangeText={(note) => props.dispatch({ type: 'setNote', note })}
      placeholder="z. B. Hohenschönhausen"
      maxLength={NOTE_MAX_LENGTH}
      error={props.state.noteError}
      hint="Steht im Kalender in Klammern hinter dem Namen."
      testID="add-entry-note"
    />
  );
}

/** The title of the chosen entry. */
function chosenTitle(state: AddEntryState): string {
  switch (state.choice?.kind) {
    case 'recipe':
      return state.choice.recipe.title;
    case 'restaurant':
      return state.choice.restaurant.name;
    case 'activity':
      return state.choice.activity.name;
    case 'leftovers':
      return state.choice.title;
    default:
      return 'Freitext';
  }
}

function chosenKind(state: AddEntryState): KindRole {
  switch (state.choice?.kind) {
    case 'restaurant':
      return 'restaurant';
    case 'activity':
      return 'activity';
    case 'recipe':
      return recipeRole(state.choice.recipe);
    default:
      return 'recipe';
  }
}

export function AddEntryDetails(props: {
  state: AddEntryState;
  dispatch: Dispatch<AddEntryAction>;
  context: AddEntryContext;
  slots: MealSlot[];
  today: ISODate;
  /** "Einplanen" on an activity: no way back, but the day can be picked. */
  preset: boolean;
  reminder: ReminderForm;
  remindable: boolean;
  online: { disabled: boolean; hint: string | undefined };
  onOpenSettings: () => void;
  onSave: () => void;
  /** Spec 0041, REQ-003: "Rhythmus" of an activity with a day. */
  repeat?: { value: RepeatDraft; onChange: (next: RepeatDraft) => void };
}) {
  const { state, dispatch, context, slots, reminder } = props;
  const entries = usePlanEntries();
  const members = useMembers();
  const membersById = useMembersById();
  const { choice, day, later, slotId, portions } = state;
  if (!choice) return null;

  const recipe = choice.kind === 'recipe' ? choice.recipe : undefined;
  const split = recipe ? splitForEaters(recipe.id, portions.eaterIds, portions.guests) : undefined;
  const misfits = split ? split.misfitMemberIds.flatMap((id) => membersById[id] ?? []) : [];
  const timed = choice.kind === 'restaurant' || choice.kind === 'activity';
  // A series has no "Erinnern" of its own (spec 0041, Entscheidungen).
  const repeating =
    choice.kind === 'activity' &&
    !!day &&
    !later &&
    (props.repeat?.value.kind ?? 'none') !== 'none';
  const slotOrder = slots.map((slot) => slot.id);

  // REQ-012: leftovers lie after their dish; earlier Tageszeiten of its day are greyed out.
  const leftoverBounds =
    choice.kind === 'leftovers'
      ? moveBounds(
          { ...choice.source, id: 'new', kind: 'leftovers', leftoversOfEntryId: choice.source.id },
          entries,
          slotOrder,
        )
      : undefined;

  return (
    <Stack gap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {props.preset ? null : (
          <Button
            label="Zurück"
            icon="chevron-left"
            variant="link"
            size="sm"
            testID="add-entry-step-back"
            onPress={() => dispatch({ type: 'backToSearch' })}
          />
        )}
        <KindIcon kind={chosenKind(state)} />
        <Text
          variant="cardTitle"
          style={{ flex: 1 }}
          numberOfLines={2}
          testID={choice.kind === 'activity' ? 'add-entry-activity-chosen' : 'add-entry-chosen'}
        >
          {chosenTitle(state)}
        </Text>
      </View>
      {props.preset && !later ? (
        <DayPicker
          value={day}
          today={props.today}
          onChange={(next) => dispatch({ type: 'setDay', day: next })}
        />
      ) : null}
      {choice.kind !== 'leftovers' && state.target.date ? (
        <Chip
          label="Ohne Tag vormerken"
          icon="bookmark"
          selected={later}
          onPress={() => dispatch({ type: 'toggleLater' })}
          testID="add-entry-later"
        />
      ) : null}
      {leftoverBounds && day ? (
        <View>
          <FieldLabel>Tageszeit</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="add-entry-slot">
            {slots.map((slot) => {
              const allowed = isSelectableMoveDay(leftoverBounds, day, slot.id);
              return (
                <Chip
                  key={slot.id}
                  label={slot.name}
                  selected={slotId === slot.id}
                  disabled={!allowed}
                  hint={allowed ? undefined : 'Reste stehen immer nach ihrem Gericht'}
                  onPress={() => dispatch({ type: 'chooseSlot', slotId: slot.id })}
                  testID={`add-entry-slot-${slot.id}`}
                />
              );
            })}
          </View>
        </View>
      ) : (
        <ChoiceChips
          label="Tageszeit"
          options={slots.map((slot) => ({ value: slot.id, label: slot.name }))}
          value={slotId}
          onChange={(next) => dispatch({ type: 'chooseSlot', slotId: next })}
          testID="add-entry-slot"
        />
      )}
      {choice.kind === 'text' ? (
        <TextField
          label="Was gibt es?"
          value={state.text}
          onChangeText={(text) => dispatch({ type: 'setText', text })}
          placeholder="z. B. Essen bei Oma"
          error={state.error}
          autoFocus={!state.text}
          returnKeyType="done"
          onSubmitEditing={props.onSave}
          testID="add-entry-text"
        />
      ) : null}
      {choice.kind === 'activity' && props.repeat && day && !later ? (
        <RepeatFields
          value={props.repeat.value}
          onChange={props.repeat.onChange}
          startsOn={day}
          today={props.today}
        />
      ) : null}
      {choice.kind === 'recipe' || choice.kind === 'restaurant' || choice.kind === 'activity' ? (
        <EaterPicker
          label={choice.kind === 'activity' ? 'Wer ist dabei?' : undefined}
          members={members}
          eaterIds={portions.eaterIds}
          guests={portions.guests}
          onEaters={(eaterIds) => dispatch({ type: 'setEaters', eaterIds, context })}
          onGuests={(guests) => dispatch({ type: 'setGuests', guests, context })}
        />
      ) : null}
      {recipe ? (
        <PortionFields
          recipe={recipe}
          state={portions}
          onChange={(next) => dispatch({ type: 'setPortions', portions: next })}
          misfits={misfits}
          testID="add-entry"
        />
      ) : null}
      {recipe ? (
        <CookPicker
          members={members}
          cookId={state.cookId}
          onChange={(cookId) => dispatch({ type: 'setCook', cookId })}
        />
      ) : null}
      {timed ? (
        <TimeField
          label="Uhrzeit (optional)"
          {...TIME_FIELD_WORDS}
          value={state.startsAt}
          optional
          clearLabel="Uhrzeit entfernen"
          onChange={(time) => {
            const next = time as TimeOfDay | undefined;
            reminder.followTime(state.startsAt, next);
            dispatch({ type: 'setStartsAt', startsAt: next });
          }}
          hint={
            choice.kind === 'restaurant'
              ? 'Die Uhrzeit, für die ihr reserviert habt.'
              : 'Wann es losgeht.'
          }
          testID="add-entry-time"
        />
      ) : null}
      <ZusatzField state={state} dispatch={dispatch} />
      {props.remindable && !repeating ? (
        <ReminderBlock
          form={reminder}
          disabled={props.online.disabled}
          hint={props.online.hint}
          onOpenSettings={props.onOpenSettings}
          testID="add-entry-reminder"
        />
      ) : null}
      {state.error && choice.kind !== 'text' ? (
        <Text variant="small" color="warn">
          {state.error}
        </Text>
      ) : null}
    </Stack>
  );
}
