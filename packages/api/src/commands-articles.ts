import {
  applyArticleMerge,
  articleDraftFromStarter,
  articleUsage,
  cleanSynonyms,
  findArticleByName,
  mergeArticlesPreview,
  validateArticleDraft,
  type Article,
  type ArticleDraft,
  type CatalogHit,
  type Diet,
  type Id,
  type ShoppingRule,
} from '@housekeeping/core';

import { WRITABLE_COLUMNS } from './db/tables';
import { commit, getData, newId, nowISO, updateData } from './store';
import { DeletedArticleSchema, TransportError } from './transport';

// The article catalog of the household (spec 0007, REQ-005 to REQ-007). Rules live in core
// (article-catalog.ts); here each action becomes one change: apply_changes for creating and
// editing, delete_article and merge_articles for what touches recipes and items.

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

function findArticle(articleId: Id): Article | undefined {
  return getData().articles.find((article) => article.id === articleId);
}

function requireArticle(articleId: Id): Article {
  const article = findArticle(articleId);
  if (!article) throw new Error('Den Artikel gibt es nicht mehr.');
  return article;
}

/** The first problem of a draft as the message the field shows (core validateArticleDraft). */
function assertValid(draft: { id?: Id; name: string; synonyms: readonly string[] }): void {
  const [problem] = validateArticleDraft(draft, getData().articles);
  if (problem) throw new Error(problem.message);
}

/**
 * Adds articles inside the running command (they ride in its change). Synonyms are cleaned, so the
 * database's checks on names and keys hold.
 */
export function insertArticles(drafts: readonly (ArticleDraft & { id?: Id })[]): Article[] {
  const createdAt = nowISO();
  const articles = drafts.map((draft): Article => {
    const name = collapse(draft.name);
    const article: Article = {
      id: draft.id ?? newId(),
      name,
      synonyms: cleanSynonyms(name, draft.synonyms),
      diet: draft.diet,
      isPantry: draft.isPantry,
      needsReview: draft.needsReview,
      createdAt,
    };
    if (draft.areaId !== undefined) article.areaId = draft.areaId;
    return article;
  });
  if (articles.length > 0) {
    updateData((data) => ({ ...data, articles: [...data.articles, ...articles] }));
  }
  return articles;
}

/**
 * Finds the article for a typed name (name or synonym) or creates a new one ("Was fehlt?", list
 * additions). A new article has no area and an unknown diet until someone sets them. Runs inside
 * the calling command, so a new article is part of that command's change.
 */
export function resolveArticle(name: string): { article: Article; created: boolean } {
  const trimmed = collapse(name);
  const existing = findArticleByName(trimmed, getData().articles);
  if (existing) return { article: existing, created: false };
  const [article] = insertArticles([
    { name: trimmed, synonyms: [], diet: 'unknown', isPantry: false, needsReview: false },
  ]);
  if (!article) throw new Error('Name fehlt');
  return { article, created: true };
}

export interface ArticleInput {
  name: string;
  synonyms?: string[];
  areaId?: Id;
  diet?: Diet;
  isPantry?: boolean;
  defaultShoppingRule?: ShoppingRule;
}

/**
 * "+ Neu" on the page "Artikel" (AC-026) and "„…“ neu anlegen" (AC-002): a new article, chosen by
 * a person, so not "Neu aus Rezepten". Throws the field's message ("Name fehlt", "Gibt es schon:
 * Kokosmilch", "„Möhren“ ist schon ein Artikel"). Online only; inside another command it rides in
 * that command's change.
 */
export function createArticle(input: ArticleInput): Id {
  const draft = { name: input.name, synonyms: input.synonyms ?? [] };
  assertValid(draft);
  return commit({ path: 'diff' }, () => {
    const [article] = insertArticles([
      {
        ...draft,
        diet: input.diet ?? 'unknown',
        isPantry: input.isPantry ?? false,
        needsReview: false,
        ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
      },
    ]);
    if (!article) throw new Error('Name fehlt');
    if (input.defaultShoppingRule !== undefined) {
      patchArticle(article.id, { defaultShoppingRule: input.defaultShoppingRule });
    }
    return article.id;
  });
}

/** null removes the area or the Standard-Einkaufsregel. */
export interface ArticlePatch {
  name?: string;
  synonyms?: string[];
  areaId?: Id | null;
  isPantry?: boolean;
  diet?: Diet;
  defaultShoppingRule?: ShoppingRule | null;
}

function patchArticle(articleId: Id, patch: ArticlePatch & { needsReview?: boolean }): void {
  updateData((data) => ({
    ...data,
    articles: data.articles.map((article) => {
      if (article.id !== articleId) return article;
      const { areaId, defaultShoppingRule, ...rest } = patch;
      const next: Article = { ...article, ...rest };
      if (areaId === null) delete next.areaId;
      else if (areaId !== undefined) next.areaId = areaId;
      if (defaultShoppingRule === null) delete next.defaultShoppingRule;
      else if (defaultShoppingRule !== undefined) next.defaultShoppingRule = defaultShoppingRule;
      return next;
    }),
  }));
}

