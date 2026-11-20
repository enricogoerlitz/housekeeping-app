import {
  findDuplicateRestaurant,
  parseMapsLink,
  type GeoPoint,
  type Id,
  type Restaurant,
} from '@housekeeping/core';

import { onlineCall } from './backend';
import { commit, getData, getState, isBackendMode, newId, nowISO, updateData } from './store';
import { TransportError } from './transport';

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

/** Demo mode: resolves a short link to a sample place. */
export function resolveShortLink(url: string): RestaurantDraft {
  return { ...SAMPLE_SHORT_LINK_PLACE, mapsUrl: url };
}

export const NOT_A_MAPS_LINK_MESSAGE = 'Das ist kein Karten-Link';
const RESOLVE_FAILED_MESSAGE =
  'Der Link ließ sich gerade nicht öffnen – bitte noch einmal versuchen';

/**
 * Resolves a short link: with the backend the edge function `resolve-maps-link` follows the
 * redirect (AC-031); in demo mode it is the sample place. Online only (OfflineError).
 */
export async function resolveMapsShortLink(url: string): Promise<RestaurantDraft> {
  if (!isBackendMode()) return resolveShortLink(url);
  try {
    const place = await onlineCall((transport) => transport.resolveMapsLink(url));
    return {
      name: place.name,
      address: place.address,
      location: place.location,
      mapsUrl: place.mapsUrl,
    };
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    throw new Error(
      error.code === 'not_a_maps_link' ? NOT_A_MAPS_LINK_MESSAGE : RESOLVE_FAILED_MESSAGE,
    );
  }
}

export function createRestaurant(draft: RestaurantDraft): Id {
  const name = draft.name.trim();
  if (!name) throw new Error('Name fehlt');
  return commit({ path: 'diff' }, () => {
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
  });
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
  commit({ path: 'diff' }, () =>
    patchRestaurant(id, (restaurant) => ({ ...restaurant, ...patch })),
  );
}

/** Favourites are per person: their own RPC; undo sends the opposite. */
export function toggleRestaurantFavorite(id: Id): void {
  const me = getState().currentMemberId;
  const restaurant = getData().restaurants.find((candidate) => candidate.id === id);
  if (!restaurant) return;
  const favorite = !restaurant.favoriteOf.includes(me);
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setRestaurantFavorite(id, favorite),
      inverse: (transport) => transport.setRestaurantFavorite(id, !favorite),
    },
    () =>
      patchRestaurant(id, (current) => ({
        ...current,
        favoriteOf: favorite
          ? [...current.favoriteOf, me]
          : current.favoriteOf.filter((member) => member !== me),
      })),
  );
}

/** Ratings are per person: their own RPC; undo restores the previous rating (or none). */
export function rateRestaurant(id: Id, stars: number): void {
  const me = getState().currentMemberId;
  const restaurant = getData().restaurants.find((candidate) => candidate.id === id);
  if (!restaurant) return;
  const value = Math.max(1, Math.min(5, Math.round(stars)));
  const previous = restaurant.ratings[me] ?? null;
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setRestaurantRating(id, value),
      inverse: (transport) => transport.setRestaurantRating(id, previous),
    },
    () =>
      patchRestaurant(id, (current) => ({
        ...current,
        ratings: { ...current.ratings, [me]: value },
      })),
  );
}
