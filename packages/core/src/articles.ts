import { fuzzyIncludes, normalizeText, similarity } from './text';
import type { Article } from './types';

const DEFAULT_SEARCH_LIMIT = 8;
const SIMILAR_THRESHOLD = 0.8;
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

/**
 * A very similar existing article for the "Meinst du …?" hint: a typo away (similarity of at least
 * 0.8 to the name or a synonym) or the singular/plural of one ("Tomate" ↔ "Tomaten").
 * Undefined when there is an exact match or nothing close.
 */
export function suggestSimilarArticle(name: string, articles: Article[]): Article | undefined {
  const wanted = normalizeText(name);
  if (wanted === '' || findArticleByName(name, articles)) return undefined;

  let best: { article: Article; score: number } | undefined;
  for (const article of articles) {
    for (const text of [article.name, ...article.synonyms]) {
      const candidate = normalizeText(text);
      const score = isSingularPluralPair(wanted, candidate) ? 1 : similarity(wanted, candidate);
      if (score >= SIMILAR_THRESHOLD && score > (best?.score ?? 0)) best = { article, score };
    }
  }
  return best?.article;
}
