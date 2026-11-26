import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { HttpError } from './errors.ts';
import { callFoundry } from './foundry.ts';
import { fakeDeps, foundryReply } from './test-fakes.ts';

const Answer = z.strictObject({ text: z.string().min(1), hint: z.string().optional() });
const request = {
  name: 'answer',
  schema: Answer,
  instructions: 'Antworte kurz.',
  input: [{ role: 'user' as const, content: 'Was koche ich heute?' }],
  maxOutputTokens: 200,
};

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

describe('callFoundry', () => {
  it('posts a strict json_schema request with the api-key header, like the probe', async () => {
    const deps = fakeDeps({ fetch: async () => foundryReply({ text: 'Curry', hint: null }) });
    await expect(callFoundry(deps, request)).resolves.toEqual({ text: 'Curry' });
    const [url, init] = deps.fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://foundry.example.test/openai/v1/responses');
    expect(new Headers(init?.headers).get('api-key')).toBe('test-foundry-key-SECRET');
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      max_output_tokens: number;
      text: { format: { type: string; name: string; strict: boolean; schema: unknown } };
    };
    expect(body.model).toBe('test-llm');
    expect(body.max_output_tokens).toBe(200);
    expect(body.text.format).toMatchObject({ type: 'json_schema', name: 'answer', strict: true });
  });

  it('reads output_text when the API sends it directly', async () => {
    const deps = fakeDeps({ fetch: async () => foundryReply({ text: 'A' }, 'output_text') });
    await expect(callFoundry(deps, request)).resolves.toEqual({ text: 'A' });
  });

  it('retries network errors, 5xx and 429 with backoff, at most 3 attempts', async () => {
    let calls = 0;
    const deps = fakeDeps({
      fetch: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('ECONNRESET');
        if (calls === 2) return new Response('busy', { status: 429 });
        return foundryReply({ text: 'ok' });
      },
    });
    const promise = callFoundry(deps, request);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ text: 'ok' });
    expect(deps.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('AC-029: gives up after 3 failed attempts with ai_unavailable', async () => {
    const deps = fakeDeps({ fetch: async () => new Response('down', { status: 503 }) });
    const promise = callFoundry(deps, request);
    const settled = expectUnavailable(promise);
    await vi.runAllTimersAsync();
    await settled;
    expect(deps.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('AC-029: a hanging Foundry is aborted; all attempts together stay within 20 s', async () => {
    const deps = fakeDeps({
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    });
    const start = Date.now();
    const promise = callFoundry(deps, request);
    const settled = expectUnavailable(promise);
    await vi.runAllTimersAsync();
    await settled;
    expect(Date.now() - start).toBeLessThanOrEqual(20_000);
  });

  it('does not retry a 4xx other than 429', async () => {
    const deps = fakeDeps({ fetch: async () => new Response('bad', { status: 400 }) });
    await expectUnavailable(callFoundry(deps, request));
    expect(deps.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AC-029: model output that breaks the schema or is no JSON gives ai_unavailable', async () => {
    for (const reply of [
      foundryReply({ text: '' }),
      foundryReply({ nope: 1 }),
      new Response(JSON.stringify({ output_text: '{"text": "abgeschnitt' }), { status: 200 }),
      new Response('<html>', { status: 200 }),
    ]) {
      const deps = fakeDeps({ fetch: async () => reply });
      await expectUnavailable(callFoundry(deps, request));
    }
  });

  it('spec 0040: sends text and image parts (input_image as data URL) as they are', async () => {
    const deps = fakeDeps({ fetch: async () => foundryReply({ text: 'Linsensuppe' }) });
    const content = [
      { type: 'input_text' as const, text: 'Was ist das?' },
      { type: 'input_image' as const, image_url: 'data:image/jpeg;base64,/9j/4AAQ' },
    ];
    await callFoundry(deps, { ...request, input: [{ role: 'user', content }] });
    const body = JSON.parse(String(deps.fetchMock.mock.calls[0]?.[1]?.body)) as {
      input: unknown;
    };
    expect(body.input).toEqual([{ role: 'user', content }]);
  });

  it('spec 0040: attempts and time budget can be set per call (2 attempts, 60 s)', async () => {
    const deps = fakeDeps({
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    });
    const start = Date.now();
    const promise = callFoundry(deps, { ...request, attempts: 2, budgetMs: 60_000 });
    const settled = expectUnavailable(promise);
    await vi.runAllTimersAsync();
    await settled;
    // One attempt waits the whole budget; a second one has no time left.
    expect(Date.now() - start).toBe(60_000);
    expect(deps.fetchMock).toHaveBeenCalledTimes(1);

    let calls = 0;
    const flaky = fakeDeps({
      fetch: async () => {
        calls += 1;
        return new Response('busy', { status: 503 });
      },
    });
    const twice = callFoundry(flaky, { ...request, attempts: 2, budgetMs: 60_000 });
    const failed = expectUnavailable(twice);
    await vi.runAllTimersAsync();
    await failed;
    expect(calls).toBe(2);
  });

  it('never logs the key, the prompt or the model output', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps({ fetch: async () => foundryReply({ nope: 'Geheimrezept' }) });
    await expectUnavailable(callFoundry(deps, request));
    const logged = JSON.stringify(errors.mock.calls);
    for (const secret of ['test-foundry-key-SECRET', 'Was koche ich', 'Geheimrezept'])
      expect(logged).not.toContain(secret);
  });
});
