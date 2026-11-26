import { describe, expect, it } from 'vitest';

import type { DbResult, StorageResult } from '../_shared/deps.ts';
import { ANON_JWT, fakeClient, fakeDeps, post, type Row } from '../_shared/test-fakes.ts';
import { HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

// "Pasta Sorrentina" with its TikTok link (spec 0043); the page JSON follows a real video page.
const RECIPE_ID = 'cccccccc-0000-4000-8000-000000000003';
const SHORT = 'https://vm.tiktok.com/ZGdXoJ8Ay/';
const LONG = 'https://www.tiktok.com/@jacobs_lunch/video/7686512961438960929';
const PLAY = 'https://v16-webapp-prime.tiktok.com/video/tos/maliva/abc/?a=1988';
const MP4 = Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const VIDEO_PATH = new RegExp(
  `^${HOUSEHOLD_ID}/recipes/${RECIPE_ID}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.mp4$`,
);

const pasta = (fields: Row = {}): Row => ({
  id: RECIPE_ID,
  household_id: HOUSEHOLD_ID,
  kind: 'recipe',
  title: 'Pasta Sorrentina',
  links: [{ url: SHORT, label: 'TikTok' }, { url: 'https://www.chefkoch.de/rezepte/1' }],
  video_path: null,
  ...fields,
});

function page(): string {
  const item = { id: '7686512961438960929', video: { playAddr: PLAY, size: MP4.byteLength } };
  const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: item } } } };
  return `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script>`;
}

const tiktok: { [url: string]: () => Response } = {
  [SHORT]: () => new Response(null, { status: 301, headers: { location: LONG } }),
  [LONG]: () =>
    new Response(page(), {
      status: 200,
      headers: [
        ['content-type', 'text/html; charset=utf-8'],
        ['set-cookie', 'ttwid=abc; Path=/'],
      ],
    }),
  [PLAY]: () => new Response(MP4, { status: 200, headers: { 'content-type': 'video/mp4' } }),
};

function setup(
  options: {
    recipe?: Row;
    routes?: { [url: string]: () => Response };
    rpc?: (fn: string) => DbResult;
    storage?: (op: 'upload' | 'remove') => StorageResult;
  } = {},
) {
  const tables = householdTables();
  tables.recipes = [options.recipe ?? pasta()];
  const client = fakeClient({
    tables,
    rpc: options.rpc,
    storage: options.storage ? (op) => options.storage?.(op) ?? { error: null } : undefined,
  });
  const routes = options.routes ?? tiktok;
  return fakeDeps({
    client,
    fetch: async (input) => {
      const route = routes[String(input)];
      if (!route) throw new TypeError(`unexpected fetch ${String(input)}`);
      return route();
    },
  });
}

const body = (fields: { [key: string]: unknown } = {}) => ({
  householdId: HOUSEHOLD_ID,
  recipeId: RECIPE_ID,
  url: SHORT,
  ...fields,
});

async function errorOf(response: Response): Promise<unknown> {
  return ((await response.json()) as { error: unknown }).error;
}

