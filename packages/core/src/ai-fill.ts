import { PROMPT_WEB_QUERY_MAX, type DraftIngredient, type RecipeDraft } from './ai-contract';
import type { PageDraft } from './page-editor';
import type { IngredientRow } from './recipe-editor';
import { draftLinks } from './recipe-draft';

// "Mit KI ausfüllen" v3 (spec 0055): which tab and photo switch a window starts with, what the
// web search of "Prompt" looks for, and the recipe of the edit mode as the AI's `current`.

/** The two tabs of "Mit KI ausfüllen" (spec 0049, REQ-001; spec 0055, REQ-004). */
export type AiFillTab = 'web' | 'prompt';

/**
 * REQ-005: editing a recipe with content opens on "Prompt" (AC-014), one with only a title on
 * "Websuche" like creating (AC-016, AC-017). "Foto generieren" is on unless the recipe being edited
 * has a photo (AC-014, AC-015).
 */
export function aiFillDefaults(recipe: {
  editing: boolean;
  hasContent: boolean;
  hasPhoto: boolean;
}): { tab: AiFillTab; generatePhoto: boolean } {
  return {
    tab: recipe.editing && recipe.hasContent ? 'prompt' : 'web',
    generatePhoto: !(recipe.editing && recipe.hasPhoto),
  };
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * REQ-007, AC-021: the one web search of "Prompt" — title and wish, without the links (those are
 * read as links), at most 200 characters cut at a word; undefined when nothing is left.
 */
export function promptWebQuery(title: string, wish: string): string | undefined {
  let rest = wish;
  for (const link of draftLinks(wish)) rest = rest.split(link).join(' ');
  const query = collapse(`${title} ${rest}`);
  if (query === '') return undefined;
  if (query.length <= PROMPT_WEB_QUERY_MAX) return query;
  const cut = query.slice(0, PROMPT_WEB_QUERY_MAX + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut.slice(0, PROMPT_WEB_QUERY_MAX)).trim();
}

const cut = (text: string, max: number) => collapse(text).slice(0, max).trim();

function whole(text: string, min: number, max: number): number | undefined {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/**
 * REQ-006, AC-018: the recipe as the edit mode shows it, in the draft format the AI answers in —
 * variants by name, rows with their article's name. Cut to the limits of the contract, so a long
 * recipe never makes the request invalid; a row without a name is left out.
 */
export function recipeDraftOf(
  page: PageDraft,
  articleName: (row: IngredientRow) => string,
): RecipeDraft {
  const variants = page.ingredients.variants.slice(0, 6);
  const variantName = (id: string | undefined) =>
    id === undefined ? undefined : variants.find((variant) => variant.id === id)?.name;
  const ingredients = page.ingredients.rows.flatMap((row): DraftIngredient[] => {
    const name = cut(articleName(row) || row.name || '', 120);
    if (name === '') return [];
    const made: DraftIngredient = { name, amount: cut(row.amountText, 60) };
    const note = cut(row.prepNote, 200);
    if (note) made.note = note;
    const group = cut(row.group, 60);
    if (group) made.group = group;
    const variant = variantName(row.variantId);
    if (variant) made.variant = cut(variant, 60);
    return [made];
  });
  const steps = (page.steps?.steps ?? []).flatMap((step): RecipeDraft['steps'] => {
    const text = cut(step.text, 1000);
    if (text === '') return [];
    const made: RecipeDraft['steps'][number] = { text };
    const variant = variantName(step.variantId);
    if (variant) made.variant = cut(variant, 60);
    if (step.timerMinutes !== undefined && step.timerMinutes >= 1 && step.timerMinutes <= 600) {
      made.timerMinutes = step.timerMinutes;
    }
    return [made];
  });
  const draft: RecipeDraft = {
    title: cut(page.head.title, 200) || 'Rezept',
    description: cut(page.head.description, 600),
    servings: whole(page.head.servings, 1, 100) ?? 4,
    course: page.classification?.course ?? 'main',
    tags: (page.classification?.tags ?? [])
      .map((tag) => cut(tag, 40))
      .filter(Boolean)
      .slice(0, 10)
      .map((name) => ({ name, isNew: false })),
    variants: variants.map((variant) => ({ name: cut(variant.name, 60) })),
    ingredients: ingredients.slice(0, 80),
    steps: steps.slice(0, 40),
  };
  const minutes = whole(page.head.totalMinutes, 1, 10000);
  if (minutes !== undefined) draft.totalMinutes = minutes;
  const cuisine = cut(page.classification?.cuisine ?? '', 80);
  if (cuisine) draft.cuisine = cuisine;
  const leadText = cut(page.steps?.leadTimeText ?? '', 200);
  const leadHours = whole(page.steps?.leadTimeHours ?? '', 1, 168);
  if (leadText && leadHours !== undefined) {
    draft.leadTime = { text: leadText, hoursBefore: leadHours };
  }
  const notes = page.notes.notes.trim().slice(0, 2000);
  if (notes) draft.notes = notes;
  return draft;
}
