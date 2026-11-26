import { isUnitWord, parseIngredientLine, withoutBullet } from './amounts';
import type { IngredientDraft } from './ingredient-drafts';
import { matchSearchOrCreate, type SearchOrCreateMatch } from './search-or-create';
import { normalizeText } from './text';
import type { Article, Id, Recipe } from './types';

// Typing in "Zutaten einfügen" (spec 0050): suggestions of household articles for the line the
// cursor stands in, taking one without losing amount and unit, and the preview of every line.

/** At most this many chips (REQ-001). */
export const MAX_TYPING_SUGGESTIONS = 5;
// One letter hits nearly every article (Entscheidung 2).
const MIN_TYPED_LETTERS = 2;

export interface CursorLine {
  /** Offset of the line's first character in the text. */
  start: number;
  /** Offset behind its last character, before the line break. */
  end: number;
  text: string;
}

/** The line the cursor stands in (AC-005); a cursor at a line's end belongs to that line. */
export function lineAtCursor(text: string, cursor: number): CursorLine {
  const at = Math.max(0, Math.min(cursor, text.length));
  const start = text.lastIndexOf('\n', at - 1) + 1;
  const next = text.indexOf('\n', at);
  const end = next === -1 ? text.length : next;
  return { start, end, text: text.slice(start, end) };
}

export interface LineArticleWords {
  /** Bullet, amount, size and unit exactly as typed, with the space before the words. */
  prefix: string;
  /** The article words as typed, without trailing spaces. */
  words: string;
}

/**
 * Splits a line into what stays (bullet, amount, unit) and the article words, the way the paste
 * parses it (parseIngredientLine): "200 g Pani" → "200 g " + "Pani". Undefined for an empty line
 * and for an amount without a name yet ("200 g", AC-004).
 */
export function lineArticleWords(line: string): LineArticleWords | undefined {
  const parsed = parseIngredientLine(withoutBullet(line));
  if (!parsed) return undefined;
  const nameWords = parsed.name.split(' ');
  // "200 g": a unit counts only before a name, so the parser calls the unit the name.
  if (parsed.amount && nameWords.length === 1 && isUnitWord(parsed.name)) return undefined;
  // The name is the end of the line, word for word; its words start at the k-th last token.
  const tokens = [...line.matchAll(/\S+/g)];
  const first = tokens[tokens.length - nameWords.length];
  if (first?.index === undefined) return undefined;
  return { prefix: line.slice(0, first.index), words: line.slice(first.index).trimEnd() };
}

/**
 * The text with the article words of the cursor's line replaced by `name`, amount and unit kept
 * (AC-007 to AC-009), and the cursor behind the line. Undefined when the line has no words.
 */
export function replaceLineArticle(
  text: string,
  cursor: number,
  name: string,
): { text: string; cursor: number } | undefined {
  const line = lineAtCursor(text, cursor);
  const words = lineArticleWords(line.text);
  if (!words) return undefined;
  const replaced = words.prefix + name;
  return {
    text: text.slice(0, line.start) + replaced + text.slice(line.end),
    cursor: line.start + replaced.length,
  };
}

/** In how many recipes each article is an ingredient, for "oft benutzt zuerst" (AC-002). */
export function articleUseCounts(recipes: readonly Recipe[]): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const recipe of recipes) {
    for (const id of new Set(recipe.ingredients.map((ingredient) => ingredient.articleId))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The chips for the cursor's line (REQ-001): household articles found by the one article search
 * (`matchSearchOrCreate`), the more used first among equally good hits, without the article the
 * line already names exactly (AC-006). Empty below two letters or without article words.
 */
export function typingSuggestions<T extends Article>(
  text: string,
  cursor: number,
  articles: readonly T[],
  useCounts: ReadonlyMap<Id, number>,
  limit = MAX_TYPING_SUGGESTIONS,
): SearchOrCreateMatch<T>[] {
  const words = lineArticleWords(lineAtCursor(text, cursor).text);
  if (!words || Array.from(normalizeText(words.words)).length < MIN_TYPED_LETTERS) return [];
  const result = matchSearchOrCreate(words.words, articles, {
    limit: limit + 1,
    rank: (article) => useCounts.get(article.id) ?? 0,
  });
  return result.matches.filter((match) => match.item !== result.exact).slice(0, limit);
}

export type IngredientPreviewState =
  /** A household article or starter entry: "2 · Zwiebel ✓". */
  | 'article'
  /** "neu anlegen" was picked: created on saving (AC-013). */
  | 'created'
  /** Spelled like an article: "Meinst du …?". */
  | 'similar'
  /** Nothing fits: "(neu)", orange on the recipe page unless picked (AC-015). */
  | 'new';

export interface IngredientPreviewLine {
  key: string;
  /** The amount as typed: "200 g". */
  amount?: string;
  /** The article it becomes, else the typed name. */
  name: string;
  /** The name as typed in the line. */
  typed: string;
  state: IngredientPreviewState;
  /** The look-alike's name for "Meinst du …?". */
  suggestion?: string;
}

/** One preview row per draft line (REQ-003, AC-011). */
export function ingredientPreview<T extends Article>(
  drafts: readonly IngredientDraft<T>[],
): IngredientPreviewLine[] {
  return drafts.map((draft) => {
    const base = {
      key: draft.key,
      ...(draft.line.amount ? { amount: draft.line.amount.text } : {}),
      typed: draft.line.name,
    };
    const { article, suggestion } = draft;
    if (article?.kind === 'hit') return { ...base, name: article.hit.name, state: 'article' };
    if (article?.kind === 'new') return { ...base, name: article.name, state: 'created' };
    if (suggestion) {
      return { ...base, name: draft.line.name, state: 'similar', suggestion: suggestion.name };
    }
    return { ...base, name: draft.line.name, state: 'new' };
  });
}
