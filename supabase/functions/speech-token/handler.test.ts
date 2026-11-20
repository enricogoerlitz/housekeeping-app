import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpeechTokenReplySchema } from '../_shared/contract.gen.ts';
import { ANON_JWT, fakeClient, fakeDeps, post } from '../_shared/test-fakes.ts';
import { handler } from './handler.ts';

const STS_URL = 'https://westeurope.api.cognitive.microsoft.com/sts/v1.0/issueToken';

afterEach(() => vi.restoreAllMocks());

describe('speech-token', () => {
  it('AC-028: exchanges the Foundry key for a short-lived token; the key is never in the reply', async () => {
    const deps = fakeDeps({
      fetch: async () => new Response('short-lived-token', { status: 200 }),
    });
    const response = await handler(post({}), deps);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('test-foundry-key-SECRET');
    expect(SpeechTokenReplySchema.parse(JSON.parse(text))).toEqual({
      token: 'short-lived-token',
      region: 'westeurope',
      expiresAt: '2026-11-20T09:39:00.000Z',
      language: 'de-DE',
    });
    const [url, init] = deps.fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(STS_URL);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('ocp-apim-subscription-key')).toBe(
      'test-foundry-key-SECRET',
    );
  });

  it('passes the configured speech model on, and charges the speech quota', async () => {
    const deps = fakeDeps({
      fetch: async () => new Response('t', { status: 200 }),
      env: { FOUNDRY_STT_MODEL: 'mai-transcribe-2-streaming' },
    });
    const response = await handler(post(undefined, { raw: '' }), deps);
    expect(await response.json()).toMatchObject({ model: 'mai-transcribe-2-streaming' });
    expect(deps.client.rpcCalls).toEqual([
      { fn: 'consume_ai_quota', args: { kind: 'speech', amount: 1 } },
    ]);
  });

  it('AC-005: the anon key gets 401 and no token is issued', async () => {
    const deps = fakeDeps();
    const response = await handler(post({}, { jwt: ANON_JWT }), deps);
    expect(response.status).toBe(401);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-030: an exhausted speech quota gives 429 without asking Azure', async () => {
    const deps = fakeDeps({ client: fakeClient({ rpc: () => ({ data: false, error: null }) }) });
    const response = await handler(post({}), deps);
    expect(response.status).toBe(429);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-029: Azure refusing the key gives 503 ai_unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps({ fetch: async () => new Response('denied', { status: 401 }) });
    const response = await handler(post({}), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ai_unavailable' });
  });

  it('rejects a region that could redirect the key to another host', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps({ env: { FOUNDRY_SPEECH_REGION: 'evil.example/x?' } });
    const response = await handler(post({}), deps);
    expect(response.status).toBe(500);
    expect(deps.fetchMock).not.toHaveBeenCalled();
  });
});
