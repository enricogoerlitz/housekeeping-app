import {
  cleanTags,
  findDuplicateRestaurant,
  isHalfStar,
  normalizeWebsite,
  parseMapsLink,
  type GeoPoint,
  type Id,
  type Restaurant,
} from '@housekeeping/core';

import { onlineCall } from './backend';
import { commit, getData, getState, newId, nowISO, updateData } from './store';
import { TransportError } from './transport';

/** Thrown by the rating commands for a value that is not 0,5 … 5 in half steps (AC-026). */
export const INVALID_STARS = 'Bewertung: 0,5 bis 5 Sterne in halben Schritten';

export interface RestaurantDraft {
  name: string;
  address?: string;
  location?: GeoPoint;
  mapsUrl?: string;
  cuisine?: string;
  priceLevel?: Restaurant['priceLevel'];
  notes?: string;
  /** Schlagworte like at the recipe, at most 30 (spec 0024, REQ-001). */
  tags?: string[];
  /** "Webseite" as typed; "https://" is added (spec 0024, REQ-003). */
  websiteUrl?: string;
}

/** The fields "Restaurant bearbeiten" changes; a field given as undefined is cleared. */
export type RestaurantPatch = Partial<
  Pick<
    Restaurant,
    | 'name'
    | 'address'
    | 'location'
    | 'mapsUrl'
    | 'cuisine'
    | 'priceLevel'
    | 'tags'
    | 'notes'
    | 'websiteUrl'
  >
>;

export const MAX_RESTAURANT_TAGS = 30;
const TOO_MANY_TAGS = `Höchstens ${MAX_RESTAURANT_TAGS} Schlagworte`;

const trimmed = (text: string | undefined) => text?.trim() || undefined;

/** Tags as stored (core cleanTags); "Höchstens 30 Schlagworte" beyond the limit. */
function checkTags(tags: readonly string[]): string[] {
  const clean = cleanTags(tags);
  if (clean.length > MAX_RESTAURANT_TAGS) throw new Error(TOO_MANY_TAGS);
  return clean;
}

/**
 * The website as stored (core normalizeWebsite, the rule of private.is_web_url), undefined for an
 * empty field; throws the field's message ("Keine gültige Adresse").
 */
export function checkWebsite(input: string | undefined): string | undefined {
  const result = normalizeWebsite(input ?? '');
  if ('problem' in result) throw new Error(result.problem);
  return result.url;
}

export type LinkReading =
  | { status: 'place'; draft: RestaurantDraft; duplicate?: Restaurant }
  /** Short link: the place is only known after the server resolved it (spec 0002, AC-005). */
  | { status: 'short'; url: string }
  | { status: 'invalid' };

/**
 * Reads a pasted or shared map link into a draft, and checks for an existing restaurant; the
 * restaurant being edited (`ownId`) does not count (spec 0024, AC-004).
 */
export function readMapsLink(text: string, ownId?: Id): LinkReading {
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
    duplicate: findDuplicateRestaurant(
      draft,
      getData().restaurants.filter((restaurant) => restaurant.id !== ownId),
    ),
  };
}

export const NOT_A_MAPS_LINK_MESSAGE = 'Das ist kein Karten-Link';
const RESOLVE_FAILED_MESSAGE =
  'Der Link ließ sich gerade nicht öffnen – bitte noch einmal versuchen';

/**
 * Resolves a short link: the edge function `resolve-maps-link` follows the redirect (AC-031).
 * Online only (OfflineError).
 */
export async function resolveMapsShortLink(url: string): Promise<RestaurantDraft> {
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
  const tags = checkTags(draft.tags ?? []);
  const websiteUrl = checkWebsite(draft.websiteUrl);
  return commit({ path: 'diff' }, () => {
    const restaurant: Restaurant = {
      id: newId(),
      name,
      address: draft.address?.trim() || undefined,
      location: draft.location,
      mapsUrl: draft.mapsUrl,
      cuisine: draft.cuisine?.trim() || undefined,
      priceLevel: draft.priceLevel,
      notes: draft.notes?.trim() || undefined,
      tags,
      websiteUrl,
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

/**
 * "Restaurant bearbeiten" (spec 0024, REQ-001): changes the fields given, a field given as
 * undefined is cleared (an emptied map link clears link and coordinates). Throws "Name fehlt",
 * "Höchstens 30 Schlagworte" or the website's message before anything changes. A restaurant
 * deleted meanwhile is refused by the server and springs back with the general hint (AC-005).
 */
export function updateRestaurant(id: Id, patch: RestaurantPatch): void {
  const clean: RestaurantPatch = { ...patch };
  if ('name' in patch) {
    const name = patch.name?.trim();
    if (!name) throw new Error('Name fehlt');
    clean.name = name;
  }
  if ('address' in patch) clean.address = trimmed(patch.address);
  if ('cuisine' in patch) clean.cuisine = trimmed(patch.cuisine);
  if ('notes' in patch) clean.notes = trimmed(patch.notes);
  if ('tags' in patch) clean.tags = checkTags(patch.tags ?? []);
  if ('websiteUrl' in patch) clean.websiteUrl = checkWebsite(patch.websiteUrl);
  commit({ path: 'diff' }, () =>
    patchRestaurant(id, (restaurant) => ({ ...restaurant, ...clean })),
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

/**
 * Ratings are per person: their own RPC; undo restores the previous rating (or none). Half steps
 * from 0,5 to 5 (spec 0011); anything else is refused before sending, never rounded (AC-026).
 * The same value again is a rating too: it is sent, and ratedAt moves on (Offene Frage 7).
 */
export function rateRestaurant(id: Id, stars: number): void {
  const me = getState().currentMemberId;
  const restaurant = getData().restaurants.find((candidate) => candidate.id === id);
  if (!restaurant) return;
  if (!isHalfStar(stars)) throw new Error(INVALID_STARS);
  const value = stars;
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
        ratedAt: { ...current.ratedAt, [me]: nowISO() },
      })),
  );
}
