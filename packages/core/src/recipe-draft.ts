import type { RecipeDraft, RecipeDraftSource } from './ai-contract';
import { exactCatalogHit, type StarterCatalogEntry } from './article-catalog';
import type { PageDraftInput, PageDraftStep } from './page-editor';
import {
  cleanTags,
  newIngredientRow,
  type IngredientRow,
  type IngredientRowArticle,
} from './recipe-editor';
import { normalizeText } from './text';
import type { Article, Id, Recipe, RecipeLink, RecipeVariant } from './types';
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

/** Tags of a draft (spec 0045, REQ-002): at most 5 (AC-004). */
export const MAX_DRAFT_TAGS = 5;

/**
 * The draft's tags as the edit mode takes them (AC-003, AC-004): one the household has in the
 * household's spelling, each once, at most 5.
 */
export function draftTags(tags: readonly { name: string }[], known: readonly string[]): string[] {
  const spelled = tags.map(
    (tag) => known.find((value) => normalizeText(value) === normalizeText(tag.name)) ?? tag.name,
  );
  return cleanTags(spelled).slice(0, MAX_DRAFT_TAGS);
}

/** AC-005: a tag no recipe of the household has yet shows "neu" in the edit mode. */
export function isNewTag(tag: string, known: readonly string[]): boolean {
  return !known.some((value) => normalizeText(value) === normalizeText(tag));
}

/**
 * The AI's draft as input for the edit mode (AC-001, AC-002): an ingredient whose name is the name
 * or a synonym of a household article gets that article, one of a starter entry the entry (both
 * like a pasted line); every other one is marked new and becomes an article only on "Speichern".
 * Each link sent becomes a link of the recipe, a TikTok link as the address it resolved to
 * (AC-016) or as sent when it could not be read (AC-017). Spec 0045: the variants get ids, the
 * first is the standard, rows and steps find theirs by name (a name the draft does not have is
 * shared, AC-009); tags follow the household's spelling.
 */
export function draftToPageInput(
  draft: RecipeDraft,
  sources: readonly RecipeDraftSource[],
  context: {
    articles: readonly Article[];
    catalog: readonly StarterCatalogEntry[];
    /** Row keys of the edit mode. */
    newKey: () => string;
    /** Ids of new variants. */
    newId: () => Id;
    /** The household's tags (tagValues). */
    tags: readonly string[];
  },
): PageDraftInput {
  const variants: RecipeVariant[] = [];
  for (const variant of draft.variants) {
    const name = variant.name.trim();
    if (variants.some((known) => normalizeText(known.name) === normalizeText(name))) continue;
    variants.push({ id: context.newId(), name, isDefault: variants.length === 0 });
  }
  const variantId = (name: string | undefined): Id | undefined =>
    name === undefined
      ? undefined
      : variants.find((variant) => normalizeText(variant.name) === normalizeText(name))?.id;

  const ingredients = draft.ingredients.map((ingredient): IngredientRow => {
    const row: IngredientRow = {
      ...newIngredientRow(context.newKey()),
      name: ingredient.name,
      amountText: ingredient.amount,
      prepNote: ingredient.note ?? '',
      group: ingredient.group ?? '',
      article: articleOf(ingredient.name, context.articles, context.catalog),
    };
    const id = variantId(ingredient.variant);
    if (id !== undefined) row.variantId = id;
    return row;
  });
  const steps = draft.steps.map((step): PageDraftStep => {
    const made: PageDraftStep = { text: step.text };
    const id = variantId(step.variant);
    if (id !== undefined) made.variantId = id;
    if (step.timerMinutes !== undefined) made.timerMinutes = step.timerMinutes;
    return made;
  });
  const links = sources.map((source): RecipeLink =>
    source.kind === 'tiktok'
      ? { url: source.resolvedUrl ?? source.url, label: 'TikTok' }
      : { url: source.url },
  );
  const input: PageDraftInput = {
    title: draft.title,
    description: draft.description,
    servings: draft.servings,
    course: draft.course,
    tags: draftTags(draft.tags, context.tags),
    variants,
    ingredients,
    steps,
    links,
  };
  if (draft.totalMinutes !== undefined) input.totalMinutes = draft.totalMinutes;
  if (draft.leadTime !== undefined) input.leadTime = draft.leadTime;
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

/** The longest prompt the image function takes (AiImageRequestSchema). */
const MAX_IMAGE_PROMPT = 1000;

/**
 * "Neu generieren" (spec 0045, REQ-006): the draft's image prompt with the person's wish behind
 * it (AC-017); when both are too long the wish is cut, never the prompt (AC-019).
 */
export function imagePromptWithExtra(prompt: string, extra: string): string {
  const base = prompt.trim();
  const wish = extra.trim();
  if (wish === '') return base;
  const joined = /[.!?]$/u.test(base) ? `${base} ${wish}` : `${base}. ${wish}`;
  return joined.slice(0, MAX_IMAGE_PROMPT);
}

/** AC-014: under the variants when some of them failed. */
export function imageFailureNotice(failed: number): string | undefined {
  if (failed <= 0) return undefined;
  return failed === 1 ? 'Eine Variante ist fehlgeschlagen' : 'Zwei Varianten sind fehlgeschlagen';
}
