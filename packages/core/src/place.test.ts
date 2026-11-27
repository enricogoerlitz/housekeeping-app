import { describe, expect, it } from 'vitest';

import {
  EMPTY_PLACE,
  forgetPlace,
  isOwnWindowOnTop,
  openerOf,
  originBackPlan,
  originFor,
  placeAfter,
  placeQuery,
  quickViewOrigin,
  sectionHref,
  tabPressAction,
  windowClosedByBack,
  type WindowEntry,
} from './place';

const LASAGNE = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const CURRY = '7a2e3d4c-5b6f-4a71-9b8c-0d1e2f3a4b5c';

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

  it('spec 0057 AC-014: keeps the start pages; a recipe opened from the overview highlights "Übersicht"', () => {
    const list = placeAfter(EMPTY_PLACE, '/rezepte', { suche: 'curry' });
    const detail = placeAfter(list, `/rezept/${LASAGNE}`, { id: LASAGNE, von: 'uebersicht' });
    expect(detail.current).toEqual({
      href: `/rezept/${LASAGNE}?von=uebersicht`,
      section: 'uebersicht',
    });
    expect(detail.startPages).toEqual({ essen: '/rezepte?suche=curry' });
  });

  it('spec 0057 AC-017: an activity opened from the calendar highlights "Kalender"', () => {
    const calendar = placeAfter(EMPTY_PLACE, '/kalender', { ansicht: 'woche' });
    const activity = placeAfter(calendar, `/aktivitaet/${LASAGNE}`, {
      id: LASAGNE,
      von: 'kalender',
    });
    expect(activity.current?.section).toBe('kalender');
    // "Zurück" still names the calendar and goes back to it (spec 0019, AC-016).
    const opener = openerOf(activity, `/aktivitaet/${LASAGNE}`);
    expect(
      originBackPlan({ von: 'kalender', own: 'verwalten', opener, place: activity }),
    ).toMatchObject({ section: 'kalender', label: 'Kalender', historyBack: true });
  });

  it('spec 0057 AC-015: cooking opened from a recipe of the overview keeps "Übersicht"', () => {
    const cooking = placeAfter(EMPTY_PLACE, `/rezept/${LASAGNE}/kochen`, {
      id: LASAGNE,
      von: 'uebersicht',
    });
    expect(cooking.current?.section).toBe('uebersicht');
  });

  it('spec 0057 AC-018, AC-019: without `von`, or with an unknown one, the page highlights its own section', () => {
    expect(
      placeAfter(EMPTY_PLACE, `/aktivitaet/${LASAGNE}`, { id: LASAGNE }).current?.section,
    ).toBe('verwalten');
    expect(placeAfter(EMPTY_PLACE, `/rezept/${LASAGNE}`, { id: LASAGNE }).current?.section).toBe(
      'essen',
    );
    expect(
      placeAfter(EMPTY_PLACE, `/rezept/${LASAGNE}`, { id: LASAGNE, von: 'quatsch' }).current
        ?.section,
    ).toBe('essen');
  });

  it('spec 0057 REQ-003: a tab start page always highlights itself, also with `von`', () => {
    expect(placeAfter(EMPTY_PLACE, '/rezepte', { von: 'kalender' }).current?.section).toBe('essen');
    // "Reisen" is no tab: opened from the calendar it keeps "Kalender".
    expect(placeAfter(EMPTY_PLACE, '/reisen', { von: 'kalender' }).current?.section).toBe(
      'kalender',
    );
  });

  it('spec 0057 AC-016: a page opened from a page with `von` inherits its section', () => {
    const overview = placeAfter(EMPTY_PLACE, '/', {});
    const first = placeAfter(overview, `/rezept/${LASAGNE}`, { id: LASAGNE, von: 'uebersicht' });
    const von = originFor(first, 'essen');
    expect(von).toBe('uebersicht');
    const second = placeAfter(first, `/rezept/${CURRY}`, { id: CURRY, von });
    expect(second.current?.section).toBe('uebersicht');
    // "Zurück" goes one step, to the first recipe.
    const opener = openerOf(second, `/rezept/${CURRY}`);
    expect(originBackPlan({ von, own: 'essen', opener, place: second })).toMatchObject({
      label: 'Übersicht',
      historyBack: true,
    });
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

  it('review 0031: after the address was replaced (back after sign-in) nothing below is the opener', () => {
    const home = placeAfter(EMPTY_PLACE, '/', {});
    const forgotten = forgetPlace(home);
    expect(openerOf(forgotten, `/rezept/${LASAGNE}`)).toBeUndefined();
    const articles = placeAfter(forgotten, '/artikel', { von: 'uebersicht' });
    expect(openerOf(articles, '/artikel')).toBeUndefined();
    expect(forgotten.startPages).toEqual(home.startPages);
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

describe('quickViewOrigin', () => {
  it('AC-006: a restaurant opened from the calendar beside the Essen list leads back there', () => {
    expect(quickViewOrigin('kalender', 'essen')).toBe('kalender');
  });

  it('AC-006: without `von` or from its own section ✕ only closes the quick view', () => {
    expect(quickViewOrigin(undefined, 'essen')).toBeUndefined();
    expect(quickViewOrigin('essen', 'essen')).toBeUndefined();
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

describe('tabPressAction (spec 0057, REQ-002)', () => {
  it('AC-009, AC-010: on the section start page as last left it scrolls to the top', () => {
    const list = placeAfter(EMPTY_PLACE, '/rezepte', { suche: 'curry' });
    expect(tabPressAction(list, 'essen')).toEqual({ kind: 'top' });
    expect(tabPressAction(placeAfter(EMPTY_PLACE, '/', {}), 'uebersicht')).toEqual({
      kind: 'top',
    });
  });

  it('AC-011: on a detail page of the section it opens the start page as last left', () => {
    const list = placeAfter(EMPTY_PLACE, '/rezepte', { suche: 'curry' });
    const detail = placeAfter(list, `/rezept/${LASAGNE}`, { id: LASAGNE });
    expect(tabPressAction(detail, 'essen')).toEqual({ kind: 'open', href: '/rezepte?suche=curry' });
  });

  it('AC-012: a window on the start page closes, the rest of the address stays', () => {
    const list = placeAfter(EMPTY_PLACE, '/liste', { posten: LASAGNE });
    expect(tabPressAction(list, 'liste')).toEqual({ kind: 'open', href: '/liste' });
  });

  it('AC-020: another section opens its start page', () => {
    const overview = placeAfter(EMPTY_PLACE, '/', {});
    const detail = placeAfter(overview, `/rezept/${LASAGNE}`, { id: LASAGNE, von: 'uebersicht' });
    expect(tabPressAction(detail, 'uebersicht')).toEqual({ kind: 'open', href: '/' });
    expect(tabPressAction(detail, 'essen')).toEqual({ kind: 'open', href: '/rezepte' });
  });

  it('before the first address it opens the start page', () => {
    expect(tabPressAction(EMPTY_PLACE, 'kalender')).toEqual({ kind: 'open', href: '/kalender' });
  });
});
