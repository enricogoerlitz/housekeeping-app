// Loading a user-supplied address from the open internet (spec 0039, ADR-0016): an image for
// fetch-image now, a recipe page later (spec 0040). SSRF guard: https on port 443 only, no user
// name or password, no single-label host; before every request (the first and each redirect) the
// host is resolved and refused if any of its addresses is not public; redirects are followed by
// hand; one deadline covers resolving, waiting and reading; the body is read up to a byte limit
// and the content type must be one the caller accepts.
//
// Rest risk (ADR-0016): fetch resolves the name again itself, so a name that answers public at our
// lookup and internal a moment later (DNS rebinding) is not caught. The edge runtime has no way to
// pin the connection to the checked address.

export type PublicFetchFailure =
  | 'invalid_url'
  /** The host is not one the caller allows (allowHost), e.g. a TikTok link leaving TikTok. */
  | 'blocked_host'
  | 'blocked_address'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'http_status'
  | 'wrong_type'
  | 'too_large'
  | 'timeout'
  | 'network';

export class PublicFetchError extends Error {
  /** The checked address the failure happened at (after redirects), if one was reached. */
  url?: string;

  constructor(readonly reason: PublicFetchFailure) {
    super(reason);
    this.name = 'PublicFetchError';
  }
}

export interface PublicFetchOptions {
  /** Largest body accepted, by header and while reading. */
  maxBytes: number;
  /** Accepted media types, lower case: exact (`text/html`) or a whole family (`image/*`). */
  contentTypes: readonly string[];
  /** One deadline for everything: lookups, every hop and reading the body. */
  timeoutMs: number;
  /** Redirects followed at most; one more is `too_many_redirects`. */
  maxRedirects: number;
  /** Sent as `Accept`; defaults to the accepted types. */
  accept?: string;
  /** Only hosts this accepts are requested, the first and every redirect (`blocked_host`). */
  allowHost?: (hostname: string) => boolean;
  /** Sent as `User-Agent`; defaults to a browser-like one that names no person. */
  userAgent?: string;
  /**
   * More request headers for every hop (spec 0043: `Referer` and the page's cookies for a TikTok
   * video). Only for callers that also restrict the hosts (allowHost): they go to every redirect.
   */
  headers?: { [name: string]: string };
}

export interface PublicFetchDeps {
  fetch: typeof fetch;
  /** Every A and AAAA address of a host name. */
  resolveDns: (hostname: string) => Promise<string[]>;
}

export interface PublicResponse {
  /** The address that answered, after redirects. */
  url: string;
  /** The media type without parameters, lower case. */
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** `name=value` of every cookie the hops set, in order (attributes dropped). */
  cookies: string[];
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);
// Some image hosts refuse requests without a browser-like agent; it names no person.
const USER_AGENT = 'Mozilla/5.0 (compatible; HousekeepingApp/1.0; +image-fetch)';

const fail = (reason: PublicFetchFailure) => new PublicFetchError(reason);

/** `name=value` of each Set-Cookie header; a header without `=` is dropped. */
function cookiesOf(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0]?.trim() ?? '')
    .filter((pair) => /^[^=\s]+=/.test(pair));
}

// ---------------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------------

function parseIpv4(text: string): number[] | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => (/^(0|[1-9]\d{0,2})$/.test(part) ? Number(part) : NaN));
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

/** The groups of one side of `::`; a dotted IPv4 tail counts as two groups. */
function ipv6Groups(part: string, mayEndInIpv4: boolean): number[] | undefined {
  if (part === '') return [];
  const pieces = part.split(':');
  const groups: number[] = [];
  for (const [index, piece] of pieces.entries()) {
    if (mayEndInIpv4 && index === pieces.length - 1 && piece.includes('.')) {
      const [a = 0, b = 0, c = 0, d = 0] = parseIpv4(piece) ?? [-1];
      if (a < 0) return undefined;
      groups.push((a << 8) | b, (c << 8) | d);
    } else if (/^[0-9a-f]{1,4}$/i.test(piece)) {
      groups.push(parseInt(piece, 16));
    } else {
      return undefined;
    }
  }
  return groups;
}

/** The eight 16-bit groups of an IPv6 address (with `::` and a dotted IPv4 tail), or undefined. */
function parseIpv6(text: string): number[] | undefined {
  if (!/^[0-9a-f:.]+$/i.test(text)) return undefined;
  const halves = text.split('::');
  if (halves.length === 1) {
    const groups = ipv6Groups(text, true);
    return groups?.length === 8 ? groups : undefined;
  }
  if (halves.length !== 2) return undefined;
  const head = ipv6Groups(halves[0] ?? '', false);
  const tail = ipv6Groups(halves[1] ?? '', true);
  if (!head || !tail || head.length + tail.length > 7) return undefined;
  return [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}

function inIpv4Range(octets: number[], base: string, bits: number): boolean {
  const toInt = (values: number[]) => values.reduce((sum, value) => sum * 256 + value, 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(octets) & mask) >>> 0 === (toInt(parseIpv4(base) ?? []) & mask) >>> 0;
}

// RFC 6890 special-purpose IPv4 ranges: nothing in them is the public internet.
const BLOCKED_IPV4: [string, number][] = [
  ['0.0.0.0', 8], // this network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

function isPublicIpv6(groups: number[]): boolean {
  const [first = 0, second = 0] = groups;
  // Only global unicast 2000::/3. That leaves out loopback, unspecified, IPv4-mapped and NAT64
  // (both embed an IPv4 address), unique local fc00::/7, link-local fe80::/10 and multicast.
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && second < 0x0200) return false; // Teredo, benchmarking, ORCHID
  if (first === 0x2001 && second === 0x0db8) return false; // documentation
  if (first === 0x2002) return false; // 6to4 embeds an IPv4 address
  if ((first & 0xfff0) === 0x3ff0) return false; // documentation 3fff::/20
  return true;
}

/** True only for a public unicast address; anything unparsable counts as not public. */
export function isPublicAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4) return !BLOCKED_IPV4.some(([base, bits]) => inIpv4Range(ipv4, base, bits));
  const ipv6 = parseIpv6(address);
  return ipv6 ? isPublicIpv6(ipv6) : false;
}

