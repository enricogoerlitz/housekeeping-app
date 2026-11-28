import { describe, expect, it } from 'vitest';

import type { Query } from '../_shared/deps.ts';
import { ANON_JWT, fakeClient, fakeDeps, post } from '../_shared/test-fakes.ts';
import { HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const URL_JPEG = 'https://bilder.example.org/kuchen.jpg';

function web(routes: { [url: string]: () => Response }): typeof fetch {
  return async (input) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected fetch ${String(input)}`);
    return route();
  };
}

function setup(
  routes: { [url: string]: () => Response } = {},
  dns: { [host: string]: string[] } = {},
) {
  const deps = fakeDeps({
    client: fakeClient({ tables: householdTables() }),
    fetch: web(routes),
  });
  deps.resolveDns = async (host) => dns[host] ?? ['93.184.215.14'];
  return deps;
}

const jpegReply = () =>
  new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });

async function errorOf(response: Response): Promise<unknown> {
  return ((await response.json()) as { error: unknown }).error;
}

describe('fetch-image (spec 0039, REQ-003)', () => {
  it('AC-006: answers the image bytes of a public address, with the CORS header', async () => {
    const deps = setup({ [URL_JPEG]: jpegReply });
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, url: URL_JPEG }, { origin: 'http://localhost:8081' }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('AC-007: an HTML page is "not_an_image" (422)', async () => {
    const deps = setup({
      'https://example.org/seite': () =>
        new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, url: 'https://example.org/seite' }),
      deps,
    );
    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe('not_an_image');
  });

  it('AC-007: an image type whose bytes are no image (SVG, a lie) is "not_an_image"', async () => {
    const deps = setup({
      'https://example.org/a.svg': () =>
        new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        }),
    });
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, url: 'https://example.org/a.svg' }),
      deps,
    );
    expect(response.status).toBe(422);
  });

  it('AC-007: internal addresses are "not_an_image" without any request', async () => {
    const deps = setup({}, { 'intern.example.org': ['10.0.0.1'] });
    for (const url of [
      'https://localhost/a.jpg',
      'https://10.0.0.1/a.jpg',
      'https://169.254.169.254/latest/meta-data',
      'https://intern.example.org/a.jpg',
    ]) {
      const response = await handler(post({ householdId: HOUSEHOLD_ID, url }), deps);
      expect(response.status).toBe(422);
    }
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-007: an http address is refused by the contract (400) before anything is loaded', async () => {
    const deps = setup();
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, url: 'http://localhost/a.jpg' }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-007: more than 15 MB is "not_an_image"', async () => {
    const deps = setup({
      [URL_JPEG]: () =>
        new Response(JPEG, {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': String(16 * 1024 * 1024) },
        }),
    });
    const response = await handler(post({ householdId: HOUSEHOLD_ID, url: URL_JPEG }), deps);
    expect(response.status).toBe(422);
  });

  it('AC-008: signed out (no JWT, or the anon key) gets 401 and nothing is loaded', async () => {
    const deps = setup({ [URL_JPEG]: jpegReply });
    for (const jwt of [null, ANON_JWT]) {
      const response = await handler(
        post({ householdId: HOUSEHOLD_ID, url: URL_JPEG }, { jwt }),
        deps,
      );
      expect(response.status).toBe(401);
    }
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('a household the caller is no member of gets 403 and nothing is loaded', async () => {
    const deps = setup({ [URL_JPEG]: jpegReply });
    const response = await handler(
      post({ householdId: 'bbbbbbbb-0000-4000-8000-000000000002', url: URL_JPEG }),
      deps,
    );
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('forbidden');
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('a failing membership lookup fails closed with 500', async () => {
    const deps = setup({ [URL_JPEG]: jpegReply });
    const failing = (): Query => {
      const failed = Promise.resolve({ data: null, error: { message: 'down' } });
      const query: Query = {
        eq: () => query,
        in: () => query,
        gte: () => query,
        lte: () => query,
        limit: () => query,
        order: () => query,
        range: () => query,
        then: (onFulfilled, onRejected) => failed.then(onFulfilled, onRejected),
      };
      return query;
    };
    deps.client.from = () => ({ select: failing });
    const response = await handler(post({ householdId: HOUSEHOLD_ID, url: URL_JPEG }), deps);
    expect(response.status).toBe(500);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});
