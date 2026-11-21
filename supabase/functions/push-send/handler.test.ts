import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigError } from '../_shared/errors.ts';
import {
  BATCH_DEADLINE_MS,
  CONCURRENCY,
  MAX_BODY_BYTES,
  SEND_TIMEOUT_MS,
  handler,
  type PushSendDeps,
} from './handler.ts';
import type { PushSender, PushTarget, VapidConfig } from './web-push.ts';

// Values made up for this test only; the real ones are function secrets nobody reads.
const SECRET = `test-${crypto.randomUUID()}`;
const VAPID: VapidConfig = {
  publicKey: 'test-vapid-public-key',
  privateKey: 'test-vapid-private-key',
  subject: 'https://housekeeping.test',
};
const ENV: { [name: string]: string } = {
  PUSH_SEND_SECRET: SECRET,
  VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: VAPID.subject,
};
const KEYS = { p256dh: `B${'q'.repeat(86)}`, auth: 'a'.repeat(22) };
const BODY_TEXT = 'Heute: Müll rausbringen · Abendessen Linsencurry';

type Message = {
  id: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ttl: number;
  urgency: 'normal' | 'high';
  notification: { title: string; body: string; url: string };
};

function message(id: number, overrides: Partial<Message> = {}): Message {
  return {
    id,
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${id}`,
    keys: KEYS,
    ttl: 3600,
    urgency: 'normal',
    notification: { title: 'Housekeeping', body: BODY_TEXT, url: '/?haushalt=h1' },
    ...overrides,
  };
}

/** Fixed clock of the handler in these tests (ms); signatures are made for this time. */
const NOW_MS = Date.UTC(2026, 10, 21, 7, 30, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

/** What the database does in private.post_push_bundle: HMAC-SHA256 over "<timestamp>.<body>". */
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

interface RequestOptions {
  /** The key the caller signs with; null sends no signature headers at all. */
  secret?: string | null;
  timestamp?: string;
  /** Overrides the computed signature. */
  signature?: string;
  /** Signs this text instead of the body that is sent. */
  signedBody?: string;
  method?: string;
  raw?: string;
  headers?: { [name: string]: string };
}

async function request(body: unknown, options: RequestOptions = {}): Promise<Request> {
  const { secret = SECRET, timestamp = String(NOW_S), method = 'POST', raw } = options;
  const text = method === 'GET' ? '' : (raw ?? JSON.stringify(body));
  const headers: { [name: string]: string } = {
    'content-type': 'application/json',
    ...options.headers,
  };
  if (secret !== null) {
    headers['x-push-timestamp'] = timestamp;
    headers['x-push-signature'] =
      options.signature ?? (await sign(secret, timestamp, options.signedBody ?? text));
  }
  return new Request('http://localhost/functions/v1/push-send', {
    method,
    headers,
    ...(method === 'GET' ? {} : { body: text }),
  });
}

type FakeDeps = PushSendDeps & {
  createSender: ReturnType<typeof vi.fn<(config: VapidConfig) => Promise<PushSender>>>;
  send: ReturnType<typeof vi.fn<PushSender>>;
};

function fakeDeps(
  options: {
    env?: { [name: string]: string | undefined };
    send?: PushSender;
    sendTimeoutMs?: number;
    batchDeadlineMs?: number;
  } = {},
): FakeDeps {
  const env = { ...ENV, ...options.env };
  const send = vi.fn<PushSender>(options.send ?? (async () => 201));
  const createSender = vi.fn(async () => send);
  return {
    env: (name) => env[name],
    now: () => NOW_MS,
    createSender,
    send,
    ...(options.sendTimeoutMs ? { sendTimeoutMs: options.sendTimeoutMs } : {}),
    ...(options.batchDeadlineMs ? { batchDeadlineMs: options.batchDeadlineMs } : {}),
  };
}

async function json(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

function consoleSpies() {
  return ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    vi.spyOn(console, method as 'log').mockImplementation(() => undefined),
  );
}

function logged(spies: ReturnType<typeof consoleSpies>): string {
  return spies.map((spy) => JSON.stringify(spy.mock.calls)).join('\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('who may call push-send', () => {
  const body = { messages: [message(1)] };
  const unauthorized: [string, RequestOptions][] = [
    ['no signature headers', { secret: null }],
    ['a signature made with another secret', { secret: 'wrong' }],
    ['a signature with the secret and one character more', { secret: `${SECRET}x` }],
    ['an empty signature', { signature: '' }],
    ['a signature that is no hex', { signature: 'z'.repeat(64) }],
    ['a signature one byte short', { signature: 'ab'.repeat(31) }],
    ['a signature over another body', { signedBody: JSON.stringify({ messages: [message(2)] }) }],
    ['a timestamp more than 5 minutes old', { timestamp: String(NOW_S - 301) }],
    ['a timestamp more than 1 minute ahead', { timestamp: String(NOW_S + 61) }],
    ['a timestamp that is no number', { timestamp: 'now' }],
    ['a timestamp in milliseconds', { timestamp: String(NOW_MS) }],
    ['the old static secret header', { secret: null, headers: { 'x-push-secret': SECRET } }],
  ];

  it.each(unauthorized)('AC-045: %s gives 401 and sends nothing', async (_label, options) => {
    const deps = fakeDeps();
    const response = await handler(await request(body, options), deps);
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: 'unauthorized' });
    expect(deps.createSender).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('AC-045: a signed request with the same timestamp but a changed body gives 401', async () => {
    // A leaked queue row (headers and body) cannot carry other messages.
    const deps = fakeDeps();
    const original = await request(body);
    const forged = new Request(original.url, {
      method: 'POST',
      headers: original.headers,
      body: JSON.stringify({
        messages: [message(1, { endpoint: 'https://fcm.googleapis.com/fcm/send/attacker' })],
      }),
    });
    const response = await handler(forged, deps);
    expect(response.status).toBe(401);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it.each([
    ['exactly 5 minutes old', NOW_S - 300],
    ['exactly 1 minute ahead', NOW_S + 60],
  ])('AC-045: a correct signature with a timestamp %s is accepted', async (_label, timestamp) => {
    const deps = fakeDeps();
    const response = await handler(await request(body, { timestamp: String(timestamp) }), deps);
    expect(response.status).toBe(200);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it('AC-045: GET gives 405 and sends nothing', async () => {
    const deps = fakeDeps();
    const response = await handler(await request(undefined, { method: 'GET' }), deps);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('AC-045: without PUSH_SEND_SECRET it answers 500 and logs only the name', async () => {
    const spies = consoleSpies();
    const deps = fakeDeps({ env: { PUSH_SEND_SECRET: undefined } });
    const response = await handler(await request({ messages: [message(1)] }), deps);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ error: 'internal' });
    expect(logged(spies)).toContain('PUSH_SEND_SECRET');
    expect(deps.send).not.toHaveBeenCalled();
  });

  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])(
    'a missing %s gives 500 with the name in the log and sends nothing',
    async (name) => {
      const spies = consoleSpies();
      const deps = fakeDeps({ env: { [name]: undefined } });
      const response = await handler(await request({ messages: [message(1)] }), deps);
      expect(response.status).toBe(500);
      expect(logged(spies)).toContain(name);
      expect(deps.send).not.toHaveBeenCalled();
    },
  );

  it('a VAPID key the sender cannot use gives 500 with the reason, never a value', async () => {
    const spies = consoleSpies();
    const deps = fakeDeps();
    deps.createSender.mockRejectedValueOnce(
      new ConfigError('VAPID_PRIVATE_KEY does not belong to VAPID_PUBLIC_KEY'),
    );
    const response = await handler(await request({ messages: [message(1)] }), deps);
    expect(response.status).toBe(500);
    const output = logged(spies);
    expect(output).toContain('VAPID_PRIVATE_KEY does not belong to VAPID_PUBLIC_KEY');
    expect(output).not.toContain(VAPID.privateKey);
    expect(output).not.toContain(SECRET);
  });
});

describe('what push-send accepts', () => {
  const invalid: [string, unknown][] = [
    ['no messages', { messages: [] }],
    ['more than 50 messages', { messages: Array.from({ length: 51 }, (_, i) => message(i + 1)) }],
    ['an unknown top-level field', { messages: [message(1)], extra: true }],
    ['an unknown message field', { messages: [{ ...message(1), extra: 1 }] }],
    ['a fractional id', { messages: [message(1.5)] }],
    ['a negative id', { messages: [message(-1)] }],
    ['duplicate ids', { messages: [message(1), message(1)] }],
    ['a ttl under 60', { messages: [message(1, { ttl: 59 })] }],
    ['an unknown urgency', { messages: [message(1, { urgency: 'low' as 'high' })] }],
    ['a short p256dh', { messages: [message(1, { keys: { ...KEYS, p256dh: 'BAAA' } })] }],
    ['a long auth', { messages: [message(1, { keys: { ...KEYS, auth: 'a'.repeat(23) } })] }],
    [
      'a body over 400 characters',
      {
        messages: [
          message(1, { notification: { title: 'Housekeeping', body: 'x'.repeat(401), url: '/' } }),
        ],
      },
    ],
    [
      'an empty body',
      { messages: [message(1, { notification: { title: 'Housekeeping', body: '', url: '/' } })] },
    ],
    [
      'an absolute url',
      {
        messages: [
          message(1, {
            notification: { title: 'Housekeeping', body: 'x', url: 'https://evil.example/' },
          }),
        ],
      },
    ],
    [
      'a protocol-relative url',
      {
        messages: [
          message(1, { notification: { title: 'Housekeeping', body: 'x', url: '//evil.example' } }),
        ],
      },
    ],
    [
      'an endpoint that is no string',
      { messages: [message(1, { endpoint: 42 as unknown as string })] },
    ],
    ['no object', ['messages']],
  ];

  it.each(invalid)('AC-045: %s gives 400 and sends nothing', async (_label, body) => {
    const deps = fakeDeps();
    const response = await handler(await request(body), deps);
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: 'invalid_request' });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('AC-045: a body that is not JSON gives 400', async () => {
    const deps = fakeDeps();
    const response = await handler(await request(undefined, { raw: '{"messages": [' }), deps);
    expect(response.status).toBe(400);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('a body of 400 characters with emoji counts characters, not UTF-16 units', async () => {
    const deps = fakeDeps();
    const body = '🧹'.repeat(400);
    const response = await handler(
      await request({
        messages: [message(1, { notification: { title: 'Housekeeping', body, url: '/' } })],
      }),
      deps,
    );
    expect(response.status).toBe(200);
  });

  it('AC-045: a body over 128 KB gives 413 and sends nothing', async () => {
    const deps = fakeDeps();
    const padding = 'x'.repeat(MAX_BODY_BYTES);
    const response = await handler(await request(undefined, { raw: `{"pad":"${padding}"}` }), deps);
    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: 'payload_too_large' });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('AC-045: a Content-Length over 128 KB gives 413 before reading', async () => {
    const deps = fakeDeps();
    const response = await handler(
      new Request('http://localhost/functions/v1/push-send', {
        method: 'POST',
        headers: {
          'x-push-timestamp': String(NOW_S),
          'x-push-signature': await sign(SECRET, String(NOW_S), '{}'),
          'content-length': String(MAX_BODY_BYTES + 1),
        },
        body: '{}',
      }),
      deps,
    );
    expect(response.status).toBe(413);
  });
});

describe('delivery', () => {
  it('AC-009: hands the VAPID values from the environment to the sender', async () => {
    const deps = fakeDeps();
    await handler(await request({ messages: [message(1)] }), deps);
    expect(deps.createSender).toHaveBeenCalledTimes(1);
    expect(deps.createSender).toHaveBeenCalledWith(VAPID);
  });

  it('AC-009: sends the notification as JSON with ttl, urgency and the subscription keys', async () => {
    const deps = fakeDeps();
    const response = await handler(
      await request({ messages: [message(7, { ttl: 900, urgency: 'high' })] }),
      deps,
    );
    expect(response.status).toBe(200);
    const [target, payload] = deps.send.mock.calls[0] ?? [];
    expect(target).toEqual<PushTarget>({
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-7',
      keys: KEYS,
      ttl: 900,
      urgency: 'high',
    });
    expect(JSON.parse(payload ?? '')).toEqual({
      title: 'Housekeeping',
      body: BODY_TEXT,
      url: '/?haushalt=h1',
    });
  });

  it('AC-039: reports exactly the status of the push service per id', async () => {
    const statuses: { [endpoint: string]: number | null } = {};
    const codes = [201, 404, 410, 500, null];
    const messages = codes.map((code, i) => {
      const m = message(100 + i);
      statuses[m.endpoint] = code;
      return m;
    });
    const deps = fakeDeps({ send: async (target) => statuses[target.endpoint] ?? null });
    const response = await handler(await request({ messages }), deps);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      results: [
        { id: 100, status: 201 },
        { id: 101, status: 404 },
        { id: 102, status: 410 },
        { id: 103, status: 500 },
        { id: 104, status: null },
      ],
    });
  });

  it('a sender that throws gives null for that message only', async () => {
    const deps = fakeDeps({
      send: async (target) => {
        if (target.endpoint.endsWith('-2')) throw new Error('boom');
        return 201;
      },
    });
    const response = await handler(await request({ messages: [message(1), message(2)] }), deps);
    expect(await json(response)).toEqual({
      results: [
        { id: 1, status: 201 },
        { id: 2, status: null },
      ],
    });
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/x',
    'https://127.0.0.1:54321/functions/v1/push-send',
    'https://kong:8000/rest/v1/',
    'https://evil.example/fcm.googleapis.com',
  ])('AC-044: %s is rejected without any send', async (endpoint) => {
    const deps = fakeDeps();
    const response = await handler(
      await request({ messages: [message(1, { endpoint }), message(2)] }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      results: [
        { id: 1, status: 'rejected' },
        { id: 2, status: 201 },
      ],
    });
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send.mock.calls[0]?.[0].endpoint).toBe(message(2).endpoint);
  });

  it('batching: 50 messages go out at most 5 at a time and come back in order', async () => {
    let inFlight = 0;
    let peak = 0;
    const deps = fakeDeps({
      send: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        await Promise.resolve();
        inFlight -= 1;
        return 201;
      },
    });
    const messages = Array.from({ length: 50 }, (_, i) => message(i + 1));
    const response = await handler(await request({ messages }), deps);
    const body = (await json(response)) as { results: { id: number; status: unknown }[] };
    expect(CONCURRENCY).toBe(5);
    expect(peak).toBe(5);
    expect(deps.send).toHaveBeenCalledTimes(50);
    expect(deps.createSender).toHaveBeenCalledTimes(1);
    expect(body.results.map((r) => r.id)).toEqual(messages.map((m) => m.id));
  });

  it('a hanging send gives null after the time limit and the answer still comes', async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const sending = new Promise<void>((resolve) => (started = resolve));
    const deps = fakeDeps({
      send: (target) => {
        if (target.endpoint.endsWith('-1')) {
          started();
          return new Promise<number | null>(() => undefined);
        }
        return Promise.resolve(201);
      },
    });
    const pending = handler(await request({ messages: [message(1), message(2)] }), deps);
    await sending;
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    const response = await pending;
    expect(await json(response)).toEqual({
      results: [
        { id: 1, status: null },
        { id: 2, status: 201 },
      ],
    });
  });

  it('messages still waiting at the batch deadline are not sent and give null', async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const sending = new Promise<void>((resolve) => (started = resolve));
    let calls = 0;
    const deps = fakeDeps({
      send: () => {
        calls += 1;
        if (calls === CONCURRENCY) started();
        return new Promise<number | null>(() => undefined);
      },
    });
    const messages = Array.from({ length: 12 }, (_, i) => message(i + 1));
    const pending = handler(await request({ messages }), deps);
    await sending;
    await vi.advanceTimersByTimeAsync(BATCH_DEADLINE_MS);
    const body = (await json(await pending)) as { results: { status: unknown }[] };
    expect(body.results).toHaveLength(12);
    expect(body.results.every((r) => r.status === null)).toBe(true);
    // Round one (5) times out after SEND_TIMEOUT_MS, round two (5) gets only the remaining
    // budget, the last two start after the deadline and are never handed to the sender.
    expect(deps.send).toHaveBeenCalledTimes(10);
  });

  it('AC-040: the answer has only id and status; the log has no address, key or text', async () => {
    const spies = consoleSpies();
    const deps = fakeDeps({ send: async () => 410 });
    const m = message(9);
    const response = await handler(await request({ messages: [m] }), deps);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ results: [{ id: 9, status: 410 }] });
    for (const leak of [m.endpoint, KEYS.p256dh, KEYS.auth, BODY_TEXT, SECRET]) {
      expect(text).not.toContain(leak);
      expect(logged(spies)).not.toContain(leak);
    }
  });
});
