// fetch-image (spec 0039, REQ-003, ADR-0016): "Bildadresse" in the photo window. The server loads
// the image so the browser needs no download and no CORS from the image host; the app shrinks
// and uploads it like any chosen photo. Signed-in members only, no quota (Enrico, 26.11.).
// Answer: the image bytes as application/octet-stream (supabase-js hands them over as a Blob),
// errors as { error }: not_an_image for every address that gives no usable public image.
import { FetchImageRequestSchema } from '../_shared/contract.gen.ts';
import type { Deps, UserClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { fetchPublic, PublicFetchError } from '../_shared/fetch-public.ts';
import { handleRequest } from '../_shared/http.ts';
import { imageTypeOf } from '../_shared/image-source.gen.ts';

/** The same limit as a chosen file (packages/api preparePhoto). */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/** Under the caller's RLS: a household she is no member of shows no member rows. */
async function requireMember(client: UserClient, householdId: string): Promise<void> {
  const { data, error } = await client
    .from('household_members')
    .select('household_id')
    .eq('household_id', householdId)
    .limit(1);
  if (error) throw new Error('membership_lookup_failed');
  if (!Array.isArray(data) || data.length === 0) throw new HttpError('forbidden');
}

async function loadImage(deps: Deps, url: string): Promise<Response> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    ({ bytes } = await fetchPublic(
      url,
      {
        maxBytes: MAX_IMAGE_BYTES,
        contentTypes: ['image/*'],
        timeoutMs: FETCH_TIMEOUT_MS,
        maxRedirects: MAX_REDIRECTS,
      },
      deps,
    ));
  } catch (error) {
    if (error instanceof PublicFetchError) throw new HttpError('not_an_image');
    throw error;
  }
  // The declared type is a claim; the bytes must be one of the formats the app can use.
  if (!imageTypeOf(bytes)) throw new HttpError('not_an_image');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: FetchImageRequestSchema,
    run: async ({ input, client }) => {
      await requireMember(client, input.householdId);
      return loadImage(deps, input.url);
    },
  });
}
