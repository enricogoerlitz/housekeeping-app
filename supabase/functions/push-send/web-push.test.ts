import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigError } from '../_shared/errors.ts';
import {
  PUSH_SUCCESS_STATUS,
  createWebPushSender,
  fromBase64Url,
  guardFetch,
  toBase64Url,
  type PushTarget,
} from './web-push.ts';

// The library (jsr:@negrel/webpush) does the cryptography. These tests pin its output against the
// published test vectors: RFC 8291 Appendix A (encryption) and RFC 8292 section 2.4 (VAPID JWT).

const RFC8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

const RFC8292 = {
  token:
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA',
  key: 'BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs',
};

const SUBJECT = 'https://housekeeping.test';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-subscription';
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;

/** A VAPID key pair made for this test run only, in the env format (base64url raw / d). */
async function testVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: toBase64Url(raw), privateKey: jwk.d ?? '' };
}

/** A user agent subscription with keys made in the test. */
async function testSubscriber(): Promise<PushTarget['keys']> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    p256dh: toBase64Url(raw),
    auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

/** Verifies an ES256 JWT with an uncompressed P-256 public key (independent of the library). */
async function verifyJwt(token: string, publicKey: string): Promise<boolean> {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return false;
  const key = await crypto.subtle.importKey('raw', fromBase64Url(publicKey), ECDSA, false, [
    'verify',
  ]);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    fromBase64Url(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

function decodeJwtPart(part: string | undefined): { [claim: string]: unknown } {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(part ?? ''))) as {
    [claim: string]: unknown;
  };
}

type Captured = { url: string; init: RequestInit };

/** Replaces the global fetch the library uses; answers with `status` or throws `error`. */
function captureFetch(answer: { status?: number; error?: Error } = {}): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      if (answer.error) throw answer.error;
      return new Response(null, { status: answer.status ?? 201 });
    }),
  );
  return calls;
}

function target(keys: PushTarget['keys'], overrides: Partial<PushTarget> = {}): PushTarget {
  return { endpoint: ENDPOINT, keys, ttl: 3600, urgency: 'normal', ...overrides };
}

function bodyBytes(call: Captured | undefined): Uint8Array {
  const body = call?.init.body;
  if (!(body instanceof ArrayBuffer || body instanceof Uint8Array)) throw new Error('no body');
  return new Uint8Array(body);
}

function header(call: Captured | undefined, name: string): string | null {
  return new Headers(call?.init.headers).get(name);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('base64url', () => {
  it('round-trips bytes and refuses other alphabets', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(toBase64Url(bytes)).toBe('AAH6-_z9_v8');
    expect(fromBase64Url('AAH6-_z9_v8')).toEqual(bytes);
    expect(() => fromBase64Url('AAH6+/z9')).toThrow();
  });
});

describe('RFC 8291 encryption through the library', () => {
  it('AC-009: the RFC 8291 Appendix A inputs give exactly the Appendix A record', async () => {
    const [asX, asY] = [
      toBase64Url(fromBase64Url(RFC8291.asPublic).slice(1, 33)),
      toBase64Url(fromBase64Url(RFC8291.asPublic).slice(33)),
    ];
    const asKeys: CryptoKeyPair = {
      publicKey: await crypto.subtle.importKey(
        'raw',
        fromBase64Url(RFC8291.asPublic),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        [],
      ),
      privateKey: await crypto.subtle.importKey(
        'jwk',
        { kty: 'EC', crv: 'P-256', x: asX, y: asY, d: RFC8291.asPrivate },
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveKey', 'deriveBits'],
      ),
    };
    // The application server key pair and the salt are random per message; pin them to the RFC.
    const subtle = crypto.subtle as unknown as {
      generateKey: (algorithm: { name: string }, ...rest: unknown[]) => Promise<unknown>;
    };
    const generateKey = subtle.generateKey.bind(crypto.subtle);
    vi.spyOn(subtle, 'generateKey').mockImplementation((algorithm, ...rest) =>
      algorithm.name === 'ECDH' ? Promise.resolve(asKeys) : generateKey(algorithm, ...rest),
    );
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array && array.byteLength === 16) {
          array.set(fromBase64Url(RFC8291.salt));
          return array;
        }
        return getRandomValues(array as unknown as Uint8Array<ArrayBuffer>) as unknown as T;
      },
    );
    const calls = captureFetch();

    const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
    const status = await send(
      target({ p256dh: RFC8291.uaPublic, auth: RFC8291.auth }),
      RFC8291.plaintext,
    );

    expect(status).toBe(PUSH_SUCCESS_STATUS);
    const body = bodyBytes(calls[0]);
    // aes128gcm header: salt (16) | record size (4) | key id length (1) | key id (65), then records.
    expect(toBase64Url(body.slice(0, 16))).toBe(RFC8291.salt);
    expect(body[20]).toBe(65);
    expect(toBase64Url(body.slice(21, 86))).toBe(RFC8291.asPublic);
    // The record size is the library's choice (the RFC example uses 4096); it does not enter the
    // key derivation, so the record itself must match the Appendix byte for byte.
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBeGreaterThanOrEqual(4096);
    expect(toBase64Url(body.slice(86))).toBe(RFC8291.ciphertext);
  });

  it('AC-009: every message gets a fresh application server key and salt (RFC 8291 §2)', async () => {
    const calls = captureFetch();
    const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
    const keys = await testSubscriber();
    await send(target(keys), 'eins');
    await send(target(keys), 'eins');
    const [first, second] = [bodyBytes(calls[0]), bodyBytes(calls[1])];
    expect(toBase64Url(first.slice(21, 86))).not.toBe(toBase64Url(second.slice(21, 86)));
    expect(toBase64Url(first.slice(0, 16))).not.toBe(toBase64Url(second.slice(0, 16)));
  });
});

