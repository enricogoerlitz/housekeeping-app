// A YouTube link in "Mit KI ausfüllen" (spec 0064): title, the whole description and the thumbnail
// of one video, without a download and without an API key. The watch page embeds them as
// `ytInitialPlayerResponse.videoDetails` (PoC 27.11.2026); when that page gives nothing (consent
// page, bot check, timeout, a changed page) the official oEmbed answer gives title and thumbnail.
// Every request goes through fetchPublic and stays on youtube.com. This is YouTube's web page, no
// official interface: when YouTube changes it, oEmbed still names the video, and the link is kept.
import {
  fetchPublic,
  PublicFetchError,
  type PublicFetchDeps,
  type PublicFetchOptions,
} from './fetch-public.ts';
import { isRecipePage } from './web-results.gen.ts';

/** Entscheidung 3: the page within 2.5 MB and 8 s, oEmbed within 4 s, 6000 characters of text. */
const PAGE_MAX_BYTES = 2.5 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 8_000;
const PAGE_REDIRECTS = 3;
const OEMBED_MAX_BYTES = 64 * 1024;
const OEMBED_TIMEOUT_MS = 4_000;
const OEMBED_REDIRECTS = 2;
const MAX_DESCRIPTION = 6000;
const MAX_URL = 2048;
// The page differs for agents it does not know; a common browser's agent names no person.
const BROWSER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Without a consent answer YouTube sends visitors from the EU to consent.youtube.com first.
const CONSENT_COOKIE = 'SOCS=CAI; CONSENT=YES+1';

const VIDEO_ID = /^[\w-]{11}$/;
const VIDEO_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Where the fetches for a YouTube link may go: youtube.com and its subdomains, nothing else. */
export function youtubeFetchHost(host: string): boolean {
  return onDomain(host.toLowerCase(), 'youtube.com');
}

export interface YouTubeVideo {
  id: string;
  /** `https://www.youtube.com/watch?v=<id>`: saved as the recipe's link (REQ-004). */
  url: string;
}

/**
 * REQ-001: a link to one video — `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, on
 * www., m. or no subdomain — as its id and normalized address; undefined for everything else
 * (channels, playlists, YouTube Music), which is read like any page (AC-003).
 */
export function youtubeVideo(link: string): YouTubeVideo | undefined {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const host = url.hostname.toLowerCase();
  let id: string | null | undefined;
  if (host === 'youtu.be') id = /^\/([^/]+)$/.exec(url.pathname)?.[1];
  else if (VIDEO_HOSTS.includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/shorts\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  }
  if (!id || !VIDEO_ID.test(id)) return undefined;
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}

export interface YouTubeRead {
  /** The normalized watch address, also when nothing could be read. */
  resolvedUrl: string;
  /** "Titel: …" and "Beschreibung: …"; empty when neither the page nor oEmbed answered (AC-006). */
  text: string;
  /** The largest thumbnail, https on YouTube's image hosts. */
  coverUrl?: string;
  /** REQ-003: a recipe page the description names when it has no ingredient part itself. */
  recipeLink?: string;
  /** AC-011: the watch page gave no description (bot check, consent page); at most the title. */
  descriptionUnread?: true;
}

type Json = { [key: string]: unknown };
const object = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** An https thumbnail on ytimg.com, short enough for the contract. */
function thumbnailAddress(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_URL) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && onDomain(url.hostname.toLowerCase(), 'ytimg.com')
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The object literal that starts at `start`, by its balanced braces outside of strings; a scan
 * instead of a pattern, because a description may contain `};` or `</script>` in its text.
 */
function objectAt(source: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let at = start; at < source.length; at += 1) {
    const char = source[at];
    if (inString) {
      if (char === '\\') at += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, at + 1);
    }
  }
  return undefined;
}

