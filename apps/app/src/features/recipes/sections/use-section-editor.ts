import {
  OfflineError,
  saveCollectionContents,
  saveRecipeSection,
  useCollectionContents,
  WRITE_REJECTED_MESSAGE,
  type SectionSave,
} from '@housekeeping/api';
import {
  addIngredientRows,
  contentsDraft,
  contentsRowsGone,
  savableContents,
  savablePart,
  sectionDraft,
  validateContentsDraft,
  validateSectionDraft,
  type CollectionContent,
  type ContentsDraft,
  type ContentsProblem,
  type Id,
  type Recipe,
  type RecipeSection,
  type RecipeSectionDraft,
  type SectionField,
  type SectionProblem,
} from '@housekeeping/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';

import { takeHandedOverRows } from './ingredient-handover';

// The sections of the recipe page (spec 0008, REQ-007, E7): at most one is open, its draft lives
// here. "Fertig" checks and saves it; another pen, leaving the page (blur, Android back, unmount)
// saves its valid part. A refusal opens the section again with its draft while the page is open.
// A collection (spec 0009, E12) has one more: "Enthält", saved with saveCollectionContents.

/** "Enthält" of a collection while it is open. */
export type ContentsSectionDraft = ContentsDraft & { section: 'contents' };
/** The draft of the open section. */
export type OpenDraft = RecipeSectionDraft | ContentsSectionDraft;
export type PageSection = RecipeSection | 'contents';
type Problem = SectionProblem | ContentsProblem;

interface EditorState {
  draft?: OpenDraft;
  /** The pen was tapped: the draft is taken from the recipe of the next render (see below). */
  opening?: PageSection;
  /** "Fertig" was tried with problems: they are shown, and follow the typing. */
  attempted?: boolean;
  /** Why "Fertig" did not save, e.g. offline. */
  error?: string;
}

export interface SectionEditor {
  /** The open section's draft; undefined = the page only reads. */
  draft: OpenDraft | undefined;
  editing: (section: PageSection) => boolean;
  /** The pen: saves the open section's valid part, then opens this one. */
  edit: (section: PageSection) => void;
  /** Every change of a field goes here; nothing is sent. */
  change: (draft: OpenDraft) => void;
  /** "Fertig". */
  done: () => void;
  /** The message for a field after a failed "Fertig" ("Titel fehlt", AC-026). */
  problem: (field: SectionField | ContentsProblem['field'], key?: string) => string | undefined;
  problems: Problem[];
  error: string | undefined;
}

/** What a save hands back: the server's answer and, for ingredients, the section to show next. */
type Save = Pick<SectionSave, 'confirmed' | 'reopened'>;

function validate(draft: OpenDraft): Problem[] {
  return draft.section === 'contents' ? validateContentsDraft(draft) : validateSectionDraft(draft);
}

/** Leaving the page or opening another pen saves the valid part (E7; core savableContents). */
function savable(draft: OpenDraft): OpenDraft | undefined {
  return draft.section === 'contents' ? savableContents(draft) : savablePart(draft);
}

function openDraft(
  recipe: Recipe,
  contents: readonly CollectionContent[],
  section: PageSection,
): OpenDraft {
  if (section === 'contents') return { ...contentsDraft(recipe, contents), section };
  return sectionDraft(recipe, section);
}

function trySave(recipeId: Id, draft: OpenDraft): { save: Save | null } | { error: string } {
  try {
    if (draft.section === 'contents') return { save: saveCollectionContents(recipeId, draft) };
    return { save: saveRecipeSection(recipeId, draft) };
  } catch (error) {
    if (error instanceof OfflineError) return { error: OFFLINE_EDIT_HINT };
    return { error: error instanceof Error ? error.message : 'Das hat nicht geklappt.' };
  }
}

