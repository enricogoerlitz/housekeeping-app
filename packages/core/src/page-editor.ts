import {
  contentsChanges,
  contentsDraft,
  validateContentsDraft,
  type ContentsDraft,
  type ContentsProblem,
} from './collection-editor';
import type { CollectionContent } from './collections';
import { scaleAmount } from './amounts';
import {
  addIngredientRows,
  addMissingIngredientRows,
  sectionChanged,
  sectionDraft,
  validateSectionDraft,
  type ClassificationDraft,
  type HeadDraft,
  type IngredientRow,
  type IngredientsDraft,
  type LinksDraft,
  type NotesDraft,
  type RecipeSection,
  type RecipeSectionDraft,
  type SectionProblem,
  type StepsDraft,
} from './recipe-editor';
import { ingredientsForVariant } from './recipe-variants';
import { normalizeText } from './text';
import type {
  Course,
  Id,
  Recipe,
  RecipeKind,
  RecipeLink,
  RecipeStep,
  RecipeVariant,
} from './types';

// The edit mode of the recipe page (spec 0037, REQ-001; replaces the sections of spec 0008,
// REQ-007): a pen at the top opens every section of the page at once, "Speichern" saves the
// sections that changed in one step (the api's saveRecipePage, one save_recipe_page call), and
// "Abbrechen" asks "Änderungen verwerfen?" when something changed. A collection (spec 0009) has
// head, "Enthält", own ingredients, notes and links; a recipe head, Einordnung, ingredients,
// steps, notes and links. The state changes only through pageEditorReducer; the app's hook saves.

/** "Enthält" of a collection while the page is edited. */
export type ContentsSectionDraft = ContentsDraft & { section: 'contents' };
/** The draft of one section of the page. */
export type OpenDraft = RecipeSectionDraft | ContentsSectionDraft;
export type PageSection = RecipeSection | 'contents';
export type OpenDraftProblem = SectionProblem | ContentsProblem;

/** Every section of the page as it is edited. */
export interface PageDraft {
  recipeId: Id;
  kind: RecipeKind;
  /** The recipe's `updated_at` when the edit mode opened (AC-006); undefined before a pull. */
  seenUpdatedAt?: string;
  head: HeadDraft;
  /** Recipes only. */
  classification?: ClassificationDraft;
  ingredients: IngredientsDraft;
  /** Recipes only. */
  steps?: StepsDraft;
  notes: NotesDraft;
  links: LinksDraft;
  /** Collections only. */
  contents?: ContentsSectionDraft;
}

/** The pen: the page as stored, every section open. */
export function pageDraft(recipe: Recipe, contents: readonly CollectionContent[]): PageDraft {
  const page: PageDraft = {
    recipeId: recipe.id,
    kind: recipe.kind,
    head: sectionDraft(recipe, 'head'),
    ingredients: sectionDraft(recipe, 'ingredients'),
    notes: sectionDraft(recipe, 'notes'),
    links: sectionDraft(recipe, 'links'),
  };
  if (recipe.updatedAt !== undefined) page.seenUpdatedAt = recipe.updatedAt;
  if (recipe.kind === 'collection') {
    page.contents = { ...contentsDraft(recipe, contents), section: 'contents' };
  } else {
    page.classification = sectionDraft(recipe, 'classification');
    page.steps = sectionDraft(recipe, 'steps');
  }
  return page;
}

/** The sections in the order of the page. */
export function pageSections(page: PageDraft): OpenDraft[] {
  const sections: (OpenDraft | undefined)[] = [
    page.head,
    page.classification,
    page.contents,
    page.ingredients,
    page.steps,
    page.notes,
    page.links,
  ];
  return sections.filter((draft): draft is OpenDraft => draft !== undefined);
}

/** The page with one section's draft replaced, e.g. after typing in it. */
export function withSection(page: PageDraft, draft: OpenDraft): PageDraft {
  return { ...page, [draft.section]: draft };
}

const OPEN_ROWS_PROBLEM = 'Erst für jede Zutat einen Artikel wählen';

/**
 * What keeps "Speichern" back: the problems of every section ("Titel fehlt", limits), and rows
 * without an article or pasted twice (AC-032 of spec 0008: orange until chosen or left out).
 */