/** `videoDetails` of the page's `ytInitialPlayerResponse`, when it is the asked video's. */
function detailsOf(html: string, id: string): Json | undefined {
  const marker = /ytInitialPlayerResponse\s*=\s*\{/.exec(html);
  if (!marker) return undefined;
  const literal = objectAt(html, marker.index + marker[0].length - 1);
  if (!literal) return undefined;
  try {
    const details = object(object(JSON.parse(literal)).videoDetails);
    return text(details.videoId) === id && text(details.title) !== '' ? details : undefined;
  } catch {
    return undefined;
  }
}

/** Entscheidung 2: the widest of the page's thumbnails (maxresdefault when the video has one). */
function largestThumbnail(details: Json): string | undefined {
  const list = object(details.thumbnail).thumbnails;
  const thumbnails = Array.isArray(list) ? list.map(object) : [];
  let best: { url: string; width: number } | undefined;
  for (const thumbnail of thumbnails) {
    const url = thumbnailAddress(thumbnail.url);
    const width = typeof thumbnail.width === 'number' ? thumbnail.width : 0;
    if (url && (!best || width > best.width)) best = { url, width };
  }
  return best?.url;
}

const youtubeOptions = (
  options: Pick<PublicFetchOptions, 'maxBytes' | 'contentTypes' | 'timeoutMs' | 'maxRedirects'>,
): PublicFetchOptions => ({
  ...options,
  allowHost: youtubeFetchHost,
  userAgent: BROWSER_AGENT,
  headers: { 'accept-language': 'de-DE,de;q=0.9', cookie: CONSENT_COOKIE },
});

/** Title, description and thumbnail of the watch page; undefined for anything else. */
async function fromPage(
  video: YouTubeVideo,
  deps: PublicFetchDeps,
): Promise<{ title: string; description: string; coverUrl?: string } | undefined> {
  let html: string;
  try {
    const page = await fetchPublic(
      `${video.url}&hl=de`,
      youtubeOptions({
        maxBytes: PAGE_MAX_BYTES,
        contentTypes: ['text/html'],
        timeoutMs: PAGE_TIMEOUT_MS,
        maxRedirects: PAGE_REDIRECTS,
      }),
      deps,
    );
    html = new TextDecoder().decode(page.bytes);
  } catch (error) {
    if (!(error instanceof PublicFetchError)) throw error;
    console.error('youtube_page_unread', { reason: error.reason });
    return undefined;
  }
  const details = detailsOf(html, video.id);
  if (!details) {
    console.error('youtube_page_unread', { reason: 'no_video_details' });
    return undefined;
  }
  const coverUrl = largestThumbnail(details);
  return {
    title: text(details.title),
    description: text(details.shortDescription),
    ...(coverUrl ? { coverUrl } : {}),
  };
}

/** AC-005: title and thumbnail from YouTube's oEmbed; undefined when it does not answer. */
async function fromOembed(
  video: YouTubeVideo,
  deps: PublicFetchDeps,
): Promise<{ title: string; coverUrl?: string } | undefined> {
  try {
    const answer = await fetchPublic(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(video.url)}&format=json`,
      youtubeOptions({
        maxBytes: OEMBED_MAX_BYTES,
        contentTypes: ['application/json'],
        timeoutMs: OEMBED_TIMEOUT_MS,
        maxRedirects: OEMBED_REDIRECTS,
      }),
      deps,
    );
    const data = object(JSON.parse(new TextDecoder().decode(answer.bytes)));
    const coverUrl = thumbnailAddress(data.thumbnail_url);
    return { title: text(data.title), ...(coverUrl ? { coverUrl } : {}) };
  } catch (error) {
    if (!(error instanceof PublicFetchError) && !(error instanceof SyntaxError)) throw error;
    console.error('youtube_oembed_unread', {
      reason: error instanceof PublicFetchError ? error.reason : 'invalid_json',
    });
    return undefined;
  }
}

// A heading "Zutaten …" on its own short line (an emoji or bullet before it is fine).
const INGREDIENT_HEADING =
  /^[^\p{L}\p{N}]*(zutaten|ingredients|einkaufsliste|du brauchst|ihr braucht)\b/iu;
// "400 g Spaghetti", "- ½ TL Salz", "2 Knoblauchzehen": an amount, maybe a unit, then a word.
const AMOUNT_LINE =
  /^[^\p{L}\p{N}]*(?:\d+(?:[.,/]\d+)?(?:\s*-\s*\d+)?|[½¼¾⅓⅔])\s*(?:g|kg|ml|l|cl|dl|el|tl|stk|stück|prisen?|bund|dosen?|packung(?:en)?|pck|pkg|zehen?|scheiben?|tassen?|cups?|tbsp|tsp|oz|lbs?)?\.?\s+\p{L}/iu;
const MIN_AMOUNT_LINES = 3;

/** REQ-003 (AC-008): a heading "Zutaten" or at least three lines with an amount. */
export function hasIngredientPart(description: string): boolean {
  const lines = description.split('\n').map((line) => line.trim());
  if (
    lines.some(
      (line) => line.length <= 40 && !/https?:\/\//i.test(line) && INGREDIENT_HEADING.test(line),
    )
  )
    return true;
  return lines.filter((line) => AMOUNT_LINE.test(line)).length >= MIN_AMOUNT_LINES;
}

const LINK = /https?:\/\/[^\s<>"'„“”«»]+/giu;
const TRAILING = /[.,;:!?)\]}]+$/u;

/**
 * REQ-003 (AC-007, AC-008): the first link of a description without an ingredient part that
 * leads to a single recipe page (its path says "rezept" or "recipe"), as https; else undefined.
 */
export function descriptionRecipeLink(description: string): string | undefined {
  if (hasIngredientPart(description)) return undefined;
  for (const match of description.matchAll(LINK)) {
    const url = match[0].replace(TRAILING, '').replace(/^http:\/\//i, 'https://');
    if (url.length > MAX_URL || !isRecipePage(url)) continue;
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      continue;
    }
    if (/rezept|recipe/i.test(path)) return url;
  }
  return undefined;
}

/**
 * Reads a YouTube video (REQ-002). Never throws for anything the internet does: the watch page,
 * else oEmbed; with neither the text is empty and the normalized address stays.
 */
export async function readYouTube(
  video: YouTubeVideo,
  deps: PublicFetchDeps,
): Promise<YouTubeRead> {
  const page = await fromPage(video, deps);
  const oembed = page?.coverUrl ? undefined : await fromOembed(video, deps);
  const title = page?.title ?? oembed?.title ?? '';
  const description = Array.from(page?.description ?? '')
    .slice(0, MAX_DESCRIPTION)
    .join('');
  const parts = [title && `Titel: ${title}`, description && `Beschreibung: ${description}`];
  const result: YouTubeRead = { resolvedUrl: video.url, text: parts.filter(Boolean).join('\n') };
  const coverUrl = page?.coverUrl ?? oembed?.coverUrl;
  if (coverUrl) result.coverUrl = coverUrl;
  const recipeLink = page ? descriptionRecipeLink(page.description) : undefined;
  if (recipeLink) result.recipeLink = recipeLink;
  if (!page) result.descriptionUnread = true;
  return result;
}
