import { describe, expect, it } from 'vitest';

import {
  findDuplicateRestaurant,
  parseMapsLink,
  priceLabel,
  restaurantVisits,
  routeLinks,
} from './restaurants';
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

describe('parseMapsLink', () => {
  it('AC-003: reads name and coordinates from a Google /maps/place/…/@lat,lng link', () => {
    const url = 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z';
    expect(parseMapsLink(url)).toEqual({
      kind: 'place',
      provider: 'google',
      name: 'Trattoria Da Enzo',
      location: { lat: 50.9271, lng: 6.958 },
      url,
    });
  });

  it('AC-003: prefers the place pin (!3d…!4d…) over the map centre (@…) in Google links', () => {
    const url =
      'https://www.google.com/maps/place/Copenhagen+Coffee+Lab/@43.626,6.648,10z/data=!4m6!3m5!1s0x0:0x1!8m2!3d43.6992!4d7.2774!16s%2Fg%2F1';
    expect(parseMapsLink(url)).toMatchObject({
      kind: 'place',
      name: 'Copenhagen Coffee Lab',
      location: { lat: 43.6992, lng: 7.2774 },
    });
  });

  it('AC-004: reads name and coordinates from an Apple Karten link with q and ll', () => {
    const url = 'https://maps.apple.com/?q=Pho+Saigon&ll=50.94,6.95';
    expect(parseMapsLink(url)).toEqual({
      kind: 'place',
      provider: 'apple',
      name: 'Pho Saigon',
      location: { lat: 50.94, lng: 6.95 },
      url,
    });
  });

  it('prefers the Apple "name" parameter and also reads "coordinate"', () => {
    const link = parseMapsLink(
      'https://maps.apple.com/place?name=Caf%C3%A9%20Fleur&coordinate=50.93,6.94&address=K%C3%B6ln',
    );
    expect(link).toMatchObject({ name: 'Café Fleur', location: { lat: 50.93, lng: 6.94 } });
  });

  it('reads the name from Google ?q= and ?query= links', () => {
    expect(parseMapsLink('https://maps.google.com/?q=Pho+Saigon')).toMatchObject({
      provider: 'google',
      name: 'Pho Saigon',
      location: undefined,
    });
    expect(
      parseMapsLink('https://www.google.com/maps/search/?api=1&query=Sushi%20Kyoto'),
    ).toMatchObject({ name: 'Sushi Kyoto' });
  });

  it('decodes encoded names and keeps a malformed escape as written', () => {
    expect(
      parseMapsLink('https://www.google.de/maps/place/Caf%C3%A9+M%C3%BCller/@50.1,6.2,17z'),
    ).toMatchObject({ name: 'Café Müller', location: { lat: 50.1, lng: 6.2 } });
    expect(parseMapsLink('https://www.google.com/maps/place/100%+Pasta/@50.1,6.2')).toMatchObject({
      name: '100% Pasta',
    });
  });

  it('reads negative coordinates and drops impossible ones', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/Ort/@-33.86,-151.2,12z')).toMatchObject(
      { location: { lat: -33.86, lng: -151.2 } },
    );
    expect(parseMapsLink('https://www.google.com/maps/place/Ort/@95.1,6.9,12z')).toMatchObject({
      name: 'Ort',
      location: undefined,
    });
    expect(parseMapsLink('https://maps.apple.com/?q=Ort&ll=abc,def')).toMatchObject({
      location: undefined,
    });
  });

  it('AC-005: recognises a maps.app.goo.gl short link', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/AbC123')).toEqual({
      kind: 'short',
      provider: 'google',
      url: 'https://maps.app.goo.gl/AbC123',
    });
  });

  it('recognises goo.gl/maps short links but no other goo.gl links', () => {
    expect(parseMapsLink('https://goo.gl/maps/xyz')).toMatchObject({ kind: 'short' });
    expect(parseMapsLink('https://goo.gl/abc')).toBeNull();
  });

  it('AC-006: "hallo welt" and an empty string are no map links', () => {
    expect(parseMapsLink('hallo welt')).toBeNull();
    expect(parseMapsLink('')).toBeNull();
  });

  it('accepts Google country domains', () => {
    expect(parseMapsLink('https://www.google.co.uk/maps/place/Dishoom/@51.5,-0.1')).toMatchObject({
      provider: 'google',
      name: 'Dishoom',
    });
    expect(parseMapsLink('https://www.google.com.au/maps/place/Ort/@-33.8,151.2')).toMatchObject({
      name: 'Ort',
    });
    expect(parseMapsLink('https://maps.google.de/?q=Enzo')).toMatchObject({ name: 'Enzo' });
  });

  it('rejects links of other sites, also ones that only look like Google', () => {
    expect(parseMapsLink('https://example.com/maps/place/Enzo/@50.1,6.2')).toBeNull();
    expect(parseMapsLink('https://www.google.com/search?q=Enzo')).toBeNull();
    expect(parseMapsLink('https://maps.google.com.evil.example/maps/place/Enzo')).toBeNull();
    expect(parseMapsLink('https://google.evil.com/maps/place/Enzo')).toBeNull();
    expect(parseMapsLink('https://www.google.com@evil.example/maps/place/Enzo')).toBeNull();
  });

  it('rejects a javascript: link and only ever returns http(s) URLs', () => {
    expect(parseMapsLink('javascript:alert(1)')).toBeNull();
    expect(parseMapsLink('javascript:alert(1)//maps.google.com/?q=x')).toBeNull();
    const embedded = parseMapsLink(
      'javascript:alert(1)//https://www.google.com/maps/place/Enzo/@50.1,6.2',
    );
    expect(embedded?.url.startsWith('https://www.google.com/')).toBe(true);
  });

  it('uses the first URL of a longer shared text', () => {
    const shared =
      'Trattoria Da Enzo\nhttps://maps.apple.com/?q=Trattoria+Da+Enzo&ll=50.9271,6.958 lecker!';
    expect(parseMapsLink(shared)).toMatchObject({
      provider: 'apple',
      name: 'Trattoria Da Enzo',
      url: 'https://maps.apple.com/?q=Trattoria+Da+Enzo&ll=50.9271,6.958',
    });
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
      visit('skipped', '2026-11-15', { notCooked: true }),
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
