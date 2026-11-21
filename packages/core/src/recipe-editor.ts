import { parseAmount } from './amounts';
import { defaultShoppingRuleFor, type CatalogHit } from './article-catalog';
import type { DraftArticle, IngredientDraft } from './ingredient-drafts';
import { cuisineFacets, spellingFacets } from './recipe-list';
import { matchSearchOrCreate, type SearchOrCreateResult } from './search-or-create';
import { normalizeText } from './text';
import type {
  Article,
  Course,
  Id,
  MealPlanEntry,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeVariant,
  ShoppingRule,
} from './types';

// Editing the recipe page section by section (spec 0008, REQ-007, REQ-008, E7 to E10). A section
// has a draft that lives in the page; "Fertig" checks it (validateSectionDraft) and turns it into a
// patch of only this section's columns (sectionPatch), which the api sends as one apply_changes.
// Switching sections or leaving the page saves the valid part (savablePart).

export type RecipeSection = 'head' | 'classification' | 'ingredients' | 'steps' | 'notes';

/**
 * Limits of the fields (E8): those of the database checks (`recipes_*`, recipes_check_ingredients),
 * and for steps, Vorlauf and variant names the plan's own. Characters count as code points, like
 * `char_length`.
 */
export const RECIPE_LIMITS = {
  title: 200,
  description: 4000,
  notes: 4000,
  servingsMin: 1,
  servingsMax: 100,
  minutesMax: 10000,
  cuisine: 80,
  tags: 30,
  tagsLength: 1000,
  variants: 20,
  variantName: 60,
  ingredients: 300,
  prepNote: 200,
  steps: 100,
  stepText: 1000,
  leadTimeText: 200,
  leadTimeHoursMax: 168,
  /** `octet_length` of the ingredients and of the steps, each. */
  jsonBytes: 200_000,
} as const;

// ---------- Drafts ----------

/** The head as typed: numbers stay text until they are checked. */
export interface HeadFields {
  title: string;
  description: string;
  servings: string;
  /** Blank = no time. */
  totalMinutes: string;
}

export interface ClassificationFields {
  course: Course;
  /** Blank = no cuisine. */
  cuisine: string;
  tags: string[];
}

/** How a row gets its article: a household article by id, or one created on saving (spec 0007). */
export type IngredientRowArticle = { kind: 'article'; articleId: Id } | DraftArticle;

/** One line in the section "Zutaten" while it is edited (≡, Menge, Artikel, ⋯). */
export interface IngredientRow {
  /** Stable within the draft; the ingredient id for stored rows. */
  key: string;
  /** The stored ingredient this row edits; undefined for a new row. */
  ingredientId?: Id;
  /** What was typed or pasted for the article; shown while the row has none. */
  name?: string;
  /** "Rezeptangabe", e.g. "200 ml"; parsed on saving. */
  amountText: string;
  /** Undefined = orange with "Artikel wählen" (AC-032). */
  article?: IngredientRowArticle;
  /** "Meinst du …?" for an orange row spelled like an article (spec 0007, AC-009). */
  suggestion?: CatalogHit;
  /** Undefined = the article's rule on saving (defaultShoppingRuleFor). */
  shoppingRule?: ShoppingRule;
  /** Chosen in this draft: it also becomes the article's Standard-Einkaufsregel (spec 0007, E7). */
  shoppingRuleChosen: boolean;
  /** Zusatz for the list. */
  shoppingNote: string;
  /** Hinweis for cooking. */
  prepNote: string;
  /** Undefined = Basis. */
  variantId?: Id;
  group: string;
}

export interface IngredientsFields {
  variants: RecipeVariant[];
  rows: IngredientRow[];
}

export interface StepsFields {
  steps: RecipeStep[];
  /** Blank text = no Vorlauf. */
  leadTimeText: string;
  leadTimeHours: string;
}

export interface NotesFields {
  notes: string;
}

export interface HeadDraft extends HeadFields {
  section: 'head';
  /** The values when the section was opened: only fields changed since then are sent (AC-029). */
  base: HeadFields;
}
export interface ClassificationDraft extends ClassificationFields {
  section: 'classification';
  base: ClassificationFields;
}
export interface IngredientsDraft extends IngredientsFields {
  section: 'ingredients';
  base: Pick<Recipe, 'variants' | 'ingredients'>;
}
export interface StepsDraft extends StepsFields {
  section: 'steps';
  base: StepsFields;
}
export interface NotesDraft extends NotesFields {
  section: 'notes';
  base: NotesFields;
}

