import type { z } from 'zod';

import { authenticate } from './auth.ts';
import { readLimitedBody } from './body.ts';
import { cors } from './cors.ts';
import type { Deps, UserClient } from './deps.ts';
import { ConfigError, HttpError, errorResponse, jsonResponse, requireEnv } from './errors.ts';
import { consumeQuota, type QuotaKind } from './quota.ts';

export const MAX_BODY_BYTES = 64 * 1024;

export interface Endpoint<Input> {
  /** Contract schema of the request body. */
  schema: z.ZodType<Input>;
  /** Charged after the body is valid and before `run`; omit for functions without cost. */
  quota?: QuotaKind;
  /** Largest body taken (default 64 KB); more is 413 before anything else is read or done. */
  maxBodyBytes?: number;
  /** The reply as JSON, or a ready Response (bytes, fetch-image) that gets the CORS headers. */
  run(context: { input: Input; client: UserClient; userId: string }): Promise<unknown>;
}

/** Reads at most `limit` bytes (more is 413); an empty body counts as `{}`. */
async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const bytes = await readLimitedBody(request, limit);
  if (bytes === null) throw new HttpError('payload_too_large');
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    return text === '' ? {} : (JSON.parse(text) as unknown);
  } catch {
    throw new HttpError('invalid_request');
  }
}

/**
 * The common path of every function: CORS → POST only → authentication → body limit and contract
 * → quota → endpoint. Errors become `{ error: code }`; nothing about the request is logged.
 */
export async function handleRequest<Input>(
  request: Request,
  deps: Deps,
  endpoint: Endpoint<Input>,
): Promise<Response> {
  let headers: { [name: string]: string } = {};
  try {
    const origins = requireEnv(deps.env, 'ALLOWED_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const access = cors(request, origins);
    if (!access.allowed) return new Response(null, { status: 403, headers: access.headers });
    headers = access.headers;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new HttpError('invalid_request');

    const { client, userId } = await authenticate(request, deps);
    const parsed = endpoint.schema.safeParse(
      await readJsonBody(request, endpoint.maxBodyBytes ?? MAX_BODY_BYTES),
    );
    if (!parsed.success) throw new HttpError('invalid_request');
    if (endpoint.quota) await consumeQuota(client, endpoint.quota);
    const reply = await endpoint.run({ input: parsed.data, client, userId });
    if (reply instanceof Response) {
      for (const [name, value] of Object.entries(headers)) reply.headers.set(name, value);
      return reply;
    }
    return jsonResponse(reply, 200, headers);
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.code, headers);
    // Only the error type (and for config errors the variable name) — never payloads.
    console.error(
      'edge_function_failed',
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.name
          : 'unknown',
    );
    return errorResponse('internal', headers);
  }
}
