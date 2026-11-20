import {
  defaultEaters,
  splitVariants,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type PlanEntryVariant,
  type VariantSplit,
} from '@housekeeping/core';

import { indexById } from './queries';
import { getData, getState, newId, updateData } from './store';

export interface PlanEntryInput {
  /** null = "vorgemerkt", without a day. */
  date: ISODate | null;
  slotId: Id;
  kind: MealPlanEntry['kind'];
  recipeId?: Id;
  restaurantId?: Id;
  text?: string;
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
  if (input.kind === 'text' && !input.text?.trim()) throw new Error('Der Text fehlt.');
  const guests = input.guests ?? 0;
  const split =
    input.kind === 'recipe' && input.recipeId && !input.variants
      ? splitForEaters(input.recipeId, input.eaterIds, guests)
      : undefined;
  const siblings = data.planEntries.filter(
    (entry) => entry.date === input.date && entry.slotId === input.slotId,
  );
  const entry: MealPlanEntry = {
    id: newId('plan'),
    date: input.date,
    slotId: input.slotId,
    kind: input.kind,
    recipeId: input.recipeId,
    restaurantId: input.restaurantId,
    text: input.text?.trim(),
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
}

export function updatePlanEntry(
  entryId: Id,
  patch: Partial<
    Pick<
      MealPlanEntry,
      'eaterIds' | 'guests' | 'portions' | 'variants' | 'cookId' | 'notCooked' | 'text'
    >
  >,
): void {
  updateData((data) => ({
    ...data,
    planEntries: data.planEntries.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch } : entry,
    ),
  }));
}

/** Moves a dish to another day (or to "vorgemerkt" with date null) and optionally another meal. */
export function movePlanEntry(entryId: Id, date: ISODate | null, slotId?: Id): void {
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
  });
}

export function removePlanEntry(entryId: Id): void {
  updateData((data) => ({
    ...data,
    planEntries: data.planEntries.filter((entry) => entry.id !== entryId),
  }));
}
