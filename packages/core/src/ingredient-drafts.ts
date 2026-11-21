import type { ParsedIngredient } from './amounts';
import {
  classifyIngredientLines,
  type CatalogHit,
  type StarterCatalogEntry,
} from './article-catalog';
import type { Article, Id } from './types';

// Draft lines of "Mehrere einfügen" (spec 0007, REQ-002): a pasted block becomes one line per
// ingredient; a line is saved only once it has an article, the rest stays orange in the editor
// (AC-008 to AC-010). The drafts live only in the editor, never in the cache.

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

export type ReadyIngredientDraft<T extends Article = Article> = IngredientDraft<T> & {
  article: DraftArticle<T>;
};

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

/** A person chose the article of a line ("Ja", a hit, "neu anlegen"): it is no longer orange. */
export function chooseDraftArticle<T extends Article>(
  drafts: readonly IngredientDraft<T>[],
  key: string,
  article: DraftArticle<T>,
): IngredientDraft<T>[] {
  return drafts.map((draft) =>
    draft.key === key ? { key: draft.key, line: draft.line, article } : draft,
  );
}

/** The name the line will show: its article's, else what was pasted. */
export function draftArticleName(draft: IngredientDraft): string {
  if (!draft.article) return draft.line.name;
  return draft.article.kind === 'hit' ? draft.article.hit.name : draft.article.name;
}

/** "200 ml · Kokosmilch", "2 · Drachenfrüchte", "Salz" (AC-008). */
export function draftLineLabel(draft: IngredientDraft): string {
  const name = draftArticleName(draft);
  return draft.line.amount ? `${draft.line.amount.text} · ${name}` : name;
}

const orange = <T extends Article>(draft: IngredientDraft<T>): IngredientDraft<T> => ({
  key: draft.key,
  line: draft.line,
});

/**
 * What a save sends (AC-010): lines with an article are ready, the others stay open in their order.
 * A line whose household article is gone meanwhile (deleted or merged on another device) is open
 * again, without article.
 */
export function splitIngredientDrafts<T extends Article>(
  drafts: readonly IngredientDraft<T>[],
  articles: readonly Pick<Article, 'id'>[],
): { ready: ReadyIngredientDraft<T>[]; open: IngredientDraft<T>[] } {
  const known = new Set<Id>(articles.map((article) => article.id));
  const ready: ReadyIngredientDraft<T>[] = [];
  const open: IngredientDraft<T>[] = [];
  for (const draft of drafts) {
    const { article } = draft;
    if (!article) open.push(draft);
    else if (article.kind === 'hit' && article.hit.kind === 'article' && !known.has(article.hit.id))
      open.push(orange(draft));
    else ready.push({ ...draft, article });
  }
  return { ready, open };
}

/**
 * Lines the server refused come back orange (spec "Offline und Konflikte": the article was deleted
 * while the recipe was saved), before the lines still open; a line already listed stays once.
 */
export function returnRejectedDrafts<T extends Article>(
  drafts: readonly IngredientDraft<T>[],
  rejected: readonly IngredientDraft<T>[],
): IngredientDraft<T>[] {
  const keys = new Set(rejected.map((draft) => draft.key));
  return [...rejected.map(orange), ...drafts.filter((draft) => !keys.has(draft.key))];
}
