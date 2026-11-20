import type { Activity, Article, Id, Member, Recipe, Restaurant } from '@housekeeping/core';

import { getData, getState, useAppSelector, useDataSelector } from './store';

// Read side of the data interface. Every hook returns stored references, so components only
// re-render when that slice changed. Derived values are computed in core functions by the caller.

export const useToday = () => useAppSelector((state) => state.today);
export const useOffline = () => useAppSelector((state) => state.offline);
export const useAllMembers = () => useAppSelector((state) => state.members);
export const useCurrentMemberId = () => useAppSelector((state) => state.currentMemberId);
export const useActiveHouseholdId = () => useAppSelector((state) => state.activeHouseholdId);
/** All households the current person belongs to (for the household switcher). */
export const useHouseholdsMap = () => useAppSelector((state) => state.households);

export const useHousehold = () => useDataSelector((data) => data.household);
export const useAreas = () => useDataSelector((data) => data.areas);
export const useArticles = () => useDataSelector((data) => data.articles);
export const useStores = () => useDataSelector((data) => data.stores);
export const useRecipes = () => useDataSelector((data) => data.recipes);
export const useRestaurants = () => useDataSelector((data) => data.restaurants);
/** Newest first. */
export const useActivities = () => useDataSelector((data) => data.activities);
export const usePlanEntries = () => useDataSelector((data) => data.planEntries);
export const useShoppingLists = () => useDataSelector((data) => data.lists);
export const useShoppingItems = () => useDataSelector((data) => data.items);
export const useChores = () => useDataSelector((data) => data.chores);
export const useChoreEvents = () => useDataSelector((data) => data.choreEvents);
export const useAbsences = () => useDataSelector((data) => data.absences);
export const useFeedback = () => useDataSelector((data) => data.feedback);

const byIdCache = new WeakMap<object, Record<Id, unknown>>();
/** Index of a stored array by id, cached per array instance. */
export function indexById<T extends { id: Id }>(list: T[]): Record<Id, T> {
  const cached = byIdCache.get(list);
  if (cached) return cached as Record<Id, T>;
  const index: Record<Id, T> = {};
  for (const entry of list) index[entry.id] = entry;
  byIdCache.set(list, index);
  return index;
}

export function useArticlesById(): Record<Id, Article> {
  return indexById(useArticles());
}
export function useRecipesById(): Record<Id, Recipe> {
  return indexById(useRecipes());
}
export function useRestaurantsById(): Record<Id, Restaurant> {
  return indexById(useRestaurants());
}
export function useRestaurant(id: Id | undefined): Restaurant | undefined {
  const restaurants = useRestaurantsById();
  return id ? restaurants[id] : undefined;
}
export function useActivitiesById(): Record<Id, Activity> {
  return indexById(useActivities());
}
export function useActivity(id: Id | undefined): Activity | undefined {
  const activities = useActivitiesById();
  return id ? activities[id] : undefined;
}
export function useRecipe(id: Id | undefined): Recipe | undefined {
  const recipes = useRecipesById();
  return id ? recipes[id] : undefined;
}

const membersCache = new WeakMap<object, Map<string, Member[]>>();
/** Members of the active household, in household order. */
export function useMembers(): Member[] {
  const all = useAllMembers();
  const household = useHousehold();
  let perMembers = membersCache.get(all);
  if (!perMembers) {
    perMembers = new Map();
    membersCache.set(all, perMembers);
  }
  const key = household.memberIds.join(',');
  let result = perMembers.get(key);
  if (!result) {
    result = household.memberIds.flatMap((id) => all.find((member) => member.id === id) ?? []);
    perMembers.set(key, result);
  }
  return result;
}
export function useMembersById(): Record<Id, Member> {
  return indexById(useAllMembers());
}
export function useCurrentMember(): Member {
  const members = useAllMembers();
  const id = useCurrentMemberId();
  const member = members.find((candidate) => candidate.id === id) ?? members[0];
  if (!member) throw new Error('No members');
  return member;
}

// Non-reactive reads for commands and event handlers.
export const readData = getData;
export const readState = getState;
