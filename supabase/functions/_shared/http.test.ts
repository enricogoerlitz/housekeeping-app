import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { MAX_BODY_BYTES, handleRequest, type Endpoint } from './http.ts';
import { ANON_JWT, fakeClient, fakeDeps, post } from './test-fakes.ts';

const echo: Endpoint<{ message: string }> = {
  schema: z.strictObject({ message: z.string().max(2000) }),
  quota: 'request',
  run: async ({ input, userId }) => ({ echo: input.message, userId }),
};

async function json(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

describe('authentication', () => {
  it('AC-005: no Authorization header gives 401 unauthorized and does nothing else', async () => {
    const deps = fakeDeps();
    const response = await handleRequest(post({ message: 'Hallo' }, { jwt: null }), deps, echo);
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: 'unauthorized' });
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('AC-005: the anon key (a JWT with role anon) gives 401', async () => {
    const deps = fakeDeps();
    const response = await handleRequest(post({ message: 'Hallo' }, { jwt: ANON_JWT }), deps, echo);
    expect(response.status).toBe(401);
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('AC-005: an unverifiable JWT, a non-Bearer header and an anonymous user give 401', async () => {
    const anonymous = 'eyJ.anonymous.user';
    const deps = fakeDeps({
      client: fakeClient({
        claims: { [anonymous]: { role: 'authenticated', sub: 'u2', is_anonymous: true } },
      }),
    });
    for (const jwt of ['not.a.valid-jwt', anonymous]) {
      const response = await handleRequest(post({ message: 'x' }, { jwt }), deps, echo);
      expect(response.status).toBe(401);
    }
    const basic = new Request('http://localhost/f', {
      method: 'POST',
      headers: { authorization: 'Basic abc' },
      body: '{}',
    });
    expect((await handleRequest(basic, deps, echo)).status).toBe(401);
  });

  it('passes the verified user id to the endpoint', async () => {
    const response = await handleRequest(post({ message: 'Hallo' }), fakeDeps(), echo);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      echo: 'Hallo',
      userId: '11111111-1111-4111-8111-111111111111',
    });
  });
});

describe('CORS', () => {
  it('answers a preflight from an allowed origin with that origin only', async () => {
    const response = await handleRequest(
      post(undefined, { method: 'OPTIONS', origin: 'http://localhost:8081', jwt: null }),
      fakeDeps(),
      echo,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(response.headers.get('access-control-allow-headers')).toMatch(/authorization/);
  });

  it('refuses a preflight and a request from any other origin', async () => {
    const deps = fakeDeps();
    for (const method of ['OPTIONS', 'POST']) {
      const response = await handleRequest(
        post({ message: 'x' }, { method, origin: 'https://evil.example' }),
        deps,
        echo,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('adds the CORS header to replies and errors for an allowed origin', async () => {
    const ok = await handleRequest(
      post({ message: 'x' }, { origin: 'https://app.example.test' }),
      fakeDeps(),
      echo,
    );
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.test');
    const denied = await handleRequest(
      post({ message: 'x' }, { origin: 'https://app.example.test', jwt: null }),
      fakeDeps(),
      echo,
    );
    expect(denied.status).toBe(401);
    expect(denied.headers.get('access-control-allow-origin')).toBe('https://app.example.test');
  });

  it('fails loudly when ALLOWED_ORIGINS is not configured', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = fakeDeps({ env: { ALLOWED_ORIGINS: '' } });
    const response = await handleRequest(post({ message: 'x' }), deps, echo);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ error: 'internal' });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('request body', () => {
  it('rejects a body over 64 KB before parsing it, without charging the quota', async () => {
    const deps = fakeDeps();
    const big = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES) });
    const response = await handleRequest(post(undefined, { raw: big }), deps, echo);
    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: 'payload_too_large' });
    expect(deps.client.rpcCalls).toEqual([]);
  });

  it('an endpoint may take a larger body (spec 0040: 6 MB with photos), and no more', async () => {
    const roomy = {
      ...echo,
      schema: z.strictObject({ message: z.string() }),
      maxBodyBytes: 200_000,
    };
    const fits = JSON.stringify({ message: 'x'.repeat(150_000) });
    expect((await handleRequest(post(undefined, { raw: fits }), fakeDeps(), roomy)).status).toBe(
      200,
    );
    const over = JSON.stringify({ message: 'x'.repeat(200_000) });
    const response = await handleRequest(post(undefined, { raw: over }), fakeDeps(), roomy);
    expect(response.status).toBe(413);
  });

  it('rejects invalid JSON, fields outside the contract and other methods', async () => {
    const deps = fakeDeps();
    for (const request of [
      post(undefined, { raw: '{"message":' }),
      post({ message: 'x', model: 'gpt-anything' }),
      post({ message: 'x'.repeat(2001) }),
      post(undefined, { method: 'GET' }),
    ]) {
      const response = await handleRequest(request, deps, echo);
      expect(response.status).toBe(400);
    }
    expect(deps.client.rpcCalls).toEqual([]);
  });
});

describe('quota', () => {
  it('charges one request with the caller’s own client before running the endpoint', async () => {
    const deps = fakeDeps();
    await handleRequest(post({ message: 'x' }), deps, echo);
    expect(deps.client.rpcCalls).toEqual([
      { fn: 'consume_ai_quota', args: { kind: 'request', amount: 1 } },
    ]);
  });

  it.each([
    ['false', { data: false, error: null }],
    ['{ allowed: false }', { data: { allowed: false }, error: null }],
    ['a quota_exceeded error', { data: null, error: { message: 'quota_exceeded', code: 'P0001' } }],
  ])('AC-030: %s gives 429 quota_exceeded and the endpoint never runs', async (_, result) => {
    const run = vi.fn();
    const deps = fakeDeps({ client: fakeClient({ rpc: () => result }) });
    const response = await handleRequest(post({ message: 'x' }), deps, { ...echo, run });
    expect(response.status).toBe(429);
    expect(await json(response)).toEqual({ error: 'quota_exceeded' });
    expect(run).not.toHaveBeenCalled();
  });

  it('fails closed when the quota check itself fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn();
    const deps = fakeDeps({
      client: fakeClient({ rpc: () => ({ data: null, error: { message: 'boom' } }) }),
    });
    const response = await handleRequest(post({ message: 'x' }), deps, { ...echo, run });
    expect(response.status).toBe(500);
    expect(run).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('accepts { allowed: true } as well as true', async () => {
    const deps = fakeDeps({
      client: fakeClient({ rpc: () => ({ data: { allowed: true }, error: null }) }),
    });
    expect((await handleRequest(post({ message: 'x' }), deps, echo)).status).toBe(200);
  });
});
