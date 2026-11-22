// push-send (spec 0013, ADR-0014): the database plans, this function only delivers. It is called by
// pg_net with a request signed by the shared secret (HMAC-SHA256 over "<timestamp>.<body>", headers
// x-push-timestamp and x-push-signature), has no database access and no service-role key, and
// answers the push service's status per message so the next tick can record it.
//
// Why a signature and not the secret itself: pg_net's queue (net.http_request_queue) is readable
// by every database role Supabase creates, until the worker has sent the request. A leaked queue
// row then carries only a signature for exactly that body, valid for five minutes.
import { z } from 'zod';

import { readLimitedBody } from '../_shared/body.ts';
import { ConfigError, jsonResponse, requireEnv } from '../_shared/errors.ts';
import { MAX_PUSH_ENDPOINT_LENGTH, isPushEndpoint } from '../_shared/push-endpoint.ts';
import type { PushSender, VapidConfig } from './web-push.ts';

export const MAX_BODY_BYTES = 128 * 1024;
export const MAX_MESSAGES = 50;
export const CONCURRENCY = 5;
export const SEND_TIMEOUT_MS = 10_000;
/** pg_net waits 20 s for the answer; everything not done by then is reported as null. */
export const BATCH_DEADLINE_MS = 15_000;
/** A signature older than this is refused (seconds). */
export const MAX_SIGNATURE_AGE_S = 300;
/** Clock skew tolerated for a timestamp in the future (seconds). */
export const MAX_CLOCK_SKEW_S = 60;

export interface PushSendDeps {
  env: (name: string) => string | undefined;
  createSender: (config: VapidConfig) => Promise<PushSender>;
  /** Current time in ms; Date.now by default (tests pin it). */
  now?: () => number;
  sendTimeoutMs?: number;
  batchDeadlineMs?: number;
}

/** Characters as Postgres counts them (code points), not UTF-16 units. */
const text = (max: number) =>
  z
    .string()
    .min(1)
    .refine((value) => [...value].length <= max);

const MessageSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  // Only the length here; an unknown host is answered per message with "rejected" (AC-044).
  endpoint: z.string().max(MAX_PUSH_ENDPOINT_LENGTH),
  keys: z.strictObject({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
  ttl: z.number().int().min(60).max(2_419_200),
  urgency: z.enum(['normal', 'high']),
  notification: z.strictObject({
    title: text(60),
    body: text(400),
    // A path of the app; the service worker checks it again against its own list.
    url: z
      .string()
      .max(512)
      .regex(/^\/(?![/\\])/),
  }),
});

const RequestSchema = z
  .strictObject({ messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES) })
  .refine(({ messages }) => new Set(messages.map((m) => m.id)).size === messages.length);

type Message = z.infer<typeof MessageSchema>;
type Status = number | null | 'rejected';

function reply(status: number, error: string, headers: { [name: string]: string } = {}): Response {
  return jsonResponse({ error }, status, headers);
}

/** Unix seconds, as the database writes them; anything else is refused. */
function freshTimestamp(value: string | null, nowMs: number): string | null {
  if (value === null || !/^\d{1,12}$/.test(value)) return null;
  const age = Math.floor(nowMs / 1000) - Number(value);
  return age <= MAX_SIGNATURE_AGE_S && age >= -MAX_CLOCK_SKEW_S ? value : null;
}

function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/**
 * HMAC-SHA256 of "<timestamp>.<body>" with the shared secret, compared byte by byte without an
 * early exit, so timing tells nothing about the expected value.
 */
async function validSignature(
  secret: string,
  timestamp: string,
  body: Uint8Array,
  given: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const prefix = encoder.encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.byteLength + body.byteLength);
  signed.set(prefix, 0);
  signed.set(body, prefix.byteLength);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  const actual = hexBytes(given);
  if (actual === null) return false;
  let difference = 0;
  for (let i = 0; i < expected.byteLength; i += 1)
    difference |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  return difference === 0;
}

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

async function deliver(
  messages: Message[],
  send: PushSender,
  deps: PushSendDeps,
): Promise<Status[]> {
  const sendTimeout = deps.sendTimeoutMs ?? SEND_TIMEOUT_MS;
  const deadline = Date.now() + (deps.batchDeadlineMs ?? BATCH_DEADLINE_MS);
  const statuses: Status[] = new Array<Status>(messages.length).fill(null);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < messages.length) {
      const index = next;
      next += 1;
      const message = messages[index] as Message;
      if (!isPushEndpoint(message.endpoint)) {
        statuses[index] = 'rejected';
        continue;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) continue;
      const { endpoint, keys, ttl, urgency, notification } = message;
      statuses[index] = await within(
        send({ endpoint, keys, ttl, urgency }, JSON.stringify(notification)),
        Math.min(sendTimeout, remaining),
        null,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, messages.length) }, worker));
  return statuses;
}

export async function handler(request: Request, deps: PushSendDeps): Promise<Response> {
  try {
    if (request.method !== 'POST') return reply(405, 'method_not_allowed', { Allow: 'POST' });
    const timestamp = freshTimestamp(
      request.headers.get('x-push-timestamp'),
      (deps.now ?? Date.now)(),
    );
    const signature = request.headers.get('x-push-signature');
    // Unsigned requests are refused before any configuration is read: the preview has no push
    // secrets (decision 8), and the answer must not reveal whether a project is configured.
    if (timestamp === null || signature === null) return reply(401, 'unauthorized');
    const secret = requireEnv(deps.env, 'PUSH_SEND_SECRET');

    const bytes = await readLimitedBody(request, MAX_BODY_BYTES);
    if (bytes === null) return reply(413, 'payload_too_large');
    if (!(await validSignature(secret, timestamp, bytes, signature)))
      return reply(401, 'unauthorized');
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return reply(400, 'invalid_request');
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return reply(400, 'invalid_request');

    const send = await deps.createSender({
      publicKey: requireEnv(deps.env, 'VAPID_PUBLIC_KEY'),
      privateKey: requireEnv(deps.env, 'VAPID_PRIVATE_KEY'),
      subject: requireEnv(deps.env, 'VAPID_SUBJECT'),
    });
    const statuses = await deliver(parsed.data.messages, send, deps);
    // Only the log id and the status (AC-040): never the address, the keys or the text.
    return jsonResponse(
      { results: parsed.data.messages.map((m, i) => ({ id: m.id, status: statuses[i] ?? null })) },
      200,
      {},
    );
  } catch (error) {
    console.error(
      'push_send_failed',
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.name
          : 'unknown',
    );
    return reply(500, 'internal');
  }
}