describe('fetch-video (spec 0043, REQ-001)', () => {
  it('AC-001: loads the video, uploads it as the caller and sets video_path through apply_changes', async () => {
    const deps = setup();
    const response = await handler(post(body(), { origin: 'http://localhost:8081' }), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    const { videoPath } = (await response.json()) as { videoPath: string };
    expect(videoPath).toMatch(VIDEO_PATH);
    expect(deps.client.uploads).toEqual([
      { bucket: 'household-videos', path: videoPath, bytes: MP4, contentType: 'video/mp4' },
    ]);
    expect(deps.client.rpcCalls).toEqual([
      {
        fn: 'apply_changes',
        args: {
          p_household_id: HOUSEHOLD_ID,
          p_ops: [
            { kind: 'patch', table: 'recipes', id: RECIPE_ID, changes: { video_path: videoPath } },
          ],
        },
      },
    ]);
    expect(deps.client.removes).toEqual([]);
  });

  it('AC-002: TikTok gives no video: video_unavailable (422), nothing is stored', async () => {
    const deps = setup({
      routes: { ...tiktok, [PLAY]: () => new Response('denied', { status: 403 }) },
    });
    const response = await handler(post(body()), deps);
    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe('video_unavailable');
    expect(deps.client.uploads).toEqual([]);
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('AC-003: a video over 50 MB: video_too_large (422), nothing is stored', async () => {
    const deps = setup({
      routes: {
        ...tiktok,
        [PLAY]: () =>
          new Response(MP4, {
            status: 200,
            headers: { 'content-type': 'video/mp4', 'content-length': String(51 * 1024 * 1024) },
          }),
      },
    });
    const response = await handler(post(body()), deps);
    expect(await errorOf(response)).toBe('video_too_large');
    expect(deps.client.uploads).toEqual([]);
  });

  it('AC-003: the bucket refusing the size (413) is video_too_large too', async () => {
    const deps = setup({
      storage: (op) =>
        op === 'upload' ? { error: { message: 'too big', status: 413 } } : { error: null },
    });
    const response = await handler(post(body()), deps);
    expect(await errorOf(response)).toBe('video_too_large');
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('AC-004: a link to another site, or one the recipe does not have, is refused before any fetch', async () => {
    for (const url of ['https://www.chefkoch.de/rezepte/1', 'https://vm.tiktok.com/other/']) {
      const deps = setup();
      const response = await handler(post(body({ url })), deps);
      expect(response.status).toBe(422);
      expect(await errorOf(response)).toBe('not_a_tiktok_link');
      expect(deps.fetchMock).not.toHaveBeenCalled();
      expect(deps.client.uploads).toEqual([]);
    }
  });

  it('AC-005: a household the caller is no member of is forbidden (403), no file', async () => {
    const deps = setup();
    const response = await handler(
      post(body({ householdId: 'ffffffff-0000-4000-8000-00000000000f' })),
      deps,
    );
    expect(response.status).toBe(403);
    expect(deps.fetchMock).not.toHaveBeenCalled();
    expect(deps.client.uploads).toEqual([]);
  });

  it('AC-005: a recipe the caller cannot see is forbidden, no file', async () => {
    const deps = setup({ recipe: pasta({ id: 'dddddddd-0000-4000-8000-000000000004' }) });
    const response = await handler(post(body()), deps);
    expect(response.status).toBe(403);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-005: signed out (anon key or no JWT) is 401, no file', async () => {
    for (const jwt of [ANON_JWT, null]) {
      const deps = setup();
      const response = await handler(post(body(), { jwt }), deps);
      expect(response.status).toBe(401);
      expect(deps.fetchMock).not.toHaveBeenCalled();
      expect(deps.client.uploads).toEqual([]);
    }
  });

  it('a recipe with a video already is video_exists (409); a collection gets none (forbidden)', async () => {
    const withVideo = setup({
      recipe: pasta({ video_path: `${HOUSEHOLD_ID}/recipes/${RECIPE_ID}/x.mp4` }),
    });
    const response = await handler(post(body()), withVideo);
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toBe('video_exists');
    const collection = setup({ recipe: pasta({ kind: 'collection' }) });
    expect(await errorOf(await handler(post(body()), collection))).toBe('forbidden');
    expect(withVideo.fetchMock).not.toHaveBeenCalled();
    expect(collection.fetchMock).not.toHaveBeenCalled();
  });

  it('Risiken: when apply_changes refuses, the uploaded file is removed again (no orphan)', async () => {
    const deps = setup({
      rpc: () => ({ data: null, error: { message: 'row_not_found', code: 'P0002' } }),
    });
    const response = await handler(post(body()), deps);
    expect(response.status).toBe(500);
    const uploaded = deps.client.uploads[0]?.path;
    expect(deps.client.removes).toEqual([{ bucket: 'household-videos', paths: [uploaded] }]);
  });

  it('a failed upload is internal (500) and sets nothing', async () => {
    const deps = setup({
      storage: (op) =>
        op === 'upload' ? { error: { message: 'denied', status: 403 } } : { error: null },
    });
    const response = await handler(post(body()), deps);
    expect(response.status).toBe(500);
    expect(deps.client.rpcCalls).toEqual([]);
  });
});
