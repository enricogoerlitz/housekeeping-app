import {
  OfflineError,
  saveCollectionContents,
  saveRecipeSection,
  useCollectionContents,
  WRITE_REJECTED_MESSAGE,
  type SectionSave,
} from '@housekeeping/api';
import {
  addPastedRows,
  contentsRowsGone,
  openSectionDraft,
  savableOpenDraft,
  sectionDraft,
  sectionEditorReducer,
  sectionSaveNotice,
  validateOpenDraft,
  type ContentsProblem,
  type Id,
  type OpenDraft,
  type OpenDraftProblem,
  type PageSection,
  type Recipe,
  type SectionEditorState,
  type SectionField,
} from '@housekeeping/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';

import { takeHandedOverRows } from './ingredient-handover';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

// The sections of the recipe page (spec 0008, REQ-007, E7): at most one is open, its state lives
// in core's sectionEditorReducer. "Fertig" checks and saves it; another pen, leaving the page
// (blur, Android back, unmount) saves its valid part. A refusal opens the section again with its
// draft while the page is open. A collection (spec 0009, E12) has one more: "Enthält", saved with
// saveCollectionContents.

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
  /** "Abbrechen" and Escape: closes the open section without saving (spec 0023, REQ-003). */
  cancel: () => void;
  /**
   * Saves the open section's valid part and closes it, like another pen (E7): before the read view
   * saves one ingredient itself (spec 0023, REQ-002).
   */
  flush: () => void;
  /** After "Fertig" with pasted rows left open: "5 Zutaten gespeichert · …" (spec 0023, REQ-006). */
  notice: string | undefined;
  /** The message for a field after a failed "Fertig" ("Titel fehlt", AC-026). */
  problem: (field: SectionField | ContentsProblem['field'], key?: string) => string | undefined;
  problems: OpenDraftProblem[];
  error: string | undefined;
}

/** What a save hands back: the server's answer and, for ingredients, the section to show next. */
type Save = Pick<SectionSave, 'confirmed' | 'reopened'>;

function trySave(recipeId: Id, draft: OpenDraft): { save: Save | null } | { error: string } {
  try {
    if (draft.section === 'contents') return { save: saveCollectionContents(recipeId, draft) };
    return { save: saveRecipeSection(recipeId, draft) };
  } catch (error) {
    if (error instanceof OfflineError) return { error: OFFLINE_EDIT_HINT };
    return { error: errorMessage(error, FAILED_MESSAGE) };
  }
}

export function useSectionEditor(recipe: Recipe): SectionEditor {
  const recipeId = recipe.id;
  // Empty for a recipe; "Enthält" opens from it.
  const contents = useCollectionContents(recipeId);
  const [state, dispatch] = useReducer(sectionEditorReducer, {});
  // The state as committed, for the focus cleanup. Synced after the commit, so the double effects
  // of React's strict mode never see a section opened in the same commit.
  const committed = useRef<SectionEditorState>({});
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
  if (state.opening)
    dispatch({ type: 'opened', draft: openSectionDraft(recipe, contents, state.opening) });

  /** E7: a refusal while the page is open may show the section again (the reducer decides). */
  const watch = useCallback((save: Save, sent: OpenDraft, leftOpen: OpenDraft | undefined) => {
    save.confirmed.catch(() => {
      if (mounted.current) dispatch({ type: 'refused', sent, leftOpen });
    });
  }, []);

  /** Sends the valid part of the open section without waiting (another pen, E7). */
  const sendValidPart = useCallback(
    (open: OpenDraft | undefined) => {
      const sent = open ? savableOpenDraft(open) : undefined;
      if (!sent) return;
      const result = trySave(recipeId, sent);
      if ('save' in result && result.save) watch(result.save, sent, undefined);
    },
    [recipeId, watch],
  );

  /** "Fertig" for a draft: invalid stays open, open rows stay open (AC-026, AC-032). */
  const finish = useCallback(
    (draft: OpenDraft) => {
      if (validateOpenDraft(draft).length > 0) {
        dispatch({ type: 'invalid', draft });
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
        dispatch({
          type: 'failed',
          draft: openSectionDraft(recipe, contents, 'contents'),
          error: WRITE_REJECTED_MESSAGE,
        });
        return;
      }
      const result = trySave(recipeId, draft);
      if ('error' in result) {
        dispatch({ type: 'failed', draft, error: result.error });
        return;
      }
      const { save } = result;
      // Gone meanwhile: nothing was sent, the page shows "gibt es nicht mehr" (AC-021).
      if (!save) {
        dispatch({ type: 'close' });
        return;
      }
      const { reopened } = save;
      dispatch({ type: 'saved', reopened, notice: sectionSaveNotice(draft, reopened) });
      watch(save, draft, reopened);
    },
    [recipe, contents, recipeId, watch],
  );

  /** Leaving the page: the valid part, without waiting and without reopening (E7). */
  const leave = useCallback(() => {
    const draft = committed.current.draft;
    if (!draft) return;
    committed.current = {};
    dispatch({ type: 'close' });
    const part = savableOpenDraft(draft);
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
  const openHandedOverRows = useEffectEvent(() => {
    const rows = takeHandedOverRows(recipeId);
    if (rows) finish(addPastedRows(sectionDraft(recipe, 'ingredients'), rows));
  });
  useEffect(() => openHandedOverRows(), []);

  const problems = state.attempted && state.draft ? validateOpenDraft(state.draft) : [];
  return {
    draft: state.draft,
    editing: (section) => state.draft?.section === section,
    edit: (section) => {
      if (state.draft?.section === section) return;
      sendValidPart(state.draft);
      dispatch({ type: 'edit', section });
    },
    change: (draft) => dispatch({ type: 'change', draft }),
    done: () => {
      if (state.draft) finish(state.draft);
    },
    cancel: () => dispatch({ type: 'close' }),
    flush: () => {
      if (!state.draft) return;
      sendValidPart(state.draft);
      dispatch({ type: 'close' });
    },
    notice: state.notice,
    problem: (field, key) =>
      problems.find(
        (problem) => problem.field === field && (key === undefined || problem.key === key),
      )?.message,
    problems,
    error: state.error,
  };
}
