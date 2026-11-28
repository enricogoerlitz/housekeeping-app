// Spec 0067, REQ-009: applying the agent's proposals. The agent never writes; the person applies
// the entries she kept on the collect card, and each one runs exactly one of the app's own
// commands (session, RLS, the commands' checks), one by one with its own result — no transaction
// pretended across them. "Rückgängig" is the app's usual `snapshot()`; deletes come here only one
// at a time, after their own confirmation in the card.
import {
  parseSmartInput,
  type AgentCommand,
  type AgentEntityRef,
  type Id,
  type ProposalData,
} from '@housekeeping/core';
import { useMemo } from 'react';

import { loadPhotoFromAddress } from './photo-sources';
import {
  preparePhoto,
  setActivityPhoto,
  setRecipePhoto,
  setRestaurantPhoto,
} from './photos-remote';

import { createActivity, toggleActivityFavorite, updateActivity } from './commands-activities';
import { resolveArticle } from './commands-articles';
import { logDone, completeChore } from './commands-chores';
import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRestaurant,
  defaultEaterIds,
  removePlanEntry,
} from './commands-plan';
import { updateRecipe } from './commands-recipes';
import { createRecurringItem, deleteRecurringItem } from './commands-recurring';
import { createRestaurant, toggleRestaurantFavorite } from './commands-restaurants';
import { addShoppingItemFromText, removeShoppingItem } from './commands-shopping';
import { commit, commitWatched, getData, getState, useAppSelector, type AppState } from './store';

function dataOf(state: AppState): ProposalData | undefined {
  const data = state.households[state.activeHouseholdId];
  if (!data) return undefined;
  return {
    today: state.today,
    memberId: state.currentMemberId,
    mealSlots: data.household.mealSlots,
    articles: data.articles,
    items: data.items,
    chores: data.chores,
    recipes: data.recipes,
    restaurants: data.restaurants,
    activities: data.activities,
    planEntries: data.planEntries,
    recurringItems: data.recurringItems,
  };
}

/** The household's data as a proposal is checked against it, now (before applying). */
export function agentProposalData(): ProposalData {
  const data = dataOf(getState());
  if (!data) throw new Error('Kein Haushalt geladen');
  return data;
}

/** The same, reactive: the card's lines follow the cache. */
export function useAgentProposalData(): ProposalData | undefined {
  const state = useAppSelector((current) => current);
  return useMemo(() => dataOf(state), [state]);
}

const GONE = {
  chore: 'Die Aufgabe gibt es nicht mehr',
} as const;

/** The entry an applied command made or changed, shown as its card in the chat (preview 28.11.). */
type Touched = AgentEntityRef | undefined;

