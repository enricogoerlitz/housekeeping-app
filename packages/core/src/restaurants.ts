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
