import { describe, expect, it } from 'vitest';

import {
  findDuplicateRestaurant,
  isInstalledIosApp,
  priceLabel,
  restaurantVisits,
  routeLinks,
  routeOpening,
} from './restaurants';
import type { Activity, MealPlanEntry, Restaurant } from './types';

function restaurant(partial: Partial<Restaurant> & Pick<Restaurant, 'id' | 'name'>): Restaurant {
  return {
    tags: [],
    favoriteOf: [],
    ratings: {},
    createdAt: '2026-10-01T12:00:00.000Z',
    ...partial,
  };
}

describe('routeOpening (spec 0029, REQ-004)', () => {
  const enzo = {
    name: 'Trattoria Da Enzo',
    address: 'Severinstraße 12, Köln',
    location: { lat: 50.9271, lng: 6.958 },
  };
  const installed = { installedIosApp: true };
  const browser = { installedIosApp: false };

  it('AC-015: the installed iPhone app opens Apple Maps by its scheme in the same window', () => {
    expect(routeOpening('apple', enzo, installed)).toEqual({
      kind: 'app-scheme',
      url: 'maps://?daddr=50.9271,6.958&q=Trattoria%20Da%20Enzo',
    });
  });

  it('AC-016: Google Maps by its scheme, with the website as fallback (AC-017)', () => {
    const eisstadion = { name: 'Eislaufen', placeName: 'Eisstadion Hohenschönhausen' };
    const encoded = 'Eisstadion%20Hohensch%C3%B6nhausen';
    expect(routeOpening('google', eisstadion, installed)).toEqual({
      kind: 'app-scheme',
      url: `comgooglemaps://?daddr=${encoded}`,
      fallback: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    });
  });

  it('AC-018: in a browser tab, on Android and on the desktop a new tab as before', () => {
    expect(routeOpening('apple', enzo, browser)).toEqual({
      kind: 'new-tab',
      url: 'https://maps.apple.com/?daddr=50.9271,6.958&q=Trattoria%20Da%20Enzo',
    });
    expect(routeOpening('google', enzo, browser)).toEqual({
      kind: 'new-tab',
      url: 'https://www.google.com/maps/dir/?api=1&destination=50.9271,6.958',
    });
  });

  it('AC-015: recognises the installed web app on iPhone and iPad only', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15';
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0';
    expect(isInstalledIosApp({ userAgent: iphone, maxTouchPoints: 5, standalone: true })).toBe(
      true,
    );
    expect(isInstalledIosApp({ userAgent: ipad, maxTouchPoints: 5, standalone: true })).toBe(true);
    expect(isInstalledIosApp({ userAgent: iphone, maxTouchPoints: 5, standalone: false })).toBe(
      false,
    );
    expect(isInstalledIosApp({ userAgent: android, maxTouchPoints: 5, standalone: true })).toBe(
      false,
    );
    // A Mac with a mouse looks like an iPad without touch points.
    expect(isInstalledIosApp({ userAgent: ipad, maxTouchPoints: 0, standalone: true })).toBe(false);
  });
});

