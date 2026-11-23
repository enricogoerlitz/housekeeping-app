import {
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  defaultEaterIds,
  type PlanSlotInput,
} from '@housekeeping/api';
import {
  addEntryDate,
  type AddEntryAction,
  type AddEntryChoice,
  type AddEntryState,
  type Id,
  type ISODate,
  type RecipeKind,
} from '@housekeeping/core';
import { Button, Stack, Text } from '@housekeeping/ui';
import type { Dispatch } from 'react';
import { View } from 'react-native';

import {
  ActivityFormFields,
  savePhotoChoice,
  useActivityForm,
} from '@/features/activities/activity-form';
import { NewRecipeFields } from '@/features/recipes/recipe-form';
import {
  RestaurantFormFields,
  saveRestaurantPhoto,
  useRestaurantForm,
} from '@/features/restaurants/restaurant-form';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

import { ZusatzField } from './add-entry-details';

// "Neu" while planning (spec 0004, AC-021 to AC-023; spec 0009, AC-021; spec 0024, REQ-001): a
// recipe, a collection, a restaurant or an activity, created and planned in one change.

type Online = { disabled: boolean; hint: string | undefined };

/**
 * The forms of "Neu" and their saving. `onCreated` closes the window with "„Paella“ angelegt und
 * eingeplant".
 */
export function useAddEntryCreate(options: {
  state: AddEntryState;
  dispatch: Dispatch<AddEntryAction>;
  online: Online;
  onCreated: (title: string, planned: ISODate | null) => void;
}) {
  const { state, dispatch, online, onCreated } = options;
  const restaurantForm = useRestaurantForm();
  const activityForm = useActivityForm();
  const date = addEntryDate(state);

  /** Where and for whom something new is planned: everyone at home that day. */
  const planSlot = (): PlanSlotInput => ({
    date,
    slotId: state.slotId,
    eaterIds: defaultEaterIds(),
  });

  /** A new recipe or, with `kind` "collection", a new empty collection (spec 0009, AC-021). */
  const saveNewRecipe = (kind: RecipeKind) => {
    if (online.disabled) return;
    const title = state.newTitle.trim();
    if (!title) {
      dispatch({ type: 'newTitleFailed', error: 'Titel fehlt' });
      return;
    }
    try {
      createAndPlanRecipe({ title, servings: state.newServings, kind }, planSlot());
    } catch (caught) {
      dispatch({ type: 'newTitleFailed', error: errorMessage(caught, FAILED_MESSAGE) });
      return;
    }
    onCreated(title, date);
  };

  const saveNewRestaurant = async () => {
    if (online.disabled) return;
    // A short link is resolved first, so creating and planning stay one change.
    const draft = await restaurantForm.submit();
    if (!draft) return;
    try {
      const { restaurantId } = createAndPlanRestaurant(draft, planSlot());
      // Spec 0024, REQ-001: the same fields as "Restaurant hinzufügen", the photo included.
      saveRestaurantPhoto(restaurantId, restaurantForm.photo);
    } catch (caught) {
      restaurantForm.fail(caught);
      return;
    }
    onCreated(draft.name.trim(), date);
  };

  const saveNewActivity = async () => {
    if (online.disabled) return;
    const values = await activityForm.submit();
    if (!values) return;
    let created: Id;
    try {
      created = createAndPlanActivity(values.draft, { ...planSlot(), note: state.note }).activityId;
    } catch (caught) {
      activityForm.fail(caught);
      return;
    }
    savePhotoChoice(created, values.photo);
    onCreated(values.draft.name, date);
  };

  /** "Neu": what was searched for is usually the name of the new thing. */
  const start = (kind: AddEntryState['creating'] & string) => {
    const name = state.query.trim();
    if (kind === 'restaurant' && !restaurantForm.name) restaurantForm.setName(name);
    if (kind === 'activity' && !activityForm.name) activityForm.setName(name);
    dispatch({ type: 'startCreating', kind });
  };

  return { restaurantForm, activityForm, saveNewRecipe, saveNewRestaurant, saveNewActivity, start };
}

