import type { PageDraft } from './page-editor';
import {
  applyFieldChanges,
  applyRowChanges,
  diffFieldChanges,
  diffRowChanges,
  type ChangeProposal,
  type Rejected,
  type RowRules,
} from './proposal-diff';
import type { IngredientRow } from './recipe-editor';
import { courseLabel } from './recipes';
import { normalizeText } from './text';
import type { Course, Id, RecipeLink, RecipeStep, RecipeVariant } from './types';

// The Änderungsansicht of a recipe (spec 0049, REQ-005): the page as stored (`before`, the pen's
// draft) against the page with the proposal filled in (`after`, fillPageDraft with "Ergänzen" or
// "Ersetzen"). Rows are the same by their article (ingredients) or text (steps, links, tags).

const FIELD_LABELS = {
  title: 'Titel',
  description: 'Beschreibung',
  servings: 'Portionen',
  totalMinutes: 'Zeit (Min)',
  course: 'Art',
  cuisine: 'Küche',
  leadTimeText: 'Vorlauf',
  leadTimeHours: 'Vorlauf (Stunden)',
  notes: 'Notizen',
} as const;
type FieldId = keyof typeof FIELD_LABELS;

export interface RecipeProposal extends ChangeProposal {
  before: PageDraft;
  after: PageDraft;
}

interface Context {
  /** The name a row shows: its article's name, or what was typed for a new one. */
  articleName: (row: IngredientRow) => string;
}

function fieldValues(page: PageDraft): Record<FieldId, string> {
  return {
    title: page.head.title,
    description: page.head.description,
    servings: page.head.servings,
    totalMinutes: page.head.totalMinutes,
    course: page.classification?.course ?? '',
    cuisine: page.classification?.cuisine ?? '',
    leadTimeText: page.steps?.leadTimeText ?? '',
    leadTimeHours: page.steps?.leadTimeHours ?? '',
    notes: page.notes.notes,
  };
}

function articleKey(row: IngredientRow): string {
  const article = row.article;
  if (article?.kind === 'article') return `id:${article.articleId}`;
  if (article?.kind === 'hit' && article.hit.kind === 'article') return `id:${article.hit.id}`;
  const name =
    article?.kind === 'hit' ? article.hit.name : article?.kind === 'new' ? article.name : row.name;
  return `name:${normalizeText(name ?? '')}`;
}

function rules(context: Context) {
  const ingredients: RowRules<IngredientRow> = {
    key: (row) => `${row.variantId ?? ''}|${articleKey(row)}`,
    label: (row) =>
      [`${row.amountText.trim()} ${context.articleName(row)}`.trim(), row.prepNote.trim()]
        .filter(Boolean)
        .join(', '),
    same: (before, after) =>
      before.amountText.trim() === after.amountText.trim() &&
      before.prepNote.trim() === after.prepNote.trim(),
  };
  const steps: RowRules<RecipeStep> = {
    key: (step) => `${step.variantId ?? ''}|${normalizeText(step.text)}`,
    label: (step) => step.text,
  };
  const links: RowRules<RecipeLink> = {
    key: (link) => link.url,
    label: (link) => link.label ?? link.url,
    same: (before, after) => (before.label ?? '') === (after.label ?? ''),
  };
  const tags: RowRules<string> = { key: normalizeText, label: (tag) => tag };
  const variants: RowRules<RecipeVariant> = {
    key: (variant) => normalizeText(variant.name),
    label: (variant) => variant.name,
  };
  return { ingredients, steps, links, tags, variants };
}

function groups(before: PageDraft, after: PageDraft, context: Context) {
  const rule = rules(context);
  return {
    variants: diffRowChanges(
      'variants',
      before.ingredients.variants,
      after.ingredients.variants,
      rule.variants,
    ),
    tags: diffRowChanges(
      'tags',
      before.classification?.tags ?? [],
      after.classification?.tags ?? [],
      rule.tags,
    ),
    ingredients: diffRowChanges(
      'ingredients',
      before.ingredients.rows,
      after.ingredients.rows,
      rule.ingredients,
    ),
    steps: diffRowChanges('steps', before.steps?.steps ?? [], after.steps?.steps ?? [], rule.steps),
    links: diffRowChanges('links', before.links.links, after.links.links, rule.links),
  };
}