/**
 * "Artikel bearbeiten" (REQ-006): only the changed columns are sent, so two people editing
 * different fields both keep theirs (AC-035). Saving counts as checked: the article leaves "Neu aus
 * Rezepten" (open question 1). Throws the field's message for an invalid name or synonym; synonyms
 * are stored cleaned (no blanks, no repeats, not the own name). Online only.
 */
export function updateArticle(articleId: Id, patch: ArticlePatch): void {
  const article = requireArticle(articleId);
  const name = patch.name === undefined ? article.name : collapse(patch.name);
  const synonyms = cleanSynonyms(name, patch.synonyms ?? article.synonyms);
  assertValid({ id: articleId, name, synonyms });
  commit({ path: 'diff' }, () =>
    patchArticle(articleId, { ...patch, name, synonyms, needsReview: false }),
  );
}

/** "Passt so": the article leaves "Neu aus Rezepten" without other changes (open question 1). */
export function confirmArticle(articleId: Id): void {
  if (!requireArticle(articleId).needsReview) return;
  commit({ path: 'diff' }, () => patchArticle(articleId, { needsReview: false }));
}

const INSERT_COLUMNS = new Set<string>(['id', ...WRITABLE_COLUMNS.articles]);

/**
 * "Löschen" (AC-033): only an unused article (no recipe, not on the list, open or done); otherwise
 * throws the reason ("Wird in 2 Rezepten verwendet – zusammenführen statt löschen", "Steht auf der
 * Einkaufsliste", AC-034). One delete_article call; `snapshot()` taken before undoes it by
 * inserting the returned row again. Online only.
 */
export function deleteArticle(articleId: Id): void {
  requireArticle(articleId);
  const data = getData();
  const usage = articleUsage(articleId, data.recipes, data.items);
  if (!usage.canDelete) throw new Error(usage.deleteBlockedReason);
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.deleteArticle(articleId),
      inverse: async (transport, context, response) => {
        const deleted = DeletedArticleSchema.safeParse(response);
        if (!deleted.success) throw new TransportError('permanent', 'invalid_response');
        const row = Object.fromEntries(
          Object.entries(deleted.data).filter(([column]) => INSERT_COLUMNS.has(column)),
        );
        return transport.applyChanges(context.householdId, [
          { kind: 'insert', table: 'articles', row: { ...row, id: deleted.data.id } },
        ]);
      },
    },
    () =>
      updateData((current) => ({
        ...current,
        articles: current.articles.filter((article) => article.id !== articleId),
      })),
  );
}

/**
 * "Zusammenführen" of source into target (REQ-007): one merge_articles call; shown at once as the
 * server will do it (core applyArticleMerge). Returns what moved, for the hint. Throws for the same
 * article and for more than 30 synonyms ("Zu viele Synonyme – entferne zuerst welche bei …"); a
 * refusal by the server for the same reason shows that hint. Not undoable (open question 3).
 * Online only.
 */
export function mergeArticles(sourceId: Id, targetId: Id): { recipes: number; items: number } {
  if (sourceId === targetId)
    throw new Error('Ein Artikel lässt sich nicht mit sich selbst zusammenführen.');
  const source = requireArticle(sourceId);
  const target = requireArticle(targetId);
  const data = getData();
  const preview = mergeArticlesPreview(source, target, data.recipes, data.items);
  if (preview.tooManySynonymsMessage) throw new Error(preview.tooManySynonymsMessage);
  const tooMany = `Zu viele Synonyme – entferne zuerst welche bei ${target.name}`;
  return commit(
    {
      path: 'rpc',
      send: (transport) => transport.mergeArticles(sourceId, targetId),
      rejectedMessage: (error) =>
        error instanceof TransportError && error.code === 'too_many_synonyms' ? tooMany : undefined,
    },
    () => {
      updateData((current) => {
        const effect = applyArticleMerge(source, target, current.recipes, current.items);
        return {
          ...current,
          articles: current.articles.flatMap((article) =>
            article.id === sourceId ? [] : article.id === targetId ? [effect.article] : [article],
          ),
          recipes: effect.recipes,
          items: effect.items,
        };
      });
      return { recipes: preview.recipes, items: preview.items };
    },
  );
}

/**
 * The article a hit of "Suchen oder anlegen" stands for (core searchArticleCatalog): an article of
 * the household as it is, a starter entry as a new household article with its synonyms, diet,
 * Vorrat and the area of the same name (AC-003, E10). Inside another command the new article rides
 * in that command's change.
 */
export function catalogChoice(hit: CatalogHit<Article>): Article {
  if (hit.kind === 'article') return requireArticle(hit.id);
  const existing = findArticleByName(hit.name, getData().articles);
  if (existing) return existing;
  return commit({ path: 'diff' }, () => {
    const data = getData();
    const [article] = insertArticles([
      articleDraftFromStarter(hit.entry, data.articles, data.areas),
    ]);
    if (!article) throw new Error('Name fehlt');
    return article;
  });
}