export function validatePageDraft(page: PageDraft): OpenDraftProblem[] {
  const problems = pageSections(page).flatMap((draft): OpenDraftProblem[] =>
    draft.section === 'contents' ? validateContentsDraft(draft) : validateSectionDraft(draft),
  );
  if (page.ingredients.rows.some((row) => row.article === undefined || row.duplicate)) {
    problems.push({ field: 'ingredients', message: OPEN_ROWS_PROBLEM });
  }
  return problems;
}

function contentsChanged(draft: ContentsDraft): boolean {
  if (validateContentsDraft(draft).length > 0) return true;
  return contentsChanges(draft).length > 0;
}

/** The sections that differ from the stored page: only they are saved (AC-003, AC-006). */
export function changedSections(page: PageDraft): OpenDraft[] {
  return pageSections(page).filter((draft) =>
    draft.section === 'contents' ? contentsChanged(draft) : sectionChanged(draft),
  );
}

/** AC-005: "Abbrechen" or leaving the page asks "Änderungen verwerfen?" only then. */
export function pageDraftChanged(page: PageDraft): boolean {
  return changedSections(page).length > 0;
}

/**
 * "+ Rezept" while a collection is edited: the window puts the recipes in at once (spec 0009,
 * AC-006), so the rows it added join "Enthält" as stored rows; rows of the draft stay as edited,
 * and a row removed in the draft does not come back.
 */
export function withNewContents(
  page: PageDraft,
  contents: readonly CollectionContent[],
): PageDraft {
  const draft = page.contents;
  if (!draft) return page;
  const known = new Set(draft.base.map((row) => row.id));
  const added = contents.filter((content) => !known.has(content.row.id));
  if (added.length === 0) return page;
  const rows = contentsDraft({ id: draft.collectionId }, added).rows;
  return withSection(page, {
    ...draft,
    rows: [...draft.rows, ...rows],
    base: [...draft.base, ...added.map((content) => content.row)],
  });
}

// ---------- A draft from outside ----------

/**
 * What a draft from outside the page fills in, e.g. "Mit KI ausfüllen" (spec 0040). Rows whose
 * article is `{ kind: 'new' }` or a catalog hit show "neu" and create the article on "Speichern".
 */
export interface PageDraftInput {
  title?: string;
  /**
   * Title, description, portions, time, Vorlauf, cuisine and notes fill only empty fields;
   * "Ersetzen" replaces them, the course too (spec 0045, AC-002; spec 0049, AC-046).
   */
  description?: string;
  servings?: number;
  totalMinutes?: number;
  /** Fills an empty Vorlauf; "Ersetzen" replaces it (recipes only). */
  leadTime?: { text: string; hoursBefore: number };
  /** Einordnung (recipes only); tags are added, each spelling once. */
  course?: Course;
  cuisine?: string;
  tags?: readonly string[];
  /**
   * Variants the rows and steps point at (spec 0045, REQ-003); one with the name of a variant
   * there is takes its place (AC-008). "Ersetzen" replaces the variants there are (AC-010).
   */
  variants?: readonly RecipeVariant[];
  /** Added after the rows there are; "Ergänzen" only the missing ones (spec 0049, AC-044). */
  ingredients?: readonly IngredientRow[];
  /** Added after the steps there are, only to a part without steps (recipes only, AC-044). */
  steps?: readonly PageDraftStep[];
  /** Fills empty notes; "Ersetzen" replaces them (AC-046). */
  notes?: string;
  /** Added; an address that is there already is left out. */
  links?: readonly RecipeLink[];
}

/** A step of a draft from outside: its text, the variant it belongs to, its timer. */
export interface PageDraftStep {
  text: string;
  variantId?: Id;
  timerMinutes?: number;
}

/**
 * The page's variants with those of the draft (AC-008, AC-010), and where each draft variant id
 * went: to a variant of the same name there is, or to itself as a new one.
 */
function mergeVariants(
  current: readonly RecipeVariant[],
  drafted: readonly RecipeVariant[],
): { variants: RecipeVariant[]; ids: Map<Id, Id> } {
  const variants = [...current];
  const ids = new Map<Id, Id>();
  for (const variant of drafted) {
    const same = variants.find(
      (known) => normalizeText(known.name) === normalizeText(variant.name),
    );
    if (same) {
      ids.set(variant.id, same.id);
      continue;
    }
    variants.push({ ...variant, isDefault: variants.length === 0 });
    ids.set(variant.id, variant.id);
  }
  return { variants, ids };
}

/**
 * The draft's variants in its order, the first the standard; one with the name of a variant there
 * was keeps that variant's id and name (spec 0055, AC-019).
 */
