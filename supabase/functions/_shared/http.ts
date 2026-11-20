import type { z } from 'zod';

import { authenticate } from './auth.ts';
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
  run(context: { input: Input; client: UserClient; userId: string }): Promise<unknown>;
}

/** Reads at most `limit` bytes; an empty body counts as `{}`. */
async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > limit)
    throw new HttpError('invalid_request');
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError('invalid_request');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
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
    const parsed = endpoint.schema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
    if (!parsed.success) throw new HttpError('invalid_request');
    if (endpoint.quota) await consumeQuota(client, endpoint.quota);
    return jsonResponse(await endpoint.run({ input: parsed.data, client, userId }), 200, headers);
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
