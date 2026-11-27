// media-sweep (spec 0039, REQ-005, ADR-0016): deletes photo files no row refers to any more. The
// database decides which (private.media_orphans: no reference, older than one day) and sends the
// names nightly through pg_net, signed (HMAC over "<timestamp>.<body>", headers
// x-sweep-timestamp and x-sweep-signature, secret MEDIA_SWEEP_SECRET from the Vault). Deleting
// has to go through the Storage API (a direct delete in storage.objects leaves the file in the
// storage backend), and only a server key may delete across households: this is the one function
// that reads it. It deletes only names of the photo folders in household-media and, since spec
// 0043, names of the video folders in household-videos ("videos"), nothing else.
import { z } from 'zod';

import { readLimitedBody } from '../_shared/body.ts';
import { ConfigError, jsonResponse, requireEnv } from '../_shared/errors.ts';
import { freshTimestamp, validSignature } from '../_shared/signature.ts';

const MAX_BODY_BYTES = 128 * 1024;
/** The database sends at most this many names per run. */
const MAX_NAMES = 500;
const CHUNK = 100;

/** The object names the photo policies allow (private.media_household_id). */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MEDIA_NAME = new RegExp(`^${UUID}/(activities|recipes|restaurants)/${UUID}/${UUID}\\.jpg$`);
/** The object names the video policies allow (private.video_household_id, spec 0043). */
const VIDEO_NAME = new RegExp(`^${UUID}/recipes/${UUID}/${UUID}\\.mp4$`);

const RequestSchema = z
  .strictObject({
    names: z.array(z.string().regex(MEDIA_NAME)).max(MAX_NAMES),
    videos: z.array(z.string().regex(VIDEO_NAME)).max(MAX_NAMES).optional(),
  })
  .refine((body) => body.names.length + (body.videos?.length ?? 0) > 0);

export type SweptBucket = 'household-media' | 'household-videos';

/** Removes the names from the bucket; resolves with how many the Storage API removed. */
export type Remover = (bucket: SweptBucket, names: string[]) => Promise<{ removed: number }>;

export interface MediaSweepDeps {
  env: (name: string) => string | undefined;
  createRemover: (config: { url: string; key: string }) => Remover;
  /** Current time in ms; Date.now by default (tests pin it). */
  now?: () => number;
}

function reply(status: number, body: { [key: string]: unknown }, headers = {}): Response {
  return jsonResponse(body, status, headers);
}

/** The secret key from SUPABASE_SECRET_KEYS ({"default": "sb_secret_…"}), else the legacy one. */
function serverKey(env: MediaSweepDeps['env']): string {
  const keys = env('SUPABASE_SECRET_KEYS');
  if (!keys) return requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  try {
    const parsed = JSON.parse(keys) as { [name: string]: unknown };
    const key = parsed.default ?? Object.values(parsed)[0];
    if (typeof key === 'string' && key) return key;
  } catch {
    // fall through to the error below
  }
  throw new ConfigError('SUPABASE_SECRET_KEYS has no usable key');
}

export async function handler(request: Request, deps: MediaSweepDeps): Promise<Response> {
  try {
    if (request.method !== 'POST')
      return reply(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    const timestamp = freshTimestamp(
      request.headers.get('x-sweep-timestamp'),
      (deps.now ?? Date.now)(),
    );
    const signature = request.headers.get('x-sweep-signature');
    if (timestamp === null || signature === null) return reply(401, { error: 'unauthorized' });
    const secret = requireEnv(deps.env, 'MEDIA_SWEEP_SECRET');

    const bytes = await readLimitedBody(request, MAX_BODY_BYTES);
    if (bytes === null) return reply(413, { error: 'payload_too_large' });
    if (!(await validSignature(secret, timestamp, bytes, signature)))
      return reply(401, { error: 'unauthorized' });
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return reply(400, { error: 'invalid_request' });
    }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return reply(400, { error: 'invalid_request' });

    const remove = deps.createRemover({
      url: requireEnv(deps.env, 'SUPABASE_URL'),
      key: serverKey(deps.env),
    });
    let removed = 0;
    const batches: [SweptBucket, string[]][] = [
      ['household-media', parsed.data.names],
      ['household-videos', parsed.data.videos ?? []],
    ];
    for (const [bucket, names] of batches) {
      for (let start = 0; start < names.length; start += CHUNK) {
        try {
          removed += (await remove(bucket, names.slice(start, start + CHUNK))).removed;
        } catch {
          // The rest stays for the next night; the names are never logged.
          console.error('media_sweep_storage_failed');
          return reply(502, { error: 'storage_failed', removed });
        }
      }
    }
    return reply(200, { removed });
  } catch (error) {
    console.error(
      'media_sweep_failed',
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.name
          : 'unknown',
    );
    return reply(500, { error: 'internal' });
  }
}
