import { describe, expect, it } from 'vitest';

import {
  COUNTRY_CENTRE,
  distanceKm,
  hoursToday,
  isRecipePage,
  isoWeekdayIn,
  mapsLinkOfCid,
  pickPlaceHits,
  priceLevelOf,
  rankRecipeResults,
  ratingLabel,
  searchCenter,
  sourceHost,
  weekdayOf,
} from './web-results';

// Spec 0049: the pure parts of the web search, shared by the edge function (gen:edge) and the app.

describe('rankRecipeResults (REQ-002)', () => {
  const hit = (url: string, rating?: number, ratingCount?: number) => ({
    url,
    ...(rating === undefined ? {} : { rating }),
    ...(ratingCount === undefined ? {} : { ratingCount }),
  });

  it('AC-006: a well rated chefkoch.de recipe in third place comes first', () => {
    const ranked = rankRecipeResults([
      hit('https://emmikochteinfach.de/bolognese-rezept/', 5, 368),
      hit('https://www.familienkost.de/rezept_bolognese.html', 5, 58),
      hit('https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html', 4.7, 638),
    ]);
    expect(ranked.map((result) => sourceHost(result.url))).toEqual([
      'chefkoch.de',
      'emmikochteinfach.de',
      'familienkost.de',
    ]);
  });

  it('keeps a chefkoch.de recipe with few or poor ratings in the order of the provider', () => {
    const ranked = rankRecipeResults([
      hit('https://emmikochteinfach.de/a/', 5, 368),
      hit('https://www.chefkoch.de/rezepte/1/a.html', 3.2, 900),
      hit('https://www.chefkoch.de/rezepte/2/b.html', 4.8, 3),
    ]);
    expect(ranked.map((result) => result.url)).toEqual([
      'https://emmikochteinfach.de/a/',
      'https://www.chefkoch.de/rezepte/1/a.html',
      'https://www.chefkoch.de/rezepte/2/b.html',
    ]);
  });
});