describe('RFC 8292 VAPID through the library', () => {
  it('the test verifier accepts the RFC 8292 section 2.4 example token', async () => {
    expect(await verifyJwt(RFC8292.token, RFC8292.key)).toBe(true);
    expect(await verifyJwt(RFC8292.token.slice(0, -2) + 'AA', RFC8292.key)).toBe(false);
  });

  it('AC-009: signs a JWT with aud = origin, sub = VAPID_SUBJECT, exp within 24 h', async () => {
    const vapid = await testVapidKeys();
    const calls = captureFetch();
    const send = await createWebPushSender({ ...vapid, subject: SUBJECT });
    const before = Math.floor(Date.now() / 1000);
    await send(target(await testSubscriber(), { ttl: 7200, urgency: 'high' }), '{}');

    const call = calls[0];
    expect(call?.url).toBe(ENDPOINT);
    expect(call?.init.method).toBe('POST');
    expect(header(call, 'content-encoding')).toBe('aes128gcm');
    expect(header(call, 'ttl')).toBe('7200');
    expect(header(call, 'urgency')).toBe('high');
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header(call, 'authorization') ?? '');
    expect(match).not.toBeNull();
    const [, token, key] = match ?? [];
    expect(key).toBe(vapid.publicKey);
    expect(await verifyJwt(token ?? '', vapid.publicKey)).toBe(true);
    const [jwtHeader, payload] = (token ?? '').split('.');
    expect(decodeJwtPart(jwtHeader)).toMatchObject({ alg: 'ES256' });
    const claims = decodeJwtPart(payload);
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe(SUBJECT);
    expect(claims.exp).toBeGreaterThan(before);
    expect(claims.exp).toBeLessThanOrEqual(before + 24 * 3600);
  });

  it('AC-009: normal urgency is sent as such', async () => {
    const calls = captureFetch();
    const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
    await send(target(await testSubscriber(), { urgency: 'normal', ttl: 60 }), '{}');
    expect(header(calls[0], 'urgency')).toBe('normal');
    expect(header(calls[0], 'ttl')).toBe('60');
  });
});

describe('status of the push service', () => {
  it.each([404, 410, 400, 403, 413, 429, 500, 302])(
    'AC-039: an answer %i is reported as exactly that status',
    async (status) => {
      captureFetch({ status });
      const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
      expect(await send(target(await testSubscriber()), '{}')).toBe(status);
    },
  );

  it('AC-039: a 2xx answer is reported as 201 (the library hides the exact success status)', async () => {
    for (const status of [200, 201, 202]) {
      captureFetch({ status });
      const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
      expect(await send(target(await testSubscriber()), '{}')).toBe(PUSH_SUCCESS_STATUS);
    }
  });

  it('a network error gives null', async () => {
    captureFetch({ error: new TypeError('network down') });
    const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
    expect(await send(target(await testSubscriber()), '{}')).toBeNull();
  });

  it('a p256dh that is not a point on the curve gives null and sends nothing', async () => {
    const calls = captureFetch();
    const send = await createWebPushSender({ ...(await testVapidKeys()), subject: SUBJECT });
    const broken = { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) };
    expect(await send(target(broken), '{}')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('VAPID configuration', () => {
  it('a private key that does not belong to the public key is a ConfigError', async () => {
    // Node refuses the pair on import already; other runtimes are caught by the sign/verify probe.
    const [a, b] = [await testVapidKeys(), await testVapidKeys()];
    const error = await createWebPushSender({
      publicKey: a.publicKey,
      privateKey: b.privateKey,
      subject: SUBJECT,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain('VAPID_PRIVATE_KEY');
    expect((error as Error).message).not.toContain(b.privateKey);
  });

  it.each([
    ['VAPID_PUBLIC_KEY', { publicKey: 'not-a-key' }],
    ['VAPID_PRIVATE_KEY', { privateKey: 'AAAA' }],
    ['VAPID_SUBJECT', { subject: 'http://housekeeping.test' }],
    ['VAPID_SUBJECT', { subject: 'push@example.com' }],
  ])('a malformed value names %s and never the value', async (name, override) => {
    const config = { ...(await testVapidKeys()), subject: SUBJECT, ...override };
    const error = await createWebPushSender(config).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain(name);
    for (const value of Object.values(override))
      expect((error as Error).message).not.toContain(value);
  });

  it('accepts a mailto: subject', async () => {
    const config = { ...(await testVapidKeys()), subject: 'mailto:push@example.com' };
    await expect(createWebPushSender(config)).resolves.toBeTypeOf('function');
  });
});

describe('guardFetch', () => {
  it('AC-044: never follows redirects and always sets a time limit', async () => {
    const inner = vi.fn(async () => new Response(null, { status: 201 }));
    await guardFetch(inner, 10_000)(ENDPOINT, { method: 'POST', redirect: 'follow' });
    const init = inner.mock.calls[0]?.at(1) as RequestInit | undefined;
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a hanging request after the time limit', async () => {
    vi.useFakeTimers();
    const inner = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const pending = guardFetch(inner, 10_000)(ENDPOINT, {});
    const outcome = pending.then(
      () => 'answered',
      () => 'aborted',
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toBe('aborted');
  });
});
