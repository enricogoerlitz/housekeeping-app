import { describe, expect, it, vi } from 'vitest';

import { handler, type MediaSweepDeps } from './handler.ts';

const SECRET = 'test-sweep-secret-0039';
const NOW_S = 1_795_000_000;
const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';
const ROW = 'cccccccc-0000-4000-8000-000000000003';
const name = (file: string, folder = 'recipes') => `${HOUSEHOLD}/${folder}/${ROW}/${file}.jpg`;
const ORPHAN = name('dddddddd-0000-4000-8000-000000000004');
const ORPHAN_2 = name('eeeeeeee-0000-4000-8000-000000000005', 'activities');
const VIDEO = `${HOUSEHOLD}/recipes/${ROW}/ffffffff-0000-4000-8000-000000000006.mp4`;

async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)),
  );
  return [...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function request(
  body: unknown,
  options: { secret?: string | null; timestamp?: string; method?: string; signature?: string } = {},
): Promise<Request> {
  const text = JSON.stringify(body);
  const headers: { [name: string]: string } = { 'content-type': 'application/json' };
  const secret = options.secret === undefined ? SECRET : options.secret;
  const timestamp = options.timestamp ?? String(NOW_S);
  if (secret !== null) {
    headers['x-sweep-timestamp'] = timestamp;
    headers['x-sweep-signature'] = options.signature ?? (await sign(secret, timestamp, text));
  }
  const method = options.method ?? 'POST';
  return new Request('http://localhost/functions/v1/media-sweep', {
    method,
    headers,
    body: method === 'POST' ? text : undefined,
  });
}

function deps(
  remove = vi.fn(async (_bucket: string, names: string[]) => ({ removed: names.length })),
) {
  const env: { [name: string]: string } = {
    MEDIA_SWEEP_SECRET: SECRET,
    SUPABASE_URL: 'http://kong:8000',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };
  const createRemover = vi.fn(() => remove);
  const value: MediaSweepDeps = {
    env: (key) => env[key],
    createRemover,
    now: () => NOW_S * 1000,
  };
  return { ...value, remove, createRemover };
}

describe('media-sweep (spec 0039, REQ-005)', () => {
  it('AC-010: deletes the named orphans through the Storage API and says how many', async () => {
    const d = deps();
    const response = await handler(await request({ names: [ORPHAN, ORPHAN_2] }), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: 2 });
    expect(d.remove).toHaveBeenCalledWith('household-media', [ORPHAN, ORPHAN_2]);
    expect(d.createRemover).toHaveBeenCalledWith({
      url: 'http://kong:8000',
      key: 'test-service-key',
    });
  });

  it('spec 0043, AC-011: deletes the orphan videos from household-videos', async () => {
    const d = deps();
    const response = await handler(await request({ names: [ORPHAN], videos: [VIDEO] }), d);
    expect(await response.json()).toEqual({ removed: 2 });
    expect(d.remove.mock.calls).toEqual([
      ['household-media', [ORPHAN]],
      ['household-videos', [VIDEO]],
    ]);
    const onlyVideos = deps();
    const alone = await handler(await request({ names: [], videos: [VIDEO] }), onlyVideos);
    expect(await alone.json()).toEqual({ removed: 1 });
    expect(onlyVideos.remove.mock.calls).toEqual([['household-videos', [VIDEO]]]);
  });

  it('removes in chunks of 100', async () => {
    const d = deps();
    const names = Array.from({ length: 250 }, (_, index) =>
      name(`dddddddd-0000-4000-8000-${String(index).padStart(12, '0')}`),
    );
    const response = await handler(await request({ names }), d);
    expect(await response.json()).toEqual({ removed: 250 });
    expect(d.remove.mock.calls.map(([, chunk]) => chunk.length)).toEqual([100, 100, 50]);
  });

  it.each([
    ['without signature headers', { secret: null }],
    ['signed with another secret', { secret: 'wrong' }],
    ['with a signature that is no hex', { signature: 'z'.repeat(64) }],
    ['with a timestamp older than 5 minutes', { timestamp: String(NOW_S - 301) }],
  ] as const)('Risiken: a request %s gets 401 and deletes nothing', async (_label, options) => {
    const d = deps();
    const response = await handler(await request({ names: [ORPHAN] }, options), d);
    expect(response.status).toBe(401);
    expect(d.createRemover).not.toHaveBeenCalled();
  });

  it('refuses another method with 405', async () => {
    const d = deps();
    const response = await handler(await request({}, { method: 'GET' }), d);
    expect(response.status).toBe(405);
  });

  it.each([
    ['no names', { names: [] }],
    ['no names and no videos', { names: [], videos: [] }],
    ['a name outside the photo folders', { names: [`${HOUSEHOLD}/other/${ROW}/x.jpg`] }],
    ['a photo name as a video', { names: [], videos: [ORPHAN] }],
    ['a video name as a photo', { names: [VIDEO] }],
    ['a path that climbs up', { names: [`${HOUSEHOLD}/recipes/../../etc/passwd`] }],
    ['an extra field', { names: [ORPHAN], bucket: 'other' }],
  ])('a signed body with %s gets 400 and deletes nothing', async (_label, body) => {
    const d = deps();
    const response = await handler(await request(body), d);
    expect(response.status).toBe(400);
    expect(d.remove).not.toHaveBeenCalled();
  });

  it('a body over 128 KB gets 413', async () => {
    const d = deps();
    const response = await handler(await request({ names: ['x'.repeat(130 * 1024)] }), d);
    expect(response.status).toBe(413);
  });

  it('a failing Storage API answers 502 with what was removed before', async () => {
    const remove = vi
      .fn<(bucket: string, names: string[]) => Promise<{ removed: number }>>()
      .mockResolvedValueOnce({ removed: 100 })
      .mockRejectedValueOnce(new Error('storage down'));
    const d = deps(remove);
    const names = Array.from({ length: 150 }, (_, index) =>
      name(`dddddddd-0000-4000-8000-${String(index).padStart(12, '0')}`),
    );
    const response = await handler(await request({ names }), d);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'storage_failed', removed: 100 });
  });

  it('a missing secret fails with 500 after a signed-looking request', async () => {
    const d = deps();
    const response = await handler(await request({ names: [ORPHAN] }), {
      ...d,
      env: () => undefined,
    });
    expect(response.status).toBe(500);
  });
});
