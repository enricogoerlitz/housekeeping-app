// Restaurant commands in backend mode (spec 0003): create and edit on the diff path, favourites
// and ratings per member over their RPCs, short links resolved by the edge function.
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import {
  createRestaurant,
  rateRestaurant,
  resolveMapsShortLink,
  toggleRestaurantFavorite,
  updateRestaurant,
} from './commands-restaurants';
import { ENRICO } from './seed/demo';
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
