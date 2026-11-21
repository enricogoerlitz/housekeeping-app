import { OfflineError, saveRecipeSection, type SectionSave } from '@housekeeping/api';
import {
  addIngredientRows,
  draftAfterRefusal,
  savablePart,
  sectionDraft,
  validateSectionDraft,
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

interface EditorState {
  draft?: RecipeSectionDraft;
  /** The pen was tapped: the draft is taken from the recipe of the next render (see below). */
  opening?: RecipeSection;
  /** "Fertig" was tried with problems: they are shown, and follow the typing. */
  attempted?: boolean;
  /** Why "Fertig" did not save, e.g. offline. */
  error?: string;
}

export interface SectionEditor {
  /** The open section's draft; undefined = the page only reads. */
  draft: RecipeSectionDraft | undefined;
  editing: (section: RecipeSection) => boolean;
  /** The pen: saves the open section's valid part, then opens this one. */
  edit: (section: RecipeSection) => void;
  /** Every change of a field goes here; nothing is sent. */
  change: (draft: RecipeSectionDraft) => void;
  /** "Fertig". */
  done: () => void;
  /** The message for a field after a failed "Fertig" ("Titel fehlt", AC-026). */
  problem: (field: SectionField, key?: string) => string | undefined;
  problems: SectionProblem[];
  error: string | undefined;
}

function trySave(
  recipeId: Id,
  draft: RecipeSectionDraft,
): { save: SectionSave | null } | { error: string } {
  try {
    return { save: saveRecipeSection(recipeId, draft) };
  } catch (error) {
    if (error instanceof OfflineError) return { error: OFFLINE_EDIT_HINT };
    return { error: error instanceof Error ? error.message : 'Das hat nicht geklappt.' };
  }
}

export function useSectionEditor(recipe: Recipe): SectionEditor {
  const recipeId = recipe.id;
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
  if (state.opening) setState({ draft: sectionDraft(recipe, state.opening) });

  /** E7: a refusal while the page is open shows the section again (core draftAfterRefusal). */
  const watch = useCallback(
    (save: SectionSave, sent: RecipeSectionDraft, leftOpen: RecipeSectionDraft | undefined) => {
      save.confirmed.catch(() => {
        if (!mounted.current) return;
        const open = committed.current.draft;
        const shown = draftAfterRefusal(open, sent, leftOpen);
        if (shown !== open) setState({ draft: shown });
      });
    },
    [],
  );

  /** "Fertig" for a draft: invalid stays open, open rows stay open (AC-026, AC-032). */
  const finish = useCallback(
    (draft: RecipeSectionDraft) => {
      if (validateSectionDraft(draft).length > 0) {
        setState({ draft, attempted: true });
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
    [recipeId, watch],
  );

  /** Leaving the page: the valid part, without waiting and without reopening (E7). */
  const leave = useCallback(() => {
    const draft = committed.current.draft;
    if (!draft) return;
    committed.current = {};
    setState({});
    trySave(recipeId, savablePart(draft));
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

  // "Neues Rezept" with pasted rows: the sure ones are saved, the section opens with the rest.
  const [handedOver] = useState(() => takeHandedOverRows(recipeId));
  const pending = useRef(handedOver);
  useEffect(() => {
    const rows = pending.current;
    pending.current = undefined;
    if (rows) finish(addIngredientRows(sectionDraft(recipe, 'ingredients'), rows));
    // Runs once for the rows handed over at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problems = state.attempted && state.draft ? validateSectionDraft(state.draft) : [];
  return {
    draft: state.draft,
    editing: (section) => state.draft?.section === section,
    edit: (section) => {
      const open = state.draft;
      if (open?.section === section) return;
      if (open) {
        const sent = savablePart(open);
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
