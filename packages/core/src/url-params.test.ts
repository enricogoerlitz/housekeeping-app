import { describe, expect, it } from 'vitest';

import { EMPTY_RECIPE_LIST_FILTER } from './recipe-list';
import { EMPTY_RESTAURANT_LIST_FILTER } from './restaurant-list';
import {
  calendarFromParams,
  cookingStepFromParam,
  PAGE_PARAMS,
  pageQuery,
  readPageParams,
  recipeListFromParams,
  recipeListToParams,
  resolveAddressedId,
  restaurantListFromParams,
  restaurantListToParams,
  safeReturnPath,
  ORIGINS,
  SECTION_START,
  sectionOfOrigin,
  sectionOfPath,
  sectionOfStartPath,
  startPageHref,
  type PageKey,
  type PageParams,
} from './url-params';

const LASAGNE = '0b4a3c52-8e5f-4d1a-9b7e-2f6d8c9a1e01';
const TEST_HOUSEHOLD = '7d1e2f30-4a5b-4c6d-8e9f-a0b1c2d3e4f5';
const OWN_HOUSEHOLD = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/** The address the router writes for a page's values: encoded, route ids belong in `path`. */
function pageHref<K extends PageKey>(path: string, page: K, values: PageParams<K>): string {
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(pageQuery(page, values))) {
    if (name === 'id' || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(entry)}`);
    }
  }
  return pairs.length > 0 ? `${path}?${pairs.join('&')}` : path;
}

/** The query of an address as the router hands it over: decoded, repeated names as lists. */
function rawOf(href: string): Record<string, string[]> {
  const raw: Record<string, string[]> = {};
  for (const pair of (href.split('?')[1] ?? '').split('&')) {
    const [key = '', value = ''] = pair.split('=');
    (raw[decodeURIComponent(key)] ??= []).push(decodeURIComponent(value));
  }
  return raw;
}

describe('readPageParams', () => {
  it('AC-034: an unknown sort and an unknown diet are ignored and reported for cleaning', () => {
    const read = readPageParams('rezepte', { sortierung: 'quatsch', ernaehrung: 'fleisch' });
    expect(read.values).toEqual({});
    expect(read.invalid.sort()).toEqual(['ernaehrung', 'sortierung']);
    expect(recipeListFromParams(read.values)).toEqual({
      query: '',
      filter: EMPTY_RECIPE_LIST_FILTER,
      sort: 'recent',
    });
  });

  it('AC-039: a day that does not exist and a view the calendar does not have give the week of today', () => {
    const read = readPageParams('kalender', { tag: '2026-13-40', ansicht: 'tag' });
    expect(read.values).toEqual({});
    expect(read.invalid.sort()).toEqual(['ansicht', 'tag']);
    expect(calendarFromParams(read.values, '2026-11-22')).toEqual({
      view: 'week',
      day: '2026-11-22',
    });
  });

  it('AC-052: an id that is not a uuid is invalid', () => {
    const read = readPageParams('haushalt', { aufgabe: 'abc' });
    expect(read.values).toEqual({});
    expect(read.invalid).toEqual(['aufgabe']);
  });

  it('spec 0021, AC-043: the chore window opened from the calendar stands in its address', () => {
    const chore = '6f1c2b0e-8a4d-4f7e-9b3a-2d5c6e7f8a90';
    expect(readPageParams('kalender', { aufgabe: chore }).values).toEqual({ aufgabe: chore });
    expect(readPageParams('kalender', { aufgabe: 'abc' }).invalid).toEqual(['aufgabe']);
  });

  it('of a repeated single parameter the first counts; a repeated list parameter keeps all', () => {
    const read = readPageParams('rezepte', {
      suche: ['curry', 'reis'],
      gang: ['hauptgericht', 'quatsch', 'dessert'],
    });
    expect(read.values).toEqual({ suche: 'curry', gang: ['hauptgericht', 'dessert'] });
    expect(read.invalid).toEqual(['gang']);
  });

  it('parameters of another page are not read and not reported', () => {
    const read = readPageParams('liste', { ansicht: 'monat', id: LASAGNE });
    expect(read.values).toEqual({});
    expect(read.invalid).toEqual([]);
  });

  it('a value equal to the default is valid but counts as cleanable', () => {
    const read = readPageParams('kalender', { ansicht: 'woche' });
    expect(read.values).toEqual({ ansicht: 'woche' });
    expect(read.invalid).toEqual(['ansicht']);
  });

  it('every page knows the route id only where the route has one', () => {
    expect(Object.keys(PAGE_PARAMS.rezept)).toContain('id');
    expect(Object.keys(PAGE_PARAMS.rezepte)).not.toContain('id');
  });
});

describe('pageHref', () => {
  it('AC-032: search, diet and sort of "Essen" in the address', () => {
    const values = recipeListToParams({
      query: 'curry',
      filter: { ...EMPTY_RECIPE_LIST_FILTER, diet: 'vegetarian' },
      sort: 'count',
    });
    expect(pageHref('/rezepte', 'rezepte', values)).toBe(
      '/rezepte?suche=curry&ernaehrung=vegetarisch&sortierung=haeufig',
    );
    const read = readPageParams('rezepte', {
      suche: 'curry',
      ernaehrung: 'vegetarisch',
      sortierung: 'haeufig',
    });
    expect(recipeListFromParams(read.values)).toEqual({
      query: 'curry',
      filter: { ...EMPTY_RECIPE_LIST_FILTER, diet: 'vegetarian' },
      sort: 'count',
    });
  });

  it('AC-035: "Zufall" stays in the address', () => {
    const values = recipeListToParams({
      query: '',
      filter: EMPTY_RECIPE_LIST_FILTER,
      sort: 'random',
    });
    expect(pageHref('/rezepte', 'rezepte', values)).toBe('/rezepte?sortierung=zufall');
    expect(
      recipeListFromParams(readPageParams('rezepte', { sortierung: 'zufall' }).values).sort,
    ).toBe('random');
  });

  it('AC-055: spaces and umlauts are encoded when written and unchanged when read', () => {
    const href = pageHref('/rezepte', 'rezepte', { suche: 'müsli bowl' });
    expect(href).toBe('/rezepte?suche=m%C3%BCsli%20bowl');
    expect(readPageParams('rezepte', rawOf(href)).values).toEqual({
      suche: 'müsli bowl',
    });
  });

  it('defaults, empty values and empty lists are left out', () => {
    expect(
      pageHref('/kalender', 'kalender', { ansicht: 'woche', tag: undefined, fenster: undefined }),
    ).toBe('/kalender');
    expect(pageHref('/rezepte', 'rezepte', { suche: '  ', gang: [] })).toBe('/rezepte');
  });

  it('AC-036: month, day and the day window', () => {
    expect(
      pageHref('/kalender', 'kalender', { ansicht: 'monat', tag: '2026-12-09', fenster: 'tag' }),
    ).toBe('/kalender?ansicht=monat&tag=2026-12-09&fenster=tag');
  });

  it('list parameters repeat', () => {
    expect(pageHref('/rezepte', 'rezepte', { gang: ['hauptgericht', 'dessert'] })).toBe(
      '/rezepte?gang=hauptgericht&gang=dessert',
    );
  });
});

describe('recipe list in the address', () => {
  it('every filter survives the round trip', () => {
    const state = {
      query: 'pasta',
      filter: {
        kind: 'collection' as const,
        favorites: true,
        diet: 'vegan' as const,
        maxMinutes: 30 as const,
        fitsAll: true,
        rare: true,
        courses: ['main' as const, 'side' as const],
        cuisines: ['italienisch'],
        minRating: 4.5 as const,
      },
      sort: 'title' as const,
    };
    const href = pageHref('/rezepte', 'rezepte', recipeListToParams(state));
    expect(recipeListFromParams(readPageParams('rezepte', rawOf(href)).values)).toEqual(state);
  });
});

describe('restaurant list in the address', () => {
  it('AC-043: the restaurant view with its filter survives the round trip', () => {
    const state = {
      query: 'pizza',
      filter: {
        favorites: true,
        cuisines: ['italienisch'],
        priceLevels: [1, 2] as (1 | 2)[],
        minRating: 4 as const,
      },
      sort: 'rating' as const,
    };
    const href = pageHref('/rezepte', 'rezepte', {
      ansicht: 'restaurants',
      ...restaurantListToParams(state),
    });
    expect(href).toBe(
      '/rezepte?ansicht=restaurants&suche=pizza&favoriten=1&kueche=italienisch&bewertung=4&preis=1&preis=2&sortierung=bewertung',
    );
    expect(restaurantListFromParams(readPageParams('rezepte', rawOf(href)).values)).toEqual(state);
  });
  it('"A–Z" is the default and stays out; an unknown sort gives it', () => {
    expect(
      restaurantListToParams({ query: '', filter: EMPTY_RESTAURANT_LIST_FILTER, sort: 'title' })
        .sortierung,
    ).toBeUndefined();
    expect(restaurantListFromParams({ sortierung: 'haeufig' }).sort).toBe('title');
  });
});

describe('cookingStepFromParam', () => {
  it('AC-045: step 3 of a recipe with six steps is index 2', () => {
    expect(cookingStepFromParam(3, 6)).toBe(2);
  });
  it('AC-046: step 99 shows the last step', () => {
    expect(cookingStepFromParam(99, 6)).toBe(5);
  });
  it('no step is the first', () => {
    expect(cookingStepFromParam(undefined, 6)).toBe(0);
    expect(cookingStepFromParam(2, 0)).toBe(0);
  });
});

describe('safeReturnPath', () => {
  it('AC-047: a path of the app with its query is kept', () => {
    expect(safeReturnPath('/kalender?ansicht=monat&tag=2026-12-09')).toBe(
      '/kalender?ansicht=monat&tag=2026-12-09',
    );
  });
  it('AC-048: foreign hosts, protocol-relative and odd paths give nothing', () => {
    for (const bad of [
      'https://boese.example',
      '//boese.example',
      '/\\boese.example',
      '/%2F%2Fboese.example',
      'javascript:alert(1)',
      ' /kalender',
      '/kalender\n',
      '/kalender%0a',
      '/%00',
      '',
      undefined,
      42,
    ]) {
      expect(safeReturnPath(bad)).toBeUndefined();
    }
  });
  it('AC-048: the root and the sign-in page itself give nothing (the app opens the overview)', () => {
    expect(safeReturnPath('/')).toBeUndefined();
  });
});

describe('resolveAddressedId', () => {
  it('AC-050: an id in no own household is not found', () => {
    expect(resolveAddressedId(OWN_HOUSEHOLD, [])).toEqual({ status: 'missing' });
  });
  it('AC-051: an id in another own household switches to it', () => {
    expect(resolveAddressedId(OWN_HOUSEHOLD, [TEST_HOUSEHOLD])).toEqual({
      status: 'switch',
      householdId: TEST_HOUSEHOLD,
    });
  });
  it('an id in the active household is shown', () => {
    expect(resolveAddressedId(OWN_HOUSEHOLD, [TEST_HOUSEHOLD, OWN_HOUSEHOLD])).toEqual({
      status: 'shown',
    });
  });
});

describe('sectionOfOrigin', () => {
  it('AC-018: an unknown origin gives the own section', () => {
    expect(sectionOfOrigin('quatsch', 'essen')).toBe('essen');
    expect(sectionOfOrigin(undefined, 'essen')).toBe('essen');
    expect(sectionOfOrigin('uebersicht', 'essen')).toBe('uebersicht');
  });
});

describe('sectionOfPath', () => {
  it('AC-018: a detail page belongs to its own section without `von`', () => {
    expect(sectionOfPath(`/rezept/${LASAGNE}`, undefined)).toBe('essen');
    expect(sectionOfPath(`/rezept/${LASAGNE}`, 'quatsch')).toBe('essen');
    expect(sectionOfPath(`/restaurant/${LASAGNE}`, undefined)).toBe('essen');
    expect(sectionOfPath(`/markt/${LASAGNE}`, undefined)).toBe('verwalten');
    expect(sectionOfPath('/einkaufen', undefined)).toBe('liste');
    expect(sectionOfPath('/einstellungen/benachrichtigungen', undefined)).toBe('verwalten');
  });
  it('AC-030 (0024): the activities live under "Verwalten", no tab is highlighted', () => {
    expect(sectionOfPath('/aktivitaeten', undefined)).toBe('verwalten');
    expect(sectionOfPath(`/aktivitaet/${LASAGNE}`, undefined)).toBe('verwalten');
  });
  it('AC-015: with `von` the origin is the section', () => {
    expect(sectionOfPath(`/rezept/${LASAGNE}`, 'uebersicht')).toBe('uebersicht');
  });
  it('a start page is always its own section', () => {
    expect(sectionOfPath('/rezepte', 'uebersicht')).toBe('essen');
  });
});

describe('startPageHref', () => {
  it('AC-012: the start page keeps search and filter but no window and no object', () => {
    expect(startPageHref(`/rezepte?suche=curry&restaurant=${LASAGNE}&fenster=neu`)).toBe(
      '/rezepte?suche=curry',
    );
  });
  it('AC-013: the calendar keeps view and day, the entry window closes', () => {
    expect(
      startPageHref(`/kalender?ansicht=monat&tag=2026-12-09&eintrag=${LASAGNE}&fenster=tag`),
    ).toBe('/kalender?ansicht=monat&tag=2026-12-09');
  });
  it('a query that cannot be decoded gives the bare path', () => {
    expect(startPageHref('/rezepte?suche=%E0%A4%A')).toBe('/rezepte');
  });
});

describe('sectionOfStartPath', () => {
  it('names the section of a start page and nothing for other pages', () => {
    expect(sectionOfStartPath('/')).toBe('uebersicht');
    expect(sectionOfStartPath('/rezepte')).toBe('essen');
    expect(sectionOfStartPath('/kalender')).toBe('kalender');
    expect(sectionOfStartPath(`/rezept/${LASAGNE}`)).toBeUndefined();
  });
  it('every section has a start path', () => {
    for (const origin of ORIGINS) expect(sectionOfStartPath(SECTION_START[origin])).toBe(origin);
  });
});
