import {
  cuisineKey,
  minRatingLabel,
  orderByShuffle,
  type CuisineFacet,
  type MinRating,
} from './recipe-list';
import { priceLabel, restaurantVisits } from './restaurants';
import type { Id, ISODate, MealPlanEntry, Restaurant } from './types';

// The list on "Essen → Restaurants" (spec 0008, REQ-005): the same filter row as for recipes,
// with Küche, Preisniveau and the own rating, and the sorts "Zuletzt besucht", "Bewertung", "A–Z"
// and "Zufall". Cuisines come from cuisineFacets.

export type PriceLevel = NonNullable<Restaurant['priceLevel']>;

export const PRICE_LEVELS: readonly PriceLevel[] = [1, 2, 3, 4];

export interface RestaurantListFilter {
  /** Own favourites; the only quick chip. */
  favorites: boolean;
  /** Cuisine keys (cuisineKey); one of them must fit. */
  cuisines: string[];
  /** One of them must fit. */
  priceLevels: PriceLevel[];
  /** The own rating from this value on. */
  minRating?: MinRating;
}

export const EMPTY_RESTAURANT_LIST_FILTER: RestaurantListFilter = {
  favorites: false,
  cuisines: [],
  priceLevels: [],
};

/** The quick chip "Favoriten". */
export function toggleRestaurantFavorites(filter: RestaurantListFilter): RestaurantListFilter {
  return { ...filter, favorites: !filter.favorites };
}

/** n in "Filter (n)", the quick chip included. */
export function restaurantFilterCount(filter: RestaurantListFilter): number {
  return (
    Number(filter.favorites) +
    filter.cuisines.length +
    filter.priceLevels.length +
    Number(filter.minRating !== undefined)
  );
}

export type RestaurantFilterChip =
  | { kind: 'cuisine'; value: string; label: string }
  | { kind: 'price'; value: PriceLevel; label: string }
  | { kind: 'rating'; value: MinRating; label: string };

/** Active values without a quick chip, with ✕: Küche, Preisniveau ("€€"), Bewertung. */
export function restaurantFilterChips(
  filter: RestaurantListFilter,
  facets: readonly CuisineFacet[],
): RestaurantFilterChip[] {
  const chips: RestaurantFilterChip[] = [
    ...filter.cuisines.map((value): RestaurantFilterChip => ({
      kind: 'cuisine',
      value,
      label: facets.find((facet) => facet.key === value)?.label ?? value,
    })),
    ...filter.priceLevels.map((value): RestaurantFilterChip => ({
      kind: 'price',
      value,
      label: priceLabel(value),
    })),
  ];
  if (filter.minRating !== undefined) {
    chips.push({
      kind: 'rating',
      value: filter.minRating,
      label: minRatingLabel(filter.minRating),
    });
  }
  return chips;
}

export function removeRestaurantFilterChip(
  filter: RestaurantListFilter,
  chip: RestaurantFilterChip,
): RestaurantListFilter {
  switch (chip.kind) {
    case 'cuisine':
      return { ...filter, cuisines: filter.cuisines.filter((value) => value !== chip.value) };
    case 'price':
      return { ...filter, priceLevels: filter.priceLevels.filter((value) => value !== chip.value) };
    case 'rating':
      return { ...filter, minRating: undefined };
  }
}

/** The restaurants that pass every section, in the given order (AC-016). */
export function applyRestaurantListFilter(
  restaurants: readonly Restaurant[],
  filter: RestaurantListFilter,
  me: Id,
): Restaurant[] {
  const cuisines = new Set(filter.cuisines);
  const { minRating } = filter;
  return restaurants.filter((restaurant) => {
    if (filter.favorites && !restaurant.favoriteOf.includes(me)) return false;
    if (cuisines.size > 0 && !cuisines.has(cuisineKey(restaurant.cuisine ?? ''))) return false;
    if (
      filter.priceLevels.length > 0 &&
      (restaurant.priceLevel === undefined || !filter.priceLevels.includes(restaurant.priceLevel))
    ) {
      return false;
    }
    if (minRating !== undefined && (restaurant.ratings[me] ?? 0) < minRating) return false;
    return true;
  });
}

export type RestaurantListSort = 'lastVisit' | 'rating' | 'title' | 'random';

/** The sort menu in this order; "A–Z" stays the default (REQ-005). */
export const RESTAURANT_SORTS: readonly { value: RestaurantListSort; label: string }[] = [
  { value: 'lastVisit', label: 'Zuletzt besucht' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'title', label: 'A–Z' },
  { value: 'random', label: 'Zufall' },
];

export const DEFAULT_RESTAURANT_SORT: RestaurantListSort = 'title';

export interface RestaurantSortContext {
  me: Id;
  /** The meal plan; a visit is a restaurant entry up to today (Glossar „Besuch“). */
  entries: readonly MealPlanEntry[];
  today: ISODate;
  /** The stored random order for "Zufall". */
  shuffle: readonly Id[];
}

const byName = (a: Restaurant, b: Restaurant): number => a.name.localeCompare(b.name, 'de');

/**
 * "Zuletzt besucht": last visit first, never visited last (AC-017); "Bewertung": the own rating,
 * best first, unrated last; ties A to Z. "Zufall" follows the stored order, new ones at the end.
 */
export function sortRestaurantList(
  restaurants: readonly Restaurant[],
  sort: RestaurantListSort,
  context: RestaurantSortContext,
): Restaurant[] {
  if (sort === 'random') {
    return orderByShuffle(restaurants, context.shuffle, (restaurant) => restaurant.name);
  }
  const entries = [...context.entries];
  // ISO dates order like strings; '' stands for "never visited" and sorts last.
  const lastVisit = new Map(
    sort === 'lastVisit'
      ? restaurants.map((restaurant) => [
          restaurant.id,
          restaurantVisits(restaurant.id, entries, context.today).lastOn ?? '',
        ])
      : [],
  );
  const compare: Record<Exclude<RestaurantListSort, 'random'>, typeof byName> = {
    lastVisit: (a, b) => (lastVisit.get(b.id) ?? '').localeCompare(lastVisit.get(a.id) ?? ''),
    rating: (a, b) => (b.ratings[context.me] ?? 0) - (a.ratings[context.me] ?? 0),
    title: () => 0,
  };
  return [...restaurants].sort((a, b) => compare[sort](a, b) || byName(a, b));
}

/** "3 Restaurants", "1 Restaurant". */
export function restaurantCountLabel(count: number): string {
  return count === 1 ? '1 Restaurant' : `${count} Restaurants`;
}

/** "1 Restaurant zeigen" (AC-016). */
export function restaurantShowLabel(count: number): string {
  return `${restaurantCountLabel(count)} zeigen`;
}

/** "Keine Restaurants für „xyzzy““, else "Keine Restaurants für diese Filter". */
export function restaurantEmptyLabel(query: string): string {
  const shown = query.trim();
  return shown === '' ? 'Keine Restaurants für diese Filter' : `Keine Restaurants für „${shown}“`;
}
