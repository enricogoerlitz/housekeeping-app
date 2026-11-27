import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANON_JWT, fakeClient, fakeDeps, foundryReply, post } from '../_shared/test-fakes.ts';
import { HOUSEHOLD_ID, householdTables } from '../_shared/test-household.ts';
import { handler } from './handler.ts';

const FLUX =
  'https://foundry.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview';
const ENV = { FOUNDRY_IMAGE_DEPLOYMENT: 'FLUX.2-pro' };
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const SCENE = 'A woman bouldering in a modern indoor climbing gym, colourful holds, crash mats.';
const SHOTS = [
  'Wide view from floor level, soft indoor light.',
  'Side view at medium distance, warm light.',
  'Close view from below, directional light.',
];
const ANSWER = { scene: SCENE, shots: SHOTS };

const fluxReply = (b64: string) =>
  new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const RESPONSES = 'https://foundry.example.test/openai/v1/responses';

/** Without `llm` the language model fails, so the direct prompt of spec 0040 is used. */
function setup(
  replies: (() => Response)[] = [() => fluxReply('/9j/AAA1')],
  llm: () => Response | Promise<Response> = () => new Response('down', { status: 503 }),
) {
  let call = 0;
  const deps = fakeDeps({
    env: ENV,
    client: fakeClient({ tables: householdTables() }),
    fetch: async (input) => {
      if (String(input) === RESPONSES) return llm();
      if (String(input) !== FLUX) throw new TypeError(`unexpected fetch ${String(input)}`);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      if (!reply) throw new TypeError('no reply');
      return reply();
    },
  });
  const callsTo = (url: string) =>
    deps.fetchMock.mock.calls.filter(([input]) => String(input) === url);
  const bodies = () =>
    callsTo(FLUX).map(
      ([, init]) => JSON.parse(String(init?.body)) as { prompt: string; input_image?: string },
    );
  const llmBodies = () =>
    callsTo(RESPONSES).map(([, init]) => JSON.parse(String(init?.body)) as LlmBody);
  return { deps, bodies, llmBodies };
}

