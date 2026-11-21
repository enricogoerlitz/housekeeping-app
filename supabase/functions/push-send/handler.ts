// push-send (spec 0013, ADR-0014): the database plans, this function only delivers. It is called by
// pg_net with the shared secret, has no database access and no service-role key, and answers the
// push service's status per message so the next tick can record it.
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

export interface PushSendDeps {
  env: (name: string) => string | undefined;
  createSender: (config: VapidConfig) => Promise<PushSender>;
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

/** Compares SHA-256 digests byte by byte without an early exit, so timing tells nothing. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [given, expected].map(
      async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
    ),
  );
  let difference = 0;
  for (let i = 0; i < 32; i += 1) difference |= (a?.[i] ?? 0) ^ (b?.[i] ?? 0);
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
    const secret = requireEnv(deps.env, 'PUSH_SEND_SECRET');
    if (!(await sameSecret(request.headers.get('x-push-secret') ?? '', secret)))
      return reply(401, 'unauthorized');

    const bytes = await readLimitedBody(request, MAX_BODY_BYTES);
    if (bytes === null) return reply(413, 'payload_too_large');
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
