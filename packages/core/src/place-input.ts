import { parseMapsLink } from './maps-link';
import { normalizeWebUrl } from './web-link';

// The place field of restaurants, activities and stores (spec 0042, REQ-001, REQ-003): the search
// in Google Maps behind the pin, and what a pasted text (or the clipboard behind "Einfügen") is —
// a map link, a web address or an address with a postcode.

/** What a text pasted into the place field is, and which field it belongs in. */
export type PlaceText =
  /** A Google Maps / Apple Karten link (also inside a shared "Name + link" text). */
  | { kind: 'maps'; url: string }
  /** Any other web address, as it would be stored ("https://" in front). */
  | { kind: 'web'; url: string }
  /** A postal address with a (German) postcode, its lines joined with commas. */
  | { kind: 'address'; text: string }
  | { kind: 'none' };

/** Longer than this it is no address but a text that happens to contain a postcode. */
const MAX_ADDRESS_LENGTH = 300;
const POSTCODE = /(^|[^\d])\d{5}(?!\d)/;
const LETTER = /\p{L}/u;
const URL_IN_TEXT = /https?:\/\/\S+/i;
/** "bless-berlin.de", "www.bless.de/menu": a host with a dot and a top-level domain, no spaces. */
const BARE_HOST = /^(www\.)?([a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,}([/?#]\S*)?$/iu;

/** Recognises a pasted text (AC-005 to AC-007). */
export function recognizePlaceText(input: string): PlaceText {
  const text = input.trim();
  if (text === '') return { kind: 'none' };
  const maps = parseMapsLink(text);
  if (maps) return { kind: 'maps', url: maps.url };
  const link = URL_IN_TEXT.exec(text)?.[0] ?? (BARE_HOST.test(text) ? text : undefined);
  if (link !== undefined) {
    const web = normalizeWebUrl(link);
    return 'url' in web ? { kind: 'web', url: web.url } : { kind: 'none' };
  }
  const address = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(', ');
  if (address.length <= MAX_ADDRESS_LENGTH && POSTCODE.test(address) && LETTER.test(address)) {
    return { kind: 'address', text: address };
  }
  return { kind: 'none' };
}

/**
 * Google Maps with the search for name and address, behind the pin (AC-001); undefined when there
 * is nothing to search for (AC-002: the pin is disabled).
 */
export function mapsSearchUrl(place: { name?: string; address?: string }): string | undefined {
  const query = [place.name?.trim(), place.address?.trim()].filter(Boolean).join(', ');
  if (query === '') return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * What a change of a field inserted at once, when that is more than one character — a paste
 * (or a dictated phrase): the field's own text stays the field's, a link or an address moves.
 * Undefined for typing, deleting or no change.
 */
export function insertedText(previous: string, next: string): string | undefined {
  if (next.length <= previous.length) return undefined;
  const limit = Math.min(previous.length, next.length);
  let start = 0;
  while (start < limit && previous[start] === next[start]) start += 1;
  let end = 0;
  while (
    end < limit - start &&
    previous[previous.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end += 1;
  }
  const inserted = next.slice(start, next.length - end);
  return inserted.length > 1 ? inserted : undefined;
}

/**
 * The field that gets the cursor after `filled` was filled (AC-006): the next empty one in
 * `order`, else the first empty one before it; undefined when every field has a value.
 */
export function nextEmptyField<F extends string>(
  order: readonly F[],
  values: Readonly<Partial<Record<F, string>>>,
  filled: F,
): F | undefined {
  const empty = (field: F) => field !== filled && (values[field] ?? '').trim() === '';
  const at = order.indexOf(filled);
  return [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))].find(empty);
}
