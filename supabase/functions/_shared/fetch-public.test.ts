import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPublic,
  isPublicAddress,
  PublicFetchError,
  type PublicFetchDeps,
  type PublicFetchOptions,
} from './fetch-public.ts';

const IMAGE: PublicFetchOptions = {
  maxBytes: 1024,
  contentTypes: ['image/*'],
  timeoutMs: 10_000,
  maxRedirects: 3,
};

const PUBLIC_IP = '93.184.215.14';

function deps(
  routes: { [url: string]: () => Response | Promise<Response> },
  dns: { [host: string]: string[] } = {},
): PublicFetchDeps & { fetchMock: ReturnType<typeof vi.fn<typeof fetch>> } {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected fetch ${String(input)}`);
    return route();
  });
  return {
    fetch: fetchMock,
    fetchMock,
    resolveDns: async (host) => dns[host] ?? [PUBLIC_IP],
  };
}

const image = (size = 10, type = 'image/jpeg') =>
  new Response(new Uint8Array(size).fill(0xff), { status: 200, headers: { 'content-type': type } });

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PublicFetchError) return error.reason;
    throw error;
  }
  return 'resolved';
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isPublicAddress (spec 0039, Risiken: SSRF)', () => {
  it.each([
    ['loopback v4', '127.0.0.1'],
    ['loopback v4 range', '127.255.0.9'],
    ['this network', '0.0.0.0'],
    ['private 10/8', '10.0.0.1'],
    ['private 172.16/12', '172.16.5.4'],
    ['private 172.31', '172.31.255.255'],
    ['private 192.168/16', '192.168.1.1'],
    ['link-local / cloud metadata', '169.254.169.254'],
    ['CGNAT 100.64/10', '100.64.0.1'],
    ['CGNAT upper end', '100.127.255.254'],
    ['IETF 192.0.0/24', '192.0.0.8'],
    ['documentation 192.0.2/24', '192.0.2.10'],
    ['benchmarking 198.18/15', '198.19.0.1'],
    ['multicast 224/4', '224.0.0.251'],
    ['reserved 240/4', '240.0.0.1'],
    ['broadcast', '255.255.255.255'],
    ['loopback v6', '::1'],
    ['unspecified v6', '::'],
    ['unique local fc00::/7', 'fd12:3456::1'],
    ['unique local fc00', 'fc00::1'],
    ['link-local v6', 'fe80::1'],
    ['multicast v6', 'ff02::1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-mapped public', '::ffff:8.8.8.8'],
    ['IPv4-mapped hex', '::ffff:7f00:1'],
    ['NAT64', '64:ff9b::a00:1'],
    ['6to4', '2002:a00:1::1'],
    ['Teredo', '2001:0:4136:e378::1'],
    ['documentation v6', '2001:db8::1'],
    ['zone id', 'fe80::1%eth0'],
    ['garbage', 'not-an-ip'],
    ['v4 with leading zero octet text', '010.0.0.1'],
  ])('refuses %s (%s)', (_name, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    ['public v4', '93.184.215.14'],
    ['just outside 172.16/12', '172.32.0.1'],
    ['just outside CGNAT', '100.128.0.1'],
    ['public v6', '2606:4700:10::6814:179a'],
    ['public v6 full form', '2a00:1450:4001:0829:0000:0000:0000:200e'],
  ])('allows %s (%s)', (_name, address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('fetchPublic', () => {
  it('AC-006: loads a public image and returns its bytes, type and final address', async () => {
    const d = deps({ 'https://example.org/kuchen.jpg': () => image(10) });
    const result = await fetchPublic('https://example.org/kuchen.jpg', IMAGE, d);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.bytes.byteLength).toBe(10);
    expect(result.url).toBe('https://example.org/kuchen.jpg');
    expect(d.fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', method: 'GET' });
  });

  it('AC-007: refuses http, another port, credentials and a single-label host before any request', async () => {
    const d = deps({});
    for (const url of [
      'http://example.org/a.jpg',
      'https://example.org:8443/a.jpg',
      'https://user:pw@example.org/a.jpg',
      'https://kong/a.jpg',
      'file:///etc/passwd',
      'nonsense',
    ])
      expect(await reason(fetchPublic(url, IMAGE, d))).toBe('invalid_url');
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-007: refuses internal addresses given directly (localhost, 10.0.0.1, 169.254.169.254, [::1])', async () => {
    const d = deps({});
    for (const url of [
      'https://127.0.0.1/a.jpg',
      'https://10.0.0.1/a.jpg',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/a.jpg',
      'https://[::ffff:10.0.0.1]/a.jpg',
      'https://0x7f.1/a.jpg',
    ])
      expect(await reason(fetchPublic(url, IMAGE, d))).toBe('blocked_address');
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it('AC-007: refuses a name that resolves to an internal address, even when only one of them is', async () => {
    const d = deps({}, { 'intern.example.org': [PUBLIC_IP, '192.168.0.10'] });
    expect(await reason(fetchPublic('https://intern.example.org/a.jpg', IMAGE, d))).toBe(
      'blocked_address',
    );
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a name that does not resolve or whose lookup fails', async () => {
    const empty = deps({}, { 'nowhere.example.org': [] });
    expect(await reason(fetchPublic('https://nowhere.example.org/a.jpg', IMAGE, empty))).toBe(
      'dns_failed',
    );
    const failing: PublicFetchDeps = {
      fetch: vi.fn<typeof fetch>(),
      resolveDns: async () => {
        throw new Error('NXDOMAIN');
      },
    };
    expect(await reason(fetchPublic('https://x.example.org/a.jpg', IMAGE, failing))).toBe(
      'dns_failed',
    );
  });

  it('AC-007: checks every redirect target again and refuses one to an internal address', async () => {
    const d = deps(
      { 'https://cdn.example.org/a.jpg': () => redirect('https://metadata.example.org/x') },
      { 'metadata.example.org': ['169.254.169.254'] },
    );
    expect(await reason(fetchPublic('https://cdn.example.org/a.jpg', IMAGE, d))).toBe(
      'blocked_address',
    );
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AC-007: refuses a redirect to http', async () => {
    const d = deps({ 'https://cdn.example.org/a.jpg': () => redirect('http://cdn.example.org/a') });
    expect(await reason(fetchPublic('https://cdn.example.org/a.jpg', IMAGE, d))).toBe(
      'invalid_url',
    );
  });

  it('follows at most maxRedirects redirects, relative ones included', async () => {
    const d = deps({
      'https://a.example.org/1': () => redirect('/2', 301),
      'https://a.example.org/2': () => redirect('https://b.example.org/3', 307),
      'https://b.example.org/3': () => redirect('https://b.example.org/4', 308),
      'https://b.example.org/4': () => image(5),
    });
    const result = await fetchPublic('https://a.example.org/1', IMAGE, d);
    expect(result.url).toBe('https://b.example.org/4');
    const tooMany = deps({
      'https://a.example.org/1': () => redirect('/2'),
      'https://a.example.org/2': () => redirect('/3'),
      'https://a.example.org/3': () => redirect('/4'),
      'https://a.example.org/4': () => redirect('/5'),
      'https://a.example.org/5': () => image(5),
    });
    expect(await reason(fetchPublic('https://a.example.org/1', IMAGE, tooMany))).toBe(
      'too_many_redirects',
    );
    expect(tooMany.fetchMock).toHaveBeenCalledTimes(4);
  });

  it('AC-007: refuses HTML when an image is asked for, and an error status', async () => {
    const html = deps({
      'https://example.org/page': () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    });
    expect(await reason(fetchPublic('https://example.org/page', IMAGE, html))).toBe('wrong_type');
    const missing = deps({
      'https://example.org/gone.jpg': () => new Response('', { status: 404 }),
    });
    expect(await reason(fetchPublic('https://example.org/gone.jpg', IMAGE, missing))).toBe(
      'http_status',
    );
  });

  it('accepts exact content types for pages (spec 0040 reuses it for HTML)', async () => {
    const d = deps({
      'https://example.org/rezept': () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'Text/HTML; charset=utf-8' },
        }),
    });
    const result = await fetchPublic(
      'https://example.org/rezept',
      { ...IMAGE, contentTypes: ['text/html', 'application/xhtml+xml'] },
      d,
    );
    expect(result.contentType).toBe('text/html');
    expect(new TextDecoder().decode(result.bytes)).toBe('<html></html>');
  });

  it('AC-007: refuses a body larger than maxBytes, by header and while reading (16 MB case)', async () => {
    const declared = deps({
      'https://example.org/big.jpg': () =>
        new Response(new Uint8Array(4), {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': String(16 * 1024 * 1024) },
        }),
    });
    expect(await reason(fetchPublic('https://example.org/big.jpg', IMAGE, declared))).toBe(
      'too_large',
    );
    const streamed = deps({ 'https://example.org/big.jpg': () => image(1025) });
    expect(await reason(fetchPublic('https://example.org/big.jpg', IMAGE, streamed))).toBe(
      'too_large',
    );
    const exact = deps({ 'https://example.org/ok.jpg': () => image(1024) });
    expect((await fetchPublic('https://example.org/ok.jpg', IMAGE, exact)).bytes.byteLength).toBe(
      1024,
    );
  });

  it('AC-007: gives up after timeoutMs while waiting for the answer', async () => {
    vi.useFakeTimers();
    const d = deps({
      'https://slow.example.org/a.jpg': () => new Promise<Response>(() => undefined),
    });
    const pending = reason(fetchPublic('https://slow.example.org/a.jpg', IMAGE, d));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBe('timeout');
    const signal = d.fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
  });

  it('AC-007: gives up after timeoutMs while the body trickles in', async () => {
    vi.useFakeTimers();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xd8]));
      },
    });
    const d = deps({
      'https://slow.example.org/a.jpg': () =>
        new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    });
    const pending = reason(fetchPublic('https://slow.example.org/a.jpg', IMAGE, d));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBe('timeout');
  });

  it('a network error is "network"', async () => {
    const d = deps({
      'https://down.example.org/a.jpg': () => Promise.reject(new TypeError('connection refused')),
    });
    expect(await reason(fetchPublic('https://down.example.org/a.jpg', IMAGE, d))).toBe('network');
  });
});
