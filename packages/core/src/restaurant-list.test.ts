import { describe, expect, it } from 'vitest';

import {
  applyRestaurantListFilter,
  EMPTY_RESTAURANT_LIST_FILTER,
  RESTAURANT_SORTS,
  restaurantCountLabel,
  restaurantEmptyLabel,
  restaurantFilterChips,
  restaurantFilterCount,
  restaurantShowLabel,
  removeRestaurantFilterChip,
  sortRestaurantList,
  toggleRestaurantFavorites,
  type RestaurantListFilter,
} from './restaurant-list';
import { cuisineFacets } from './recipe-list';
import { enrico, nadja } from './test-fixtures';
import type { MealPlanEntry, Restaurant } from './types';

function restaurant(partial: Partial<Restaurant> & Pick<Restaurant, 'id' | 'name'>): Restaurant {
  return {
    tags: [],
    favoriteOf: [],
    ratings: {},
    createdAt: '2026-10-01T12:00:00.000Z',
    ...partial,
  };
}

const enzo = restaurant({
  id: 'enzo',
  name: 'Trattoria Da Enzo',
  cuisine: 'Italienisch',
  priceLevel: 2,
});
const pho = restaurant({ id: 'pho', name: 'Pho Saigon', cuisine: 'Vietnamesisch', priceLevel: 1 });
const mario = restaurant({ id: 'mario', name: 'Da Mario', cuisine: 'Italienisch', priceLevel: 3 });
const all = [enzo, pho, mario];

const names = (restaurants: readonly Restaurant[]) => restaurants.map((entry) => entry.name);

function visit(id: string, restaurantId: string, date: string): MealPlanEntry {
  return {
    id,
    date,
    slotId: 'slot-abend',
    kind: 'restaurant',
    restaurantId,
    eaterIds: [],
    guests: 0,
    portions: 0,
    variants: [],
    sort: 0,
  };
}

const today = '2026-11-20';

describe('restaurant list (REQ-005)', () => {
  it('AC-016: cuisine and price level together leave "1 Restaurant zeigen"', () => {
    const filter: RestaurantListFilter = {
      ...EMPTY_RESTAURANT_LIST_FILTER,
      cuisines: ['italienisch'],
      priceLevels: [2],
    };
    const shown = applyRestaurantListFilter(all, filter, enrico.id);
    expect(names(shown)).toEqual(['Trattoria Da Enzo']);
    expect(restaurantShowLabel(shown.length)).toBe('1 Restaurant zeigen');
    expect(restaurantShowLabel(3)).toBe('3 Restaurants zeigen');
    expect(restaurantFilterCount(filter)).toBe(2);
  });

  it('AC-016: several price levels: one of them fits', () => {
    const filter: RestaurantListFilter = { ...EMPTY_RESTAURANT_LIST_FILTER, priceLevels: [1, 3] };
    expect(names(applyRestaurantListFilter(all, filter, enrico.id))).toEqual([
      'Pho Saigon',
      'Da Mario',
    ]);
  });

  it('AC-016: cuisines with counts as for recipes', () => {
    expect(cuisineFacets(all)).toEqual([
      { key: 'italienisch', label: 'Italienisch', count: 2 },
      { key: 'vietnamesisch', label: 'Vietnamesisch', count: 1 },
    ]);
  });

  it('AC-016: chips with ✕ for cuisine, price level and rating; ✕ removes the value', () => {
    const filter: RestaurantListFilter = {
      favorites: true,
      cuisines: ['italienisch'],
      priceLevels: [2],
      minRating: 4,
    };
    const chips = restaurantFilterChips(filter, cuisineFacets(all));
    expect(chips.map((chip) => chip.label)).toEqual(['Italienisch', '€€', 'ab 4 ★']);
    expect(restaurantFilterCount(filter)).toBe(4);
    let rest = filter;
    for (const chip of chips) rest = removeRestaurantFilterChip(rest, chip);
    expect(rest).toEqual({ ...EMPTY_RESTAURANT_LIST_FILTER, favorites: true });
  });

  it('AC-017: "Zuletzt besucht" orders by the last visit, never visited last', () => {
    const entries = [
      visit('e1', 'pho', '2026-11-08'),
      visit('e2', 'enzo', '2026-10-21'),
      visit('e3', 'enzo', '2026-12-01'),
    ];
    expect(
      names(sortRestaurantList(all, 'lastVisit', { me: enrico.id, entries, today, shuffle: [] })),
    ).toEqual(['Pho Saigon', 'Trattoria Da Enzo', 'Da Mario']);
  });

  it('AC-016: the sorts are "Zuletzt besucht", "Bewertung", "A–Z" and "Zufall"', () => {
    expect(RESTAURANT_SORTS.map((sort) => sort.label)).toEqual([
      'Zuletzt besucht',
      'Bewertung',
      'A–Z',
      'Zufall',
    ]);
    const ctx = { me: enrico.id, entries: [], today, shuffle: ['pho', 'mario', 'enzo'] };
    expect(names(sortRestaurantList(all, 'title', ctx))).toEqual([
      'Da Mario',
      'Pho Saigon',
      'Trattoria Da Enzo',
    ]);
    expect(names(sortRestaurantList(all, 'random', ctx))).toEqual([
      'Pho Saigon',
      'Da Mario',
      'Trattoria Da Enzo',
    ]);
    const added = restaurant({ id: 'neu', name: 'Burger Bar' });
    expect(names(sortRestaurantList([...all, added], 'random', ctx)).at(-1)).toBe('Burger Bar');
  });

  it('own rating counts for the rating filter and sort; unrated come last', () => {
    const rated = [
      { ...enzo, ratings: { [enrico.id]: 3.5, [nadja.id]: 5 } },
      { ...pho, ratings: { [enrico.id]: 4.5 } },
      { ...mario, ratings: { [nadja.id]: 5 } },
    ];
    const ctx = { me: enrico.id, entries: [], today, shuffle: [] };
    expect(names(sortRestaurantList(rated, 'rating', ctx))).toEqual([
      'Pho Saigon',
      'Trattoria Da Enzo',
      'Da Mario',
    ]);
    const filter = { ...EMPTY_RESTAURANT_LIST_FILTER, minRating: 4 as const };
    expect(names(applyRestaurantListFilter(rated, filter, enrico.id))).toEqual(['Pho Saigon']);
  });

  it('quick chip "Favoriten" means the own favourites', () => {
    const favs = [{ ...enzo, favoriteOf: [nadja.id] }, { ...pho, favoriteOf: [enrico.id] }, mario];
    const filter = toggleRestaurantFavorites(EMPTY_RESTAURANT_LIST_FILTER);
    expect(names(applyRestaurantListFilter(favs, filter, enrico.id))).toEqual(['Pho Saigon']);
    expect(restaurantFilterChips(filter, [])).toEqual([]);
    expect(toggleRestaurantFavorites(filter)).toEqual(EMPTY_RESTAURANT_LIST_FILTER);
  });

  it('labels: "3 Restaurants", "1 Restaurant", empty search and empty filter', () => {
    expect(restaurantCountLabel(3)).toBe('3 Restaurants');
    expect(restaurantCountLabel(1)).toBe('1 Restaurant');
    expect(restaurantEmptyLabel('xyzzy')).toBe('Keine Restaurants für „xyzzy“');
    expect(restaurantEmptyLabel(' ')).toBe('Keine Restaurants für diese Filter');
  });
});