describe('isRecipePage (REQ-002)', () => {
  it('AC-007: overview, magazine and search pages are no recipe cards', () => {
    expect(isRecipePage('https://www.chefkoch.de/rs/s0/bolognese/Rezepte.html')).toBe(false);
    expect(isRecipePage('https://www.chefkoch.de/magazin/artikel/161207918953319-x')).toBe(false);
    expect(isRecipePage('https://www.lecker.de/suche?q=bolognese')).toBe(false);
    expect(isRecipePage('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isRecipePage('https://de.pinterest.com/pin/123/')).toBe(false);
  });

  it('AC-007: a single recipe page is one', () => {
    expect(
      isRecipePage('https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html'),
    ).toBe(true);
    expect(isRecipePage('https://emmikochteinfach.de/bolognese-rezept/')).toBe(true);
  });

  it('refuses what is no https address', () => {
    expect(isRecipePage('http://example.de/rezept')).toBe(false);
    expect(isRecipePage('kein link')).toBe(false);
  });
});

describe('sourceHost', () => {
  it('drops "www." and lower-cases', () => {
    expect(sourceHost('https://WWW.Chefkoch.de/rezepte/1')).toBe('chefkoch.de');
    expect(sourceHost('kaputt')).toBe('');
  });
});

describe('places', () => {
  it('AC-011: German and English weekday names become ISO weekdays', () => {
    expect(weekdayOf('Montag')).toBe(1);
    expect(weekdayOf('Donnerstag')).toBe(4);
    expect(weekdayOf('sonntag')).toBe(7);
    expect(weekdayOf('Sunday')).toBe(7);
    expect(weekdayOf('Feiertag')).toBeUndefined();
  });

  it('AC-011: "Heute 11:00–23:00", closed days and unknown days', () => {
    const days = [
      { weekday: 4, hours: '11:00–23:00' },
      { weekday: 1, hours: 'Geschlossen' },
    ];
    expect(hoursToday(days, 4)).toBe('Heute 11:00–23:00');
    expect(hoursToday(days, 1)).toBe('Heute geschlossen');
    expect(hoursToday(days, 2)).toBeUndefined();
    expect(hoursToday(undefined, 2)).toBeUndefined();
  });

  it('AC-011: the ISO weekday of a moment in the household time zone', () => {
    // Thursday 26.11.2026, 23:30 UTC is already Friday in Berlin.
    expect(isoWeekdayIn(new Date('2026-11-26T12:00:00Z'), 'Europe/Berlin')).toBe(4);
    expect(isoWeekdayIn(new Date('2026-11-26T23:30:00Z'), 'Europe/Berlin')).toBe(5);
  });

  it('the price range of the provider as € … €€€€', () => {
    expect(priceLevelOf('1–10 €')).toBe(1);
    expect(priceLevelOf('10–20 €')).toBe(2);
    expect(priceLevelOf('20–30 €')).toBe(3);
    expect(priceLevelOf('50–100 €')).toBe(4);
    expect(priceLevelOf('100+ €')).toBe(4);
    expect(priceLevelOf('€€')).toBe(2);
    expect(priceLevelOf('$$$')).toBe(3);
    expect(priceLevelOf('günstig')).toBeUndefined();
    expect(priceLevelOf(undefined)).toBeUndefined();
  });

  it('the maps link of a Google place id', () => {
    expect(mapsLinkOfCid('8138665074501765423')).toBe(
      'https://maps.google.com/?cid=8138665074501765423',
    );
    expect(mapsLinkOfCid('12ab')).toBeUndefined();
  });

  it('AC-008: the search centre is the median of the household places', () => {
    expect(searchCenter([])).toBeUndefined();
    expect(
      searchCenter([
        { lat: 52.5, lng: 13.4 },
        { lat: 52.52, lng: 13.45 },
        { lat: 48.1, lng: 11.5 },
      ]),
    ).toEqual({ lat: 52.5, lng: 13.4 });
    expect(
      searchCenter([
        { lat: 52.0, lng: 13.0 },
        { lat: 53.0, lng: 14.0 },
      ]),
    ).toEqual({ lat: 52.5, lng: 13.5 });
  });

  it('AC-005: the rating as "★ 4,7 (638)"', () => {
    expect(ratingLabel(4.7, 638)).toBe('★ 4,7 (638)');
    expect(ratingLabel(5, 1234)).toBe('★ 5,0 (1.234)');
    expect(ratingLabel(4.2, undefined)).toBe('★ 4,2');
    expect(ratingLabel(undefined, 12)).toBeUndefined();
  });
});

describe('pickPlaceHits (Entscheidung 11)', () => {
  const KOELN = { lat: 50.934, lng: 6.948 };
  const BERLIN = { lat: 52.515, lng: 13.454 };
  const at = (title: string, lat: number, lng: number) => ({ title, location: { lat, lng } });
  const friedrichshain = [at('Vietland', 52.51, 13.45), at('TAT Restaurant', 52.52, 13.46)];
  const koeln = [at('My-Da Garden', 50.94, 6.94), at('Viet Village', 50.93, 6.94)];
  const usa = [
    at('Holiday Ice Rink', 34.05, -118.25),
    at('LA Kings Valley Ice Center', 34.2, -118.4),
  ];

  it('distances in km between two points', () => {
    expect(Math.round(distanceKm(BERLIN, KOELN))).toBe(481);
    expect(distanceKm(BERLIN, BERLIN)).toBe(0);
  });

  it('AC-038: a district in the text wins over the household centre (Köln → Friedrichshain)', () => {
    expect(pickPlaceHits(friedrichshain, koeln, KOELN)).toEqual(friedrichshain);
  });

  it('AC-039: a named place far from the household is found ("Mutzenbacher" from Köln)', () => {
    const mutzenbacher = [at('Mutzenbacher', 52.51, 13.45)];
    const river = [at('Mutzbach', 50.98, 7.05)];
    expect(pickPlaceHits(mutzenbacher, river, KOELN)).toEqual(mutzenbacher);
  });

  it('AC-008: a text without a place stays around the household (the free search lands in the USA)', () => {
    expect(pickPlaceHits(usa, koeln, KOELN)).toEqual(koeln);
    expect(pickPlaceHits(usa, [], KOELN)).toEqual([]);
    expect(pickPlaceHits([], koeln, KOELN)).toEqual(koeln);
  });

  it('AC-040: without places of the household the centre is Germany, never the USA', () => {
    expect(pickPlaceHits(usa, koeln, COUNTRY_CENTRE)).toEqual(koeln);
    expect(pickPlaceHits(friedrichshain, koeln, COUNTRY_CENTRE)).toEqual(friedrichshain);
  });

  it('AC-045: a name the household has nearby wins over a famous one far away ("Trattoria Da Enzo" from Köln)', () => {
    const rome = [at('Trattoria Da Enzo', 41.888, 12.474), at('Da Enzo al 29', 41.888, 12.474)];
    const nearby = [at('Trattoria Da Enzo', 50.97, 7.41), at('Ristorante Da Enzo', 50.9, 6.9)];
    expect(pickPlaceHits(rome, nearby, KOELN, 'Trattoria Da Enzo')).toEqual(nearby);
    expect(pickPlaceHits(rome, nearby, KOELN, 'trattoria  da énzo')).toEqual(nearby);
    // Only a name hit counts: the river "Mutzbach" is no "Mutzenbacher".
    const mutzenbacher = [at('Mutzenbacher', 52.51, 13.45)];
    expect(
      pickPlaceHits(mutzenbacher, [at('Mutzbach', 50.98, 7.05)], KOELN, 'mutzenbacher'),
    ).toEqual(mutzenbacher);
    // A name hit farther than the city region does not count.
    const hamburg = [at('Trattoria Da Enzo', 53.55, 9.99)];
    expect(pickPlaceHits(rome, hamburg, KOELN, 'Trattoria Da Enzo')).toEqual(rome);
  });

  it('free hits without coordinates count as not found nearby', () => {
    const unplaced: { title: string; location?: { lat: number; lng: number } }[] = [
      { title: 'Irgendwo' },
    ];
    expect(pickPlaceHits(unplaced, koeln, KOELN)).toEqual(koeln);
  });
});
