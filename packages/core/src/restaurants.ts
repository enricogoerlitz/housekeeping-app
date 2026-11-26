import { visitsOf, type Visits } from './meal-plan';
import { normalizeText } from './text';
import type { Activity, GeoPoint, ISODate, MealPlanEntry, Restaurant } from './types';

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

export type MapsApp = 'apple' | 'google';

/** How "Route" opens a map app (spec 0029, REQ-004). */
export type RouteOpening =
  /** As a link in a new tab: browser tabs, Android, desktop. */
  | { kind: 'new-tab'; url: string }
  /**
   * By the app's scheme in the same window, so no empty in-app browser stays behind in the
   * installed iPhone web app; `fallback` opens when the app is not installed.
   */
  | { kind: 'app-scheme'; url: string; fallback?: string };

/**
 * "Route" shows only where a map link is stored (spec 0036, REQ-011): at a restaurant, an
 * activity, a plan entry and in the overview. An address alone is no destination to trust.
 */
export function showsRoute(place: { mapsUrl?: string }): boolean {
  return (place.mapsUrl ?? '').trim() !== '';
}

/**
 * The opening for a map app. In the installed web app on iPhone and iPad a new window becomes an
 * in-app browser that stays empty once a universal link has jumped to the app (WebKit bug 199029),
 * so the app is opened by its scheme instead: `maps:` with the parameters of `maps.apple.com`,
 * `comgooglemaps:` with `daddr` (Google "Maps URL Scheme for iOS").
 */
export function routeOpening(
  app: MapsApp,
  place: Parameters<typeof routeLinks>[0],
  environment: { installedIosApp: boolean },
): RouteOpening {
  const links = routeLinks(place);
  const url = links[app];
  if (!environment.installedIosApp) return { kind: 'new-tab', url };
  if (app === 'apple') {
    return { kind: 'app-scheme', url: url.replace('https://maps.apple.com/', 'maps://') };
  }
  // The same destination as the website link: coordinates, else the encoded name and address.
  const destination = url.slice(url.indexOf('destination=') + 'destination='.length);
  return { kind: 'app-scheme', url: `comgooglemaps://?daddr=${destination}`, fallback: url };
}

/**
 * Whether this is the web app installed on an iPhone or iPad's home screen. iPadOS reports itself
 * as a Mac; only the touch points tell it apart from a Mac with a mouse.
 */
export function isInstalledIosApp(device: {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): boolean {
  if (!device.standalone) return false;
  if (/iPhone|iPad|iPod/.test(device.userAgent)) return true;
  return /Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1;
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
