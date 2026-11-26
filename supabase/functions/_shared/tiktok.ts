// A TikTok link in "Mit KI ausfüllen" (spec 0040, REQ-006, Entscheidung 3 A): the short link is
// resolved, the video page's embedded JSON gives the description, the cover image and the
// subtitles (automatic captions, text only). "Video speichern" (spec 0043) reads the same page for
// the video's address (playAddr) and loads the MP4 with the cookies that page set and TikTok as the
// referer: TikTok's video hosts answer 403 without either (checked 26.11.2026). Every request goes
// through fetchPublic and stays on TikTok and its CDNs. This is TikTok's web page, no official
// interface: when TikTok changes it, the link is still kept and the app says it could not be read.
import {
  fetchPublic,
  PublicFetchError,
  type PublicFetchDeps,
  type PublicResponse,
} from './fetch-public.ts';

const PAGE_MAX_BYTES = 2 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 10_000;
const PAGE_REDIRECTS = 5;
const SUBTITLE_MAX_BYTES = 64 * 1024;
const SUBTITLE_TIMEOUT_MS = 5_000;
const SUBTITLE_REDIRECTS = 2;
const MAX_TEXT = 20_000;
const MAX_URL = 2048;
/** Spec 0043, Entscheidung 2 and 3: the bucket's limit, loaded within 60 s. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_TIMEOUT_MS = 60_000;
const VIDEO_REDIRECTS = 3;
const VIDEO_REFERER = 'https://www.tiktok.com/';
// The playAddr of a real page is longer than a cover's address (signed query); still bounded.
const MAX_VIDEO_URL = 4096;

const FETCH_DOMAINS = ['tiktok.com', 'tiktokcdn.com', 'tiktokcdn-eu.com', 'tiktokcdn-us.com'];

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** tiktok.com and its subdomains (vm., vt., www., m.): a link the person shared. */
export function isTikTokHost(host: string): boolean {
  return onDomain(host.toLowerCase(), 'tiktok.com');
}

/** Where the fetches for a TikTok link may go: TikTok and its CDNs, nothing else. */
export function tiktokFetchHost(host: string): boolean {
  const lower = host.toLowerCase();
  return FETCH_DOMAINS.some((domain) => onDomain(lower, domain));
}

export interface TikTokRead {
  /** Where the link leads (the video page, without tracking parameters); absent when unknown. */
  resolvedUrl?: string;
  /** "Beschreibung: …" and "Untertitel: …"; empty when the page gave nothing (AC-017). */
  text: string;
  /** The video's cover, https on a TikTok CDN. */
  coverUrl?: string;
}

/** A TikTok video page, without query and fragment; undefined for anything else. */
function videoPage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !isTikTokHost(url.hostname)) return undefined;
    if (!/\/video\/\d+/.test(url.pathname)) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/** An https address on TikTok's hosts, short enough for the contract. */
