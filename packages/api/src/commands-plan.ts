import {
  defaultEaters,
  splitVariants,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type PlanEntryVariant,
  type VariantSplit,
} from '@housekeeping/core';

import { createActivity, type ActivityDraft } from './commands-activities';
import { createRecipe } from './commands-recipes';
import { createRestaurant, type RestaurantDraft } from './commands-restaurants';
import { indexById } from './queries';
import { commit, getData, getState, newId, updateData } from './store';

/** meal_plan_entries_note_length. */
export const NOTE_MAX_LENGTH = 120;

export interface PlanEntryInput {
  /** null = "vorgemerkt", without a day. */
  date: ISODate | null;
  slotId: Id;
  kind: MealPlanEntry['kind'];
  recipeId?: Id;
  restaurantId?: Id;
  activityId?: Id;
  text?: string;
  /** Zusatz, kept only on activities: "Eislaufen (Hohenschönhausen)". */
  note?: string;
  leftoversOfEntryId?: Id;
  eaterIds: Id[];
  guests?: number;
  portions?: number;
  variants?: PlanEntryVariant[];
  cookId?: Id;
}

/** Who eats by default on a day: every member of the household who is not absent. */
export function defaultEaterIds(date: ISODate | null): Id[] {
  const data = getData();
  const members = getState().members.filter((member) =>
    data.household.memberIds.includes(member.id),
  );
  return defaultEaters(members, date, data.absences).map((member) => member.id);
}

/** Portions and variant split for a recipe and the chosen eaters (one portion per person). */
export function splitForEaters(recipeId: Id, eaterIds: Id[], guests: number): VariantSplit {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error('Rezept nicht gefunden');
  const eaters = getState().members.filter((member) => eaterIds.includes(member.id));
  return splitVariants(recipe, eaters, guests, indexById(data.articles));
}

/** Where and for whom something new is planned (create while planning, REQ-008). */
export type PlanSlotInput = Omit<
  PlanEntryInput,
  'kind' | 'recipeId' | 'restaurantId' | 'activityId' | 'text' | 'leftoversOfEntryId'
>;

/** The trimmed Zusatz (empty → none); "Der Zusatz ist zu lang …" over 120 characters. */
function cleanNote(note: string | undefined): string | undefined {
  const clean = note?.trim() || undefined;
  if (clean && clean.length > NOTE_MAX_LENGTH) {
    throw new Error(`Der Zusatz ist zu lang (höchstens ${NOTE_MAX_LENGTH} Zeichen)`);
  }
  return clean;
}

/** Adds a dish to a meal. A meal can hold several dishes, each with its own cook. */
export function addPlanEntry(input: PlanEntryInput): Id {
  const data = getData();
  if (input.kind === 'recipe' && !data.recipes.some((recipe) => recipe.id === input.recipeId)) {
    throw new Error('Rezept nicht gefunden');
  }
  if (
    input.kind === 'restaurant' &&
    !data.restaurants.some((restaurant) => restaurant.id === input.restaurantId)
  ) {
    throw new Error('Restaurant nicht gefunden');
  }
  if (
    input.kind === 'activity' &&
    !data.activities.some((activity) => activity.id === input.activityId)
  ) {
    throw new Error('Aktivität nicht gefunden');
  }
  if (input.kind === 'text' && !input.text?.trim()) throw new Error('Der Text fehlt.');
  const note = input.kind === 'activity' ? cleanNote(input.note) : undefined;
  const guests = input.guests ?? 0;
  const split =
    input.kind === 'recipe' && input.recipeId && !input.variants
      ? splitForEaters(input.recipeId, input.eaterIds, guests)
      : undefined;
  const siblings = data.planEntries.filter(
    (entry) => entry.date === input.date && entry.slotId === input.slotId,
  );
  return commit({ path: 'diff' }, () => {
    const entry: MealPlanEntry = {
      id: newId(),
      date: input.date,
      slotId: input.slotId,
      kind: input.kind,
      recipeId: input.recipeId,
      restaurantId: input.restaurantId,
      activityId: input.kind === 'activity' ? input.activityId : undefined,
      text: input.text?.trim(),
      note,
      leftoversOfEntryId: input.leftoversOfEntryId,
      eaterIds: input.eaterIds,
      guests,
      portions: input.portions ?? split?.portions ?? Math.max(1, input.eaterIds.length + guests),
      variants: input.variants ?? split?.variants ?? [],
      cookId: input.cookId,
      sort: siblings.length,
    };
    updateData((current) => ({ ...current, planEntries: [...current.planEntries, entry] }));
    return entry.id;
  });
}

