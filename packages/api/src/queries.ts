import {
  resolveShoppingStore,
  type Activity,
  type Article,
  type Id,
  type Member,
  type PackingItem,
  type PackingListBag,
  type Recipe,
  type Restaurant,
  type Store,
} from '@housekeeping/core';

import { useMemo } from 'react';

import { useAppSelector, useDataSelector } from './store';

// Read side of the data interface. Every hook returns stored references, so components only
// re-render when that slice changed. Derived values are computed in core functions by the caller.

export const useToday = () => useAppSelector((state) => state.today);
export const useOffline = () => useAppSelector((state) => state.offline);
const useAllMembers = () => useAppSelector((state) => state.members);
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
export const useShoppingItems = () => useDataSelector((data) => data.items);
export const useChores = () => useDataSelector((data) => data.chores);
export const useChoreEvents = () => useDataSelector((data) => data.choreEvents);
export const useAbsences = () => useDataSelector((data) => data.absences);
export const useFeedback = () => useDataSelector((data) => data.feedback);
/** Spec 0012: Reisetaschen and their Packstücke in creation order (core orderedBags, bagItemsOf). */
export const usePackingBags = () => useDataSelector((data) => data.packingBags);
export const usePackingBagItems = () => useDataSelector((data) => data.packingBagItems);
/** Every bag of a packing list and every Packstück of the household (calendar, Übersicht). */
export const usePackingListBags = () => useDataSelector((data) => data.packingListBags);
export const usePackingItems = () => useDataSelector((data) => data.packingItems);

export interface PackingList {
  listBags: PackingListBag[];
  items: PackingItem[];
}

/**
 * The packing list of these absences (the absences of one Urlaubsseite): their bags and those
 * bags' Packstücke, in creation order; order them with core packingSections. Recomputed only
 * when the ids or the packing rows change.
 */
export function usePackingList(absenceIds: readonly Id[]): PackingList {
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const key = absenceIds.join(',');
  return useMemo(() => {
    const ids = new Set(key.split(','));
    const own = listBags.filter((bag) => ids.has(bag.absenceId));
    const bagIds = new Set(own.map((bag) => bag.id));
    return { listBags: own, items: items.filter((item) => bagIds.has(item.listBagId)) };
  }, [key, listBags, items]);
}

/**
 * The store "Einkaufen" sorts for (spec 0006, D26): the one chosen on this device, else the
 * household's default store; undefined = "Ohne Markt – nach Bereichen".
 */
export function useShoppingStore(): Store | undefined {
  const stores = useStores();
  const household = useHousehold();
  const choice = useAppSelector((state) => state.storeChoices?.[state.activeHouseholdId]);
  return resolveShoppingStore(stores, choice, household.defaultStoreId);
}

const byIdCache = new WeakMap<object, Record<Id, unknown>>();
/**
 * Index of a stored array by id, cached per array instance. Without a prototype, so an id from
 * the address like `constructor` or `toString` finds nothing instead of an Object method.
 */
export function indexById<T extends { id: Id }>(list: T[]): Record<Id, T> {
  const cached = byIdCache.get(list);
  if (cached) return cached as Record<Id, T>;
  const index = Object.create(null) as Record<Id, T>;
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
