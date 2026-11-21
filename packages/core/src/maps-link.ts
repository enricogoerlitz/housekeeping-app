// Reading shared map links. The edge function resolve-maps-link uses the same rules: `pnpm gen:edge`
// copies this file to supabase/functions/_shared/maps-link.gen.ts, so it imports nothing and uses
// no platform globals (core has no DOM or Node types; the URL is split by hand).

export interface MapsPlace {
  provider: 'google' | 'apple';
  name?: string;
  location?: { lat: number; lng: number };
}

export type MapsLink =
  | ({ kind: 'place'; url: string } & MapsPlace)
  /** A short link (maps.app.goo.gl, goo.gl/maps) that only the server can resolve. */
  | { kind: 'short'; provider: 'google'; url: string };

/** Only real Google domains ("google.de", "google.co.uk"); a free suffix would let
 * "maps.google.com.evil.example" pass as Google. */
const GOOGLE_HOST = /^(maps\.)?google\.(com|[a-z]{2}|(co|com)\.[a-z]{2})$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim();
  } catch {
    return segment.replace(/\+/g, ' ').trim();
  }
}

function parsePoint(lat: string | undefined, lng: string | undefined) {
  const a = Number(lat);
  const b = Number(lng);
  if (!lat || !lng || !Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return undefined;
  return { lat: a, lng: b };
}

/** Host without "www.", in lower case. */
function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

/** Hosts whose place links can be read without fetching anything. */
export function isPlaceHost(hostname: string): boolean {
  const host = bareHost(hostname);
  return host === 'maps.apple.com' || host === 'maps.apple' || GOOGLE_HOST.test(host);
}

/**
 * Reads a shared map link. Google: /maps/place/<Name>/@lat,lng… or ?q= / ?query=; Apple:
 * maps.apple.com/?q=<Name>&ll=lat,lng (also `address`, `name`). Short Google links are recognised
 * but need the server. Anything else (also text that merely contains a link) → null; the first URL
 * in a longer shared text is used. A parameter counts once, its first occurrence (like
 * URLSearchParams).
 */
export function parseMapsLink(input: string): MapsLink | null {
  const match = input.match(/https?:\/\/\S+/);
  if (!match) return null;
  const href = match[0];
  const parts = href.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/);
  if (!parts) return null;
  const host = bareHost(parts[1] ?? '');
  const pathname = parts[2] ?? '';
  const params = new Map<string, string>();
  for (const pair of (parts[3] ?? '').split('&')) {
    const split = pair.indexOf('=');
    const key = decodeSegment(split < 0 ? pair : pair.slice(0, split));
    if (key && !params.has(key))
      params.set(key, decodeSegment(split < 0 ? '' : pair.slice(split + 1)));
  }

  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && pathname.startsWith('/maps'))) {
    return { kind: 'short', provider: 'google', url: href };
  }
  if (host === 'maps.apple.com' || host === 'maps.apple') {
    const [lat, lng] = (params.get('ll') ?? params.get('coordinate') ?? '').split(',');
    return {
      kind: 'place',
      provider: 'apple',
      name: params.get('name') || params.get('q') || undefined,
      location: parsePoint(lat, lng),
      url: href,
    };
  }
  const isGoogle =
    GOOGLE_HOST.test(host) && (host.startsWith('maps.') || pathname.startsWith('/maps'));
  if (!isGoogle) return null;
  const place = pathname.match(/\/maps\/place\/([^/]+)/);
  // "@lat,lng" is only the centre of the visible map; the place itself is "!3d<lat>!4d<lng>".
  const pin = [...pathname.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)].at(-1);
  const at = pin ?? pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const name = place?.[1] ? decodeSegment(place[1]) : (params.get('query') ?? params.get('q'));
  return {
    kind: 'place',
    provider: 'google',
    name: name || undefined,
    location: parsePoint(at?.[1], at?.[2]),
    url: href,
  };
}