const show = { course: (value: string) => courseLabel(value as Course) };

/**
 * Spec 0049, AC-047: the page's photo is proposed with "Ersetzen", and with "Ergänzen" only for a
 * recipe without a photo — "Ergänzen" never changes what is there.
 */
export function proposesPagePhoto(options: { hasPhoto: boolean; replace: boolean }): boolean {
  return options.replace || !options.hasPhoto;
}

/** What the proposal changes on the page, for the Änderungsansicht. */
export function recipeProposal(
  before: PageDraft,
  after: PageDraft,
  context: Context,
): RecipeProposal {
  const rows = groups(before, after, context);
  return {
    before,
    after,
    fields: diffFieldChanges(FIELD_LABELS, fieldValues(before), fieldValues(after), show),
    groups: [
      { id: 'tags', label: 'Schlagworte', rows: rows.tags },
      { id: 'variants', label: 'Varianten', rows: rows.variants },
      { id: 'ingredients', label: 'Zutaten', rows: rows.ingredients },
      { id: 'steps', label: 'Schritte', rows: rows.steps },
      { id: 'links', label: 'Links', rows: rows.links },
    ].filter((group) => group.rows.length > 0),
  };
}

/**
 * The page "Speichern" saves: every change still active applied to the stored page. Rows that
 * stay are the stored ones; an accepted other amount keeps the stored ingredient.
 */
export function applyRecipeProposal(proposal: RecipeProposal, rejected: Rejected): PageDraft {
  const { before, after } = proposal;
  // The labels play no part in applying, so a plain name is enough here.
  const rows = groups(before, after, { articleName: (row) => row.name ?? '' });
  const values = applyFieldChanges(fieldValues(before), proposal.fields, rejected);
  const ingredientRows = applyRowChanges(rows.ingredients, rejected, (old, next) => ({
    ...next,
    key: old.key,
    ...(old.ingredientId === undefined ? {} : { ingredientId: old.ingredientId }),
  }));
  const stepRows = applyRowChanges(rows.steps, rejected);
  // A variant dropped with × takes its rows and steps along; a stored variant that a kept row
  // still points at stays.
  const variants = applyRowChanges(rows.variants, rejected);
  const known = new Set<Id>(variants.map((variant) => variant.id));
  for (const variant of before.ingredients.variants) {
    const used =
      ingredientRows.some((entry) => entry.variantId === variant.id) ||
      stepRows.some((step) => step.variantId === variant.id);
    if (used && !known.has(variant.id)) {
      variants.push(variant);
      known.add(variant.id);
    }
  }
  const kept = (variantId: Id | undefined) => variantId === undefined || known.has(variantId);
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const page: PageDraft = {
    ...before,
    head: {
      ...before.head,
      title: values.title,
      description: values.description,
      servings: values.servings,
      totalMinutes: values.totalMinutes,
    },
    ingredients: {
      ...before.ingredients,
      variants: variants.map((variant) => ({
        ...variant,
        isDefault: variant.id === defaultVariant?.id,
      })),
      rows: ingredientRows.filter((entry) => kept(entry.variantId)),
    },
    notes: { ...before.notes, notes: values.notes },
    links: { ...before.links, links: applyRowChanges(rows.links, rejected) },
  };
  if (before.classification) {
    page.classification = {
      ...before.classification,
      course: values.course as Course,
      cuisine: values.cuisine,
      tags: applyRowChanges(rows.tags, rejected),
    };
  }
  if (before.steps) {
    page.steps = {
      ...before.steps,
      steps: stepRows.filter((step) => kept(step.variantId)),
      leadTimeText: values.leadTimeText,
      leadTimeHours: values.leadTimeHours,
    };
  }
  return page;
}