describe('routeLinks', () => {
  it('AC-012: routes to the coordinates when they are known', () => {
    const enzo = restaurant({
      id: 'r',
      name: 'Trattoria Da Enzo',
      address: 'Severinstraße 12, Köln',
      location: { lat: 50.9271, lng: 6.958 },
    });
    expect(routeLinks(enzo)).toEqual({
      apple: 'https://maps.apple.com/?daddr=50.9271,6.958&q=Trattoria%20Da%20Enzo',
      google: 'https://www.google.com/maps/dir/?api=1&destination=50.9271,6.958',
    });
  });

  it('routes to the encoded name and address without coordinates', () => {
    const links = routeLinks({ name: 'Bar & Grill #1', address: 'Ring 1, Köln' });
    const encoded = 'Bar%20%26%20Grill%20%231%2C%20Ring%201%2C%20K%C3%B6ln';
    expect(links).toEqual({
      apple: `https://maps.apple.com/?daddr=${encoded}`,
      google: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    });
  });

  it('URL-encodes the name next to coordinates', () => {
    const links = routeLinks({ name: 'A&B?x=1', location: { lat: 1, lng: 2 } });
    expect(links.apple).toBe('https://maps.apple.com/?daddr=1,2&q=A%26B%3Fx%3D1');
  });

  it('AC-014 (0004): routes an activity to its place, labelled with the place name', () => {
    const eislaufen: Activity = {
      id: 'act-eislaufen',
      name: 'Eislaufen',
      placeName: 'Eisstadion Hohenschönhausen',
      location: { lat: 52.55, lng: 13.5 },
      tags: [],
      favoriteOf: [],
      ratings: {},
      createdAt: '2026-11-01T12:00:00.000Z',
    };
    expect(routeLinks(eislaufen)).toEqual({
      apple: 'https://maps.apple.com/?daddr=52.55,13.5&q=Eisstadion%20Hohensch%C3%B6nhausen',
      google: 'https://www.google.com/maps/dir/?api=1&destination=52.55,13.5',
    });
  });

  it('AC-014 (0004): without coordinates an activity routes to place name and address', () => {
    const links = routeLinks({
      name: 'Eislaufen',
      placeName: 'Eisstadion',
      address: 'Konrad-Wolf-Straße 2, Berlin',
    });
    const encoded = 'Eisstadion%2C%20Konrad-Wolf-Stra%C3%9Fe%202%2C%20Berlin';
    expect(links).toEqual({
      apple: `https://maps.apple.com/?daddr=${encoded}`,
      google: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    });
  });

  it('falls back to the name when an activity has no place name', () => {
    expect(routeLinks({ name: 'Wandern', address: 'Teufelsberg, Berlin' }).google).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Wandern%2C%20Teufelsberg%2C%20Berlin',
    );
  });

  it('never uses the stored maps link, so a hostile link cannot become the route', () => {
    const hostile = restaurant({ id: 'r', name: 'Enzo', mapsUrl: 'javascript:alert(1)' });
    const links = routeLinks(hostile);
    expect(links.apple.startsWith('https://maps.apple.com/?')).toBe(true);
    expect(links.google.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
    expect(JSON.stringify(links)).not.toContain('javascript');
  });
});

describe('findDuplicateRestaurant', () => {
  const enzo = restaurant({
    id: 'rest-enzo',
    name: 'Trattoria Da Enzo',
    location: { lat: 50.9271, lng: 6.958 },
  });
  const sushi = restaurant({ id: 'rest-sushi', name: 'Sushi Kyoto' });

  it('AC-009: finds an existing restaurant with the same name', () => {
    expect(findDuplicateRestaurant({ name: '  trattoria da  ENZO ' }, [sushi, enzo])).toBe(enzo);
  });

  it('AC-009: finds an existing restaurant within about 40 m', () => {
    const nearby = { name: 'Da Enzo', location: { lat: 50.9273, lng: 6.9584 } };
    expect(findDuplicateRestaurant(nearby, [sushi, enzo])).toBe(enzo);
  });

  it('returns undefined for another name farther away or without anything to compare', () => {
    const farther = { name: 'Da Enzo', location: { lat: 50.928, lng: 6.958 } };
    expect(findDuplicateRestaurant(farther, [sushi, enzo])).toBeUndefined();
    expect(findDuplicateRestaurant({}, [sushi, enzo])).toBeUndefined();
    expect(findDuplicateRestaurant({ name: 'Neu' }, [])).toBeUndefined();
  });
});

describe('restaurantVisits', () => {
  const today = '2026-11-20';
  const visit = (id: string, date: string | null, extra: Partial<MealPlanEntry> = {}) => ({
    id,
    date,
    slotId: 'slot-abend',
    kind: 'restaurant' as const,
    restaurantId: 'rest-pho',
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...extra,
  });

  it('AC-013: three past visits, the last one 12 days ago; future entries do not count', () => {
    const entries: MealPlanEntry[] = [
      visit('a', '2026-10-18'),
      visit('b', '2026-11-08'),
      visit('c', '2026-09-20'),
      visit('future', '2026-11-25'),
      visit('unplanned', null),
      visit('skipped', '2026-11-15', { notDone: true }),
      visit('other', '2026-11-19', { restaurantId: 'rest-enzo' }),
      visit('recipe', '2026-11-19', { kind: 'recipe', restaurantId: undefined }),
    ];
    expect(restaurantVisits('rest-pho', entries, today)).toEqual({
      count: 3,
      lastOn: '2026-11-08',
      daysSince: 12,
    });
  });

  it('counts a visit planned for today', () => {
    expect(restaurantVisits('rest-pho', [visit('t', today)], today)).toEqual({
      count: 1,
      lastOn: today,
      daysSince: 0,
    });
  });

  it('reports no visits without plan entries', () => {
    expect(restaurantVisits('rest-pho', [], today)).toEqual({
      count: 0,
      lastOn: undefined,
      daysSince: undefined,
    });
  });
});

describe('priceLabel', () => {
  it('repeats the euro sign per level; "" without level', () => {
    expect(priceLabel(2)).toBe('€€');
    expect(priceLabel(4)).toBe('€€€€');
    expect(priceLabel(undefined)).toBe('');
  });
});