interface LlmBody {
  instructions: string;
  input: { role: string; content: { type: string; text?: string; image_url?: string }[] }[];
  max_output_tokens: number;
  reasoning?: unknown;
  text: { format: { name: string } };
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
    expect(bodies()).toHaveLength(3);
    expect(deps.client.rpcCalls).toEqual([]);
    const [first] = bodies();
    expect(first?.prompt).toContain('Apfelkuchen');
    expect(first?.prompt).toMatch(/rustic wooden table/i);
    expect(first?.prompt).toMatch(/directly above/);
    expect(first?.prompt).toMatch(/no text/);
    expect(first?.input_image).toBeUndefined();
  });

  it('spec 0067, REQ-011: "Mach ein Foto dazu" asks for exactly one image, one FLUX call', async () => {
    const { deps, bodies } = setup([() => fluxReply('/9j/AAA1')]);
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, prompt: 'Linsen-Dal', count: 1 }),
      deps,
    );
    expect(await json(response)).toEqual({ images: ['/9j/AAA1'], failed: 0 });
    expect(bodies()).toHaveLength(1);
    const invalid = await handler(post({ householdId: HOUSEHOLD_ID, prompt: 'x', count: 4 }), deps);
    expect(invalid.status).toBe(400);
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

  /** The second image hangs; the language model answers after `llmMs` with three prompts. */
  async function hangingVariant(llmMs: number | undefined) {
    vi.useFakeTimers();
    let call = 0;
    const deps = fakeDeps({
      env: ENV,
      client: fakeClient({ tables: householdTables() }),
      fetch: (input, init) => {
        if (String(input) === RESPONSES) {
          if (llmMs === undefined) return Promise.resolve(new Response('down', { status: 503 }));
          return new Promise((resolve) => setTimeout(() => resolve(foundryReply(ANSWER)), llmMs));
        }
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
    expect(settled).toBe(true);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ images: ['/9j/AAA1', '/9j/AAA3'], failed: 1 });
  }

  it('AC-012, AC-014: a variant that hangs does not hold back the others beyond 30 s', async () => {
    await hangingVariant(undefined);
  });

  it('AC-007: the 30 s count from the request, the enhancement included', async () => {
    await hangingVariant(4_000);
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

  it('AC-010: over 6 MB is 413; an empty prompt, a PNG, an unknown style or kind, a long extra is 400', async () => {
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
      { householdId: HOUSEHOLD_ID, prompt: 'x', context: { kind: 'hotel', title: 'Adlon' } },
      { householdId: HOUSEHOLD_ID, prompt: 'x', extra: 'e'.repeat(301) },
    ]) {
      expect((await handler(post(body), deps)).status).toBe(400);
    }
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});

describe('ai-image: one enhancement for three images (spec 0052, REQ-001)', () => {
  const flux = [
    () => fluxReply('/9j/AAA1'),
    () => fluxReply('/9j/AAA2'),
    () => fluxReply('/9j/AAA3'),
  ];

  it('AC-001: one call to the language model, three images each with its own prompt', async () => {
    const { deps, bodies, llmBodies } = setup(flux, () => foundryReply(ANSWER));
    const response = await handler(
      post({
        householdId: HOUSEHOLD_ID,
        prompt: 'Frau in Boulderhalle',
        context: { kind: 'activity', title: 'Bertablock', category: 'Bouldern' },
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      images: ['/9j/AAA1', '/9j/AAA2', '/9j/AAA3'],
      failed: 0,
    });
    const [llm, ...more] = llmBodies();
    expect(more).toEqual([]);
    expect(llm?.text.format.name).toBe('image_prompts');
    expect(llm?.max_output_tokens).toBeLessThanOrEqual(1000);
    expect(llm?.reasoning).toEqual({ effort: 'none' });
    expect(llm?.input[0]?.content[0]?.text).toContain('Frau in Boulderhalle');
    expect(llm?.input[0]?.content[0]?.text).toContain('Bertablock');
    expect(bodies().map((body) => body.prompt)).toEqual(
      SHOTS.map((shot) => `${SCENE} ${shot} No text, letters, logos or watermarks.`),
    );
  });

  it('AC-004: "Aus diesem Foto": every image starts from the photo, the language model gets none', async () => {
    const { deps, bodies, llmBodies } = setup(flux, () => foundryReply(ANSWER));
    const response = await handler(
      post({ householdId: HOUSEHOLD_ID, prompt: 'Text entfernen', image: PHOTO }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(llmBodies()).toHaveLength(1);
    expect(JSON.stringify(llmBodies()[0]?.input)).not.toContain('base64');
    expect(bodies()).toHaveLength(3);
    for (const body of bodies()) expect(body.input_image).toBe('/9j/4AAQSkZJRgABAQ==');
  });
});

describe('ai-image: never worse than before (spec 0052, REQ-002)', () => {
  it('AC-005: the language model fails: three images from the direct prompt, no error', async () => {
    const { deps, bodies, llmBodies } = setup(undefined, () => new Response('x', { status: 500 }));
    const response = await handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Pasta' }), deps);
    expect(response.status).toBe(200);
    expect(llmBodies()).toHaveLength(1);
    expect(bodies()).toHaveLength(3);
    for (const body of bodies()) expect(body.prompt).toContain('Subject: Pasta.');
  });

  it('AC-005: an answer without three shots counts as failed', async () => {
    const { deps, bodies } = setup(undefined, () =>
      foundryReply({ scene: SCENE, shots: SHOTS.slice(0, 2) }),
    );
    const response = await handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Pasta' }), deps);
    expect(response.status).toBe(200);
    for (const body of bodies()) expect(body.prompt).toContain('Subject: Pasta.');
  });

  it('AC-006: after 6 s the language model is dropped and the direct prompt is used', async () => {
    vi.useFakeTimers();
    const { deps, bodies } = setup();
    // The language model never answers; only the abort at the deadline ends its call.
    deps.fetchMock.mockImplementation((input, init) => {
      if (String(input) === RESPONSES)
        return new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      return Promise.resolve(fluxReply('/9j/AAA1'));
    });
    const pending = handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Pasta' }), deps);
    await vi.advanceTimersByTimeAsync(5_900);
    expect(bodies()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(bodies()).toHaveLength(3);
    for (const body of bodies()) expect(body.prompt).toContain('Subject: Pasta.');
  });

  it('AC-012: the extra ends the wish in the direct prompt', async () => {
    const { deps, bodies } = setup();
    await handler(
      post({
        householdId: HOUSEHOLD_ID,
        prompt: 'spaghetti with meatballs',
        extra: 'heller und mit Basilikum',
      }),
      deps,
    );
    expect(bodies()[0]?.prompt).toContain('spaghetti with meatballs. heller und mit Basilikum.');
  });

  it('signed out or foreign household: the language model is not called either', async () => {
    const { deps, llmBodies } = setup(undefined, () => foundryReply(ANSWER));
    await handler(post({ householdId: HOUSEHOLD_ID, prompt: 'Kuchen' }, { jwt: null }), deps);
    await handler(
      post({ householdId: 'bbbbbbbb-0000-4000-8000-000000000002', prompt: 'Kuchen' }),
      deps,
    );
    expect(llmBodies()).toEqual([]);
  });
});
