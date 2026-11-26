import type { PageDraft } from './page-editor';
import {
  applyFields,
  applyRows,
  diffFields,
  diffRows,
  type Proposal,
  type Rejected,
  type RowRules,
} from './proposal-diff';
import type { IngredientRow } from './recipe-editor';
import { courseLabel } from './recipes';
import { normalizeText } from './text';
import type { Course, RecipeLink, RecipeStep } from './types';

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
  notes: 'Notizen',
} as const;
type FieldId = keyof typeof FIELD_LABELS;

export interface RecipeProposal extends Proposal {
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
    notes: page.notes.notes,
  };
}

function articleKey(row: IngredientRow): string {
  const article = row.article;
  if (article?.kind === 'article') return `id:${article.articleId}`;
  if (article?.kind === 'hit' && article.hit.kind === 'article') return `id:${article.hit.id}`;
  const name = article?.kind === 'hit' ? article.hit.name : article?.kind === 'new' ? article.name : row.name;
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
  return { ingredients, steps, links, tags };
}

function groups(before: PageDraft, after: PageDraft, context: Context) {
  const rule = rules(context);
  return {
    tags: diffRows('tags', before.classification?.tags ?? [], after.classification?.tags ?? [], rule.tags),
    ingredients: diffRows('ingredients', before.ingredients.rows, after.ingredients.rows, rule.ingredients),
    steps: diffRows('steps', before.steps?.steps ?? [], after.steps?.steps ?? [], rule.steps),
    links: diffRows('links', before.links.links, after.links.links, rule.links),
  };
}

const show = { course: (value: string) => courseLabel(value as Course) };

/** What the proposal changes on the page, for the Änderungsansicht. */
export function recipeProposal(before: PageDraft, after: PageDraft, context: Context): RecipeProposal {
  const rows = groups(before, after, context);
  return {
    before,
    after,
    fields: diffFields(FIELD_LABELS, fieldValues(before), fieldValues(after), show),
    groups: [
      { id: 'tags', label: 'Schlagworte', rows: rows.tags },
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
  const values = applyFields(fieldValues(before), proposal.fields, rejected);
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
      rows: applyRows(rows.ingredients, rejected, (old, next) => ({
        ...next,
        key: old.key,
        ...(old.ingredientId === undefined ? {} : { ingredientId: old.ingredientId }),
      })),
    },
    notes: { ...before.notes, notes: values.notes },
    links: { ...before.links, links: applyRows(rows.links, rejected) },
  };
  if (before.classification) {
    page.classification = {
      ...before.classification,
      course: values.course as Course,
      cuisine: values.cuisine,
      tags: applyRows(rows.tags, rejected),
    };
  }
  if (before.steps) page.steps = { ...before.steps, steps: applyRows(rows.steps, rejected) };
  return page;
}
