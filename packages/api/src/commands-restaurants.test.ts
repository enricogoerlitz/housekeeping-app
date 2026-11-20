import { addDays, restaurantVisits } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { setCurrentMember } from './commands-household';
import {
  createRestaurant,
  rateRestaurant,
  readMapsLink,
  resolveShortLink,
  toggleRestaurantFavorite,
  updateRestaurant,
} from './commands-restaurants';
import { ENRICO, NADJA } from './seed/demo';
import { getData } from './store';
import { TODAY, withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('restaurant commands', () => {
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

  it('AC-006: "hallo welt" is no map link', () => {
    expect(readMapsLink('hallo welt')).toEqual({ status: 'invalid' });
  });

  it('AC-005: a short link resolves to a sample place that can be saved', () => {
    const reading = readMapsLink('https://maps.app.goo.gl/AbC123');
    expect(reading).toEqual({ status: 'short', url: 'https://maps.app.goo.gl/AbC123' });
    const draft = resolveShortLink('https://maps.app.goo.gl/AbC123');
    expect(draft.name).not.toBe('');
    expect(draft.location).toBeDefined();
    expect(draft.mapsUrl).toBe('https://maps.app.goo.gl/AbC123');
    const id = createRestaurant(draft);
    expect(getData().restaurants.find((r) => r.id === id)?.location).toEqual(draft.location);
  });

  it('AC-010: rating, favourite and note; ratings and favourites are per member', () => {
    setCurrentMember(NADJA);
    rateRestaurant('rest-enzo', 2);
    toggleRestaurantFavorite('rest-enzo');
    updateRestaurant('rest-enzo', { notes: 'Trüffelpasta!' });
    setCurrentMember(ENRICO);
    rateRestaurant('rest-enzo', 7);
    const enzo = getData().restaurants.find((r) => r.id === 'rest-enzo');
    expect(enzo?.ratings).toEqual({ [ENRICO]: 5, [NADJA]: 2 });
    expect(enzo?.favoriteOf).toEqual([ENRICO]);
    expect(enzo?.notes).toBe('Trüffelpasta!');

    rateRestaurant('rest-enzo', 0);
    expect(getData().restaurants.find((r) => r.id === 'rest-enzo')?.ratings[ENRICO]).toBe(1);
  });

  it('rejects renaming a restaurant to an empty name', () => {
    expect(() => updateRestaurant('rest-enzo', { name: ' ' })).toThrow('Name fehlt');
  });
});

describe('restaurant visits in the seed', () => {
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