function tiktokAddress(raw: unknown, maxLength = MAX_URL): string | undefined {
  if (typeof raw !== 'string' || raw.length > maxLength) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && tiktokFetchHost(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

type Json = { [key: string]: unknown };
const object = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The video's data from the page's `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON, or undefined. */
function itemOf(html: string): Json | undefined {
  const match =
    /<script\b[^>]*id\s*=\s*["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(
      html,
    );
  if (!match) return undefined;
  try {
    const data = object(JSON.parse(match[1] ?? ''));
    const detail = object(object(data.__DEFAULT_SCOPE__)['webapp.video-detail']);
    const item = object(object(detail.itemInfo).itemStruct);
    return Object.keys(item).length > 0 ? item : undefined;
  } catch {
    return undefined;
  }
}

/** The spoken words of a WebVTT file: no header, cue numbers, timings, notes or tags. */
export function vttText(vtt: string): string {
  const words: string[] = [];
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const first = lines[0]?.trim() ?? '';
    if (first.startsWith('WEBVTT') || first.startsWith('NOTE') || first.startsWith('STYLE'))
      continue;
    for (const line of lines) {
      if (line.includes('-->') || /^\d+$/.test(line.trim())) continue;
      const spoken = line.replace(/<[^>]*>/g, '').trim();
      if (spoken) words.push(spoken);
    }
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/** German subtitles first, else English, else none. */
function subtitleUrl(video: Json): string | undefined {
  const infos = Array.isArray(video.subtitleInfos) ? video.subtitleInfos.map(object) : [];
  const vtt = infos.filter((info) => text(info.Format).toLowerCase() === 'webvtt');
  const pick = (prefix: string) =>
    vtt.find((info) => text(info.LanguageCodeName).toLowerCase().startsWith(prefix));
  return tiktokAddress((pick('deu') ?? pick('eng'))?.Url);
}

async function subtitles(url: string | undefined, deps: PublicFetchDeps): Promise<string> {
  if (!url) return '';
  try {
    const { bytes } = await fetchPublic(
      url,
      {
        maxBytes: SUBTITLE_MAX_BYTES,
        contentTypes: ['text/plain', 'text/vtt'],
        timeoutMs: SUBTITLE_TIMEOUT_MS,
        maxRedirects: SUBTITLE_REDIRECTS,
        allowHost: tiktokFetchHost,
      },
      deps,
    );
    return vttText(new TextDecoder().decode(bytes));
  } catch {
    return '';
  }
}

/** The video page a TikTok link leads to, short links resolved; never leaves TikTok. */
function fetchPage(link: string, deps: PublicFetchDeps): Promise<PublicResponse> {
  return fetchPublic(
    link,
    {
      maxBytes: PAGE_MAX_BYTES,
      contentTypes: ['text/html'],
      timeoutMs: PAGE_TIMEOUT_MS,
      maxRedirects: PAGE_REDIRECTS,
      allowHost: tiktokFetchHost,
    },
    deps,
  );
}

/**
 * Reads a TikTok link. Never throws for anything the internet does: a link that resolved but gave
 * no data keeps `resolvedUrl` with an empty `text`; a dead link gives `{ text: '' }`.
 */
export async function readTikTok(link: string, deps: PublicFetchDeps): Promise<TikTokRead> {
  let page: { url: string; bytes: Uint8Array };
  try {
    page = await fetchPage(link, deps);
  } catch (error) {
    if (!(error instanceof PublicFetchError)) throw error;
    const resolvedUrl = videoPage(error.url);
    return resolvedUrl ? { resolvedUrl, text: '' } : { text: '' };
  }
  const item = itemOf(new TextDecoder().decode(page.bytes));
  const fallback = videoPage(page.url);
  if (!item) return fallback ? { resolvedUrl: fallback, text: '' } : { text: '' };

  const author = text(object(item.author).uniqueId);
  const id = text(item.id);
  const canonical =
    /^[\w.-]{1,64}$/.test(author) && /^\d{1,25}$/.test(id)
      ? `https://www.tiktok.com/@${author}/video/${id}`
      : fallback;
  const video = object(item.video);
  const desc = text(item.desc);
  const spoken = await subtitles(subtitleUrl(video), deps);
  const parts = [desc && `Beschreibung: ${desc}`, spoken && `Untertitel: ${spoken}`].filter(
    Boolean,
  );
  const result: TikTokRead = { text: Array.from(parts.join('\n')).slice(0, MAX_TEXT).join('') };
  if (canonical) result.resolvedUrl = canonical;
  const coverUrl =
    tiktokAddress(text(video.cover) || undefined) ?? tiktokAddress(video.originCover);
  if (coverUrl) result.coverUrl = coverUrl;
  return result;
}

/** Why a TikTok link gave no video (spec 0043): AC-002 and AC-003. */
export class TikTokVideoError extends Error {
  constructor(readonly reason: 'unavailable' | 'too_large') {
    super(reason);
    this.name = 'TikTokVideoError';
  }
}

/** An MP4 starts with a box whose type is `ftyp` (ISO/IEC 14496-12). */
function isMp4(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

/**
 * The MP4 of a TikTok video (spec 0043, REQ-001): the page (short link resolved), its playAddr,
 * then the file with the page's cookies and TikTok as the referer, at most VIDEO_MAX_BYTES within
 * 60 s. Throws TikTokVideoError: `too_large` above the limit (by the page's size, the answer's
 * header or while reading), `unavailable` for everything else the internet or TikTok does.
 */
export async function loadTikTokVideo(
  link: string,
  deps: PublicFetchDeps,
): Promise<Uint8Array<ArrayBuffer>> {
  const unavailable = () => new TikTokVideoError('unavailable');
  let page: PublicResponse;
  try {
    page = await fetchPage(link, deps);
  } catch (error) {
    if (error instanceof PublicFetchError) throw unavailable();
    throw error;
  }
  const video = object(itemOf(new TextDecoder().decode(page.bytes))?.video);
  const address = tiktokAddress(video.playAddr, MAX_VIDEO_URL);
  if (!address) throw unavailable();
  if (typeof video.size === 'number' && video.size > VIDEO_MAX_BYTES)
    throw new TikTokVideoError('too_large');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    ({ bytes } = await fetchPublic(
      address,
      {
        maxBytes: VIDEO_MAX_BYTES,
        contentTypes: ['video/mp4'],
        timeoutMs: VIDEO_TIMEOUT_MS,
        maxRedirects: VIDEO_REDIRECTS,
        allowHost: tiktokFetchHost,
        headers: { referer: VIDEO_REFERER, cookie: page.cookies.join('; ') },
      },
      deps,
    ));
  } catch (error) {
    if (error instanceof PublicFetchError)
      throw new TikTokVideoError(error.reason === 'too_large' ? 'too_large' : 'unavailable');
    throw error;
  }
  if (!isMp4(bytes)) throw unavailable();
  return bytes;
}
