import {
  ResolveMapsLinkReplySchema,
  ResolveMapsLinkRequestSchema,
  type ResolveMapsLinkReply,
} from '../_shared/contract.gen.ts';
import type { Deps } from '../_shared/deps.ts';
import { HttpError } from '../_shared/errors.ts';
import { handleRequest } from '../_shared/http.ts';
import { isPlaceHost, parseMapsLink } from '../_shared/maps-link.gen.ts';

// SSRF guard: only Google-owned hosts are ever fetched, each hop is checked again, redirects are
// followed by hand, bodies are never read. Place links on other map hosts are only parsed.
const FETCH_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
]);
const CONSENT_HOST = 'consent.google.com';
const MAX_FETCHES = 5;
/** Consent pages and redirects together; ends loops that never fetch. */
const MAX_STEPS = 10;
const HOP_TIMEOUT_MS = 5_000;
const REDIRECT = new Set([301, 302, 303, 307, 308]);

const notAMapsLink = () => new HttpError('not_a_maps_link');

function checkedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw notAMapsLink();
  }
  const host = url.hostname;
  const allowedHost = FETCH_HOSTS.has(host) || host === CONSENT_HOST || isPlaceHost(host);
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '')
    throw notAMapsLink();
  if (!allowedHost) throw notAMapsLink();
  return url;
}

/** One hop: GET without following redirects or reading the body; returns the Location, if any. */
async function nextLocation(fetchFn: typeof fetch, url: URL): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
  try {
    const response = await fetchFn(url.href, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    await response.body?.cancel();
    return REDIRECT.has(response.status)
      ? (response.headers.get('location') ?? undefined)
      : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function resolve(deps: Deps, input: string): Promise<ResolveMapsLinkReply> {
  let url = checkedUrl(input);
  let fetches = 0;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (url.hostname === CONSENT_HOST) {
      // Google's EU consent interstitial: the target is in `continue`; never fetch the page.
      const target = url.searchParams.get('continue');
      if (!target) throw notAMapsLink();
      url = checkedUrl(target);
      continue;
    }
    const link = parseMapsLink(url.href);
    const place = link?.kind === 'place' ? link : null;
    if (place?.name) {
      const reply = ResolveMapsLinkReplySchema.safeParse({
        name: place.name,
        ...(place.location ? { location: place.location } : {}),
        mapsUrl: url.href,
      });
      if (!reply.success) throw notAMapsLink();
      return reply.data;
    }
    const fetchable = FETCH_HOSTS.has(url.hostname) && link !== null;
    if (!fetchable || fetches >= MAX_FETCHES) throw notAMapsLink();
    fetches += 1;
    const location = await nextLocation(deps.fetch, url);
    if (!location) throw notAMapsLink();
    url = checkedUrl(new URL(location, url).href);
  }
  throw notAMapsLink();
}

export function handler(request: Request, deps: Deps): Promise<Response> {
  return handleRequest(request, deps, {
    schema: ResolveMapsLinkRequestSchema,
    run: ({ input }) => resolve(deps, input.url),
  });
}
