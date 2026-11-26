// The web search (spec 0049): which hits become cards, their order, and how place data reads.
// This file imports nothing: `pnpm gen:edge` copies it into
// supabase/functions/_shared/web-results.gen.ts, where the edge function `web-search` uses it.

// core has no DOM types (no URL), so addresses are read with one pattern: scheme, host, path, query.
const ADDRESS = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#]*@)?([^/?#:]+)(?::\d+)?([^?#]*)(\?[^#]*)?/i;

/** The host without "www.", lower case; "" for what is no address. */
export function sourceHost(url: string): string {
  return (
    ADDRESS.exec(url)?.[2]
      ?.toLowerCase()
      .replace(/^www\./, '') ?? ''
  );
}

const NO_RECIPE_HOSTS = [
  'youtube.com',
  'youtu.be',
  'pinterest.com',
  'pinterest.de',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'reddit.com',
  'amazon.de',
];
/** Overview, magazine, search and list pages: one card must be one recipe (AC-007). */
const NO_RECIPE_PATH =
  /^\/(rs|magazin|suche|search|tag|tags|kategorie|category|thema|themen|sammlung)(\/|$)|[?&](q|s|query)=/i;

const onHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** True for an https page that can be a single recipe; the page itself must still show one. */
export function isRecipePage(url: string): boolean {
  const parts = ADDRESS.exec(url);
  if (!parts || parts[1]?.toLowerCase() !== 'https') return false;
  const host = sourceHost(url);
  if (NO_RECIPE_HOSTS.some((domain) => onHost(host, domain) || host.startsWith('pinterest.')))
    return false;
  return !NO_RECIPE_PATH.test(`${parts[3] ?? ''}${parts[4] ?? ''}`);
}

const PREFERRED_HOST = 'chefkoch.de';
const GOOD_RATING = 4;
const ENOUGH_RATINGS = 10;

/**
 * Well rated chefkoch.de recipes first (Entscheidung 1), the rest in the provider's order. The
 * provider's order stays among the preferred ones too.
 */
export function rankRecipeResults<T extends { url: string; rating?: number; ratingCount?: number }>(
  results: readonly T[],
): T[] {
  const preferred = (result: T) =>
    onHost(sourceHost(result.url), PREFERRED_HOST) &&
    (result.rating ?? 0) >= GOOD_RATING &&
    (result.ratingCount ?? 0) >= ENOUGH_RATINGS;
  return [...results.filter(preferred), ...results.filter((result) => !preferred(result))];
}

const WEEKDAYS: { [name: string]: number } = {
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonntag: 7,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/** ISO weekday (1 = Montag) of a day name the provider writes; undefined for anything else. */
export function weekdayOf(name: string): number | undefined {
  return WEEKDAYS[name.trim().toLowerCase()];
}

const SHORT_WEEKDAYS: { [name: string]: number } = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** ISO weekday of `now` in the household's time zone. */
export function isoWeekdayIn(now: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now);
  return SHORT_WEEKDAYS[short] ?? 1;
}

/** AC-011: "Heute 11:00–23:00" or "Heute geschlossen"; undefined when the day is not known. */
export function hoursToday(
  days: readonly { weekday: number; hours: string }[] | undefined,
  isoWeekday: number,
): string | undefined {
  const today = days?.find((day) => day.weekday === isoWeekday);
  if (!today) return undefined;
  return /^geschlossen$|^closed$/i.test(today.hours.trim())
    ? 'Heute geschlossen'
    : `Heute ${today.hours.trim()}`;
}

/**
 * The provider's price range as 1 (€) … 4 (€€€€): symbols count, a range in euro goes by its
 * upper end (up to 10 €, 20 €, 30 €, more).
 */
export function priceLevelOf(text: string | undefined): 1 | 2 | 3 | 4 | undefined {
  if (!text) return undefined;
  const symbols = /^\s*([€$]{1,4})\s*$/.exec(text);
  if (symbols?.[1]) return symbols[1].length as 1 | 2 | 3 | 4;
  const numbers = [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length === 0) return undefined;
  const upper = Math.max(...numbers);
  if (/\+/.test(text) || upper > 30) return 4;
  if (upper > 20) return 3;
  if (upper > 10) return 2;
  return 1;
}

/** The maps link of a Google place id (Entscheidung 2); undefined for anything but digits. */
export function mapsLinkOfCid(cid: string): string | undefined {
  return /^\d{1,30}$/.test(cid) ? `https://maps.google.com/?cid=${cid}` : undefined;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

/**
 * Where to search for places (Entscheidung 3): the median of the household's places, so one place
 * far away does not move it; undefined without places.
 */
export function searchCenter(
  points: readonly { lat: number; lng: number }[],
): { lat: number; lng: number } | undefined {
  if (points.length === 0) return undefined;
  return { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) };
}

/** AC-005: "★ 4,7 (638)"; undefined without a rating. */
export function ratingLabel(
  rating: number | undefined,
  ratingCount: number | undefined,
): string | undefined {
  if (rating === undefined) return undefined;
  const stars = `★ ${rating.toFixed(1).replace('.', ',')}`;
  if (ratingCount === undefined) return stars;
  return `${stars} (${ratingCount.toLocaleString('de-DE')})`;
}
