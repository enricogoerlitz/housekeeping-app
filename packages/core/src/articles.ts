import { editDistance, fuzzyIncludes, normalizeText, similarity } from './text';
import type { Article } from './types';

const DEFAULT_SEARCH_LIMIT = 8;
const NUMBER_ENDINGS = ['n', 'en', 'e', 's'];
// Shorter stems turn into other words with one of the endings ("Ei" → "Eis").
const MIN_STEM_LENGTH = 3;

export interface ArticleMatch {
  article: Article;
  /** Set when the query matched a synonym rather than the name ("Karotten" for Möhren). */
  matchedSynonym?: string;
  score: number;
}

function matchScore(query: string, text: string, isSynonym: boolean): number {
  const normalized = normalizeText(text);
  if (normalized === query) return 100;
  if (normalized.startsWith(query)) return isSynonym ? 70 : 80;
  if (normalized.includes(query)) return isSynonym ? 40 : 50;
  return fuzzyIncludes(query, normalized) ? 20 : 0;
}

/**
 * Autocomplete over names and synonyms, best first: exact > prefix > substring > typo-tolerant;
 * a hit on the name beats the same kind of hit on a synonym. Equal scores: shorter name first,
 * then alphabetical. "Karot" finds Möhren with matchedSynonym "Karotten". Empty query → [].
 * At most `limit` results, 8 by default.
 */
export function searchArticles(query: string, articles: Article[], limit?: number): ArticleMatch[] {
  const q = normalizeText(query);
  if (q === '') return [];

  const matches: ArticleMatch[] = [];
  for (const article of articles) {
    let best: ArticleMatch = { article, score: matchScore(q, article.name, false) };
    for (const synonym of article.synonyms) {
      const score = matchScore(q, synonym, true);
      // Strictly greater: on a tie the name, or the earlier synonym, is the better explanation.
      if (score > best.score) best = { article, matchedSynonym: synonym, score };
    }
    if (best.score > 0) matches.push(best);
  }

  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.article.name.length - b.article.name.length ||
        a.article.name.localeCompare(b.article.name, 'de'),
    )
    .slice(0, Math.max(0, limit ?? DEFAULT_SEARCH_LIMIT));
}
/** Exact match on the normalised name or a synonym; a name match wins over a synonym match. */
export function findArticleByName(name: string, articles: Article[]): Article | undefined {
  const wanted = normalizeText(name);
  if (wanted === '') return undefined;
  return (
    articles.find((article) => normalizeText(article.name) === wanted) ??
    articles.find((article) =>
      article.synonyms.some((synonym) => normalizeText(synonym) === wanted),
    )
  );
}

/** True for the singular and plural of one word, both normalised ("tomate" ↔ "tomaten"). */
export function isSingularPluralPair(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < MIN_STEM_LENGTH) return false;
  return NUMBER_ENDINGS.some((ending) => shorter + ending === longer);
}

// Words of this length or more may carry two typos; shorter ones one. Below that, two edits are
// mostly another word ("Pfefferminze" ↔ "Pfefferminztee", "Fleischkäse" ↔ "Frischkäse").
const TWO_TYPOS_FROM_LENGTH = 15;
// One typo in a four-letter word is mostly another word ("Brot" ↔ "Boot").
const ONE_TYPO_FROM_LENGTH = 5;

/** Typos one word (normalised) may have, by the length of the longer of both. */
function allowedTypos(length: number): number {
  if (length >= TWO_TYPOS_FROM_LENGTH) return 2;
  return length >= ONE_TYPO_FROM_LENGTH ? 1 : 0;
}

function wordsSpelledAlike(a: string, b: string): boolean {
  if (a === b || isSingularPluralPair(a, b)) return true;
  // Typos rarely hit the first letter, while most look-alike words differ exactly there
  // ("Tafelessig" ↔ "Apfelessig", "Kochschinken" ↔ "Rohschinken").
  if (a[0] !== b[0]) return false;
  const allowed = allowedTypos(Math.max(a.length, b.length));
  if (allowed === 0 || Math.abs(a.length - b.length) > allowed) return false;
  return editDistance(a, b) <= allowed;
}

/** The words of a normalised name ("kokos-milch" → kokos, milch). */
export function wordsOf(key: string): string[] {
  return key.split(/[ -]+/).filter((word) => word !== '');
}

/**
 * True when two names are the same thing spelled differently (spec 0007, E13): the same words
 * apart from spaces and hyphens ("Kokos-Milch" ↔ "Kokosmilch"), or word by word each the same,
 * its singular/plural ("Rote Zwiebel" ↔ "Rote Zwiebeln") or a typo away — one typo, two from 15
 * letters on, never in the first letter. Never a word part: "Milch" is not "Buttermilch",
 * "Schwarze Linsen" not "Schwarze Oliven". Basis of every "Meinst du …?" and of "Ähnliche Namen".
 */
export function spelledAlike(a: string, b: string): boolean {
  const wordsA = wordsOf(normalizeText(a));
  const wordsB = wordsOf(normalizeText(b));
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  if (wordsA.join('') === wordsB.join('')) return true;
  if (wordsA.length !== wordsB.length) return false;
  return wordsA.every((word, index) => wordsSpelledAlike(word, wordsB[index] ?? ''));
}

/** How alike two names spelled alike are, for picking the best suggestion; 0 when not alike. */
export function spellingScore(a: string, b: string): number {
  if (!spelledAlike(a, b)) return 0;
  const x = normalizeText(a);
  const y = normalizeText(b);
  return isSingularPluralPair(x, y) ? 1 : similarity(x, y);
}

/**
 * A very similar existing article for the "Meinst du …?" hint: its name or a synonym is spelled
 * alike (`spelledAlike`: a typo away or the singular/plural, "Tomate" ↔ "Tomaten").
 * Undefined when there is an exact match or nothing close.
 */
export function suggestSimilarArticle(name: string, articles: Article[]): Article | undefined {
  const wanted = normalizeText(name);
  if (wanted === '' || findArticleByName(name, articles)) return undefined;

  let best: { article: Article; score: number } | undefined;
  for (const article of articles) {
    for (const text of [article.name, ...article.synonyms]) {
      const score = spellingScore(wanted, text);
      if (score > 0 && score > (best?.score ?? 0)) best = { article, score };
    }
  }
  return best?.article;
}