export type AddEntryCreate = ReturnType<typeof useAddEntryCreate>;

/** Title row of a "Neu anlegen" form, with the way back to the search. */
function NewHeading(props: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text variant="cardTitle" style={{ flex: 1 }}>
        {props.title}
      </Text>
      <Button
        label="Zur Suche"
        variant="link"
        size="sm"
        testID="add-entry-new-back"
        onPress={props.onBack}
      />
    </View>
  );
}

/** The form of the kind being created. */
export function AddEntryCreateBody(props: {
  state: AddEntryState;
  dispatch: Dispatch<AddEntryAction>;
  create: AddEntryCreate;
  onChoose: (choice: AddEntryChoice) => void;
}) {
  const { state, dispatch, create } = props;
  const { creating } = state;
  const back = () => dispatch({ type: 'stopCreating' });
  if (creating === 'recipe' || creating === 'collection') {
    return (
      <Stack gap={12}>
        <NewHeading
          title={creating === 'collection' ? 'Neue Sammlung' : 'Neues Rezept'}
          onBack={back}
        />
        <NewRecipeFields
          title={state.newTitle}
          onChangeTitle={(title) => dispatch({ type: 'setNewTitle', title })}
          error={state.newTitleError}
          onSubmit={() => create.saveNewRecipe(creating)}
          autoFocus
          servings={{
            value: state.newServings,
            onChange: (servings) => dispatch({ type: 'setNewServings', servings }),
          }}
          kind={creating}
        />
      </Stack>
    );
  }
  if (creating === 'restaurant') {
    return (
      <Stack gap={12}>
        <NewHeading title="Neues Restaurant" onBack={back} />
        <RestaurantFormFields
          form={create.restaurantForm}
          focus="link"
          openLabel="Auswählen"
          onOpenExisting={(chosen) => props.onChoose({ kind: 'restaurant', restaurant: chosen })}
        />
      </Stack>
    );
  }
  if (creating === 'activity') {
    return (
      <Stack gap={12}>
        <NewHeading title="Neue Aktivität" onBack={back} />
        <ActivityFormFields
          form={create.activityForm}
          autoFocus
          openLabel="Auswählen"
          onOpenExisting={(chosen) => props.onChoose({ kind: 'activity', activity: chosen })}
        />
        <ZusatzField state={state} dispatch={dispatch} />
      </Stack>
    );
  }
  return null;
}

/** "Anlegen und einplanen" / "Anlegen und vormerken" of the kind being created. */
export function AddEntryCreateFooter(props: {
  state: AddEntryState;
  create: AddEntryCreate;
  online: Online;
}) {
  const { state, create, online } = props;
  const { creating } = state;
  const label = state.later ? 'Anlegen und vormerken' : 'Anlegen und einplanen';
  if (creating === 'recipe' || creating === 'collection') {
    return (
      <Button
        label={label}
        icon="check"
        full
        disabled={online.disabled}
        hint={online.hint}
        testID={`add-entry-new-${creating}-save`}
        onPress={() => create.saveNewRecipe(creating)}
      />
    );
  }
  if (creating === 'restaurant') {
    const { restaurantForm } = create;
    return (
      <Button
        label={label}
        icon="check"
        full
        disabled={online.disabled || !!restaurantForm.duplicate || restaurantForm.saving}
        hint={
          online.hint ??
          (restaurantForm.duplicate ? `Gibt es schon: ${restaurantForm.duplicate.name}` : undefined)
        }
        testID="add-entry-new-restaurant-save"
        onPress={() => void create.saveNewRestaurant()}
      />
    );
  }
  if (creating === 'activity') {
    const { activityForm } = create;
    return (
      <Button
        label={label}
        icon="check"
        full
        disabled={
          online.disabled ||
          !!activityForm.duplicate ||
          activityForm.saving ||
          activityForm.preparing
        }
        hint={
          online.hint ??
          (activityForm.duplicate ? `Gibt es schon: ${activityForm.duplicate.name}` : undefined)
        }
        testID="add-entry-new-activity-save"
        onPress={() => void create.saveNewActivity()}
      />
    );
  }
  return null;
}
