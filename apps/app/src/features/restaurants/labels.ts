import { priceLabel, type Restaurant } from '@housekeeping/core';

/** The town part of an address: "Severinstraße 12, Köln" → "Köln". */
function addressArea(address: string | undefined): string {
  if (!address) return '';
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** "Italienisch · €€ · Köln". */
export function restaurantMeta(restaurant: Restaurant): string {
  return [restaurant.cuisine, priceLabel(restaurant.priceLevel), addressArea(restaurant.address)]
    .filter(Boolean)
    .join(' · ');
}

/** "Zuletzt: vor 12 Tagen", "Zuletzt: gestern"; undefined without a visit. */
export function lastVisitLabel(daysSince: number | undefined): string | undefined {
  if (daysSince === undefined) return undefined;
  if (daysSince === 0) return 'Zuletzt: heute';
  if (daysSince === 1) return 'Zuletzt: gestern';
  return `Zuletzt: vor ${daysSince} Tagen`;
}

/** "Zuletzt: vor 12 Tagen · 3 Besuche" (AC-013). */
export function visitsLabel(visits: { count: number; daysSince?: number }): string {
  const last = lastVisitLabel(visits.daysSince);
  if (!last) return 'Noch kein Besuch im Plan';
  return `${last} · ${visits.count === 1 ? '1 Besuch' : `${visits.count} Besuche`}`;
}