/**
 * Changes an entry. The Zusatz is trimmed (empty removes it). An entry that is no longer an
 * activity loses its activity and Zusatz (meal_plan_entries_note_only_activity).
 */
export function updatePlanEntry(
  entryId: Id,
  patch: Partial<
    Pick<
      MealPlanEntry,
      | 'eaterIds'
      | 'guests'
      | 'portions'
      | 'variants'
      | 'cookId'
      | 'notCooked'
      | 'text'
      | 'note'
      | 'kind'
      | 'recipeId'
      | 'restaurantId'
      | 'activityId'
    >
  >,
): void {
  const clean = { ...patch };
  if ('note' in patch) clean.note = cleanNote(patch.note);
  if (
    patch.activityId !== undefined &&
    !getData().activities.some((activity) => activity.id === patch.activityId)
  ) {
    throw new Error('Aktivität nicht gefunden');
  }
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const next = { ...entry, ...clean };
        return next.kind === 'activity'
          ? next
          : { ...next, activityId: undefined, note: undefined };
      }),
    })),
  );
}

/** Moves a dish to another day (or to "vorgemerkt" with date null) and optionally another meal. */
export function movePlanEntry(entryId: Id, date: ISODate | null, slotId?: Id): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => {
      const entry = data.planEntries.find((candidate) => candidate.id === entryId);
      if (!entry) return data;
      const targetSlot = slotId ?? entry.slotId;
      const siblings = data.planEntries.filter(
        (candidate) =>
          candidate.id !== entryId && candidate.date === date && candidate.slotId === targetSlot,
      );
      return {
        ...data,
        planEntries: data.planEntries.map((candidate) =>
          candidate.id === entryId
            ? { ...candidate, date, slotId: targetSlot, sort: siblings.length }
            : candidate,
        ),
      };
    }),
  );
}

/**
 * Removes a dish. Leftovers of it that name no recipe go with it: without their dish they would
 * mean nothing, and the database refuses leftovers without recipe and dish. Leftovers with a
 * recipe stay (the server clears their link).
 */
export function removePlanEntry(entryId: Id): void {
  const removed = new Set([
    entryId,
    ...getData()
      .planEntries.filter((entry) => entry.leftoversOfEntryId === entryId && !entry.recipeId)
      .map((entry) => entry.id),
  ]);
  commit({ path: 'diff', maxDeletes: { meal_plan_entries: removed.size } }, () =>
    updateData((data) => ({
      ...data,
      planEntries: data.planEntries.filter((entry) => !removed.has(entry.id)),
    })),
  );
}

// ---------- Create while planning (spec 0004, REQ-008) ----------
// The new entity and its plan entry are one command, so one apply_changes call: both or neither.
// Validation errors ("Name fehlt", "Titel fehlt", "Gibt es schon: …") come before anything changes.

/** A new activity, planned right away (AC-021, AC-023). */
export function createAndPlanActivity(
  draft: ActivityDraft,
  plan: PlanSlotInput,
): { activityId: Id; entryId: Id } {
  return commit({ path: 'diff' }, () => {
    const activityId = createActivity(draft);
    const entryId = addPlanEntry({ ...plan, kind: 'activity', activityId });
    return { activityId, entryId };
  });
}

/** A new recipe (a title is enough), planned right away (AC-022). */
export function createAndPlanRecipe(
  input: { title: string; servings?: number },
  plan: PlanSlotInput,
): { recipeId: Id; entryId: Id } {
  return commit({ path: 'diff' }, () => {
    const recipeId = createRecipe(input);
    const entryId = addPlanEntry({ ...plan, kind: 'recipe', recipeId });
    return { recipeId, entryId };
  });
}

/**
 * A new restaurant, planned right away (AC-022). A short map link is resolved before
 * (resolveMapsShortLink, async), so that this stays one change.
 */
export function createAndPlanRestaurant(
  draft: RestaurantDraft,
  plan: PlanSlotInput,
): { restaurantId: Id; entryId: Id } {
  return commit({ path: 'diff' }, () => {
    const restaurantId = createRestaurant(draft);
    const entryId = addPlanEntry({ ...plan, kind: 'restaurant', restaurantId });
    return { restaurantId, entryId };
  });
}
