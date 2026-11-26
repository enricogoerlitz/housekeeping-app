import type { RecipeDraft, RecipeDraftSource } from './ai-contract';
import { exactCatalogHit, type StarterCatalogEntry } from './article-catalog';
import type { PageDraftInput } from './page-editor';
import { newIngredientRow, type IngredientRow, type IngredientRowArticle } from './recipe-editor';
import type { Article, Id, Recipe, RecipeLink } from './types';
import { linkHost } from './web-link';

// "Mit KI ausfüllen" (spec 0040, REQ-001 – REQ-006): what the app does with the AI's answer before
// the person sees it in the edit mode. Nothing here saves; the page editor fills its draft with
// the result (fillPageDraft) and "Speichern" stores it.

export const AI_DRAFT_UNREACHABLE_MESSAGE =
  'Die KI ist gerade nicht erreichbar. Deine Eingabe bleibt stehen.';

const MAX_DRAFT_LINKS = 3;
const MAIN_INGREDIENTS_IN_PROMPT = 3;

// An address with a scheme, or a bare host with a dot and a path ("chefkoch.de/rezepte/1").
const LINK =
  /https?:\/\/[^\s<>"'„“”«»]+|(?<![\w@./:-])(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'„“”«»]*/giu;
const TRAILING = /[.,;:!?)\]}]+$/u;

/** True for tiktok.com and its subdomains (vm.tiktok.com, www.tiktok.com). */
export function isTikTokUrl(url: string): boolean {
  const host = linkHost(url);
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

/**
 * The links in the text of the AI field, as https addresses in their order, each once, at most 3
 * (REQ-001): "http://" becomes "https://", a bare address gets it in front.
 */
export function draftLinks(text: string): string[] {
  const links: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const raw = match[0].replace(TRAILING, '');
    const url = /^https?:\/\//i.test(raw)
      ? raw.replace(/^http:\/\//i, 'https://')
      : `https://${raw}`;
    if (!links.includes(url)) links.push(url);
    if (links.length === MAX_DRAFT_LINKS) break;
  }
  return links;
}

/** The chip under the AI field for one link (AC-004, AC-017). */
export function linkChipLabel(url: string, state: 'reading' | 'read' | 'failed'): string {
  const name = isTikTokUrl(url) ? 'TikTok' : linkHost(url);
  if (state === 'reading') return `${name} wird gelesen …`;
  if (state === 'failed') return `${name} konnte nicht gelesen werden`;
  return name;
}

function articleOf(
  name: string,
  articles: readonly Article[],
  catalog: readonly StarterCatalogEntry[],
): IngredientRowArticle {
  const hit = exactCatalogHit(name, articles, catalog);
  if (!hit) return { kind: 'new', name };
  return hit.kind === 'article' ? { kind: 'article', articleId: hit.id } : { kind: 'hit', hit };
}

/**
 * The AI's draft as input for the edit mode (AC-001, AC-002): an ingredient whose name is the name
 * or a synonym of a household article gets that article, one of a starter entry the entry (both
 * like a pasted line); every other one is marked new and becomes an article only on "Speichern".
 * Each link sent becomes a link of the recipe, a TikTok link as the address it resolved to
 * (AC-016) or as sent when it could not be read (AC-017).
 */
export function draftToPageInput(
  draft: RecipeDraft,
  sources: readonly RecipeDraftSource[],
  context: {
    articles: readonly Article[];
    catalog: readonly StarterCatalogEntry[];
    newKey: () => string;
  },
): PageDraftInput {
  const ingredients = draft.ingredients.map((ingredient): IngredientRow => ({
    ...newIngredientRow(context.newKey()),
    name: ingredient.name,
    amountText: ingredient.amount,
    prepNote: ingredient.note ?? '',
    group: ingredient.group ?? '',
    article: articleOf(ingredient.name, context.articles, context.catalog),
  }));
  const links = sources.map((source): RecipeLink =>
    source.kind === 'tiktok'
      ? { url: source.resolvedUrl ?? source.url, label: 'TikTok' }
      : { url: source.url },
  );
  const input: PageDraftInput = {
    title: draft.title,
    servings: draft.servings,
    course: draft.course,
    tags: draft.tags,
    ingredients,
    steps: draft.steps,
    links,
  };
  if (draft.totalMinutes !== undefined) input.totalMinutes = draft.totalMinutes;
  if (draft.cuisine !== undefined) input.cuisine = draft.cuisine;
  if (draft.notes !== undefined) input.notes = draft.notes;
  return input;
}

/**
 * Dictated text into the AI field at the cursor (AC-008): a selection is replaced, a space keeps
 * it apart from the words around it; without a known cursor at the end.
 */
export function insertAtCursor(
  text: string,
  selection: { start: number; end: number } | undefined,
  insert: string,
): { text: string; cursor: number } {
  const start = Math.min(selection?.start ?? text.length, text.length);
  const end = Math.max(start, Math.min(selection?.end ?? text.length, text.length));
  const words = insert.trim();
  if (words === '') return { text, cursor: end };
  const before = text.slice(0, start);
  const after = text.slice(end);
  const head = before === '' || /\s$/u.test(before) ? before : `${before} `;
  const tail = after === '' || /^[\s.,;:!?]/u.test(after) ? after : ` ${after}`;
  return { text: `${head}${words}${tail}`, cursor: head.length + words.length };
}

/** The prefilled prompt of the tab "KI" (REQ-004): the title, for a recipe with main ingredients. */
export function defaultImagePrompt(title: string, mainIngredients: readonly string[]): string {
  const names = mainIngredients.slice(0, MAIN_INGREDIENTS_IN_PROMPT);
  if (names.length === 0) return title;
  // "Apfelkuchen mit Streuseln mit Butter" reads badly: a second "mit" becomes a comma.
  return /\smit\s/i.test(title)
    ? `${title}, ${names.join(', ')}`
    : `${title} mit ${names.join(', ')}`;
}

/** The main ingredients of a recipe for its image prompt: base rows without Vorrat, in order. */
export function mainIngredientNames(recipe: Recipe, articlesById: Record<Id, Article>): string[] {
  return recipe.ingredients.flatMap((ingredient) => {
    const article = articlesById[ingredient.articleId];
    if (!article || article.isPantry || ingredient.variantId !== undefined) return [];
    return [article.name];
  });
}

/** AC-014: under the variants when some of them failed. */
export function imageFailureNotice(failed: number): string | undefined {
  if (failed <= 0) return undefined;
  return failed === 1 ? 'Eine Variante ist fehlgeschlagen' : 'Zwei Varianten sind fehlgeschlagen';
}
