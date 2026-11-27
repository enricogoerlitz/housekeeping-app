import { ALL_VARIANTS_LABEL, variantLabel } from './ingredient-groups';
import type { PageDraft } from './page-editor';
import {
  applyFieldChanges,
  applyRowChanges,
  diffFieldChanges,
  diffRowChanges,
  type ChangeProposal,
  type Rejected,
  type RowChange,
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

/** Where a row stands: its variant (undefined: every variant) and its group. */
interface Place {
  variantId?: Id;
  group?: string;
}

/** The variants of both pages by id, for headings and hints. */
function variantNames(before: PageDraft, after: PageDraft): Map<Id, string> {
  const names = new Map<Id, string>();
  for (const variant of [...after.ingredients.variants, ...before.ingredients.variants]) {
    if (!names.has(variant.id)) names.set(variant.id, variantLabel(variant.name));
  }
  return names;
}

/**
 * "jetzt nur in „Original“ · jetzt unter „Soße“": where a row that keeps its text went
 * (Nachklick 27.11., N-01).
 */
function movedHint(before: Place, after: Place, names: Map<Id, string>): string | undefined {
  const parts: string[] = [];
  if (before.variantId !== after.variantId) {
    const name = after.variantId === undefined ? undefined : names.get(after.variantId);
    parts.push(name ? `jetzt nur in „${name}“` : 'jetzt in allen Varianten');
  }
  const group = (after.group ?? '').trim();
  if ((before.group ?? '').trim() !== group) {
    parts.push(group ? `jetzt unter „${group}“` : 'jetzt ohne Gruppe');
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function rules(context: Context, names: Map<Id, string>) {
  const ingredients: RowRules<IngredientRow> = {
    key: (row) => `${row.variantId ?? ''}|${articleKey(row)}`,
    loose: articleKey,
    label: (row) =>
      [`${row.amountText.trim()} ${context.articleName(row)}`.trim(), row.prepNote.trim()]
        .filter(Boolean)
        .join(', '),
    same: (before, after) =>
      before.amountText.trim() === after.amountText.trim() &&
      before.prepNote.trim() === after.prepNote.trim() &&
      before.variantId === after.variantId &&
      before.group.trim() === after.group.trim(),
    hint: (before, after) => movedHint(before, after, names),
  };
  const steps: RowRules<RecipeStep> = {
    key: (step) => `${step.variantId ?? ''}|${normalizeText(step.text)}`,
    loose: (step) => normalizeText(step.text),
    label: (step) => step.text,
    same: (before, after) => before.variantId === after.variantId,
    hint: (before, after) => movedHint(before, after, names),
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
  const rule = rules(context, variantNames(before, after));
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
 * The rows of a list under the headings of the recipe page (Nachklick 27.11., N-01): with
 * variants „Alle Varianten“ first, then each variant in its order; within each, the rows without
 * group first, then each group. Only for showing: saving keeps the proposed order.
 */
function inSections<T extends Place>(
  rows: RowChange<T>[],
  before: PageDraft,
  after: PageDraft,
): RowChange<T>[] {
  const names = variantNames(before, after);
  const order = [...names.keys()];
  const withVariants = order.length > 0;
  const groupOrder: string[] = [];
  const placed = rows.map((row, index) => {
    const place: Place = row.after ?? row.before ?? {};
    const variantId =
      place.variantId !== undefined && names.has(place.variantId) ? place.variantId : undefined;
    const group = (place.group ?? '').trim();
    const groupKey = `${variantId ?? ''}|${group.toLocaleLowerCase('de')}`;
    if (group !== '' && !groupOrder.includes(groupKey)) groupOrder.push(groupKey);
    const heading = [
      withVariants ? (variantId === undefined ? ALL_VARIANTS_LABEL : names.get(variantId)) : '',
      group,
    ]
      .filter(Boolean)
      .join(' · ');
    const section: RowChange<T> = heading ? { ...row, section: heading } : row;
    return {
      row: section,
      index,
      variant: variantId === undefined ? -1 : order.indexOf(variantId),
      group: group === '' ? -1 : groupOrder.indexOf(groupKey),
    };
  });
  return placed
    .sort((a, b) => a.variant - b.variant || a.group - b.group || a.index - b.index)
    .map((entry) => entry.row);
}

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
      { id: 'ingredients', label: 'Zutaten', rows: inSections(rows.ingredients, before, after) },
      { id: 'steps', label: 'Schritte', rows: inSections(rows.steps, before, after) },
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
