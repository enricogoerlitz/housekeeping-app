// What a result card of the web search (spec 0049, REQ-002) shows of a page: its schema.org
// Recipe (JSON-LD) and its og:image. Never rendered and never followed; the values reach the app
// as data and are checked against the contract there. One pass with indexOf, so a hostile page
// costs linear time (like page-text.ts).

export interface PageRecipe {
  name?: string;
  imageUrl?: string;
  totalMinutes?: number;
  rating?: number;
  ratingCount?: number;
}

export interface PageMeta {
  ogImage?: string;
  /** Undefined when the page carries no Recipe: then it is no recipe card (AC-007). */
  recipe?: PageRecipe;
}

const MAX_TAG = 2000;
const MAX_URL = 2048;
const MAX_NAME = 200;
const ATTRIBUTE = /([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const JSON_LD = /\btype\s*=\s*["']?application\/ld\+json/i;

function decode(text: string): string {
  return text
    .replace(/&#(\d{1,7});/g, (whole, code: string) => {
      const value = Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const httpsUrl = (value: unknown): string | undefined =>
  typeof value === 'string' && value.startsWith('https://') && value.length <= MAX_URL
    ? value
    : undefined;

/** Minutes of an ISO 8601 duration ("PT1H20M", "P0DT45M"); undefined for anything else or 0. */
export function durationMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^P(?:(\d{1,3})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:\d{1,4}S)?)?$/i.exec(
    value.trim(),
  );
  if (!match) return undefined;
  const minutes =
    Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return minutes > 0 && minutes <= 10_000 ? minutes : undefined;
}

function firstImage(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = firstImage(entry);
      if (url) return url;
    }
    return undefined;
  }
  if (typeof value === 'object' && value !== null) return httpsUrl((value as { url?: unknown }).url);
  return httpsUrl(value);
}

const isRecipe = (node: { [key: string]: unknown }) => {
  const type = node['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
};

function findRecipe(node: unknown, depth = 0): { [key: string]: unknown } | undefined {
  if (depth > 4 || typeof node !== 'object' || node === null) return undefined;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findRecipe(entry, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const object = node as { [key: string]: unknown };
  if (isRecipe(object)) return object;
  return findRecipe(object['@graph'], depth + 1);
}

function recipeOf(node: { [key: string]: unknown }): PageRecipe {
  const recipe: PageRecipe = {};
  if (typeof node.name === 'string' && node.name.trim()) {
    recipe.name = decode(node.name.trim()).slice(0, MAX_NAME);
  }
  const imageUrl = firstImage(node.image);
  if (imageUrl) recipe.imageUrl = imageUrl;
  const parts = [durationMinutes(node.prepTime), durationMinutes(node.cookTime)];
  const total =
    durationMinutes(node.totalTime) ??
    (parts.some((part) => part !== undefined)
      ? parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
      : undefined);
  if (total !== undefined) recipe.totalMinutes = total;
  const rating = node.aggregateRating as { [key: string]: unknown } | undefined;
  if (typeof rating === 'object' && rating !== null) {
    const value = Number(rating.ratingValue);
    if (Number.isFinite(value) && value >= 0 && value <= 5) {
      recipe.rating = Math.round(value * 10) / 10;
      const count = Number(rating.ratingCount ?? rating.reviewCount);
      if (Number.isInteger(count) && count >= 0) recipe.ratingCount = count;
    }
  }
  return recipe;
}

function attributes(tag: string): { [name: string]: string } {
  const found: { [name: string]: string } = {};
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (name) found[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return found;
}

/** The og:image and the first Recipe of the page's JSON-LD. */
export function pageMeta(html: string): PageMeta {
  const lower = html.toLowerCase();
  const meta: PageMeta = {};
  for (let at = lower.indexOf('<meta'); at !== -1; at = lower.indexOf('<meta', at)) {
    const close = lower.indexOf('>', at);
    if (close === -1) break;
    const tag = html.slice(at, close);
    at = close;
    if (tag.length > MAX_TAG) continue;
    const attrs = attributes(tag);
    if ((attrs.property ?? attrs.name)?.toLowerCase() === 'og:image') {
      const url = httpsUrl(decode(attrs.content ?? '').trim());
      if (url) {
        meta.ogImage = url;
        break;
      }
    }
  }
  for (let at = lower.indexOf('<script'); at !== -1; at = lower.indexOf('<script', at)) {
    const close = lower.indexOf('>', at);
    if (close === -1) break;
    const tag = lower.slice(at, close);
    const end = lower.indexOf('</script', close);
    if (end === -1) break;
    at = end;
    if (!JSON_LD.test(tag)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(html.slice(close + 1, end));
    } catch {
      continue;
    }
    const found = findRecipe(parsed);
    if (found) {
      meta.recipe = recipeOf(found);
      break;
    }
  }
  return meta;
}
