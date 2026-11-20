// Place parsing of packages/core/src/restaurants.ts `parseMapsLink`, reduced to what the server
// needs and working on a parsed URL. core cannot be imported from Deno; keep both in step.

export interface MapsPlace {
  provider: 'google' | 'apple';
  name?: string;
  location?: { lat: number; lng: number };
}

/** Only real Google domains ("google.de", "google.co.uk"), never a free suffix. */
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

/** Short links only the server can resolve: maps.app.goo.gl/… and goo.gl/maps/…. */
export function isShortLink(url: URL): boolean {
  return (
    url.hostname === 'maps.app.goo.gl' ||
    (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps'))
  );
}

/** Hosts whose place links can be read without fetching anything. */
export function isPlaceHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '');
  return host === 'maps.apple.com' || host === 'maps.apple' || GOOGLE_HOST.test(host);
}

/** Reads name and coordinates from a Google or Apple place link; null for anything else. */
export function parsePlaceUrl(url: URL): MapsPlace | null {
  const host = url.hostname.replace(/^www\./, '');
  const param = (key: string) => {
    const value = url.searchParams.get(key);
    return value === null ? undefined : value.trim();
  };
  if (host === 'maps.apple.com' || host === 'maps.apple') {
    const [lat, lng] = (param('ll') ?? param('coordinate') ?? '').split(',');
    return {
      provider: 'apple',
      name: param('name') || param('q') || undefined,
      location: parsePoint(lat, lng),
    };
  }
  const isGoogle =
    GOOGLE_HOST.test(host) && (host.startsWith('maps.') || url.pathname.startsWith('/maps'));
  if (!isGoogle) return null;
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const query = param('query') ?? param('q');
  const name = place?.[1] ? decodeSegment(place[1]) : query;
  return { provider: 'google', name: name || undefined, location: parsePoint(at?.[1], at?.[2]) };
}
