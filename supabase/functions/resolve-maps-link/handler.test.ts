import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANON_JWT, fakeDeps, post } from '../_shared/test-fakes.ts';
import { handler } from './handler.ts';

const PLACE =
  'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z/data=!3m1!4b1';

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** A fake web: each URL answers with the given response factory; anything else fails the test. */
function web(routes: { [url: string]: () => Response }): typeof fetch {
  return async (input) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  };
}

async function resolve(url: string, routes: { [url: string]: () => Response } = {}) {
  const deps = fakeDeps({ fetch: web(routes) });
  const response = await handler(post({ url }), deps);
  return { response, body: (await response.json()) as unknown, deps };
}

afterEach(() => vi.restoreAllMocks());

describe('resolve-maps-link', () => {
  it('AC-031: follows a short link to the place and returns name, location and link', async () => {
    const { response, body, deps } = await resolve('https://maps.app.goo.gl/AbC123', {
      'https://maps.app.goo.gl/AbC123': () => redirect(PLACE),
    });
    expect(response.status).toBe(200);
    expect(body).toEqual({
      name: 'Trattoria Da Enzo',
      location: { lat: 50.9271, lng: 6.958 },
      mapsUrl: PLACE,
    });
    expect(deps.fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('AC-031: reads the EU consent page’s continue parameter without fetching it', async () => {
    const consent = `https://consent.google.com/ml?continue=${encodeURIComponent(PLACE)}&gl=DE&hl=de`;
    const { response, body, deps } = await resolve('https://maps.app.goo.gl/eu', {
      'https://maps.app.goo.gl/eu': () => redirect(consent),
    });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ name: 'Trattoria Da Enzo' });
    expect(deps.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AC-031: a full place link and an Apple link resolve without any fetch', async () => {
    const apple = 'https://maps.apple.com/?q=Pho%20Saigon&ll=50.94,6.95';
    for (const [url, name] of [
      [PLACE, 'Trattoria Da Enzo'],
      [apple, 'Pho Saigon'],
      ['https://www.google.de/maps/place/Caf%C3%A9+M%C3%BCller/@50.1,6.2,17z', 'Café Müller'],
    ] as const) {
      const { response, body, deps } = await resolve(url);
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ name });
      expect(deps.fetchMock).not.toHaveBeenCalled();
    }
  });

  it('follows a chain of short links through all redirect codes', async () => {
    const { response } = await resolve('https://goo.gl/maps/one', {
      'https://goo.gl/maps/one': () => redirect('https://maps.app.goo.gl/two', 301),
      'https://maps.app.goo.gl/two': () => redirect('/three', 307),
      'https://maps.app.goo.gl/three': () => redirect(PLACE, 308),
    });
    expect(response.status).toBe(200);
  });

  const ssrf: [string, string, { [url: string]: () => Response }][] = [
    ['another host', 'https://example.com/maps/place/Enzo/@50.1,6.2', {}],
    ['a look-alike host', 'https://maps.app.goo.gl.evil.example/x', {}],
    ['an IPv4 literal', 'https://127.0.0.1/maps/place/Enzo/@50.1,6.2', {}],
    ['an IPv6 literal', 'https://[::1]/maps/place/Enzo/@50.1,6.2', {}],
    ['userinfo pointing elsewhere', 'https://maps.app.goo.gl@evil.example/x', {}],
    ['credentials on an allowed host', 'https://user:pw@maps.app.goo.gl/x', {}],
    ['a non-default port', 'https://maps.app.goo.gl:8443/x', {}],
    ['a Google page that is not a map', 'https://www.google.com/search?q=Enzo', {}],
    [
      'a redirect to an internal host',
      'https://maps.app.goo.gl/internal',
      { 'https://maps.app.goo.gl/internal': () => redirect('https://169.254.169.254/latest/') },
    ],
    [
      'a redirect to localhost over http',
      'https://maps.app.goo.gl/local',
      { 'https://maps.app.goo.gl/local': () => redirect('http://localhost:54321/rest/v1/') },
    ],
    [
      'a redirect to a foreign site',
      'https://maps.app.goo.gl/foreign',
      {
        'https://maps.app.goo.gl/foreign': () => redirect('https://evil.example/maps/place/X/@1,1'),
      },
    ],
    [
      'a consent page whose continue leads elsewhere',
      'https://maps.app.goo.gl/consent-bad',
      {
        'https://maps.app.goo.gl/consent-bad': () =>
          redirect('https://consent.google.com/ml?continue=https%3A%2F%2F10.0.0.1%2Fadmin'),
      },
    ],
    [
      'a consent page without continue',
      'https://maps.app.goo.gl/consent-empty',
      { 'https://maps.app.goo.gl/consent-empty': () => redirect('https://consent.google.com/ml') },
    ],
    [
      'a short link that does not redirect',
      'https://maps.app.goo.gl/dead',
      { 'https://maps.app.goo.gl/dead': () => new Response('<html>', { status: 200 }) },
    ],
    [
      'a redirect without location',
      'https://maps.app.goo.gl/nolocation',
      { 'https://maps.app.goo.gl/nolocation': () => new Response(null, { status: 302 }) },
    ],
    ['an Apple link without a name', 'https://maps.apple.com/?ll=50.94,6.95', {}],
  ];

  it.each(ssrf)('AC-032: %s is no map link (422) and is not followed', async (_, url, routes) => {
    const { response, body, deps } = await resolve(url, routes);
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: 'not_a_maps_link' });
    expect(deps.fetchMock.mock.calls.length).toBeLessThanOrEqual(Object.keys(routes).length);
  });

  it('AC-032: stops after 5 redirects', async () => {
    const routes: { [url: string]: () => Response } = {};
    for (let hop = 0; hop < 10; hop += 1)
      routes[`https://maps.app.goo.gl/hop${hop}`] = () =>
        redirect(`https://maps.app.goo.gl/hop${hop + 1}`);
    const { response, deps } = await resolve('https://maps.app.goo.gl/hop0', routes);
    expect(response.status).toBe(422);
    expect(deps.fetchMock).toHaveBeenCalledTimes(5);
  });

  it('AC-032: a consent loop is cut off as well', async () => {
    const loop = 'https://consent.google.com/ml?continue=';
    let url = 'https://maps.app.goo.gl/x';
    for (let i = 0; i < 10; i += 1) url = loop + encodeURIComponent(url.replace(/x$/, 'x'));
    const { response } = await resolve(`${loop}${encodeURIComponent(url)}`);
    expect(response.status).toBe(422);
  });

  it('AC-032: aborts a hop that hangs after 5 s and does not follow it', async () => {
    vi.useFakeTimers();
    const deps = fakeDeps({
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    });
    const pending = handler(post({ url: 'https://maps.app.goo.gl/slow' }), deps);
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    vi.useRealTimers();
    expect(response.status).toBe(422);
  });

  it('AC-005: the anon key gets 401 and nothing is fetched', async () => {
    const deps = fakeDeps();
    const response = await handler(
      post({ url: 'https://maps.app.goo.gl/x' }, { jwt: ANON_JWT }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-032: a request that is no https URL is rejected by the contract (400), nothing fetched', async () => {
    for (const url of ['http://maps.app.goo.gl/x', 'file:///etc/passwd', 'gopher://x']) {
      const { response, deps } = await resolve(url);
      expect(response.status).toBe(400);
      expect(deps.fetchMock).not.toHaveBeenCalled();
    }
  });

  it('AC-032: a redirect from https to http is not followed', async () => {
    const { response, deps } = await resolve('https://maps.app.goo.gl/down', {
      'https://maps.app.goo.gl/down': () => redirect('http://maps.app.goo.gl/x'),
    });
    expect(response.status).toBe(422);
    expect(deps.fetchMock).toHaveBeenCalledTimes(1);
  });
});
