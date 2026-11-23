import { addPlanEntry, NOTE_MAX_LENGTH, useHousehold, useHouseholdClock } from '@housekeeping/api';
import {
  checkEntryNote,
  suggestedReminder,
  TIME_FIELD_WORDS,
  type Id,
  type PlanChoice,
  type TimeOfDay,
} from '@housekeeping/core';
import { Stack, TextField, TimeField } from '@housekeeping/ui';
import { useState } from 'react';

import { PlanSheet } from './plan-sheet';

/**
 * "Einplanen" at a restaurant or an activity (spec 0024, REQ-005, REQ-006): the window of the
 * recipes (Decision 8) with "Uhrzeit (optional)" (not while "vorgemerkt") and "Zusatz (optional)";
 * an activity opens on the first Tageszeit and has no "Wer isst mit?". A time switches the reminder
 * on two hours before (spec 0021, REQ-014); the window has no "Erinnern" block (Decision 4).
 * Afterwards the page stays, with "Eingeplant: …" and "Ansehen".
 */
export function PlanPlaceSheet(props: {
  kind: 'restaurant' | 'activity';
  place: { id: Id; name: string };
  onClose: () => void;
}) {
  const household = useHousehold();
  const clock = useHouseholdClock();
  const [startsAt, setStartsAt] = useState<TimeOfDay | undefined>();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const restaurant = props.kind === 'restaurant';

  const plan = (choice: PlanChoice) => {
    if (!choice.slotId) return;
    const checked = checkEntryNote(note);
    if (!checked.ok) {
      setNoteError(checked.error);
      throw new Error(checked.error);
    }
    const time = choice.date ? startsAt : undefined;
    const suggestion =
      choice.date && time
        ? suggestedReminder(choice.date, time, clock().now, household.timeZone)
        : undefined;
    addPlanEntry({
      date: choice.date,
      slotId: choice.slotId,
      kind: props.kind,
      ...(restaurant ? { restaurantId: props.place.id } : { activityId: props.place.id }),
      eaterIds: restaurant ? choice.eaterIds : [],
      guests: restaurant ? choice.guests : 0,
      note,
      ...(time ? { startsAt: time } : {}),
      ...(suggestion ? { reminder: suggestion } : {}),
    });
  };

  return (
    <PlanSheet
      title={props.place.name}
      eaters={restaurant}
      slot={restaurant ? 'last' : 'first'}
      onPlan={plan}
      onClose={props.onClose}
      extra={(choice) => (
        <Stack gap={18}>
          {choice.date ? (
            <TimeField
              label="Uhrzeit (optional)"
              {...TIME_FIELD_WORDS}
              value={startsAt}
              optional
              clearLabel="Uhrzeit entfernen"
              onChange={(time) => setStartsAt(time as TimeOfDay | undefined)}
              hint={restaurant ? 'Die Uhrzeit, für die ihr reserviert habt.' : 'Wann es losgeht.'}
              testID="plan-place-time"
            />
          ) : null}
          <TextField
            label="Zusatz (optional)"
            value={note}
            onChangeText={(value) => {
              setNote(value);
              setNoteError(undefined);
            }}
            placeholder={restaurant ? 'z. B. Geburtstag von Nadja' : 'z. B. Halle Nord'}
            maxLength={NOTE_MAX_LENGTH}
            error={noteError}
            hint="Steht im Kalender in Klammern hinter dem Namen."
            testID="plan-place-note"
          />
        </Stack>
      )}
    />
  );
}
