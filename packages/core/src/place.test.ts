import { describe, expect, it } from 'vitest';

import {
  EMPTY_PLACE,
  isOwnWindowOnTop,
  openerOf,
  originBackPlan,
  originFor,
  placeAfter,
  placeQuery,
  sectionHref,
  windowClosedByBack,
  type WindowEntry,
} from './place';

const LASAGNE = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

describe('placeQuery', () => {
  it('writes every parameter but the route id, repeated ones as often as given', () => {
    expect(
      placeQuery({ id: LASAGNE, suche: 'curry & reis', ernaehrung: ['vegan', 'vegetarisch'] }),
    ).toBe('?suche=curry%20%26%20reis&ernaehrung=vegan&ernaehrung=vegetarisch');
  });

  it('is empty without parameters', () => {
    expect(placeQuery({ id: LASAGNE, suche: undefined })).toBe('');
  });
});

describe('placeAfter', () => {
  it('remembers the address and its section, and the start page as last left (REQ-005)', () => {
    const place = placeAfter(EMPTY_PLACE, '/rezepte', { suche: 'curry', fenster: 'neu' });
    expect(place.current).toEqual({ href: '/rezepte?suche=curry&fenster=neu', section: 'essen' });
    expect(place.startPages).toEqual({ essen: '/rezepte?suche=curry' });
  });

  it('keeps the start pages of the other sections and leaves them on a detail page', () => {
    const list = placeAfter(EMPTY_PLACE, '/rezepte', { suche: 'curry' });
    const detail = placeAfter(list, `/rezept/${LASAGNE}`, { id: LASAGNE, von: 'uebersicht' });
    expect(detail.current).toEqual({
      href: `/rezept/${LASAGNE}?von=uebersicht`,
      section: 'uebersicht',
    });
    expect(detail.startPages).toEqual({ essen: '/rezepte?suche=curry' });
  });

  it('does not change the state it was given', () => {
    placeAfter(EMPTY_PLACE, '/rezepte', {});
    expect(EMPTY_PLACE).toEqual({ startPages: {} });
  });
});

describe('sectionHref', () => {
  it('opens a section at its start page as last left (REQ-005)', () => {
    const place = placeAfter(EMPTY_PLACE, '/kalender', { ansicht: 'monat' });
    expect(sectionHref(place, 'kalender')).toBe('/kalender?ansicht=monat');
  });

  it('opens a section never visited at its start', () => {
    expect(sectionHref(EMPTY_PLACE, 'haushalt')).toBe('/haushalt');
    expect(sectionHref(EMPTY_PLACE, 'uebersicht')).toBe('/');
  });
});

describe('originFor', () => {
  it('names the current section when it is another one (REQ-006)', () => {
    const place = placeAfter(EMPTY_PLACE, '/', {});
    expect(originFor(place, 'essen')).toBe('uebersicht');
  });

  it('names nothing inside the own section or before the first address', () => {
    const place = placeAfter(EMPTY_PLACE, '/rezepte', {});
    expect(originFor(place, 'essen')).toBeUndefined();
    expect(originFor(EMPTY_PLACE, 'essen')).toBeUndefined();
  });
});

describe('openerOf', () => {
  it('is the address the page was opened from', () => {
    const place = placeAfter(EMPTY_PLACE, '/', {});
    expect(openerOf(place, `/rezept/${LASAGNE}`)).toEqual({ href: '/', section: 'uebersicht' });
  });

  it('is the address before when the page mounts only after the router showed it (a lazy tab)', () => {
    const shopping = placeAfter(EMPTY_PLACE, '/einkaufen', {});
    const stores = placeAfter(shopping, '/maerkte', { von: 'liste' });
    expect(openerOf(stores, '/maerkte')).toEqual({ href: '/einkaufen', section: 'liste' });
  });

  it('is nothing when the current address is the page itself (deep link mounted again)', () => {
    const place = placeAfter(EMPTY_PLACE, `/rezept/${LASAGNE}`, { id: LASAGNE, schritt: '2' });
    expect(openerOf(place, `/rezept/${LASAGNE}`)).toBeUndefined();
    expect(openerOf(EMPTY_PLACE, `/rezept/${LASAGNE}`)).toBeUndefined();
  });
});

describe('originBackPlan', () => {
  const overview = placeAfter(EMPTY_PLACE, '/', {});

  it('AC-018: goes back one entry when that is the origin', () => {
    const plan = originBackPlan({
      von: 'uebersicht',
      own: 'essen',
      opener: overview.current,
      place: overview,
    });
    expect(plan).toEqual({
      section: 'uebersicht',
      label: 'Übersicht',
      historyBack: true,
      href: '/',
    });
  });

  it('AC-018: opens the origin start page after a deep link, never leaves the app', () => {
    const plan = originBackPlan({
      von: 'kalender',
      own: 'essen',
      opener: undefined,
      place: EMPTY_PLACE,
    });
    expect(plan).toEqual({
      section: 'kalender',
      label: 'Kalender',
      historyBack: false,
      href: '/kalender',
    });
  });

  it('uses the page own list without `von`, e.g. "Märkte"', () => {
    const plan = originBackPlan({
      von: undefined,
      own: 'verwalten',
      opener: overview.current,
      place: overview,
      home: { label: 'Märkte', href: '/maerkte' },
    });
    expect(plan).toEqual({
      section: 'verwalten',
      label: 'Märkte',
      historyBack: false,
      href: '/maerkte',
    });
  });

  it('goes back one entry to its own list, whatever section the list itself names', () => {
    // "Märkte" opened from the list (von=liste), then "Rewe Südstadt" from "Märkte".
    const stores = placeAfter(EMPTY_PLACE, '/maerkte', { von: 'liste' });
    const plan = originBackPlan({
      von: undefined,
      own: 'verwalten',
      opener: stores.current,
      place: stores,
      home: { label: 'Märkte', href: '/maerkte' },
    });
    expect(plan).toEqual({
      section: 'verwalten',
      label: 'Märkte',
      historyBack: true,
      href: '/maerkte',
    });
  });

  it('opens the own section start page when the opener is another section and no `von` came', () => {
    const plan = originBackPlan({
      von: undefined,
      own: 'essen',
      opener: overview.current,
      place: overview,
    });
    expect(plan).toEqual({
      section: 'essen',
      label: 'Essen',
      historyBack: false,
      href: '/rezepte',
    });
  });
});

describe('windows in the browser history', () => {
  const close = () => undefined;
  const stack: WindowEntry[] = [{ entryId: 7, base: '/kalender?ansicht=monat', close }];

  it('a back to the copy below the window only closes the window', () => {
    expect(windowClosedByBack(stack, 7, '/kalender?ansicht=monat')).toBe(stack[0]);
  });

  it('any other back is the router’s', () => {
    expect(windowClosedByBack(stack, 8, '/kalender?ansicht=monat')).toBeUndefined();
    expect(windowClosedByBack(stack, 7, '/rezepte')).toBeUndefined();
    expect(windowClosedByBack([], 7, '/kalender')).toBeUndefined();
  });

  it('AC-042: ✕ goes back only for a window opened in this session', () => {
    expect(isOwnWindowOnTop(stack, 7, '/kalender?ansicht=monat&fenster=tag')).toBe(true);
    expect(isOwnWindowOnTop(stack, 7, '/kalender?ansicht=monat')).toBe(false);
    expect(isOwnWindowOnTop(stack, 9, '/kalender?ansicht=monat&fenster=tag')).toBe(false);
    expect(isOwnWindowOnTop([], 7, '/kalender?fenster=tag')).toBe(false);
  });
});
