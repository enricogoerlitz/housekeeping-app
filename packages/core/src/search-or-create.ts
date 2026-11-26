import { spellingScore } from './articles';
import { fuzzyIncludes, normalizeText } from './text';

// Matching rule of the building block "Suchen oder anlegen" (spec 0005, REQ-006) and the one search
// for articles (spec 0025, REQ-009: "Was fehlt?", "Posten hinzufügen", "Artikel", Zutat and the
// area picker). The specs that use it only decide what is searched; how it matches lives here.

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
  /** Hits, best first: exact > prefix > substring or all words in any order > typo > word part. */
  matches: SearchOrCreateMatch<T>[];
  /**
   * The item whose name or synonym is the query. A name leaves nothing to create; a synonym of
   * another item still offers "neu anlegen" (spec 0036, REQ-005: „Schinken“ next to Kochschinken).
   */
  exact?: T;
  /**
   * The look-alike for "Meinst du …?": creating needs a second confirmation. Only by spelling
   * (`spelledAlike`), never through a word part or a synonym containing the query.
   */
  similar?: T;
  /** A non-empty query that is no existing name (a synonym of another item does not count). */
  canCreate: boolean;
}

const DEFAULT_LIMIT = 8;
// Shorter pieces are common to unrelated words ("brot" in "Brotzeit"); the spec's estimate.
const MIN_WORD_PART = 5;

const SCORE = {
  exact: 100,
  // An exact synonym ranks behind an exact name (spec 0036, Entscheidung 2).
  exactSynonym: 95,
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

/** Every word of a query of several words is part of the text, in any order ("bio ei"). */
function allWordsIncluded(query: string, text: string): boolean {
  const words = query.split(/[ -]+/).filter((word) => word !== '');
  return words.length > 1 && words.every((word) => text.includes(word));
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
  if (t === query) return { score: isSynonym ? SCORE.exactSynonym : SCORE.exact, piece: 0 };
  if (t.startsWith(query))
    return { score: isSynonym ? SCORE.prefixSynonym : SCORE.prefix, piece: 0 };
  if (t.includes(query) || allWordsIncluded(query, t))
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
 * "Meinst du …?": only when a name or synonym is spelled alike (`spelledAlike`: a typo away or
 * the singular/plural, word by word). Word-part hits are listed but never brake (spec 0005,
 * AC-034 Nachtrag): "Drachenfrucht" is no "Meinst du Marmelade?" via "Fruchtaufstrich".
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

  const exactName = items.find((item) => normalizeText(item.name) === q);
  const exactSynonym = items.find((item) =>
    (item.synonyms ?? []).some((synonym) => normalizeText(synonym) === q),
  );
  const matches = scored
    .slice(0, Math.max(0, options?.limit ?? DEFAULT_LIMIT))
    .map(({ item, matchedSynonym, wordPart }) =>
      matchedSynonym === undefined ? { item, wordPart } : { item, matchedSynonym, wordPart },
    );
  if (exactName) return { matches, exact: exactName, canCreate: false };
  // The synonym is shown as the hit, so there is nothing to brake for.
  if (exactSynonym) return { matches, exact: exactSynonym, canCreate: true };

  return { matches, similar: findSimilar(q, items), canCreate: true };
}

function findSimilar<T extends SearchOrCreateItem>(
  query: string,
  items: readonly T[],
): T | undefined {
  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    for (const text of textsOf(item)) {
      const score = spellingScore(query, text);
      if (score > 0 && score > (best?.score ?? 0)) best = { item, score };
    }
  }
  return best?.item;
}
