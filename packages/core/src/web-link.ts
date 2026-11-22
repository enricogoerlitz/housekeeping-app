import type { RecipeLink } from './types';

// Links to pages on the web (spec 0023, REQ-009; the website of restaurants and activities, spec
// 0024 REQ-003, follows the same rule). The rule is the one of private.is_web_url in the database:
// only http and https, a host name with a dot, no spaces or control characters, at most 2000
// characters. The app never loads the page; before a link is opened its address is checked again
// (linkDisplay), so an address that slipped into the cache another way stays plain text.

export const MAX_LINKS = 10;
export const MAX_URL_LENGTH = 2000;
export const MAX_LINK_LABEL_LENGTH = 80;
export const LINK_LIMIT_HINT = 'Höchstens 10 Links';

const ONLY_HTTP = 'Nur Adressen mit http:// oder https://';
const INVALID = 'Keine gültige Adresse';

// The same characters as the check in private.is_web_url: C0 and space, DEL, C1, no-break and
// other spaces, soft hyphen and the invisible or direction-changing characters.
const FORBIDDEN =
  /[\u0000-\u0020\u007f-\u00a0\u00ad\u061c\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/u;
const WEB_URL =
  /^https?:\/\/([A-Za-z0-9\u00a1-\uffff-]+\.)+[A-Za-z0-9\u00a1-\uffff-]+(:[0-9]{1,5})?([/?#].*)?$/su;
// Control and invisible characters in a label (as meal_plan_entries_reminder_text_valid).
const LABEL_CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/gu;
// "javascript:", "mailto:", "https:"; a colon followed by a digit is a port ("chefkoch.de:8080").
const SCHEME = /^([a-z][a-z0-9+.-]*):(?!\d)/i;

const length = (text: string): number => Array.from(text).length;

/** True when the address passes the rule of private.is_web_url as it is (no trimming). */
export function isWebUrl(url: string): boolean {
  return length(url) <= MAX_URL_LENGTH && !FORBIDDEN.test(url) && WEB_URL.test(url);
}

/**
 * The address as stored, from what was typed or pasted: edges trimmed, "https://" in front when
 * there is no scheme, the scheme in lower case. Otherwise the message for the field.
 */
export function normalizeWebUrl(input: string): { url: string } | { problem: string } {
  const trimmed = input.trim();
  if (trimmed === '') return { problem: 'Adresse fehlt' };
  const scheme = SCHEME.exec(trimmed);
  let url: string;
  if (scheme) {
    const name = (scheme[1] ?? '').toLowerCase();
    if (name !== 'http' && name !== 'https') return { problem: ONLY_HTTP };
    url = name + trimmed.slice(name.length);
  } else {
    url = `https://${trimmed}`;
  }
  if (length(url) > MAX_URL_LENGTH) return { problem: `Höchstens ${MAX_URL_LENGTH} Zeichen` };
  return isWebUrl(url) ? { url } : { problem: INVALID };
}

/** The host in lower case without "www." and port: "chefkoch.de". */
export function linkHost(url: string): string {
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]*)/i.exec(url)?.[1] ?? url;
  return host.toLowerCase().replace(/^www\./, '');
}

export interface LinkDisplay {
  /** The label, else the host. */
  title: string;
  /** The host under the label; undefined without a label. */
  subtitle?: string;
  /** The address to open; undefined when it fails the check (shown as text only, AC-035). */
  href?: string;
}

/** What a row under "Links" shows and opens. */
export function linkDisplay(link: RecipeLink): LinkDisplay {
  const valid = isWebUrl(link.url);
  const host = valid ? linkHost(link.url) : link.url;
  const display: LinkDisplay = link.label ? { title: link.label, subtitle: host } : { title: host };
  if (valid) display.href = link.url;
  return display;
}

export type LinkValidation = { link: RecipeLink } | { field: 'url' | 'label'; problem: string };

/**
 * The window "Link" on "Übernehmen": the normalised link, or the first problem with its field.
 * `editingIndex` is the link being edited; its own address does not count as a duplicate. Control
 * characters in the label are removed (they are invisible), a blank label is no label.
 */
export function validateLink(
  input: { url: string; label: string },
  links: readonly RecipeLink[],
  editingIndex?: number,
): LinkValidation {
  const normalized = normalizeWebUrl(input.url);
  if ('problem' in normalized) return { field: 'url', problem: normalized.problem };
  const label = input.label.replace(LABEL_CONTROL, '').trim();
  if (length(label) > MAX_LINK_LABEL_LENGTH) {
    return { field: 'label', problem: `Höchstens ${MAX_LINK_LABEL_LENGTH} Zeichen` };
  }
  const taken = links.some((link, index) => index !== editingIndex && link.url === normalized.url);
  if (taken) return { field: 'url', problem: 'Diesen Link gibt es schon' };
  return { link: label === '' ? { url: normalized.url } : { url: normalized.url, label } };
}

/** "+ Link": the list with the new link at the end; throws "Höchstens 10 Links" beyond the limit. */
export function addLink(links: readonly RecipeLink[], link: RecipeLink): RecipeLink[] {
  if (links.length >= MAX_LINKS) throw new Error(LINK_LIMIT_HINT);
  return [...links, link];
}
