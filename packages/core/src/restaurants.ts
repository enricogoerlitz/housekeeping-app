import { visitsOf, type Visits } from './meal-plan';
import { normalizeText } from './text';
import type { Activity, GeoPoint, ISODate, MealPlanEntry, Restaurant } from './types';

export type MapsLink =
  | { kind: 'place'; provider: 'google' | 'apple'; name?: string; location?: GeoPoint; url: string }
  /** A short link (maps.app.goo.gl, goo.gl/maps) that only the server can resolve. */
  | { kind: 'short'; provider: 'google'; url: string };

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
  } catch {
    return segment.replace(/\+/g, ' ').trim();
  }
}

function parsePoint(lat: string | undefined, lng: string | undefined): GeoPoint | undefined {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180)
    return undefined;
  return { lat: a, lng: b };
}

/**
 * Reads a shared map link. Google: /maps/place/<Name>/@lat,lng… or ?q= / ?query=; Apple:
 * maps.apple.com/?q=<Name>&ll=lat,lng (also `address`, `name`). Short Google links are recognised
 * but need the server. Anything else (also text that merely contains a link) → null; the first URL
 * in a longer shared text is used.
 */
export function parseMapsLink(input: string): MapsLink | null {
  const match = input.match(/https?:\/\/\S+/);
  if (!match) return null;
  // core has no DOM/Node globals, so the URL is split by hand.
  const parts = match[0].match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/);
  if (!parts) return null;
  const hostname = (parts[1] ?? '').toLowerCase();
  const pathname = parts[2] ?? '';
  const params = new Map<string, string>();
  for (const pair of (parts[3] ?? '').split('&')) {
    const [key, value] = pair.split('=');
    if (key) params.set(key, decodeSegment(value ?? ''));
  }
  const href = match[0];
  const host = hostname.replace(/^www\./, '');
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && pathname.startsWith('/maps'))) {
    return { kind: 'short', provider: 'google', url: href };
  }
  if (host === 'maps.apple.com' || host === 'maps.apple') {
    const name = params.get('name') ?? params.get('q') ?? undefined;
    const [lat, lng] = (params.get('ll') ?? params.get('coordinate') ?? '').split(',');
    return {
      kind: 'place',
      provider: 'apple',
      name: name?.trim() || undefined,
      location: parsePoint(lat, lng),
      url: href,
    };
  }
  const isGoogle =
    // Only real Google domains ("google.de", "google.co.uk"); a free suffix would let
    // "maps.google.com.evil.example" pass as Google.
    /^(maps\.)?google\.(com|[a-z]{2}|(co|com)\.[a-z]{2})$/.test(host) &&
    (host.startsWith('maps.') || pathname.startsWith('/maps'));
  if (!isGoogle) return null;
  const place = pathname.match(/\/maps\/place\/([^/]+)/);
  // "@lat,lng" is only the centre of the visible map; the place itself is "!3d<lat>!4d<lng>".
  const pin = [...pathname.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)].at(-1);
  const at = pin ?? pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const query = params.get('query') ?? params.get('q') ?? undefined;
  const name = place?.[1] ? decodeSegment(place[1]) : query ? decodeSegment(query) : undefined;
  return {
    kind: 'place',
    provider: 'google',
    name: name || undefined,
    location: parsePoint(at?.[1], at?.[2]),
    url: href,
  };
}

/**
 * Route links for both map apps. Coordinates win over the name when known. An activity's place
 * name labels the destination instead of the activity's own name ("Eisstadion …", not
 * "Eislaufen"), which a map search could not find.
 */
export function routeLinks(
  place: Pick<Restaurant, 'name' | 'address' | 'location'> & Pick<Activity, 'placeName'>,
): {
  apple: string;
  google: string;
} {
  const name = place.placeName || place.name;
  const label = [name, place.address].filter(Boolean).join(', ');
  const q = encodeURIComponent(label);
  if (place.location) {
    const ll = `${place.location.lat},${place.location.lng}`;
    return {
      apple: `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(name)}`,
      google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    };
  }
  return {
    apple: `https://maps.apple.com/?daddr=${q}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}

/** An existing restaurant with the same normalised name, or within ~40 m of the same location. */
export function findDuplicateRestaurant(
  candidate: { name?: string; location?: GeoPoint },
  restaurants: Restaurant[],
): Restaurant | undefined {
  const name = candidate.name ? normalizeText(candidate.name) : undefined;
  return restaurants.find((restaurant) => {
    if (name && normalizeText(restaurant.name) === name) return true;
    if (candidate.location && restaurant.location) {
      const dLat = Math.abs(candidate.location.lat - restaurant.location.lat);
      const dLng = Math.abs(candidate.location.lng - restaurant.location.lng);
      return dLat < 0.0004 && dLng < 0.0006;
    }
    return false;
  });
}

/** Visits derived from the meal plan: entries of kind restaurant up to today. */
export function restaurantVisits(
  restaurantId: string,
  entries: MealPlanEntry[],
  today: ISODate,
): Omit<Visits, 'dates'> {
  const { count, lastOn, daysSince } = visitsOf('restaurant', restaurantId, entries, today);
  return { count, lastOn, daysSince };
}

/** "€€" for priceLevel 2. */
export function priceLabel(level: Restaurant['priceLevel']): string {
  return level ? '€'.repeat(level) : '';
}