export function useSectionEditor(recipe: Recipe): SectionEditor {
  const recipeId = recipe.id;
  // Empty for a recipe; "Enthält" opens from it.
  const contents = useCollectionContents(recipeId);
  const [state, setState] = useState<EditorState>({});
  // The state as committed, for the focus cleanup and a late refusal. Synced after the commit, so
  // the double effects of React's strict mode never see a section opened in the same commit.
  const committed = useRef<EditorState>({});
  useLayoutEffect(() => {
    committed.current = state;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A pen opens its section from the recipe as it is after the previous section was saved: that
  // save changed the store, so this render reads the new recipe (a removed variant took its steps).
  if (state.opening) setState({ draft: openDraft(recipe, contents, state.opening) });

  /**
   * E7: a refusal while the page is open shows the section again: when none is open, or the one
   * open is still the draft the save left open (the rule of core draftAfterRefusal, for every
   * section including "Enthält").
   */
  const watch = useCallback((save: Save, sent: OpenDraft, leftOpen: OpenDraft | undefined) => {
    save.confirmed.catch(() => {
      if (!mounted.current) return;
      const open = committed.current.draft;
      const shown = open === undefined || open === leftOpen ? sent : open;
      if (shown !== open) setState({ draft: shown });
    });
  }, []);

  /** "Fertig" for a draft: invalid stays open, open rows stay open (AC-026, AC-032). */
  const finish = useCallback(
    (draft: OpenDraft) => {
      if (validate(draft).length > 0) {
        setState({ draft, attempted: true });
        return;
      }
      // Conflict table: a row removed meanwhile on another device. Its changes would go nowhere,
      // so the section says so and opens again with the current rows.
      if (
        draft.section === 'contents' &&
        contentsRowsGone(
          draft,
          contents.map((content) => content.row),
        )
      ) {
        setState({ draft: openDraft(recipe, contents, 'contents'), error: WRITE_REJECTED_MESSAGE });
        return;
      }
      const result = trySave(recipeId, draft);
      if ('error' in result) {
        setState({ draft, error: result.error });
        return;
      }
      const { save } = result;
      // Gone meanwhile: nothing was sent, the page shows "gibt es nicht mehr" (AC-021).
      if (!save) {
        setState({});
        return;
      }
      setState(save.reopened ? { draft: save.reopened } : {});
      watch(save, draft, save.reopened);
    },
    [recipe, contents, recipeId, watch],
  );

  /** Leaving the page: the valid part, without waiting and without reopening (E7). */
  const leave = useCallback(() => {
    const draft = committed.current.draft;
    if (!draft) return;
    committed.current = {};
    setState({});
    const part = savable(draft);
    if (part) trySave(recipeId, part);
  }, [recipeId]);

  useFocusEffect(
    useCallback(() => {
      // E16: an open sheet or menu closes itself first (Modal); then back closes the section.
      const back =
        Platform.OS === 'android'
          ? BackHandler.addEventListener('hardwareBackPress', () => {
              if (!committed.current.draft) return false;
              leave();
              return true;
            })
          : undefined;
      return () => {
        back?.remove();
        leave();
      };
    }, [leave]),
  );

  // "Neues Rezept" with orange rows: the section opens with them. Taken after the commit, so a
  // render thrown away during the navigation cannot use them up (spec 0018, E-01).
  useEffect(() => {
    const rows = takeHandedOverRows(recipeId);
    // The rows come from outside React (the window "Neu"); opening the section with them is the
    // synchronisation this effect exists for, once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (rows) finish(addIngredientRows(sectionDraft(recipe, 'ingredients'), rows));
    // Runs once for the rows handed over before the page opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problems = state.attempted && state.draft ? validate(state.draft) : [];
  return {
    draft: state.draft,
    editing: (section) => state.draft?.section === section,
    edit: (section) => {
      const open = state.draft;
      if (open?.section === section) return;
      const sent = open ? savable(open) : undefined;
      if (sent) {
        const result = trySave(recipeId, sent);
        if ('save' in result && result.save) watch(result.save, sent, undefined);
      }
      setState({ opening: section });
    },
    change: (draft) => setState((current) => ({ ...current, draft, error: undefined })),
    done: () => {
      if (state.draft) finish(state.draft);
    },
    problem: (field, key) =>
      problems.find(
        (problem) => problem.field === field && (key === undefined || problem.key === key),
      )?.message,
    problems,
    error: state.error,
  };
}
