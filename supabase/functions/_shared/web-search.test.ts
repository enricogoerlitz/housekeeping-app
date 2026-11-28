import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from './errors.ts';
import { fakeDeps } from './test-fakes.ts';
import { configuredProviders, searchWithFallback } from './web-search.ts';

// Spec 0049, REQ-006: one small interface for the search provider — Serper.dev (Google results)
// first, the Brave Search API when Serper fails or is out of credits. Keys only in headers, never
// in a log.

const SERPER_KEY = 'serper-SECRET-key';
const BRAVE_KEY = 'brave-SECRET-key';
const KEYS = { SERPER_API_KEY: SERPER_KEY, BRAVE_SEARCH_API_KEY: BRAVE_KEY };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const organic = {
  organic: [
    {
      title: 'Spaghetti Bolognese – einfach und lecker',
      link: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html',
      snippet: 'Zutaten ; 500 g. Rinderhackfleisch',
      rating: 4.7,
      ratingCount: 638,
    },
    { title: 'ohne Link' },
    { title: 'Unsicher', link: 'http://unsicher.example/rezept' },
  ],
  credits: 1,
};

const maps = {
  places: [
    {
      title: 'Madame Hien',
      address: 'Torstraße 59, 10119 Berlin, Deutschland',
      latitude: 52.5291305,
      longitude: 13.4089044,
      rating: 4.8,
      ratingCount: 708,
      type: 'Vietnamesisches Restaurant',
      website: 'http://madamehienberlin.de/',
      openingHours: { Donnerstag: '11:00–23:00', Montag: 'Geschlossen', Feiertag: '12–14' },
      thumbnailUrl: 'https://lh3.googleusercontent.com/thumb.jpg',
      priceLevel: '10–20 €',
      cid: '8138665074501765423',
    },
  ],
};

const brave = {
  web: {
    results: [
      {
        title: 'Spaghetti <strong>Bolognese</strong>',
        url: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html',
        description: 'Dieses <strong>Top-Rezept</strong> …',
        thumbnail: { original: 'https://img.chefkoch-cdn.de/bolognese.jpg' },
      },
    ],
  },
};

afterEach(() => vi.restoreAllMocks());

describe('configuredProviders', () => {
  it('Serper first, then Brave; a missing key leaves its provider out', () => {
    expect(configuredProviders(fakeDeps({ env: KEYS })).map((p) => p.name)).toEqual([
      'serper',
      'brave',
    ]);
    expect(
      configuredProviders(fakeDeps({ env: { BRAVE_SEARCH_API_KEY: BRAVE_KEY } })).map(
        (p) => p.name,
      ),
    ).toEqual(['brave']);
  });
});

describe('Serper', () => {
  it('AC-005: web search with the key in X-API-KEY, German results; only https links', async () => {
    const deps = fakeDeps({ env: KEYS, fetch: async () => json(organic) });
    const { value, provider } = await searchWithFallback(configuredProviders(deps), (p) =>
      p.web('Spaghetti Bolognese Rezept'),
    );
    expect(provider).toBe('serper');
    expect(value).toEqual([
      {
        title: 'Spaghetti Bolognese – einfach und lecker',
        url: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html',
        snippet: 'Zutaten ; 500 g. Rinderhackfleisch',
        rating: 4.7,
        ratingCount: 638,
      },
    ]);
    const [url, init] = deps.fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://google.serper.dev/search');
    expect(new Headers(init?.headers).get('X-API-KEY')).toBe(SERPER_KEY);
    expect(JSON.parse(String(init?.body))).toEqual({
      q: 'Spaghetti Bolognese Rezept',
      gl: 'de',
      hl: 'de',
    });
  });

  it('AC-008, AC-011: places from /maps around the centre, with hours, price and maps link', async () => {
    const deps = fakeDeps({ env: KEYS, fetch: async () => json(maps) });
    const { value } = await searchWithFallback(configuredProviders(deps), (p) =>
      p.places('vietnamesisch', { lat: 52.515, lng: 13.454, zoom: 11 }),
    );
    expect(value).toEqual([
      {
        title: 'Madame Hien',
        address: 'Torstraße 59, 10119 Berlin, Deutschland',
        location: { lat: 52.5291305, lng: 13.4089044 },
        rating: 4.8,
        ratingCount: 708,
        category: 'Vietnamesisches Restaurant',
        websiteUrl: 'https://madamehienberlin.de/',
        mapsUrl: 'https://maps.google.com/?cid=8138665074501765423',
        imageUrl: 'https://lh3.googleusercontent.com/thumb.jpg',
        openingHours: [
          { weekday: 4, hours: '11:00–23:00' },
          { weekday: 1, hours: 'Geschlossen' },
        ],
        priceLevel: 2,
      },
    ]);
    // Entscheidung 11: once without a place, once around the centre.
    const sent = deps.fetchMock.mock.calls.map(([url, init]) => {
      expect(String(url)).toBe('https://google.serper.dev/maps');
      return JSON.parse(String(init?.body));
    });
    expect(sent).toEqual([
      { q: 'vietnamesisch', gl: 'de', hl: 'de' },
      { q: 'vietnamesisch', gl: 'de', hl: 'de', ll: '@52.515,13.454,11z' },
    ]);
  });

  it('AC-045: a namesake around the household wins over a famous one far away (the query reaches the pick)', async () => {
    const place = (title: string, latitude: number, longitude: number, cid: string) => ({
      title,
      address: 'x',
      latitude,
      longitude,
      cid,
    });
    const deps = fakeDeps({
      env: KEYS,
      fetch: async (_input, init) =>
        json({
          places: JSON.parse(String(init?.body)).ll
            ? [place('Trattoria Da Enzo', 50.97, 7.41, '2')]
            : [place('Trattoria Da Enzo', 41.888, 12.474, '1')],
        }),
    });
    const { value } = await searchWithFallback(configuredProviders(deps), (p) =>
      p.places('Trattoria Da Enzo', { lat: 50.934, lng: 6.948, zoom: 11 }),
    );
    expect(value.map((hit) => hit.mapsUrl)).toEqual(['https://maps.google.com/?cid=2']);
  });

  it('a place without cid gets a maps link from its coordinates', async () => {
    const [place] = maps.places;
    const deps = fakeDeps({
      env: KEYS,
      fetch: async () => json({ places: [{ ...place, cid: undefined }] }),
    });
    const { value } = await searchWithFallback(configuredProviders(deps), (p) => p.places('x'));
    expect(value[0]?.mapsUrl).toBe(
      'https://www.google.com/maps/search/?api=1&query=52.5291305%2C13.4089044',
    );
  });
});

