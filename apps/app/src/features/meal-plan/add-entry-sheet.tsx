import {
  addPlanEntry,
  createActivitySeries,
  defaultEaterIds,
  useActivities,
  useArticlesById,
  useHousehold,
  useMembers,
  useToday,
} from '@housekeeping/api';
import {
  addEntryDate,
  addEntryReducer,
  addEntryRequest,
  addedNotice,
  defaultRepeat,
  initialAddEntryState,
  offersReminder,
  repeatRule,
  seriesPlanButtonLabel,
  seriesRuleLabel,
  type RepeatDraft,
  type AddEntryChoice,
  type AddEntryContext,
  type AddEntryTarget,
  type EntryReminder,
  type Id,
  type ISODate,
} from '@housekeeping/core';
import { Sheet, Text, toast, type SheetAction } from '@housekeeping/ui';
import { useReducer, useState } from 'react';

import { DEFAULT_SERVINGS } from '@/features/recipes/recipe-form';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';

import { AddEntryCreateBody, addEntryCreateAction, useAddEntryCreate } from './add-entry-create';
import { AddEntryDetails } from './add-entry-details';
import { AddEntrySearch, AddEntrySearchHeader } from './add-entry-search';
import { addSheetTitle } from './labels';
import { useReminderForm } from './reminder-block';

export type AddTarget = AddEntryTarget;

/**
 * "+ Hinzufügen" in the calendar (spec 0010, REQ-007): one large window of fixed size with the
 * search field "Was steht an?" and the tabs "Alle · Rezepte · Restaurants · Aktivitäten ·
 * Sammlungen · Reste" (spec 0009, AC-021; spec 0030, REQ-006); "Neu" creates a recipe,
 * collection, restaurant or activity right here (spec 0004, REQ-008), free text and "Reste" from
 * the seven days before (REQ-011) are in "Alle". The second step runs in the same window. With
 * `activityId` ("Einplanen" on an activity) that activity is chosen and the day can be picked.
 * The state lives in addEntryReducer (spec 0031, REQ-023).
 */
