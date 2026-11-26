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
  addStep,
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
import type { Id, Recipe, RecipeKind, RecipeLink } from './types';

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
  servings?: number;
  totalMinutes?: number;
  /** Added after the rows there are. */
  ingredients?: readonly IngredientRow[];
  /** Added after the steps there are (recipes only). */
  steps?: readonly string[];
  /** Replaces the notes. */
  notes?: string;
  /** Added; an address that is there already is left out. */
  links?: readonly RecipeLink[];
}

/**
 * Fills the open page with a draft from outside without saving anything: the person checks it in
 * the edit mode and saves it with "Speichern" or throws it away with "Abbrechen". Spec 0040 hooks
 * in here (and the app's page editor `load`, which also takes a photo).
 */
export function fillPageDraft(page: PageDraft, input: PageDraftInput, newId: () => Id): PageDraft {
  let next = page;
  const head = { ...page.head };
  if (input.title !== undefined) head.title = input.title;
  if (input.servings !== undefined) head.servings = String(input.servings);
  if (input.totalMinutes !== undefined) head.totalMinutes = String(input.totalMinutes);
  next = withSection(next, head);
  if (input.ingredients && input.ingredients.length > 0) {
    next = withSection(next, addIngredientRows(next.ingredients, input.ingredients));
  }
  if (next.steps && input.steps && input.steps.length > 0) {
    let steps = next.steps;
    for (const text of input.steps) steps = addStep(steps, text, newId());
    next = withSection(next, steps);
  }
  if (input.notes !== undefined) next = withSection(next, { ...next.notes, notes: input.notes });
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