export type RecipeSectionDraft =
  HeadDraft | ClassificationDraft | IngredientsDraft | StepsDraft | NotesDraft;

function headFields(recipe: Recipe): HeadFields {
  return {
    title: recipe.title,
    description: recipe.description ?? '',
    servings: String(recipe.servings),
    totalMinutes: recipe.totalMinutes === undefined ? '' : String(recipe.totalMinutes),
  };
}

function classificationFields(recipe: Recipe): ClassificationFields {
  return { course: recipe.course, cuisine: recipe.cuisine ?? '', tags: [...recipe.tags] };
}

function stepsFields(recipe: Recipe): StepsFields {
  return {
    steps: [...recipe.steps],
    leadTimeText: recipe.leadTime?.text ?? '',
    leadTimeHours: recipe.leadTime === undefined ? '' : String(recipe.leadTime.hoursBefore),
  };
}

function rowFromIngredient(ingredient: RecipeIngredient): IngredientRow {
  return {
    key: ingredient.id,
    ingredientId: ingredient.id,
    amountText: ingredient.amount?.text ?? '',
    article: { kind: 'article', articleId: ingredient.articleId },
    shoppingRule: ingredient.shoppingRule,
    shoppingRuleChosen: false,
    shoppingNote: ingredient.shoppingNote ?? '',
    prepNote: ingredient.prepNote ?? '',
    variantId: ingredient.variantId,
    group: ingredient.group ?? '',
  };
}

/** The draft of a section as stored in the recipe, opened with its pen. */
export function sectionDraft(recipe: Recipe, section: 'head'): HeadDraft;
export function sectionDraft(recipe: Recipe, section: 'classification'): ClassificationDraft;
export function sectionDraft(recipe: Recipe, section: 'ingredients'): IngredientsDraft;
export function sectionDraft(recipe: Recipe, section: 'steps'): StepsDraft;
export function sectionDraft(recipe: Recipe, section: 'notes'): NotesDraft;
export function sectionDraft(recipe: Recipe, section: RecipeSection): RecipeSectionDraft;
export function sectionDraft(recipe: Recipe, section: RecipeSection): RecipeSectionDraft {
  switch (section) {
    case 'head':
      return { section, ...headFields(recipe), base: headFields(recipe) };
    case 'classification':
      return { section, ...classificationFields(recipe), base: classificationFields(recipe) };
    case 'ingredients':
      return {
        section,
        variants: [...recipe.variants],
        rows: recipe.ingredients.map(rowFromIngredient),
        base: { variants: recipe.variants, ingredients: recipe.ingredients },
      };
    case 'steps':
      return { section, ...stepsFields(recipe), base: stepsFields(recipe) };
    case 'notes':
      return { section, notes: recipe.notes ?? '', base: { notes: recipe.notes ?? '' } };
  }
}

// ---------- Checking ----------

export type SectionField =
  | 'title'
  | 'description'
  | 'servings'
  | 'totalMinutes'
  | 'cuisine'
  | 'tags'
  | 'variants'
  | 'variant'
  | 'ingredients'
  | 'ingredient'
  | 'steps'
  | 'step'
  | 'leadTimeText'
  | 'leadTimeHours'
  | 'notes';

export interface SectionProblem {
  field: SectionField;
  /** The variant id, row key or step id for `variant`, `ingredient` and `step`. */
  key?: string;
  message: string;
}

const TOO_MUCH_TEXT = 'Zu viel Text – bitte kürzen';

const length = (text: string): number => Array.from(text).length;
const tooLong = (max: number): string => `Höchstens ${max} Zeichen`;

