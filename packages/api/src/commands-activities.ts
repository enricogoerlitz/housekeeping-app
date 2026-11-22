// Activities (spec 0004): like restaurants (spec 0002/0003) — create and edit on the diff path,
// favourites and ratings per member over their own RPCs. The name is free; a map link only gives
// the place. Names are unique per household after normalizeText (AC-008, unique name_key).
import {
  findDuplicateActivity,
  isHalfStar,
  parseMapsLink,
  type Activity,
  type GeoPoint,
  type Id,
} from '@housekeeping/core';

import { INVALID_STARS, resolveMapsShortLink } from './commands-restaurants';
import { commit, getData, getState, newId, nowISO, updateData } from './store';

/** Where an activity takes place; every field optional. */
export interface ActivityPlace {
  /** e.g. "Eisstadion Hohenschönhausen" (labels the route, AC-014). */
  placeName?: string;
  address?: string;
  location?: GeoPoint;
  /** The map link it came from (https). */
  mapsUrl?: string;
}

export interface ActivityDraft extends ActivityPlace {
  name: string;
  description?: string;
}

export type ActivityLinkReading =
  | { status: 'place'; place: ActivityPlace }
  /** Short link: the place is only known after the server resolved it (resolveActivityShortLink). */
  | { status: 'short'; url: string }
  | { status: 'invalid' };

type ActivityPatch = Partial<
  Pick<Activity, 'name' | 'description' | 'placeName' | 'address' | 'location' | 'mapsUrl'>
>;

const trimmed = (text: string | undefined) => text?.trim() || undefined;

/** "Name fehlt", or "Gibt es schon: Bouldern" when another activity has the same name. */
function checkName(name: string, ownId?: Id): string {
  const clean = name.trim();
  if (!clean) throw new Error('Name fehlt');
  const others = getData().activities.filter((activity) => activity.id !== ownId);
  const duplicate = findDuplicateActivity(clean, others);
  if (duplicate) throw new Error(`Gibt es schon: ${duplicate.name}`);
  return clean;
}

/**
 * Creates an activity at the top of the collection. Throws "Name fehlt" or "Gibt es schon: <Name>"
 * before anything changes; the form shows the duplicate with "Öffnen" by checking the name with
 * core `findDuplicateActivity` while typing.
 */
export function createActivity(draft: ActivityDraft): Id {
  const name = checkName(draft.name);
  return commit({ path: 'diff' }, () => {
    const activity: Activity = {
      id: newId(),
      name,
      description: trimmed(draft.description),
      placeName: trimmed(draft.placeName),
      address: trimmed(draft.address),
      location: draft.location,
      mapsUrl: draft.mapsUrl,
      favoriteOf: [],
      ratings: {},
      createdBy: getState().currentMemberId,
      createdAt: nowISO(),
    };
    updateData((data) => ({ ...data, activities: [activity, ...data.activities] }));
    return activity.id;
  });
}

function patchActivity(id: Id, patch: (activity: Activity) => Activity): void {
  updateData((data) => ({
    ...data,
    activities: data.activities.map((activity) =>
      activity.id === id ? patch(activity) : activity,
    ),
  }));
}

/** Changes the fields given; a field given as undefined is cleared (e.g. the whole place). */
export function updateActivity(id: Id, patch: ActivityPatch): void {
  const clean: ActivityPatch = { ...patch };
  if ('name' in patch) clean.name = checkName(patch.name ?? '', id);
  if ('description' in patch) clean.description = trimmed(patch.description);
  if ('placeName' in patch) clean.placeName = trimmed(patch.placeName);
  if ('address' in patch) clean.address = trimmed(patch.address);
  commit({ path: 'diff' }, () => patchActivity(id, (activity) => ({ ...activity, ...clean })));
}

/** Favourites are per person: their own RPC; undo sends the opposite. */
export function toggleActivityFavorite(id: Id): void {
  const me = getState().currentMemberId;
  const activity = getData().activities.find((candidate) => candidate.id === id);
  if (!activity) return;
  const favorite = !activity.favoriteOf.includes(me);
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setActivityFavorite(id, favorite),
      inverse: (transport) => transport.setActivityFavorite(id, !favorite),
    },
    () =>
      patchActivity(id, (current) => ({
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
export function rateActivity(id: Id, stars: number): void {
  const me = getState().currentMemberId;
  const activity = getData().activities.find((candidate) => candidate.id === id);
  if (!activity) return;
  if (!isHalfStar(stars)) throw new Error(INVALID_STARS);
  const value = stars;
  const previous = activity.ratings[me] ?? null;
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setActivityRating(id, value),
      inverse: (transport) => transport.setActivityRating(id, previous),
    },
    () =>
      patchActivity(id, (current) => ({
        ...current,
        ratings: { ...current.ratings, [me]: value },
        ratedAt: { ...current.ratedAt, [me]: nowISO() },
      })),
  );
}

/** Reads a pasted or shared map link into the place of an activity (AC-006). */
export function readActivityMapsLink(text: string): ActivityLinkReading {
  const link = parseMapsLink(text);
  if (!link) return { status: 'invalid' };
  if (link.kind === 'short') return { status: 'short', url: link.url };
  return {
    status: 'place',
    place: { placeName: link.name, location: link.location, mapsUrl: link.url },
  };
}

/**
 * The place behind a short link, resolved on the server like for restaurants (online only,
 * OfflineError; German messages for a link without a place or a failure).
 */
export async function resolveActivityShortLink(url: string): Promise<ActivityPlace> {
  const place = await resolveMapsShortLink(url);
  return {
    placeName: place.name || undefined,
    address: place.address,
    location: place.location,
    mapsUrl: place.mapsUrl,
  };
}
