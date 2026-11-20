import { isSingularPluralPair } from './articles';
import { fuzzyIncludes, normalizeText, similarity } from './text';

// Matching rule of the building block "Suchen oder anlegen" (spec 0005, REQ-006). The specs that
// use the block only decide what is searched; how it matches lives here and nowhere else.

export interface SearchOrCreateItem {
  id: string;
  name: string;
  synonyms?: readonly string[];
}

export interface SearchOrCreateMatch<T> {
  item: T;
  /** Set when the query matched a synonym rather than the name ("Karotten" for Möhren). */
  matchedSynonym?: string;
  /** Found only through a word part of the query ("Milchko" → Kokosmilch); ranks last. */
  wordPart: boolean;
}

export interface SearchOrCreateResult<T> {
  /** Hits, best first: exact > prefix > substring > typo > word part. */
  matches: SearchOrCreateMatch<T>[];
  /** The item whose name or synonym is the query; then there is nothing to create. */
  exact?: T;
  /** The look-alike for "Meinst du …?": creating needs a second confirmation. */
  similar?: T;
  /** A non-empty query that is no existing name or synonym. */
  canCreate: boolean;
}

const DEFAULT_LIMIT = 8;
const SIMILAR_THRESHOLD = 0.8;
// Shorter pieces are common to unrelated words ("brot" in "Brotzeit"); the spec's estimate.
const MIN_WORD_PART = 5;

const SCORE = {
  exact: 100,
  prefix: 80,
  prefixSynonym: 70,
  substring: 50,
  substringSynonym: 40,
  typo: 20,
  wordPart: 10,
} as const;

/** Length of the longest piece of a query word (at least MIN_WORD_PART letters) found in text. */
function longestWordPart(query: string, text: string): number {
  let longest = 0;
  for (const word of query.split(/[ -]+/)) {
    for (let length = word.length; length >= MIN_WORD_PART && length > longest; length--) {
      for (let start = 0; start + length <= word.length; start++) {
        if (text.includes(word.slice(start, start + length))) {
          longest = length;
          break;
        }
      }
    }
  }
  return longest;
}

interface Scored<T> extends SearchOrCreateMatch<T> {
  score: number;
  /** Word-part hits only: the longest shared piece; more is a better explanation. */
  piece: number;
}

function scoreText(
  query: string,
  text: string,
  isSynonym: boolean,
): { score: number; piece: number } {
  const t = normalizeText(text);
  if (t === query) return { score: SCORE.exact, piece: 0 };
  if (t.startsWith(query))
    return { score: isSynonym ? SCORE.prefixSynonym : SCORE.prefix, piece: 0 };
  if (t.includes(query))
    return { score: isSynonym ? SCORE.substringSynonym : SCORE.substring, piece: 0 };
  if (fuzzyIncludes(query, t)) return { score: SCORE.typo, piece: 0 };
  const piece = longestWordPart(query, t);
  return piece > 0 ? { score: SCORE.wordPart, piece } : { score: 0, piece: 0 };
}

function textsOf(item: SearchOrCreateItem): string[] {
  return [item.name, ...(item.synonyms ?? [])];
}

/**
 * Matches a query for "Suchen oder anlegen": finds the start, part and typos of names and
 * synonyms like the other searches, plus word parts ("Milchko" finds Kokosmilch, spec 0005,
 * open question 5). Decides whether "neu anlegen" is offered and whether it brakes with
 * "Meinst du …?": one typo away (similarity ≥ 0.8), singular/plural of one word, or a word-part
 * hit — but never while the query is the start of an existing name ("Kokos").
 */
export function matchSearchOrCreate<T extends SearchOrCreateItem>(
  query: string,
  items: readonly T[],
  options?: { limit?: number },
): SearchOrCreateResult<T> {
  const q = normalizeText(query);
  if (q === '') return { matches: [], canCreate: false };

  const scored: Scored<T>[] = [];
  for (const item of items) {
    const name = scoreText(q, item.name, false);
    let best: Scored<T> = { item, wordPart: false, ...name };
    for (const synonym of item.synonyms ?? []) {
      const candidate = scoreText(q, synonym, true);
      // Strictly better: on a tie the name, or the earlier synonym, explains the hit best.
      if (
        candidate.score > best.score ||
        (candidate.score === best.score && candidate.piece > best.piece)
      ) {
        best = { item, matchedSynonym: synonym, wordPart: false, ...candidate };
      }
    }
    if (best.score > 0) scored.push({ ...best, wordPart: best.score === SCORE.wordPart });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.piece - a.piece ||
      a.item.name.length - b.item.name.length ||
      a.item.name.localeCompare(b.item.name, 'de'),
  );

  const exact =
    items.find((item) => normalizeText(item.name) === q) ??
    items.find((item) => (item.synonyms ?? []).some((synonym) => normalizeText(synonym) === q));
  const matches = scored
    .slice(0, Math.max(0, options?.limit ?? DEFAULT_LIMIT))
    .map(({ item, matchedSynonym, wordPart }) =>
      matchedSynonym === undefined ? { item, wordPart } : { item, matchedSynonym, wordPart },
    );
  if (exact) return { matches, exact, canCreate: false };

  return { matches, similar: findSimilar(q, items, scored), canCreate: true };
}

function findSimilar<T extends SearchOrCreateItem>(
  query: string,
  items: readonly T[],
  ranked: Scored<T>[],
): T | undefined {
  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    for (const text of textsOf(item)) {
      const candidate = normalizeText(text);
      const score = isSingularPluralPair(query, candidate) ? 1 : similarity(query, candidate);
      if (score >= SIMILAR_THRESHOLD && score > (best?.score ?? 0)) best = { item, score };
    }
  }
  if (best) return best.item;

  const typingAName = items.some((item) =>
    textsOf(item).some((text) => normalizeText(text).startsWith(query)),
  );
  if (typingAName) return undefined;
  return ranked.find((entry) => entry.score === SCORE.wordPart)?.item;
}