function keepVariantIds(
  current: readonly RecipeVariant[],
  drafted: readonly RecipeVariant[],
): { variants: RecipeVariant[]; ids: Map<Id, Id> } {
  const ids = new Map<Id, Id>();
  const used = new Set<Id>();
  const variants = drafted.map((variant, index): RecipeVariant => {
    const same = current.find(
      (known) => !used.has(known.id) && normalizeText(known.name) === normalizeText(variant.name),
    );
    const id = same?.id ?? variant.id;
    used.add(id);
    ids.set(variant.id, id);
    return { id, name: same?.name ?? variant.name, isDefault: index === 0 };
  });
  return { variants, ids };
}

/**
 * Fills the open page with a draft from outside without saving anything: the person checks it in
 * the edit mode and saves it with "Speichern" or throws it away with "Abbrechen". Spec 0040 hooks
 * in here (and the app's page editor `load`, which also takes a photo).
 */
export function fillPageDraft(
  page: PageDraft,
  input: PageDraftInput,
  newId: () => Id,
  /**
   * "Ersetzen" (spec 0040, AC-006): the draft's ingredients and steps take the place of the old.
   * `change` (spec 0055, REQ-006): the draft is the whole recipe changed by a wish; variants of
   * the same name keep their ids, so the Änderungsansicht shows only what changed (AC-019).
   */
  options: { replace?: boolean; change?: boolean } = {},
): PageDraft {
  let next = page;
  const replace = options.replace === true;
  // "Ergänzen" fills only empty fields and never changes a value there is (spec 0049, AC-046):
  // the amounts there are belong to the portions there are. "Ersetzen" takes every value.
  const fills = (current: string) => replace || current.trim() === '';
  // Without ingredients no amount belongs to the portions, and portions and course are still
  // what the recipe was created with: they count as empty.
  const unset = replace || page.ingredients.rows.length === 0;
  const head = { ...page.head };
  if (input.title !== undefined && fills(head.title)) head.title = input.title;
  if (input.description !== undefined && fills(head.description)) {
    head.description = input.description;
  }
  if (input.servings !== undefined && (unset || fills(head.servings))) {
    head.servings = String(input.servings);
  }
  if (input.totalMinutes !== undefined && fills(head.totalMinutes)) {
    head.totalMinutes = String(input.totalMinutes);
  }
  next = withSection(next, head);
  if (next.classification) {
    const classification = { ...next.classification };
    // A recipe always has a course: "Ergänzen" sets it only while there are no ingredients.
    if (input.course !== undefined && unset) classification.course = input.course;
    if (input.cuisine !== undefined && fills(classification.cuisine)) {
      classification.cuisine = input.cuisine;
    }
    if (input.tags) {
      const tags = [...classification.tags];
      for (const tag of input.tags) {
        if (!tags.some((known) => normalizeText(known) === normalizeText(tag))) tags.push(tag);
      }
      classification.tags = tags;
    }
    next = withSection(next, classification);
  }
  const newRows = input.ingredients ?? [];
  if (replace && newRows.length > 0) {
    next = withSection(next, { ...next.ingredients, rows: [], variants: [] });
  }
  // A collection has no variants (spec 0009, E3): its rows stay shared.
  const merged =
    next.ingredients.kind === 'collection'
      ? { variants: next.ingredients.variants, ids: new Map<Id, Id>() }
      : options.change && replace && newRows.length > 0
        ? keepVariantIds(page.ingredients.variants, input.variants ?? [])
        : mergeVariants(next.ingredients.variants, input.variants ?? []);
  const variantOf = (id: Id | undefined) => (id === undefined ? undefined : merged.ids.get(id));
  next = withSection(next, { ...next.ingredients, variants: merged.variants });
  if (newRows.length > 0) {
    const rows = newRows.map((row) => {
      const { variantId: drafted, ...rest } = row;
      const variantId = variantOf(drafted);
      return variantId === undefined ? rest : { ...rest, variantId };
    });
    // "Ergänzen" adds only the missing rows (spec 0049, AC-044).
    const add = replace ? addIngredientRows : addMissingIngredientRows;
    next = withSection(next, add(next.ingredients, rows));
  }
  if (next.steps) {
    let steps = next.steps;
    const newSteps = input.steps ?? [];
    if (replace && newSteps.length > 0) steps = { ...steps, steps: [] };
    // "Ergänzen" (spec 0049, AC-044) never doubles the method: steps go only to a part (shared or
    // a variant) that has none yet, e.g. a new variant.
    const withSteps = new Set(steps.steps.map((step) => step.variantId ?? ''));
    const added = newSteps.flatMap((step): RecipeStep[] => {
      const made: RecipeStep = { id: newId(), text: step.text };
      const variantId = variantOf(step.variantId);
      if (variantId !== undefined) made.variantId = variantId;
      if (step.timerMinutes !== undefined) made.timerMinutes = step.timerMinutes;
      return replace || !withSteps.has(variantId ?? '') ? [made] : [];
    });
    steps = { ...steps, steps: [...steps.steps, ...added] };
    if (input.leadTime && (replace || steps.leadTimeText.trim() === '')) {
      steps = {
        ...steps,
        leadTimeText: input.leadTime.text,
        leadTimeHours: String(input.leadTime.hoursBefore),
      };
    }
    next = withSection(next, steps);
  }
  if (input.notes !== undefined && fills(next.notes.notes)) {
    next = withSection(next, { ...next.notes, notes: input.notes });
  }
  if (input.links && input.links.length > 0) {
    const links = [...next.links.links];
    for (const link of input.links) {
      if (!links.some((known) => known.url === link.url)) links.push(link);
    }
    next = withSection(next, { ...next.links, links });
  }
  return next;
}