/** A whole number written with digits only ("12", " 6 "); undefined otherwise. */
function wholeNumber(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function within(value: number | undefined, min: number, max: number): boolean {
  return value !== undefined && value >= min && value <= max;
}

/**
 * Bytes of the value as Postgres writes jsonb as text (`octet_length(x::text)`): JSON with a space
 * after every ":" and ",", UTF-8. Close enough to keep a save from failing at the check.
 */
function jsonbBytes(value: unknown): number {
  let bytes = 0;
  for (const character of jsonbText(value)) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const pairs = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => `${JSON.stringify(key)}: ${jsonbText(entry)}`);
    return `{${pairs.join(', ')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Equal as stored: key order and keys holding undefined do not count. */
function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const pairs = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function headProblems(draft: HeadFields): SectionProblem[] {
  const problems: SectionProblem[] = [];
  const title = draft.title.trim();
  if (title === '') problems.push({ field: 'title', message: 'Titel fehlt' });
  else if (length(title) > RECIPE_LIMITS.title) {
    problems.push({ field: 'title', message: tooLong(RECIPE_LIMITS.title) });
  }
  if (length(draft.description.trim()) > RECIPE_LIMITS.description) {
    problems.push({ field: 'description', message: tooLong(RECIPE_LIMITS.description) });
  }
  if (!within(wholeNumber(draft.servings), RECIPE_LIMITS.servingsMin, RECIPE_LIMITS.servingsMax)) {
    problems.push({ field: 'servings', message: '1 bis 100 Portionen' });
  }
  if (
    draft.totalMinutes.trim() !== '' &&
    !within(wholeNumber(draft.totalMinutes), 0, RECIPE_LIMITS.minutesMax)
  ) {
    problems.push({ field: 'totalMinutes', message: '0 bis 10000 Minuten' });
  }
  return problems;
}

function classificationProblems(draft: ClassificationFields): SectionProblem[] {
  const problems: SectionProblem[] = [];
  if (length(draft.cuisine.trim()) > RECIPE_LIMITS.cuisine) {
    problems.push({ field: 'cuisine', message: tooLong(RECIPE_LIMITS.cuisine) });
  }
  const tags = cleanTags(draft.tags);
  if (tags.length > RECIPE_LIMITS.tags) {
    problems.push({ field: 'tags', message: 'Höchstens 30 Schlagworte' });
  }
  if (tags.reduce((sum, tag) => sum + length(tag), 0) > RECIPE_LIMITS.tagsLength) {
    problems.push({ field: 'tags', message: 'Höchstens 1000 Zeichen in allen Schlagworten' });
  }
  return problems;
}

function stepsProblems(draft: StepsFields): SectionProblem[] {
  const problems: SectionProblem[] = [];
  const steps = savedSteps(draft.steps);
  for (const step of steps) {
    if (length(step.text) > RECIPE_LIMITS.stepText) {
      problems.push({ field: 'step', key: step.id, message: tooLong(RECIPE_LIMITS.stepText) });
    }
  }
  if (steps.length > RECIPE_LIMITS.steps) {
    problems.push({ field: 'steps', message: 'Höchstens 100 Schritte' });
  } else if (jsonbBytes(steps) > RECIPE_LIMITS.jsonBytes) {
    problems.push({ field: 'steps', message: TOO_MUCH_TEXT });
  }
  const leadText = draft.leadTimeText.trim();
  if (leadText !== '') {
    if (length(leadText) > RECIPE_LIMITS.leadTimeText) {
      problems.push({ field: 'leadTimeText', message: tooLong(RECIPE_LIMITS.leadTimeText) });
    }
    if (!within(wholeNumber(draft.leadTimeHours), 1, RECIPE_LIMITS.leadTimeHoursMax)) {
      problems.push({ field: 'leadTimeHours', message: '1 bis 168 Stunden' });
    }
  }
  return problems;
}

// A stand-in for an id not known before saving, as long as a UUID.
const UUID_LENGTH_ID = 'x'.repeat(36);

function ingredientsProblems(draft: IngredientsDraft): SectionProblem[] {
  const problems: SectionProblem[] = [];
  if (draft.variants.length > RECIPE_LIMITS.variants) {
    problems.push({ field: 'variants', message: 'Höchstens 20 Varianten' });
  }
  for (const variant of draft.variants) {
    const name = variant.name.trim();
    if (name === '') problems.push({ field: 'variant', key: variant.id, message: 'Name fehlt' });
    else if (length(name) > RECIPE_LIMITS.variantName) {
      problems.push({
        field: 'variant',
        key: variant.id,
        message: tooLong(RECIPE_LIMITS.variantName),
      });
    }
  }
  for (const id of duplicateVariantIds(draft)) {
    problems.push({ field: 'variant', key: id, message: 'Gibt es schon' });
  }

  for (const row of draft.rows) {
    if (length(row.prepNote.trim()) > RECIPE_LIMITS.prepNote) {
      problems.push({
        field: 'ingredient',
        key: row.key,
        message: tooLong(RECIPE_LIMITS.prepNote),
      });
    }
  }
  if (draft.rows.length > RECIPE_LIMITS.ingredients) {
    problems.push({ field: 'ingredients', message: 'Höchstens 300 Zutaten' });
  } else {
    const estimate = draft.rows.map((row) =>
      ingredientFromRow(
        row,
        { id: UUID_LENGTH_ID, isPantry: false },
        undefined,
        () => UUID_LENGTH_ID,
      ),
    );
    if (jsonbBytes(estimate) > RECIPE_LIMITS.jsonBytes) {
      problems.push({ field: 'ingredients', message: TOO_MUCH_TEXT });
    }
  }
  return problems;
}

/**
 * Variants whose name another one has too (after normalizeText). The one being renamed or added
 * is flagged, not the one that already had the name; if none of them is new, all but the first.
 */
function duplicateVariantIds(draft: IngredientsDraft): Id[] {
  const groups = new Map<string, RecipeVariant[]>();
  for (const variant of draft.variants) {
    const key = normalizeText(variant.name);
    if (key === '') continue;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }
  const flagged: Id[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const changed = group.filter(
      (variant) =>
        !draft.base.variants.some(
          (stored) => stored.id === variant.id && stored.name === variant.name,
        ),
    );
    flagged.push(...(changed.length > 0 ? changed : group.slice(1)).map((variant) => variant.id));
  }
  return flagged;
}

/**
 * What keeps "Fertig" from saving (E8, AC-026): "Titel fehlt", "Höchstens n Zeichen",
 * "1 bis 100 Portionen", "Gibt es schon" and the other limits. [] = the draft can be saved. Rows
 * without an article are no problem here: they stay open (openRows, AC-032).
 */
export function validateSectionDraft(draft: RecipeSectionDraft): SectionProblem[] {
  switch (draft.section) {
    case 'head':
      return headProblems(draft);
    case 'classification':
      return classificationProblems(draft);
    case 'ingredients':
      return ingredientsProblems(draft);
    case 'steps':
      return stepsProblems(draft);
    case 'notes':
      return length(draft.notes.trim()) > RECIPE_LIMITS.notes
        ? [{ field: 'notes', message: tooLong(RECIPE_LIMITS.notes) }]
        : [];
  }
}

/**
 * The valid part of a draft, saved when another pen is tapped or the page is left (E7): every
 * field with a problem goes back to its stored value (an empty title keeps the old title), and
 * rows without an article drop out. A valid draft comes back unchanged.
 */
export function savablePart(draft: RecipeSectionDraft): RecipeSectionDraft {
  const fields = new Set(validateSectionDraft(draft).map((problem) => problem.field));
  switch (draft.section) {
    case 'head': {
      const next = { ...draft };
      for (const field of ['title', 'description', 'servings', 'totalMinutes'] as const) {
        if (fields.has(field)) next[field] = draft.base[field];
      }
      return fields.size === 0 ? draft : next;
    }
    case 'classification':
      if (fields.size === 0) return draft;
      return {
        ...draft,
        cuisine: fields.has('cuisine') ? draft.base.cuisine : draft.cuisine,
        tags: fields.has('tags') ? draft.base.tags : draft.tags,
      };
    case 'ingredients': {
      const rows = fields.size === 0 ? draft.rows : draft.base.ingredients.map(rowFromIngredient);
      const ready = rows.filter((row) => row.article !== undefined);
      if (fields.size === 0 && ready.length === draft.rows.length) return draft;
      return {
        ...draft,
        variants: fields.size === 0 ? draft.variants : [...draft.base.variants],
        rows: ready,
      };
    }
    case 'steps': {
      if (fields.size === 0) return draft;
      const lead = fields.has('leadTimeText') || fields.has('leadTimeHours');
      return {
        ...draft,
        steps: fields.has('step') || fields.has('steps') ? draft.base.steps : draft.steps,
        leadTimeText: lead ? draft.base.leadTimeText : draft.leadTimeText,
        leadTimeHours: lead ? draft.base.leadTimeHours : draft.leadTimeHours,
      };
    }
    case 'notes':
      return fields.size === 0 ? draft : { ...draft, notes: draft.base.notes };
  }
}

// ---------- Patch ----------

/** Columns a section writes; a key holding undefined clears the column. */
export type RecipePatch = Partial<
  Pick<
    Recipe,
    | 'title'
    | 'description'
    | 'servings'
    | 'totalMinutes'
    | 'course'
    | 'cuisine'
    | 'tags'
    | 'variants'
    | 'ingredients'
    | 'steps'
    | 'leadTime'
    | 'notes'
  >
>;

export interface SectionPatchContext {
  /** The household's articles now; a row whose article is gone stays open. */
  articles: readonly Article[];
  /**
   * The household article for a starter hit or "„…“ neu anlegen", created in the same change
   * (spec 0007, `DraftArticle`). Called only for rows that are saved.
   */
  createArticle: (article: DraftArticle) => Article;
  newId: () => Id;
  /** The meal plan, for variants that are removed (E10). */
  entries: readonly MealPlanEntry[];
}

export interface SectionPatch {
  /** Only the columns of this section the draft changed; {} = nothing to send. */
  recipe: RecipePatch;
  /** Plan entries changed because a variant was removed (E10); same change as the recipe. */
  entries: MealPlanEntry[];
  /** Rows without an article: not saved, the section stays open with them (AC-032). */
  open: IngredientRow[];
  /** Rules chosen in this draft, to become the articles' Standard-Einkaufsregel (spec 0007, E7). */
  rules: { articleId: Id; rule: ShoppingRule }[];
}

function headValues(fields: HeadFields): RecipePatch {
  const minutes = fields.totalMinutes.trim();
  return {
    title: fields.title.trim(),
    description: fields.description.trim() || undefined,
    servings: Number(fields.servings.trim()),
    totalMinutes: minutes === '' ? undefined : Number(minutes),
  };
}

function classificationValues(fields: ClassificationFields): RecipePatch {
  return {
    course: fields.course,
    cuisine: fields.cuisine.trim() || undefined,
    tags: cleanTags(fields.tags),
  };
}

function savedSteps(steps: readonly RecipeStep[]): RecipeStep[] {
  return steps.flatMap((step) => {
    const text = step.text.trim();
    return text === '' ? [] : [{ ...step, text }];
  });
}

function stepsValues(fields: StepsFields): RecipePatch {
  const text = fields.leadTimeText.trim();
  return {
    steps: savedSteps(fields.steps),
    leadTime: text === '' ? undefined : { text, hoursBefore: Number(fields.leadTimeHours.trim()) },
  };
}

/** The keys of `next` whose value differs from `before`. */
function changed(next: RecipePatch, before: RecipePatch): RecipePatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (!sameValue(value, (before as Record<string, unknown>)[key])) patch[key] = value;
  }
  return patch as RecipePatch;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The stored ingredient of a row: the stored amount while its text is unchanged (so a quantity is
 * not parsed anew), the row's rule or the article's (defaultShoppingRuleFor), notes trimmed.
 */
function ingredientFromRow(
  row: IngredientRow,
  article: Pick<Article, 'id' | 'isPantry' | 'defaultShoppingRule'>,
  stored: RecipeIngredient | undefined,
  newId: () => Id,
): RecipeIngredient {
  const text = row.amountText.trim();
  const amount = stored && text === (stored.amount?.text ?? '') ? stored.amount : parseAmount(text);
  const ingredient: RecipeIngredient = {
    id: row.ingredientId ?? newId(),
    articleId: article.id,
    shoppingRule: row.shoppingRule ?? defaultShoppingRuleFor(article, amount),
  };
  if (amount) ingredient.amount = amount;
  const shoppingNote = collapse(row.shoppingNote);
  if (shoppingNote !== '') ingredient.shoppingNote = shoppingNote;
  const prepNote = collapse(row.prepNote);
  if (prepNote !== '') ingredient.prepNote = prepNote;
  if (row.variantId !== undefined) ingredient.variantId = row.variantId;
  const group = row.group.trim();
  if (group !== '') ingredient.group = group;
  return ingredient;
}

/** The household article id a row already points at, if any. */
function existingArticleId(article: IngredientRowArticle): Id | undefined {
  if (article.kind === 'article') return article.articleId;
  if (article.kind === 'hit' && article.hit.kind === 'article') return article.hit.id;
  return undefined;
}

/** The row's household article, created for a starter hit or a new name; undefined when gone. */
function resolveRowArticle(
  article: IngredientRowArticle,
  known: ReadonlyMap<Id, Article>,
  create: (article: DraftArticle) => Article,
): Article | undefined {
  if (article.kind === 'article') return known.get(article.articleId);
  if (article.kind === 'hit' && article.hit.kind === 'article') return known.get(article.hit.id);
  return create(article);
}

function orangeRow(row: IngredientRow): IngredientRow {
  const copy = { ...row };
  delete copy.article;
  return copy;
}

function ingredientsPatch(
  recipe: Recipe,
  draft: IngredientsDraft,
  context: SectionPatchContext,
): SectionPatch {
  const known = new Map(context.articles.map((article) => [article.id, article]));
  const stored = new Map(draft.base.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const ingredients: RecipeIngredient[] = [];
  const open: IngredientRow[] = [];
  const rules = new Map<Id, ShoppingRule>();

  for (const row of draft.rows) {
    if (row.article === undefined) {
      open.push(row);
      continue;
    }
    const article = resolveRowArticle(row.article, known, context.createArticle);
    if (article === undefined) {
      open.push(orangeRow(row));
      continue;
    }
    const ingredient = ingredientFromRow(
      row,
      article,
      row.ingredientId === undefined ? undefined : stored.get(row.ingredientId),
      context.newId,
    );
    ingredients.push(ingredient);
    if (row.shoppingRuleChosen) rules.set(article.id, ingredient.shoppingRule);
  }

  const variants = draft.variants.map((variant) => ({ ...variant, name: variant.name.trim() }));
  const remaining = new Set(variants.map((variant) => variant.id));
  const removed = draft.base.variants
    .filter((variant) => !remaining.has(variant.id))
    .map((variant) => variant.id);
  const removedSet = new Set(removed);
  const steps = recipe.steps.filter(
    (step) => step.variantId === undefined || !removedSet.has(step.variantId),
  );

  const patch: RecipePatch = changed(
    { ingredients, variants },
    { ingredients: draft.base.ingredients, variants: draft.base.variants },
  );
  if (steps.length !== recipe.steps.length) patch.steps = steps;

  return {
    recipe: patch,
    entries: planEntriesAfterVariantRemoval(context.entries, recipe.id, removed, variants),
    open,
    rules: [...rules].map(([articleId, rule]) => ({ articleId, rule })),
  };
}

/**
 * The patch "Fertig" sends (AC-029, E7): only the columns of the draft's section that changed
 * since the section was opened, so a field another device changed meanwhile stays. `recipe` is
 * the recipe as it is now. For "Zutaten": rows without an article stay open, new and starter
 * articles come from `context.createArticle`, and removing a variant also takes its steps (of the
 * current recipe) and moves its planned portions (E10). Throws for a draft with problems: check it
 * with validateSectionDraft first.
 */
export function sectionPatch(
  recipe: Recipe,
  draft: RecipeSectionDraft,
  context: SectionPatchContext,
): SectionPatch {
  if (validateSectionDraft(draft).length > 0) throw new Error('Der Abschnitt ist nicht gültig.');
  const only = (patch: RecipePatch): SectionPatch => ({
    recipe: patch,
    entries: [],
    open: [],
    rules: [],
  });
  switch (draft.section) {
    case 'head':
      return only(changed(headValues(draft), headValues(draft.base)));
    case 'classification':
      return only(changed(classificationValues(draft), classificationValues(draft.base)));
    case 'ingredients':
      return ingredientsPatch(recipe, draft, context);
    case 'steps':
      return only(changed(stepsValues(draft), stepsValues(draft.base)));
    case 'notes':
      return only(
        changed(
          { notes: draft.notes.trim() || undefined },
          { notes: draft.base.notes.trim() || undefined },
        ),
      );
  }
}

// ---------- Classification ----------

/** Tags as stored: trimmed, blank ones left out, each once after normalizeText (E8). */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of tags) {
    const shown = tag.trim();
    const key = normalizeText(shown);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(shown);
  }
  return cleaned;
}

/** Adds a tag unless it is there already in another spelling. */
export function addTag(tags: readonly string[], tag: string): string[] {
  return cleanTags([...tags, tag]);
}

/** The household's cuisines for "Suchen oder anlegen", most used first (AC-024). */
export function cuisineValues(recipes: readonly Recipe[]): string[] {
  return cuisineFacets(recipes).map((facet) => facet.label);
}

/** The household's tags, most used first, each in its most common spelling (AC-024). */
export function tagValues(recipes: readonly Recipe[]): string[] {
  return spellingFacets(
    recipes.flatMap((recipe) => recipe.tags),
    normalizeText,
  ).map((facet) => facet.label);
}

/**
 * "Suchen oder anlegen" over existing values (AC-024): "italienisch" finds "Italienisch" with
 * nothing to create, "Orientalisch" offers "„Orientalisch“ neu anlegen".
 */
export function valueSuggestions(
  query: string,
  values: readonly string[],
): SearchOrCreateResult<{ id: string; name: string }> {
  return matchSearchOrCreate(
    query,
    values.map((value) => ({ id: value, name: value })),
  );
}

// ---------- Steps ----------

/** Moves an item to `toIndex` (clamped); the same array when the key is unknown. */
function moveTo<T>(items: readonly T[], index: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

/** "+ Schritt"; a blank step is left out on saving. */
export function addStep(draft: StepsDraft, text: string, id: Id): StepsDraft {
  return { ...draft, steps: [...draft.steps, { id, text }] };
}

export function updateStepText(draft: StepsDraft, id: Id, text: string): StepsDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => (step.id === id ? { ...step, text } : step)),
  };
}

export function removeStep(draft: StepsDraft, id: Id): StepsDraft {
  return { ...draft, steps: draft.steps.filter((step) => step.id !== id) };
}

/** Drag, "Nach oben" or "Nach unten" (AC-027); the same draft for an unknown step. */
export function moveStep(draft: StepsDraft, id: Id, toIndex: number): StepsDraft {
  const index = draft.steps.findIndex((step) => step.id === id);
  if (index === -1) return draft;
  return { ...draft, steps: moveTo(draft.steps, index, toIndex) };
}

// ---------- Ingredients ----------

/** "+ Zutat": an empty orange row. */
export function newIngredientRow(key: string): IngredientRow {
  return {
    key,
    amountText: '',
    shoppingRuleChosen: false,
    shoppingNote: '',
    prepNote: '',
    group: '',
  };
}

function rowArticle(article: DraftArticle): IngredientRowArticle {
  return article.kind === 'hit' && article.hit.kind === 'article'
    ? { kind: 'article', articleId: article.hit.id }
    : article;
}

/** The lines of "Mehrere einfügen" as rows: sure lines with their article, the rest orange. */
export function rowsFromIngredientDrafts(drafts: readonly IngredientDraft[]): IngredientRow[] {
  return drafts.map((draft) => {
    const row: IngredientRow = {
      ...newIngredientRow(draft.key),
      name: draft.line.name,
      amountText: draft.line.amount?.text ?? '',
    };
    if (draft.article) row.article = rowArticle(draft.article);
    if (draft.suggestion) row.suggestion = draft.suggestion;
    return row;
  });
}

export function addIngredientRows(
  draft: IngredientsDraft,
  rows: readonly IngredientRow[],
): IngredientsDraft {
  return { ...draft, rows: [...draft.rows, ...rows] };
}

function mapRow(
  draft: IngredientsDraft,
  key: string,
  change: (row: IngredientRow) => IngredientRow,
): IngredientsDraft {
  return { ...draft, rows: draft.rows.map((row) => (row.key === key ? change(row) : row)) };
}

/** Menge, Zusatz, Hinweis, Variante or Gruppe of a row (its ⋯). */
export function updateIngredientRow(
  draft: IngredientsDraft,
  key: string,
  patch: Partial<
    Pick<IngredientRow, 'name' | 'amountText' | 'shoppingNote' | 'prepNote' | 'variantId' | 'group'>
  >,
): IngredientsDraft {
  return mapRow(draft, key, (row) => ({ ...row, ...patch }));
}

/** A hit, "Ja" on "Meinst du …?" or "neu anlegen" (AC-030, AC-032): the row is no longer orange. */
export function chooseRowArticle(
  draft: IngredientsDraft,
  key: string,
  article: DraftArticle,
): IngredientsDraft {
  return mapRow(draft, key, (row) => {
    const next: IngredientRow = { ...row, article: rowArticle(article) };
    delete next.suggestion;
    return next;
  });
}

/** Einkaufsregel in the row's ⋯; it also becomes the article's Standard-Einkaufsregel (E7). */
export function setRowShoppingRule(
  draft: IngredientsDraft,
  key: string,
  rule: ShoppingRule,
): IngredientsDraft {
  return mapRow(draft, key, (row) => ({ ...row, shoppingRule: rule, shoppingRuleChosen: true }));
}

/** Drag, "Nach oben" or "Nach unten"; the same draft for an unknown row. */
export function moveIngredient(
  draft: IngredientsDraft,
  key: string,
  toIndex: number,
): IngredientsDraft {
  const index = draft.rows.findIndex((row) => row.key === key);
  if (index === -1) return draft;
  return { ...draft, rows: moveTo(draft.rows, index, toIndex) };
}

/** "Entfernen" in the row's ⋯ (spec 0007 "Zutat entfernen"). */
export function removeIngredient(draft: IngredientsDraft, key: string): IngredientsDraft {
  return { ...draft, rows: draft.rows.filter((row) => row.key !== key) };
}

/**
 * Rows that will not be saved (AC-032): without an article, or whose household article is gone
 * (deleted or merged on another device; then without article). missingArticlesLabel names them.
 */
export function openRows(draft: IngredientsDraft, articles: readonly Article[]): IngredientRow[] {
  const known = new Set(articles.map((article) => article.id));
  return draft.rows.flatMap((row) => {
    if (row.article === undefined) return [row];
    const id = existingArticleId(row.article);
    return id !== undefined && !known.has(id) ? [orangeRow(row)] : [];
  });
}

/** The article name a row shows: its article's, else what was typed or pasted. */
export function rowArticleName(row: IngredientRow, articlesById: Record<Id, Article>): string {
  const { article } = row;
  if (article === undefined) return row.name ?? '';
  if (article.kind === 'article') return articlesById[article.articleId]?.name ?? row.name ?? '';
  return article.kind === 'hit' ? article.hit.name : article.name;
}

// ---------- Variants ----------

/** "+ Variante"; the first variant of a recipe is its default. */
export function addVariant(draft: IngredientsDraft, name: string, id: Id): IngredientsDraft {
  return {
    ...draft,
    variants: [...draft.variants, { id, name, isDefault: draft.variants.length === 0 }],
  };
}

export function renameVariant(draft: IngredientsDraft, id: Id, name: string): IngredientsDraft {
  return {
    ...draft,
    variants: draft.variants.map((variant) => (variant.id === id ? { ...variant, name } : variant)),
  };
}

/** "Als Standard". */
export function setDefaultVariant(draft: IngredientsDraft, id: Id): IngredientsDraft {
  return {
    ...draft,
    variants: draft.variants.map((variant) => ({ ...variant, isDefault: variant.id === id })),
  };
}

/**
 * "Entfernen" of a variant (AC-033, E10): its rows go with it; when it was the default, the first
 * remaining variant becomes the default. Its steps and planned portions follow on saving.
 */
export function removeVariant(draft: IngredientsDraft, id: Id): IngredientsDraft {
  const variants = draft.variants.filter((variant) => variant.id !== id);
  const [first, ...rest] = variants;
  const withDefault =
    first === undefined || variants.some((variant) => variant.isDefault)
      ? variants
      : [{ ...first, isDefault: true }, ...rest];
  return {
    ...draft,
    variants: withDefault,
    rows: draft.rows.filter((row) => row.variantId !== id),
  };
}

/**
 * Plan entries of the recipe, on any day, after variants were removed (E10): the portions of a
 * removed variant go to the (new) default variant and are merged, in the order of `variants`.
 * Without any variant left the split becomes empty and the entry keeps its portions. Returns only
 * the entries that change.
 */
export function planEntriesAfterVariantRemoval(
  entries: readonly MealPlanEntry[],
  recipeId: Id,
  removedVariantIds: readonly Id[],
  variants: readonly RecipeVariant[],
): MealPlanEntry[] {
  const removed = new Set(removedVariantIds);
  if (removed.size === 0) return [];
  const defaultId = (variants.find((variant) => variant.isDefault) ?? variants[0])?.id;
  const order = variants.map((variant) => variant.id);
  const rank = (id: Id): number => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };
  return entries.flatMap((entry) => {
    if (entry.recipeId !== recipeId) return [];
    if (!entry.variants.some((row) => removed.has(row.variantId))) return [];
    if (defaultId === undefined) return [{ ...entry, variants: [] }];
    const portions = new Map<Id, number>();
    for (const row of entry.variants) {
      const id = removed.has(row.variantId) ? defaultId : row.variantId;
      portions.set(id, (portions.get(id) ?? 0) + row.portions);
    }
    const split = [...portions]
      .map(([variantId, count]) => ({ variantId, portions: count }))
      .sort((a, b) => rank(a.variantId) - rank(b.variantId));
    return [{ ...entry, variants: split }];
  });
}
