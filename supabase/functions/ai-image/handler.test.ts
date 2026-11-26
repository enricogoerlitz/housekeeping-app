import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANON_JWT, fakeClient, fakeDeps, post } from '../_shared/test-fakes.ts';
import { HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

const FLUX =
  'https://foundry.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview';
const ENV = { FOUNDRY_IMAGE_DEPLOYMENT: 'FLUX.2-pro' };
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

const fluxReply = (b64: string) =>
  new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function setup(replies: (() => Response)[] = [() => fluxReply('/9j/AAA1')]) {
  let call = 0;
  const deps = fakeDeps({
    env: ENV,
    client: fakeClient({ tables: householdTables() }),
    fetch: async (input) => {
      if (String(input) !== FLUX) throw new TypeError(`unexpected fetch ${String(input)}`);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new TypeError('no reply');
      return reply();
    },
  });
  const bodies = () =>
    deps.fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)) as { prompt: string; input_image?: string },
    );
  return { deps, bodies };
}

async function json(response: Response): Promise<{ [key: string]: unknown }> {
  return (await response.json()) as { [key: string]: unknown };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ai-image (spec 0040, REQ-004)', () => {
  it('AC-012: three variants in one answer; nothing is stored or written', async () => {
    const { deps, bodies } = setup([
      () => fluxReply('/9j/AAA1'),
      () => fluxReply('/9j/AAA2'),
      () => fluxReply('/9j/AAA3'),
    ]);
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, prompt: 'Apfelkuchen', styles: ['rustic', 'top'] }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      images: ['/9j/AAA1', '/9j/AAA2', '/9j/AAA3'],
      failed: 0,
    });
    expect(deps.fetchMock).toHaveBeenCalledTimes(3);
    expect(deps.client.rpcCalls).toEqual([]);
    const [first] = bodies();
    expect(first?.prompt).toContain('Apfelkuchen');
    expect(first?.prompt).toMatch(/rustic wooden table/i);
    expect(first?.prompt).toMatch(/directly above/);
    expect(first?.prompt).toMatch(/no text/);
    expect(first?.input_image).toBeUndefined();
  });

  it('AC-014: two of three succeed: the two and how many failed', async () => {
    const { deps } = setup([
      () => fluxReply('/9j/AAA1'),
      () => new Response('{"error":"policy"}', { status: 400 }),
      () => fluxReply('/9j/AAA3'),
    ]);
    const response = await handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Pasta' }), deps);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.failed).toBe(1);
    expect(body.images).toHaveLength(2);
  });

  it('AC-012, AC-014: a variant that hangs does not hold back the others beyond 30 s', async () => {
    vi.useFakeTimers();
    let call = 0;
    const deps = fakeDeps({
      env: ENV,
      client: fakeClient({ tables: householdTables() }),
      fetch: (_input, init) => {
        call += 1;
        if (call !== 2) return Promise.resolve(fluxReply(`/9j/AAA${call}`));
        return new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      },
    });
    let settled = false;
    const pending = handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Pasta' }), deps).finally(
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(29_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ images: ['/9j/AAA1', '/9j/AAA3'], failed: 1 });
  });

  it('AC-014: when every variant fails it is 503 ai_unavailable', async () => {
    const { deps } = setup([() => new Response('bad', { status: 400 })]);
    const response = await handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Pasta' }), deps);
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: 'ai_unavailable' });
  });
});

describe('ai-image from a photo (REQ-005)', () => {
  it('AC-015: the photo goes as input_image without its data: prefix, with the instruction', async () => {
    const { deps, bodies } = setup();
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, prompt: 'Text entfernen', image: PHOTO }),
      deps,
    );
    expect(response.status).toBe(200);
    for (const body of bodies()) {
      expect(body.input_image).toBe('/9j/4AAQSkZJRgABAQ==');
      expect(body.prompt).toMatch(/same/i);
      expect(body.prompt).toMatch(/remove any text/i);
      expect(body.prompt).toContain('Text entfernen');
    }
  });
});

describe('ai-image: who may call it', () => {
  it('signed out gets 401 and no image is made', async () => {
    const { deps } = setup();
    for (const jwt of [null, ANON_JWT]) {
      const response = await handler(
        post({ householdId: HOUSEHOLD_ID, prompt: 'Kuchen' }, { jwt }),
        deps,
      );
      expect(response.status).toBe(401);
    }
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('a foreign household gets 403 and no image is made', async () => {
    const { deps } = setup();
    const response = await handler(
      post({ householdId: 'bbbbbbbb-0000-4000-8000-000000000002', prompt: 'Kuchen' }),
      deps,
    );
    expect(response.status).toBe(403);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('over 6 MB is 413; an empty prompt, a PNG or an unknown style is 400', async () => {
    const { deps } = setup();
    const big = JSON.stringify({
      householdId: HOUSEHOLD_ID,
      prompt: 'x',
      image: `data:image/jpeg;base64,${'A'.repeat(6 * 1024 * 1024)}`,
    });
    expect((await handler(post(undefined, { raw: big }), deps)).status).toBe(413);
    for (const body of [
      { householdId: HOUSEHOLD_ID, prompt: ' ' },
      { householdId: HOUSEHOLD_ID, prompt: 'x', image: 'data:image/png;base64,iVBORw0KGgo=' },
      { householdId: HOUSEHOLD_ID, prompt: 'x', styles: ['neon'] },
    ]) {
      expect((await handler(post(body), deps)).status).toBe(400);
    }
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});
