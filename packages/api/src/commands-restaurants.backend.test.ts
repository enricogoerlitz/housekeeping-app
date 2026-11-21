// Restaurant commands (spec 0003): create and edit on the diff path, favourites
// and ratings per member over their RPCs, short links resolved by the edge function.
import { addDays, restaurantVisits } from '@housekeeping/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import {
  createRestaurant,
  rateRestaurant,
  readMapsLink,
  resolveMapsShortLink,
  toggleRestaurantFavorite,
  updateRestaurant,
} from './commands-restaurants';
import { ENRICO, NADJA } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';

const fx = withBackend();

const restaurantById = (id: string) => getData().restaurants.find((r) => r.id === id);

describe('restaurants', () => {
  it('AC-013: created here, renamed, shown on the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createRestaurant({
      name: 'Café Fleur',
      mapsUrl: 'https://maps.app.goo.gl/abc',
      location: { lat: 50.9, lng: 6.9 },
    });
    updateRestaurant(id, { cuisine: 'Café' });
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    expect(fx.server.row(H, 'restaurants', id)).toMatchObject({
      name: 'Café Fleur',
      lat: 50.9,
      lng: 6.9,
      cuisine: 'Café',
    });
    expect(fx.nadjaData(nadja).restaurants.find((r) => r.id === id)?.cuisine).toBe('Café');
  });

  it('favourite and rating use their RPCs; undo sends the opposite / previous value', async () => {
    await fx.startEnrico();
    const restaurant = getData().restaurants.find(
      (candidate) =>
        !candidate.favoriteOf.includes(ENRICO) && candidate.ratings[ENRICO] !== undefined,
    );
    if (!restaurant) throw new Error('fixture');
    const previous = restaurant.ratings[ENRICO];
    const restore = snapshot();
    toggleRestaurantFavorite(restaurant.id);
    rateRestaurant(restaurant.id, 1);
    expect(restaurantById(restaurant.id)).toMatchObject({
      favoriteOf: expect.arrayContaining([ENRICO]),
      ratings: expect.objectContaining({ [ENRICO]: 1 }),
    });
    await fx.settle();
    expect(fx.calls).toEqual([
      { fn: 'setRestaurantFavorite', args: [restaurant.id, true] },
      { fn: 'setRestaurantRating', args: [restaurant.id, 1] },
    ]);
    restore();
    await fx.settle();
    expect(fx.calls.slice(2)).toEqual([
      { fn: 'setRestaurantRating', args: [restaurant.id, previous] },
      { fn: 'setRestaurantFavorite', args: [restaurant.id, false] },
    ]);
    expect(restaurantById(restaurant.id)?.ratings[ENRICO]).toBe(previous);
  });
});

describe('short links (edge function resolve-maps-link)', () => {
  it('AC-031: resolves through the server into a draft', async () => {
    await fx.startEnrico();
    fx.server.setMapsLink('https://maps.app.goo.gl/xyz', {
      name: 'Trattoria Nuova',
      address: 'Ehrenstraße 1, Köln',
      location: { lat: 50.94, lng: 6.94 },
      mapsUrl: 'https://www.google.com/maps/place/Trattoria+Nuova/@50.94,6.94,17z',
    });
    await expect(resolveMapsShortLink('https://maps.app.goo.gl/xyz')).resolves.toEqual({
      name: 'Trattoria Nuova',
      address: 'Ehrenstraße 1, Köln',
      location: { lat: 50.94, lng: 6.94 },
      mapsUrl: 'https://www.google.com/maps/place/Trattoria+Nuova/@50.94,6.94,17z',
    });
    expect(fx.calls).toEqual([{ fn: 'resolveMapsLink', args: ['https://maps.app.goo.gl/xyz'] }]);
  });

  it('a link that leads to no place says so in German; offline it is not tried', async () => {
    const engine = await fx.startEnrico();
    await expect(resolveMapsShortLink('https://maps.app.goo.gl/nothing')).rejects.toThrow(
      'Das ist kein Karten-Link',
    );
    engine.setSimulatedOffline(true);
    await expect(resolveMapsShortLink('https://maps.app.goo.gl/xyz')).rejects.toBeInstanceOf(
      OfflineError,
    );
  });
});

describe('restaurant commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-007: a restaurant without name is not created', () => {
    const before = getData().restaurants;
    expect(() => createRestaurant({ name: '   ' })).toThrow('Name fehlt');
    expect(getData().restaurants).toBe(before);
  });

  it('creates a restaurant with trimmed fields at the top of the list', () => {
    const id = createRestaurant({ name: ' Café Fleur ', cuisine: ' ', notes: ' Kuchen ' });
    expect(getData().restaurants[0]).toMatchObject({
      id,
      name: 'Café Fleur',
      cuisine: undefined,
      notes: 'Kuchen',
      ratings: {},
      favoriteOf: [],
    });
  });

  it('AC-003 / AC-009: a pasted link of an existing restaurant is reported as duplicate', () => {
    const reading = readMapsLink(
      'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z',
    );
    expect(reading).toMatchObject({
      status: 'place',
      draft: { name: 'Trattoria Da Enzo', location: { lat: 50.9271, lng: 6.958 } },
      duplicate: { id: 'rest-enzo' },
    });
  });

  it('AC-004: a new Apple link fills the draft without duplicate', () => {
    const reading = readMapsLink('https://maps.apple.com/?q=Neues+Lokal&ll=48.1,11.5');
    expect(reading).toEqual({
      status: 'place',
      draft: {
        name: 'Neues Lokal',
        location: { lat: 48.1, lng: 11.5 },
        mapsUrl: 'https://maps.apple.com/?q=Neues+Lokal&ll=48.1,11.5',
      },
      duplicate: undefined,
    });
  });

  it('AC-005 / AC-006: a short link needs the server; "hallo welt" is no map link', () => {
    expect(readMapsLink('https://maps.app.goo.gl/AbC123')).toEqual({
      status: 'short',
      url: 'https://maps.app.goo.gl/AbC123',
    });
    expect(readMapsLink('hallo welt')).toEqual({ status: 'invalid' });
  });

  it('AC-010: rating, favourite and note; ratings and favourites are per member', async () => {
    const nadja = await fx.startAs(NADJA);
    rateRestaurant('rest-enzo', 2);
    toggleRestaurantFavorite('rest-enzo');
    updateRestaurant('rest-enzo', { notes: 'Trüffelpasta!' });
    await fx.settle(nadja);
    await fx.startEnrico();
    rateRestaurant('rest-enzo', 7);
    const enzo = restaurantById('rest-enzo');
    expect(enzo?.ratings).toEqual({ [ENRICO]: 5, [NADJA]: 2 });
    expect(enzo?.favoriteOf).toEqual([ENRICO]);
    expect(enzo?.notes).toBe('Trüffelpasta!');

    rateRestaurant('rest-enzo', 0);
    expect(restaurantById('rest-enzo')?.ratings[ENRICO]).toBe(1);
  });

  it('rejects renaming a restaurant to an empty name', () => {
    expect(() => updateRestaurant('rest-enzo', { name: ' ' })).toThrow('Name fehlt');
  });

  it('AC-013: Pho Saigon was last visited 12 days ago, 3 visits in total', () => {
    expect(restaurantVisits('rest-pho', getData().planEntries, TODAY)).toEqual({
      count: 3,
      lastOn: addDays(TODAY, -12),
      daysSince: 12,
    });
    // The visit to Trattoria Da Enzo planned in five days does not count yet.
    expect(restaurantVisits('rest-enzo', getData().planEntries, TODAY).count).toBe(1);
  });
});
