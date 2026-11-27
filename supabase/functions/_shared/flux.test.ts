import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from './errors.ts';
import { callFlux } from './flux.ts';
import { fakeDeps } from './test-fakes.ts';

const ENV = { FOUNDRY_IMAGE_DEPLOYMENT: 'FLUX.2-pro' };
const fluxReply = (b64 = '/9j/4AAQSkZJRg==') =>
  new Response(JSON.stringify({ data: [{ b64_json: b64 }], request_meta: { cost: 3 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function expectUnavailable(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpError);
  await expect(promise).rejects.toMatchObject({ code: 'ai_unavailable' });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('callFlux (ADR-0016: FLUX.2-pro over the BFL path of Foundry)', () => {
  it('AC-012: posts the prompt to the BFL path of the resource with the api-key header', async () => {
    const deps = fakeDeps({ env: ENV, fetch: async () => fluxReply() });
    await expect(callFlux(deps, { prompt: 'Apfelkuchen' })).resolves.toBe('/9j/4AAQSkZJRg==');
    const [url, init] = deps.fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://foundry.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview',
    );
    expect(new Headers(init?.headers).get('api-key')).toBe('test-foundry-key-SECRET');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'FLUX.2-pro',
      prompt: 'Apfelkuchen',
      width: 1024,
      height: 1024,
      output_format: 'jpeg',
    });
  });

  it('AC-015: an edit sends the photo as input_image', async () => {
    const deps = fakeDeps({ env: ENV, fetch: async () => fluxReply() });
    await callFlux(deps, { prompt: 'Text entfernen', image: '/9j/AAAA' });
    const body = JSON.parse(String(deps.fetchMock.mock.calls[0]?.[1]?.body)) as {
      input_image?: string;
    };
    expect(body.input_image).toBe('/9j/AAAA');
  });

  it('Entscheidung 4: one more try on 429/5xx, then ai_unavailable', async () => {
    let calls = 0;
    const deps = fakeDeps({
      env: ENV,
      fetch: async () => {
        calls += 1;
        return calls === 1 ? new Response('busy', { status: 429 }) : fluxReply();
      },
    });
    const ok = callFlux(deps, { prompt: 'x' });
    await vi.runAllTimersAsync();
    await expect(ok).resolves.toBe('/9j/4AAQSkZJRg==');
    const down = fakeDeps({ env: ENV, fetch: async () => new Response('down', { status: 503 }) });
    const failed = expectUnavailable(callFlux(down, { prompt: 'x' }));
    await vi.runAllTimersAsync();
    await failed;
    expect(down.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Entscheidung 4: a hanging image call gives up after 45 s', async () => {
    const deps = fakeDeps({
      env: ENV,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    });
    const start = Date.now();
    const settled = expectUnavailable(callFlux(deps, { prompt: 'x' }));
    await vi.runAllTimersAsync();
    await settled;
    expect(Date.now() - start).toBe(45_000);
  });

  it('a refusal, an answer without an image or no JSON is ai_unavailable; no key and no prompt is logged', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const reply of [
      new Response('{"error":"content policy"}', { status: 400 }),
      new Response('{"data":[]}', { status: 200 }),
      new Response('{"data":[{"b64_json":"<html>"}]}', { status: 200 }),
      new Response('<html>', { status: 200 }),
    ]) {
      const deps = fakeDeps({ env: ENV, fetch: async () => reply });
      await expectUnavailable(callFlux(deps, { prompt: 'Geheimes Familienrezept' }));
    }
    const logged = JSON.stringify(errors.mock.calls);
    for (const secret of ['test-foundry-key-SECRET', 'Geheimes', '<html>'])
      expect(logged).not.toContain(secret);
  });

  it('Entscheidung 9 (0040): a rejection logs its status and the error code and message of the reply, short', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reject = async (body: string) => {
      const deps = fakeDeps({ env: ENV, fetch: async () => new Response(body, { status: 400 }) });
      await expectUnavailable(callFlux(deps, { prompt: 'Lasagne Bolognese', image: '/9j/AAAA' }));
      return errors.mock.calls.at(-1);
    };
    expect(
      await reject(
        JSON.stringify({
          error: { code: 'content_filter', message: 'The request was filtered.', inner: 'x' },
        }),
      ),
    ).toEqual([
      'flux_rejected',
      { status: 400, code: 'content_filter', message: 'The request was filtered.' },
    ]);
    // Black Forest Labs answers with "detail"; a bare string error counts as the message.
    expect(await reject(JSON.stringify({ detail: 'Invalid input_image' }))).toEqual([
      'flux_rejected',
      { status: 400, message: 'Invalid input_image' },
    ]);
    expect(await reject(JSON.stringify({ error: 'content policy' }))).toEqual([
      'flux_rejected',
      { status: 400, message: 'content policy' },
    ]);
    // At most 200 characters, on one line.
    const long = await reject(JSON.stringify({ error: { message: `a\n${'b'.repeat(500)}` } }));
    expect((long?.[1] as { message: string }).message).toBe(`a ${'b'.repeat(198)}`);
    // Never the prompt, the photo or the key, even when the reply repeats them; no JSON: status only.
    for (const echo of [
      'Prompt "Lasagne Bolognese" rejected',
      'bad image /9j/AAAA',
      'key test-foundry-key-SECRET invalid',
    ])
      expect(await reject(JSON.stringify({ error: { code: 'bad', message: echo } }))).toEqual([
        'flux_rejected',
        { status: 400, code: 'bad' },
      ]);
    expect(await reject('<html>Bad Request</html>')).toEqual(['flux_rejected', { status: 400 }]);
    expect(await reject(JSON.stringify({ error: { code: 'x'.repeat(80) } }))).toEqual([
      'flux_rejected',
      { status: 400 },
    ]);
  });

  it('a missing FOUNDRY_IMAGE_DEPLOYMENT fails loudly before any call', async () => {
    const deps = fakeDeps({ fetch: async () => fluxReply() });
    await expect(callFlux(deps, { prompt: 'x' })).rejects.toThrow(/FOUNDRY_IMAGE_DEPLOYMENT/);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});