describe('Serper images (spec 0067, REQ-011)', () => {
  it('Google images from /images: https image and page only, with the page as the source', async () => {
    const deps = fakeDeps({
      env: KEYS,
      fetch: async () =>
        json({
          images: [
            {
              title: 'Linsen-Dal <b>Rezept</b>',
              imageUrl: 'https://img.koch.de/dal.jpg',
              thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/images?q=1',
              link: 'https://koch.de/dal',
            },
            { title: 'unsicher', imageUrl: 'http://x.de/a.jpg', link: 'https://x.de' },
            { title: 'ohne Seite', imageUrl: 'https://x.de/b.jpg' },
          ],
        }),
    });
    const [serper] = configuredProviders(deps);
    expect(await serper?.images?.('Linsen Dal')).toEqual([
      {
        imageUrl: 'https://img.koch.de/dal.jpg',
        thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/images?q=1',
        pageUrl: 'https://koch.de/dal',
        title: 'Linsen-Dal Rezept',
      },
    ]);
    const [url] = deps.fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://google.serper.dev/images');
  });
});

describe('fallback (REQ-006)', () => {
  it('AC-022: Serper out of credits → Brave, with its key in X-Subscription-Token', async () => {
    const deps = fakeDeps({
      env: KEYS,
      fetch: async (input) =>
        String(input).startsWith('https://google.serper.dev')
          ? json({ message: 'Not enough credits' }, 400)
          : json(brave),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { value, provider } = await searchWithFallback(configuredProviders(deps), (p) =>
      p.web('Spaghetti Bolognese Rezept'),
    );
    expect(provider).toBe('brave');
    expect(value).toEqual([
      {
        title: 'Spaghetti Bolognese',
        url: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html',
        snippet: 'Dieses Top-Rezept …',
        imageUrl: 'https://img.chefkoch-cdn.de/bolognese.jpg',
      },
    ]);
    const [url, init] = deps.fetchMock.mock.calls[1] ?? [];
    const braveUrl = new URL(String(url));
    expect(braveUrl.origin + braveUrl.pathname).toBe(
      'https://api.search.brave.com/res/v1/web/search',
    );
    expect(Object.fromEntries(braveUrl.searchParams)).toMatchObject({
      q: 'Spaghetti Bolognese Rezept',
      country: 'DE',
      search_lang: 'de',
    });
    expect(new Headers(init?.headers).get('X-Subscription-Token')).toBe(BRAVE_KEY);
    // The log names provider and status, never the key or the query.
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('serper');
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('Bolognese');
  });

  it('AC-022: a network error or a broken answer at Serper also falls back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const deps = fakeDeps({
      env: KEYS,
      fetch: async (input) => {
        calls += 1;
        if (String(input).startsWith('https://google.serper.dev')) {
          if (calls === 1) throw new TypeError('network');
        }
        return json(brave);
      },
    });
    const { provider } = await searchWithFallback(configuredProviders(deps), (p) => p.web('x'));
    expect(provider).toBe('brave');
    const broken = fakeDeps({
      env: KEYS,
      fetch: async (input) =>
        String(input).startsWith('https://google.serper.dev')
          ? new Response('<html>', { status: 200 })
          : json(brave),
    });
    expect(
      (await searchWithFallback(configuredProviders(broken), (p) => p.web('x'))).provider,
    ).toBe('brave');
  });

  it('Brave stands in for places with its web results (website, no rating)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps({
      env: KEYS,
      fetch: async (input) =>
        String(input).startsWith('https://google.serper.dev') ? json({}, 503) : json(brave),
    });
    const { value } = await searchWithFallback(configuredProviders(deps), (p) => p.places('x'));
    expect(value).toEqual([
      {
        title: 'Spaghetti Bolognese',
        websiteUrl: 'https://www.chefkoch.de/rezepte/393031127655461/Spaghetti-Bolognese.html',
        imageUrl: 'https://img.chefkoch-cdn.de/bolognese.jpg',
        snippet: 'Dieses Top-Rezept …',
      },
    ]);
  });

  it('AC-023: both fail → search_unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps({ env: KEYS, fetch: async () => json({}, 429) });
    await expect(searchWithFallback(configuredProviders(deps), (p) => p.web('x'))).rejects.toEqual(
      new HttpError('search_unavailable'),
    );
  });

  it('AC-023: no provider configured → search_unavailable, logged by name only', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps();
    await expect(searchWithFallback(configuredProviders(deps), (p) => p.web('x'))).rejects.toEqual(
      new HttpError('search_unavailable'),
    );
    expect(error).toHaveBeenCalledWith('web_search_not_configured');
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});
