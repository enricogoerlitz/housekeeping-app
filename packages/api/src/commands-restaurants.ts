import {
  findDuplicateRestaurant,
  parseMapsLink,
  type GeoPoint,
  type Id,
  type Restaurant,
} from '@housekeeping/core';

import { getData, getState, newId, nowISO, updateData } from './store';

export interface RestaurantDraft {
  name: string;
  address?: string;
  location?: GeoPoint;
  mapsUrl?: string;
  cuisine?: string;
  priceLevel?: Restaurant['priceLevel'];
  notes?: string;
}

export type LinkReading =
  | { status: 'place'; draft: RestaurantDraft; duplicate?: Restaurant }
  /** Short link: the place is only known after the server resolved it (spec 0002, AC-005). */
  | { status: 'short'; url: string }
  | { status: 'invalid' };

/** Reads a pasted or shared map link into a draft, and checks for an existing restaurant. */
export function readMapsLink(text: string): LinkReading {
  const link = parseMapsLink(text);
  if (!link) return { status: 'invalid' };
  if (link.kind === 'short') return { status: 'short', url: link.url };
  const draft: RestaurantDraft = {
    name: link.name ?? '',
    location: link.location,
    mapsUrl: link.url,
  };
  return {
    status: 'place',
    draft,
    duplicate: findDuplicateRestaurant(draft, getData().restaurants),
  };
}

// Stand-in for the server that follows a short link's redirect (Edge Function, later spec).
const SAMPLE_SHORT_LINK_PLACE: RestaurantDraft = {
  name: 'Café Fleur',
  address: 'Lindenstraße 10, Köln',
  location: { lat: 50.9338, lng: 6.9395 },
  cuisine: 'Café',
};

/** Resolves a short link. Today a sample place; later the server follows the redirect. */
export function resolveShortLink(url: string): RestaurantDraft {
  return { ...SAMPLE_SHORT_LINK_PLACE, mapsUrl: url };
}

export function createRestaurant(draft: RestaurantDraft): Id {
  const name = draft.name.trim();
  if (!name) throw new Error('Name fehlt');
  const restaurant: Restaurant = {
    id: newId('rest'),
    name,
    address: draft.address?.trim() || undefined,
    location: draft.location,
    mapsUrl: draft.mapsUrl,
    cuisine: draft.cuisine?.trim() || undefined,
    priceLevel: draft.priceLevel,
    notes: draft.notes?.trim() || undefined,
    tags: [],
    favoriteOf: [],
    ratings: {},
    createdAt: nowISO(),
  };
  updateData((data) => ({ ...data, restaurants: [restaurant, ...data.restaurants] }));
  return restaurant.id;
}

function patchRestaurant(id: Id, patch: (restaurant: Restaurant) => Restaurant): void {
  updateData((data) => ({
    ...data,
    restaurants: data.restaurants.map((restaurant) =>
      restaurant.id === id ? patch(restaurant) : restaurant,
    ),
  }));
}

export function updateRestaurant(
  id: Id,
  patch: Partial<Pick<Restaurant, 'name' | 'address' | 'cuisine' | 'priceLevel' | 'notes'>>,
): void {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Name fehlt');
  patchRestaurant(id, (restaurant) => ({ ...restaurant, ...patch }));
}

export function toggleRestaurantFavorite(id: Id): void {
  const me = getState().currentMemberId;
  patchRestaurant(id, (restaurant) => ({
    ...restaurant,
    favoriteOf: restaurant.favoriteOf.includes(me)
      ? restaurant.favoriteOf.filter((member) => member !== me)
      : [...restaurant.favoriteOf, me],
  }));
}

export function rateRestaurant(id: Id, stars: number): void {
  const me = getState().currentMemberId;
  const value = Math.max(1, Math.min(5, Math.round(stars)));
  patchRestaurant(id, (restaurant) => ({
    ...restaurant,
    ratings: { ...restaurant.ratings, [me]: value },
  }));
}