function runCommand(command: AgentCommand): Touched {
  switch (command.type) {
    case 'addToList':
      if (!addShoppingItemFromText(command.text)) throw new Error('Nichts zum Hinzufügen');
      return;
    case 'completeChore':
      if (completeChore(command.choreId) === null) throw new Error(GONE.chore);
      return;
    case 'logDone':
      logDone({ title: command.title });
      return;
    case 'plan': {
      const slot = {
        date: command.date,
        slotId: command.slotId,
        eaterIds: defaultEaterIds(),
        ...(command.startsAt ? { startsAt: command.startsAt } : {}),
        ...(command.note ? { note: command.note } : {}),
      };
      const { target } = command;
      switch (target.kind) {
        case 'recipe':
          addPlanEntry({ ...slot, kind: 'recipe', recipeId: target.recipeId });
          return { kind: 'recipe', id: target.recipeId };
        case 'restaurant':
          addPlanEntry({ ...slot, kind: 'restaurant', restaurantId: target.restaurantId });
          return { kind: 'restaurant', id: target.restaurantId };
        case 'activity':
          addPlanEntry({ ...slot, kind: 'activity', activityId: target.activityId });
          return { kind: 'activity', id: target.activityId };
        case 'text': {
          const { startsAt: _time, ...plain } = slot;
          addPlanEntry({ ...plain, kind: 'text', text: target.text });
          return;
        }
        case 'newRestaurant': {
          const made = createAndPlanRestaurant(
            { name: target.name, ...(target.address ? { address: target.address } : {}) },
            slot,
          );
          return { kind: 'restaurant', id: made.restaurantId };
        }
        case 'newActivity': {
          const made = createAndPlanActivity(
            { name: target.name, ...(target.address ? { address: target.address } : {}) },
            slot,
          );
          return { kind: 'activity', id: made.activityId };
        }
      }
      return;
    }
    case 'createRestaurant':
      return {
        kind: 'restaurant',
        id: createRestaurant({
          name: command.name,
          ...(command.address ? { address: command.address } : {}),
        }),
      };
    case 'createActivity':
      return {
        kind: 'activity',
        id: createActivity({
          name: command.name,
          ...(command.address ? { address: command.address } : {}),
        }),
      };
    case 'favoriteRestaurant':
      toggleRestaurantFavorite(command.restaurantId);
      return { kind: 'restaurant', id: command.restaurantId };
    case 'favoriteActivity':
      toggleActivityFavorite(command.activityId);
      return { kind: 'activity', id: command.activityId };
    case 'rememberActivity':
      // The one-tap "Merken" of spec 0041 (#150): the same command, no edit window.
      updateActivity(command.activityId, { remembered: command.remembered });
      return { kind: 'activity', id: command.activityId };
    case 'workOut':
      // REQ-013: not a write — the card opens "Mit KI ausarbeiten" for it (spec 0061).
      throw new Error('Wird auf der Rezeptseite ausgearbeitet');
    case 'setServings':
      updateRecipe(command.recipeId, { servings: command.servings });
      return { kind: 'recipe', id: command.recipeId };
    case 'addRecurring': {
      const typed = parseSmartInput(command.text);
      if (!typed) throw new Error('Nichts zum Hinzufügen');
      // A new article is part of the same change, as with "Was fehlt?" (resolveArticle).
      commit({ path: 'diff' }, () => {
        const { article } = resolveArticle(typed.name);
        createRecurringItem(
          {
            articleId: article.id,
            amount: { count: typed.count, qty: typed.qty, unit: typed.unit },
            ...(typed.note ? { note: typed.note } : {}),
            rule: command.rule,
          },
          getState().today,
        );
      });
      return;
    }
    case 'removeItem':
      if (!getData().items.some((item) => item.id === command.itemId))
        throw new Error('Steht nicht mehr auf der Liste');
      removeShoppingItem(command.itemId);
      return;
    case 'removePlanEntry':
      if (!getData().planEntries.some((entry) => entry.id === command.entryId))
        throw new Error('Steht nicht mehr im Kalender');
      removePlanEntry(command.entryId);
      return;
    case 'deleteRecurring':
      if (!getData().recurringItems.some((item) => item.id === command.recurringId))
        throw new Error('Den Dauerposten gibt es nicht mehr.');
      deleteRecurringItem(command.recurringId);
      return;
  }
}

/**
 * Preview 28.11.: a photo the chat showed (a card's Google photo, a chosen Google image) becomes
 * the entry's own photo through the usual path — loaded by fetch-image, prepared as a JPEG,
 * uploaded, its path set. False when it cannot be loaded or saved: the entry simply stays
 * without one (the caller says so calmly).
 */
export async function savePhotoFromAddress(
  target: { kind: 'recipe' | 'restaurant' | 'activity'; id: Id },
  url: string,
  prepare: (image: Blob) => Promise<Blob> = preparePhoto,
): Promise<boolean> {
  try {
    const photo = await prepare(await loadPhotoFromAddress(url));
    if (target.kind === 'recipe') await setRecipePhoto(target.id, photo);
    else if (target.kind === 'restaurant') await setRestaurantPhoto(target.id, photo);
    else await setActivityPhoto(target.id, photo);
    return true;
  } catch {
    return false;
  }
}

/**
 * One entry of a proposal through its command; resolves once the server took it, rejects with
 * the command's hint (AC-019). Online only (OfflineError from the command).
 */
export function runAgentCommand(command: AgentCommand): Promise<AgentEntityRef | undefined> {
  return commitWatched(() => runCommand(command));
}
