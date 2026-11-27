import { AGENT_BADGE_LABELS, AGENT_LIMITS, type AgentBadgeSlug } from './ai-agent';

// Spec 0067 "Housekeeping-Agent", REQ-003/REQ-004: the badges of the agent ("Rezepte",
// "Ausgehen" …) in the input. A badge is a hint to the agent, never a lock and never free text:
// the start page and the slash menu set it, ✕ or backspace right behind it remove it whole,
// several may stand in one message. The slugs and their labels are part of the contract
// (ai-agent.ts); this is the input's logic, used only by the app.

export interface AgentBadge {
  slug: AgentBadgeSlug;
  label: string;
  /** The one line of the start page "Ich kann …". */
  line: string;
  /** Further words the slash menu matches ("/re" finds "Ausgehen" by "Restaurants"). */
  keywords: readonly string[];
}

export const AGENT_BADGES: readonly AgentBadge[] = [
  {
    slug: 'rezepte',
    label: AGENT_BADGE_LABELS.rezepte,
    line: 'Eure Rezepte finden – was passt, was ihr lange nicht hattet',
    keywords: ['Kochen'],
  },
  {
    slug: 'ausgehen',
    label: AGENT_BADGE_LABELS.ausgehen,
    line: 'Restaurants und Aktivitäten suchen, auch im Web',
    keywords: ['Restaurants', 'Aktivitäten', 'Essen gehen'],
  },
  {
    slug: 'planen',
    label: AGENT_BADGE_LABELS.planen,
    line: 'Kalender und Reisen im Blick: was ansteht, wo noch Platz ist',
    keywords: ['Kalender', 'Woche', 'Wochenplan'],
  },
  {
    slug: 'einkaufen',
    label: AGENT_BADGE_LABELS.einkaufen,
    line: 'Was auf der Liste steht, Dauerposten und Artikel',
    keywords: ['Liste', 'Dauerposten', 'Artikel'],
  },
  {
    slug: 'haushalt',
    label: AGENT_BADGE_LABELS.haushalt,
    line: 'Aufgaben: was fällig ist und wer dran ist',
    keywords: ['Aufgaben', 'Putzen'],
  },
];

export function badgeLabel(slug: AgentBadgeSlug): string {
  return AGENT_BADGE_LABELS[slug];
}

const fold = (value: string) =>
  value.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

/** The slash word being typed: "/" at the start or after whitespace, up to the cursor. */
export interface SlashQuery {
  start: number;
  end: number;
  query: string;
}

export function slashQuery(text: string, cursor: number): SlashQuery | undefined {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const match = /(^|\s)\/([\p{L}]{0,20})$/u.exec(before);
  if (!match) return undefined;
  // A word that goes on behind the cursor is not being typed.
  if (/^[\p{L}]/u.test(text.slice(before.length))) return undefined;
  const start = before.length - match[2]!.length - 1;
  return { start, end: before.length, query: match[2]! };
}

/**
 * The badges for a slash word (AC-006): name or one of its words starting with it, in the order
 * of the start page, without those already set.
 */
export function matchBadges(query: string, chosen: readonly AgentBadgeSlug[]): AgentBadge[] {
  const wanted = fold(query.trim());
  return AGENT_BADGES.filter(
    (badge) =>
      !chosen.includes(badge.slug) &&
      [badge.label, ...badge.keywords].some((word) =>
        fold(word)
          .split(/\s+/)
          .some((part) => part.startsWith(wanted)),
      ),
  );
}

/** The text without the slash word; the cursor stands where it was (AC-006). */
export function takeSlash(text: string, slash: SlashQuery): { text: string; cursor: number } {
  const head = text.slice(0, slash.start);
  const tail = text.slice(slash.end);
  const joined = head.endsWith(' ') && tail.startsWith(' ') ? head + tail.slice(1) : head + tail;
  return { text: joined.replace(/^\s+/, ''), cursor: head.replace(/^\s+/, '').length };
}

export function addBadge(
  badges: readonly AgentBadgeSlug[],
  slug: AgentBadgeSlug,
): AgentBadgeSlug[] {
  if (badges.includes(slug) || badges.length >= AGENT_LIMITS.badges) return [...badges];
  return [...badges, slug];
}

/**
 * Backspace with the cursor right behind the badges, i.e. at the start of the text without a
 * selection (AC-007): the badges without the last one; undefined when backspace edits the text.
 */
export function backspaceRemovesBadge(
  badges: readonly AgentBadgeSlug[],
  selection: { start: number; end: number },
): AgentBadgeSlug[] | undefined {
  if (badges.length === 0 || selection.start !== 0 || selection.end !== 0) return undefined;
  return badges.slice(0, -1);
}
