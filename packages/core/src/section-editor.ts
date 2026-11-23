import {
  contentsDraft,
  savableContents,
  validateContentsDraft,
  type ContentsDraft,
  type ContentsProblem,
} from './collection-editor';
import type { CollectionContent } from './collections';
import {
  pastedSaveNotice,
  savablePart,
  sectionDraft,
  validateSectionDraft,
  type IngredientsDraft,
  type RecipeSection,
  type RecipeSectionDraft,
  type SectionProblem,
} from './recipe-editor';
import type { Recipe } from './types';

// The sections of the recipe page (spec 0008, REQ-007, E7): at most one is open. Its state changes
// only through sectionEditorReducer (spec 0031, REQ-009); the app's hook does the saving. A
// collection (spec 0009, E12) has one more section: "Enthält".

/** "Enthält" of a collection while it is open. */
export type ContentsSectionDraft = ContentsDraft & { section: 'contents' };
/** The draft of the open section. */
export type OpenDraft = RecipeSectionDraft | ContentsSectionDraft;
export type PageSection = RecipeSection | 'contents';
export type OpenDraftProblem = SectionProblem | ContentsProblem;

export function openSectionDraft(
  recipe: Recipe,
  contents: readonly CollectionContent[],
  section: PageSection,
): OpenDraft {
  if (section === 'contents') return { ...contentsDraft(recipe, contents), section };
  return sectionDraft(recipe, section);
}

export function validateOpenDraft(draft: OpenDraft): OpenDraftProblem[] {
  return draft.section === 'contents' ? validateContentsDraft(draft) : validateSectionDraft(draft);
}

/** Leaving the page or opening another pen saves the valid part (E7). */
export function savableOpenDraft(draft: OpenDraft): OpenDraft | undefined {
  return draft.section === 'contents' ? savableContents(draft) : savablePart(draft);
}

/** The keys of the rows "Fertig" left open: without article, or duplicates (core openRows). */
function openKeys(draft: IngredientsDraft): Set<string> {
  return new Set(
    draft.rows.filter((row) => row.article === undefined || row.duplicate).map((row) => row.key),
  );
}

/**
 * After "Fertig" with pasted rows left open: "5 Zutaten gespeichert · …" (spec 0023, REQ-006).
 * Saved are the new rows of the sent draft the reopened section no longer has open.
 */
export function sectionSaveNotice(
  sent: OpenDraft,
  reopened: IngredientsDraft | undefined,
): string | undefined {
  if (sent.section !== 'ingredients' || !reopened) return undefined;
  const stored = new Set(sent.base.ingredients.map((ingredient) => ingredient.id));
  const open = openKeys(reopened);
  const saved = sent.rows.filter(
    (row) => row.ingredientId === undefined && !stored.has(row.key) && !open.has(row.key),
  ).length;
  return pastedSaveNotice(
    saved,
    reopened.rows.filter((row) => open.has(row.key)),
  );
}

/**
 * E7: what the page shows after the server refused a section it saved. The section opens again
 * with the refused draft when no section is open, or when the one open is still exactly the draft
 * the save left open (AC-032: the orange rows). A section opened or edited since stays as it is,
 * so a refusal never sends anything again by itself.
 */
export function draftAfterRefusal(
  open: OpenDraft | undefined,
  refused: OpenDraft,
  leftOpen: OpenDraft | undefined,
): OpenDraft {
  if (open === undefined) return refused;
  return open === leftOpen ? refused : open;
}

export interface SectionEditorState {
  draft?: OpenDraft;
  /** The pen was tapped: the draft is taken from the recipe of the next render. */
  opening?: PageSection;
  /** "Fertig" was tried with problems: they are shown, and follow the typing. */
  attempted?: boolean;
  /** Why "Fertig" did not save, e.g. offline. */
  error?: string;
  /** What "Fertig" saved and what stays open (sectionSaveNotice). */
  notice?: string;
}

export type SectionEditorAction =
  /** The pen: the open section's valid part was sent; this one opens with the next render. */
  | { type: 'edit'; section: PageSection }
  | { type: 'opened'; draft: OpenDraft }
  | { type: 'change'; draft: OpenDraft }
  /** "Fertig" with problems (AC-026). */
  | { type: 'invalid'; draft: OpenDraft }
  | { type: 'failed'; draft: OpenDraft; error: string }
  /** "Fertig" sent the draft; rows it left open stay open (AC-032). */
  | { type: 'saved'; reopened?: IngredientsDraft; notice?: string }
  /** "Abbrechen", Escape, leaving the page, or the recipe is gone. */
  | { type: 'close' }
  /** The server refused `sent`; `leftOpen` is what its save left open (E7). */
  | { type: 'refused'; sent: OpenDraft; leftOpen: OpenDraft | undefined };

export function sectionEditorReducer(
  state: SectionEditorState,
  action: SectionEditorAction,
): SectionEditorState {
  switch (action.type) {
    case 'edit':
      return state.draft?.section === action.section ? state : { opening: action.section };
    case 'opened':
      return { draft: action.draft };
    case 'change':
      return { ...state, draft: action.draft, error: undefined, notice: undefined };
    case 'invalid':
      return { draft: action.draft, attempted: true };
    case 'failed':
      return { draft: action.draft, error: action.error };
    case 'saved':
      return action.reopened ? { draft: action.reopened, notice: action.notice } : {};
    case 'close':
      return {};
    case 'refused': {
      const shown = draftAfterRefusal(state.draft, action.sent, action.leftOpen);
      return shown === state.draft ? state : { draft: shown };
    }
  }
}