/**
 * Every A and AAAA address of a host. Only "no records" (Deno's NotFound: NXDOMAIN or no data)
 * makes a family empty; any other failure of either lookup throws, so an address that could
 * not be checked is never connected to (fail closed).
 */
export async function resolveAddresses(
  hostname: string,
  lookup: (hostname: string, type: 'A' | 'AAAA') => Promise<string[]>,
): Promise<string[]> {
  const families = await Promise.allSettled([lookup(hostname, 'A'), lookup(hostname, 'AAAA')]);
  return families.flatMap((family) => {
    if (family.status === 'fulfilled') return family.value;
    const reason: unknown = family.reason;
    if (reason instanceof Error && reason.name === 'NotFound') return [];
    throw reason;
  });
}

// ---------------------------------------------------------------------------------------------
// One request
// ---------------------------------------------------------------------------------------------

/** https, port 443, no credentials, a dotted host name or an IP literal. */
function checkedUrl(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw fail('invalid_url');
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '')
    throw fail('invalid_url');
  const host = url.hostname;
  if (!host.startsWith('[') && !host.includes('.')) throw fail('invalid_url');
  return url;
}

function within<T>(promise: Promise<T>, aborted: Promise<never>): Promise<T> {
  return Promise.race([promise, aborted]);
}

async function checkHost(url: URL, deps: PublicFetchDeps, aborted: Promise<never>) {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (parseIpv4(host) || host.includes(':')) {
    if (!isPublicAddress(host)) throw fail('blocked_address');
    return;
  }
  let addresses: string[];
  try {
    addresses = await within(deps.resolveDns(host), aborted);
  } catch (error) {
    if (error instanceof PublicFetchError) throw error;
    throw fail('dns_failed');
  }
  if (addresses.length === 0) throw fail('dns_failed');
  if (!addresses.every(isPublicAddress)) throw fail('blocked_address');
}

function mediaType(header: string | null): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function accepted(type: string, contentTypes: readonly string[]): boolean {
  return contentTypes.some((entry) =>
    entry.endsWith('/*')
      ? type.startsWith(entry.slice(0, -1)) && type.length > entry.length - 1
      : type === entry,
  );
}

async function readBody(
  response: Response,
  maxBytes: number,
  aborted: Promise<never>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw fail('too_large');
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await within(reader.read(), aborted);
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw fail('too_large');
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      if (error instanceof PublicFetchError) throw error;
      throw fail('network');
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * GETs a public https address and returns its body; throws PublicFetchError with the reason
 * otherwise. Nothing about the address is logged here.
 */
export async function fetchPublic(
  raw: string,
  options: PublicFetchOptions,
  deps: PublicFetchDeps,
): Promise<PublicResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const aborted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(fail('timeout'));
    }, options.timeoutMs);
  });
  aborted.catch(() => undefined);
  let url: URL | undefined;
  const cookies: string[] = [];
  try {
    url = checkedUrl(raw);
    for (let redirects = 0; ; redirects += 1) {
      if (options.allowHost && !options.allowHost(url.hostname.toLowerCase()))
        throw fail('blocked_host');
      await checkHost(url, deps, aborted);
      let response: Response;
      try {
        response = await within(
          deps.fetch(url.href, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              ...options.headers,
              accept: options.accept ?? options.contentTypes.join(', '),
              'user-agent': options.userAgent ?? USER_AGENT,
            },
          }),
          aborted,
        );
      } catch (error) {
        if (error instanceof PublicFetchError) throw error;
        throw fail(controller.signal.aborted ? 'timeout' : 'network');
      }
      cookies.push(...cookiesOf(response));
      if (REDIRECT.has(response.status)) {
        void response.body?.cancel().catch(() => undefined);
        const location = response.headers.get('location');
        if (!location) throw fail('http_status');
        if (redirects >= options.maxRedirects) throw fail('too_many_redirects');
        url = checkedUrl(location, url);
        continue;
      }
      if (response.status < 200 || response.status > 299) {
        void response.body?.cancel().catch(() => undefined);
        throw fail('http_status');
      }
      const contentType = mediaType(response.headers.get('content-type'));
      if (!accepted(contentType, options.contentTypes)) {
        void response.body?.cancel().catch(() => undefined);
        throw fail('wrong_type');
      }
      const bytes = await readBody(response, options.maxBytes, aborted);
      return { url: url.href, contentType, bytes, cookies };
    }
  } catch (error) {
    // Where it failed, e.g. the page a short link led to (spec 0040: the TikTok link is kept).
    if (error instanceof PublicFetchError && url) error.url = url.href;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
