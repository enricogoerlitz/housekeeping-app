import type { ParsedIngredient } from './amounts';
import {
  classifyIngredientLines,
  type CatalogHit,
  type StarterCatalogEntry,
} from './article-catalog';
import { normalizeText } from './text';
import type { Article } from './types';

// Draft lines of "Mehrere einfügen" (spec 0007, REQ-002): a pasted block becomes one line per
// ingredient; they become rows of the section "Zutaten" (recipe-editor rowsFromIngredientDrafts),
// where a row is saved only once it has an article (AC-008 to AC-010; spec 0008, E9).

/** How a draft line gets its article when it is saved. */
export type DraftArticle<T extends Article = Article> =
  /** A household article or a starter entry (created on saving, AC-003). */
  | { kind: 'hit'; hit: CatalogHit<T> }
  /** "„Drachenfrüchte“ neu anlegen" (AC-002): created on saving, not "Neu aus Rezepten". */
  | { kind: 'new'; name: string };

export interface IngredientDraft<T extends Article = Article> {
  key: string;
  line: ParsedIngredient;
  /** Undefined = orange with "Artikel wählen". */
  article?: DraftArticle<T>;
  /** "Meinst du …?" for an orange line spelled like an article (AC-009). */
  suggestion?: CatalogHit<T>;
}

/**
 * The drafts of a pasted block (classifyIngredientLines): a sure line has its article, a look-alike
 * line carries the suggestion, a new line neither. Empty lines and bullets are ignored.
 */
export function ingredientDrafts<T extends Article>(
  text: string,
  articles: readonly T[],
  catalog: readonly StarterCatalogEntry[],
  newKey: () => string,
): IngredientDraft<T>[] {
  return classifyIngredientLines(text, articles, catalog).map((entry): IngredientDraft<T> => {
    const draft: IngredientDraft<T> = { key: newKey(), line: entry.line };
    if (entry.status === 'sure') draft.article = { kind: 'hit', hit: entry.hit };
    if (entry.status === 'similar') draft.suggestion = entry.suggestion;
    return draft;
  });
}

/**
 * What a person chose in the preview of "Zutaten einfügen" (spec 0050, REQ-003), by the line's
 * name (`linePickKey`): lines move while typing, their name does not (Entscheidung 4).
 */
export type LinePicks<T extends Article = Article> = ReadonlyMap<string, DraftArticle<T>>;

/** The key of a line's name in `LinePicks`: "Paniermehl" and " paniermehl" are one. */
export const linePickKey = (name: string): string => normalizeText(name);

/** The drafts with the article picked for their name; a renamed line has no pick (AC-014). */
export function withLinePicks<T extends Article>(
  drafts: readonly IngredientDraft<T>[],
  picks: LinePicks<T>,
): IngredientDraft<T>[] {
  return drafts.map((draft) => {
    const article = picks.get(linePickKey(draft.line.name));
    return article ? { key: draft.key, line: draft.line, article } : draft;
  });
}