// ---------- "Aus Rezept übernehmen" (REQ-003) ----------

/**
 * The ingredients of `source` (base and default variant) as copies at the end of the draft, in a
 * group named like the recipe, scaled from its portions to `servings` of the page (AC-010,
 * AC-011). Copies: they never follow later changes of the source. Without ingredients the
 * problem „„Pizzateig“ hat keine Zutaten“ (AC-012).
 */
export function copyIngredientsFrom(
  draft: IngredientsDraft,
  source: Recipe,
  servings: number,
  newKey: () => string,
): { draft: IngredientsDraft } | { problem: string } {
  const ingredients = ingredientsForVariant(source, undefined);
  if (ingredients.length === 0) return { problem: `„${source.title}“ hat keine Zutaten` };
  const factor = servings / source.servings;
  const rows = ingredients.map((ingredient): IngredientRow => ({
    key: newKey(),
    amountText: ingredient.amount ? scaleAmount(ingredient.amount, factor).text : '',
    article: { kind: 'article', articleId: ingredient.articleId },
    shoppingRule: ingredient.shoppingRule,
    shoppingRuleChosen: false,
    shoppingNote: ingredient.shoppingNote ?? '',
    prepNote: ingredient.prepNote ?? '',
    group: source.title,
  }));
  return { draft: addIngredientRows(draft, rows) };
}

// ---------- State ----------

export interface PageEditorState {
  /** Undefined = the page only reads. */
  draft?: PageDraft;
  /** "Speichern" was tried with problems: they are shown and follow the typing. */
  attempted?: boolean;
  /** Waiting for the server: the fields stay, nothing can be typed. */
  saving?: boolean;
  /** Why "Speichern" did not save (offline, refused). */
  error?: string;
}

export type PageEditorAction =
  | { type: 'open'; draft: PageDraft }
  | { type: 'change'; draft: PageDraft }
  /** "Speichern" with problems. */
  | { type: 'invalid' }
  | { type: 'saving' }
  /** The server refused: nothing is saved, the edit mode stays with the message (AC-004). */
  | { type: 'failed'; error: string }
  /** "+ Rezept" while editing a collection: the rows the window put in (withNewContents). */
  | { type: 'contents'; contents: readonly CollectionContent[] }
  /** Saved, "Abbrechen" (after "Verwerfen"), or the recipe is gone. */
  | { type: 'close' };

export function pageEditorReducer(
  state: PageEditorState,
  action: PageEditorAction,
): PageEditorState {
  switch (action.type) {
    case 'open':
      return { draft: action.draft };
    case 'change':
      if (!state.draft || state.saving) return state;
      return state.attempted ? { draft: action.draft, attempted: true } : { draft: action.draft };
    case 'invalid':
      return { ...state, attempted: true };
    case 'saving': {
      const { draft } = state;
      return draft ? { draft, saving: true } : state;
    }
    case 'failed': {
      const { draft } = state;
      return draft ? { draft, error: action.error } : state;
    }
    case 'contents': {
      if (!state.draft) return state;
      const draft = withNewContents(state.draft, action.contents);
      return draft === state.draft ? state : { ...state, draft };
    }
    case 'close':
      return {};
  }
}
