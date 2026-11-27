import { describe, expect, it } from 'vitest';

import type { AgentCard } from './ai-agent';
import {
  activityDraftOfCard,
  chatMetaLine,
  decodeRecentPlaces,
  encodeRecentPlaces,
  rememberPlace,
  restaurantDraftOfCard,
  savedPlaceOf,
  tripPlaces,
} from './ai-agent-places';
import type { Activity, Restaurant, Trip } from './types';

const trip = (over: Partial<Trip>): Trip => ({
  id: 't1',
  from: '2026-12-03',
  to: '2026-12-07',
  members: [],
  ...over,
});

describe('places from trips', () => {
  it('AC-011: running and coming trips with a note, past ones and ones without a note left out', () => {
    expect(
      tripPlaces(
        [
          trip({ id: 'london', note: 'London\nHotel in Shoreditch' }),
          trip({ id: 'past', note: 'Rom', from: '2026-10-01', to: '2026-10-05' }),
          trip({ id: 'empty', note: '  ' }),
          trip({ id: 'now', note: 'Leipzig', from: '2026-11-26', to: '2026-11-28' }),
        ],
        '2026-11-27',
      ),
    ).toEqual([
      { tripId: 'now', label: 'Leipzig', dates: '26.–28. Nov.' },
      { tripId: 'london', label: 'London', dates: '3.–7. Dez.' },
    ]);
  });
  it('a trip over a month end names both months', () => {
    expect(
      tripPlaces([trip({ note: 'Wien', from: '2026-11-29', to: '2026-12-02' })], '2026-11-27'),
    ).toEqual([{ tripId: 't1', label: 'Wien', dates: '29. Nov. – 2. Dez.' }]);
  });
});

describe('recent places', () => {
  const place = (label: string) => ({ source: 'pinned' as const, label, radius: 'walk' as const });
  it('AC-013: the last five, newest first, without doubles', () => {
    let recent = [] as ReturnType<typeof rememberPlace>;
    for (const label of ['A', 'B', 'C', 'D', 'E', 'F', 'C'])
      recent = rememberPlace(recent, place(label));
    expect(recent.map((entry) => entry.label)).toEqual(['C', 'F', 'E', 'D', 'B']);
  });
  it('the device location is never remembered', () => {
    expect(
      rememberPlace([], { source: 'device', label: 'Aktueller Standort', radius: 'walk' }),
    ).toEqual([]);
  });
  it('reads back what it wrote; broken storage is empty', () => {
    const recent = rememberPlace([], { ...place('Mitte'), location: { lat: 52.52, lng: 13.4 } });
    expect(decodeRecentPlaces(encodeRecentPlaces(recent))).toEqual(recent);
    expect(decodeRecentPlaces('{')).toEqual([]);
    expect(decodeRecentPlaces(null)).toEqual([]);
    expect(decodeRecentPlaces('[{"label":""}]')).toEqual([]);
  });
});

const card = (over: Partial<AgentCard>): AgentCard => ({
  index: 0,
  kind: 'restaurant',
  name: 'Katz Orange',
  category: 'Deutsch',
  address: 'Bergstraße 22, 10115 Berlin',
  priceLevel: 3,
  why: 'Hinterhof einer alten Brauerei.',
  websiteUrl: 'https://katzorange.com',
  tags: [],
  mapsUrl: 'https://maps.google.com/?cid=77',
  location: { lat: 52.53, lng: 13.39 },
  ...over,
});

describe('saving a card', () => {
  it('AC-021: a restaurant with cuisine, price, link, address and coordinates', () => {
    expect(restaurantDraftOfCard(card({}))).toEqual({
      name: 'Katz Orange',
      address: 'Bergstraße 22, 10115 Berlin',
      location: { lat: 52.53, lng: 13.39 },
      mapsUrl: 'https://maps.google.com/?cid=77',
      cuisine: 'Deutsch',
      priceLevel: 3,
      websiteUrl: 'https://katzorange.com',
    });
  });
  it('AC-023: an activity takes "warum" as description and a kind only when the household has it', () => {
    const museum = card({ kind: 'activity', name: 'Computerspielemuseum', category: 'Museum' });
    expect(
      activityDraftOfCard(museum, [{ id: 'k1', name: 'museum', icon: 'mountain' }]),
    ).toMatchObject({
      name: 'Computerspielemuseum',
      description: 'Hinterhof einer alten Brauerei.',
      placeName: 'Computerspielemuseum',
      kindId: 'k1',
    });
    expect(activityDraftOfCard(museum, []).kindId).toBeUndefined();
  });
  it('AC-022: a place saved before (same maps link or same name) is found', () => {
    const saved = { id: 'r1', name: 'katz  orange', mapsUrl: undefined } as unknown as Restaurant;
    expect(savedPlaceOf(card({}), [saved], [])).toEqual({ kind: 'restaurant', id: 'r1' });
    const byLink = {
      id: 'r2',
      name: 'Anders',
      mapsUrl: 'https://maps.google.com/?cid=77',
    } as unknown as Restaurant;
    expect(savedPlaceOf(card({}), [byLink], [])).toEqual({ kind: 'restaurant', id: 'r2' });
    const activity = { id: 'a1', name: 'Katz Orange' } as unknown as Activity;
    expect(savedPlaceOf(card({ kind: 'activity' }), [], [activity])).toEqual({
      kind: 'activity',
      id: 'a1',
    });
    expect(savedPlaceOf(card({}), [], [activity])).toBeUndefined();
  });
});

describe('history line', () => {
  it('AC-024: place, day and who started it', () => {
    expect(
      chatMetaLine(
        { placeLabel: 'Friedrichshain', createdAt: '2026-11-23T09:00:00Z', createdBy: 'n' },
        { n: 'Nadja' },
        '2026-11-27',
      ),
    ).toBe('Friedrichshain · Mo., 23. Nov. · Nadja');
    expect(chatMetaLine({ createdAt: '2026-11-27T09:00:00Z' }, {}, '2026-11-27')).toBe('heute');
  });
});