export function AddEntrySheet(props: { target: AddTarget; onClose: () => void; activityId?: Id }) {
  const online = useOnlineOnly();
  const today = useToday();
  const household = useHousehold();
  const activities = useActivities();
  const members = useMembers();
  const articlesById = useArticlesById();

  const [state, dispatch] = useReducer(addEntryReducer, undefined, () =>
    initialAddEntryState(props.target, {
      servings: DEFAULT_SERVINGS,
      activity: activities.find((candidate) => candidate.id === props.activityId),
    }),
  );
  const { choice, creating, slotId, slotChosen } = state;
  const context: AddEntryContext = { members, articlesById };
  const date = addEntryDate(state);
  const slots = household.mealSlots;
  const slotName = slots.find((slot) => slot.id === slotId)?.name;
  // Spec 0041, REQ-003: "Rhythmus"; while "Einmalig" it follows the chosen day.
  const repeatDay = date ?? today;
  const [repeat, setRepeat] = useState<RepeatDraft>(() => defaultRepeat(repeatDay));
  const [repeatFor, setRepeatFor] = useState(repeatDay);
  if (repeatFor !== repeatDay) {
    setRepeatFor(repeatDay);
    if (repeat.kind === 'none') setRepeat(defaultRepeat(repeatDay));
  }
  const rule = choice?.kind === 'activity' && date ? repeatRule(repeat) : undefined;

  // Spec 0017, REQ-001: "Erinnern" in the second step, only with a day (not for "Vormerken").
  const reminder = useReminderForm({
    entryDate: date ?? today,
    slotName: slotName ?? '',
    startsAt: state.startsAt,
  });
  const remindable = offersReminder(date, today);

  const choose = (next: AddEntryChoice) => {
    dispatch({ type: 'choose', choice: next, eaterIds: defaultEaterIds(), context });
    reminder.reset();
  };

  const create = useAddEntryCreate({
    state,
    dispatch,
    online,
    onCreated: (title: string, planned: ISODate | null) => {
      props.onClose();
      toast.show({
        message: planned
          ? `„${title}“ angelegt und eingeplant`
          : `„${title}“ angelegt und vorgemerkt`,
      });
    },
  });

  const save = () => {
    if (!choice || online.disabled) return;
    dispatch({ type: 'save' });
    const request = addEntryRequest(state, defaultEaterIds());
    if (!request) return;
    if (rule && date && request.input.activityId) {
      try {
        createActivitySeries({
          activityId: request.input.activityId,
          rule,
          startsOn: date,
          endsOn: repeat.until,
          slotId: request.input.slotId,
          startsAt: request.input.startsAt,
          note: request.input.note,
          eaterIds: request.input.eaterIds,
          guests: request.input.guests ?? 0,
        });
      } catch (caught) {
        dispatch({ type: 'fail', error: errorMessage(caught, FAILED_MESSAGE) });
        return;
      }
      props.onClose();
      toast.show({ message: `„${request.title}“ ${seriesRuleLabel(rule, date)} eingeplant` });
      return;
    }
    // A reminder that cannot be saved keeps the window open with its hint (REQ-003).
    let checked: EntryReminder | undefined;
    if (remindable) {
      const decision = reminder.check();
      if (decision.action === 'invalid') return;
      if (decision.action === 'set') checked = decision.reminder;
    }
    try {
      addPlanEntry({ ...request.input, ...(checked ? { reminder: checked } : {}) });
    } catch (caught) {
      const error = errorMessage(caught, FAILED_MESSAGE);
      // An activity's refusal concerns its Zusatz (spec 0021, REQ-008).
      dispatch(
        choice.kind === 'activity' ? { type: 'noteFailed', error } : { type: 'fail', error },
      );
      return;
    }
    props.onClose();
    toast.show({ message: addedNotice(request.title, request.input.date, today) });
  };

  let actions: { primary: SheetAction } | undefined;
  if (creating) {
    const primary = addEntryCreateAction(state, create, online);
    actions = primary ? { primary } : undefined;
  } else if (choice) {
    const needsEaters = choice.kind === 'recipe' || choice.kind === 'restaurant';
    const noEaters = needsEaters && state.portions.eaterIds.length + state.portions.guests === 0;
    actions = {
      primary: {
        // A series says so (review 0003, B-11): "Wöchentlich ab Di 1.12. einplanen".
        label: state.later
          ? 'Vormerken'
          : rule && date
            ? seriesPlanButtonLabel(rule, date)
            : 'Einplanen',
        icon: 'plus',
        disabled: online.disabled || noEaters,
        hint: online.hint ?? (noEaters ? 'Wähl aus, wer mitisst.' : undefined),
        testID: 'add-entry-save',
        onPress: save,
      },
    };
  }

  const searching = !choice && !creating;
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={addSheetTitle(date, slotName, slotChosen)}
      testID="add-entry-sheet"
      size="l"
      // Search and tabs stay at the top; switching tabs keeps the window's size (AC-022).
      header={
        searching ? (
          <AddEntrySearchHeader
            query={state.query}
            tab={state.tab}
            withLeftovers={props.target.date !== null}
            onQuery={(query) => dispatch({ type: 'setQuery', query })}
            onTab={(tab) => dispatch({ type: 'setTab', tab })}
          />
        ) : undefined
      }
      actions={actions}
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 8 }}>
          {online.hint}
        </Text>
      ) : null}
      {creating ? (
        <AddEntryCreateBody state={state} dispatch={dispatch} create={create} onChoose={choose} />
      ) : choice ? (
        <AddEntryDetails
          state={state}
          dispatch={dispatch}
          context={context}
          slots={slots}
          today={today}
          preset={props.activityId !== undefined}
          reminder={reminder}
          remindable={remindable}
          online={online}
          onSave={save}
          repeat={{ value: repeat, onChange: setRepeat }}
        />
      ) : (
        <AddEntrySearch
          state={state}
          slots={slots}
          offline={online.disabled}
          onChoose={choose}
          onCreate={create.start}
          onTab={(tab) => dispatch({ type: 'setTab', tab })}
          onToggleOlder={() => dispatch({ type: 'toggleOlderLeftovers' })}
        />
      )}
    </Sheet>
  );
}
