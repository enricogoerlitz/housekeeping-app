import {
  createRecipeFromPage,
  OfflineError,
  saveRecipePage,
  setRecipePhoto,
  useCollectionContents,
  WRITE_REJECTED_MESSAGE,
} from '@housekeeping/api';
import {
  addIngredientRows,
  contentsDraft,
  contentsRowsGone,
  fillPageDraft,
  pageDraft,
  pageDraftChanged,
  revertPageDraft,
  pageEditorReducer,
  validatePageDraft,
  withSection,
  type CollectionContent,
  type Id,
  type OpenDraft,
  type OpenDraftProblem,
  type PageDraft,
  type PageDraftInput,
  type Recipe,
} from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { BackHandler, Platform } from 'react-native';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { OFFLINE_EDIT_HINT, undoAction } from '@/features/shell/offline';

import {
  dismissPhotoSuggestions,
  forgetUnsavedRecipe,
  peekAiDraftPhoto,
  takeAiDraft,
} from '../ai-draft';
import { takeHandedOverRows } from './ingredient-handover';

// The edit mode of the recipe and collection page (spec 0037, REQ-001): the pen at the top opens
// every section at once (core pageDraft), "Speichern" sends the changed sections in one step
// (api saveRecipePage, one transaction) and stays open with the message when the server refuses
// (AC-004); "Abbrechen" and leaving the page ask "Änderungen verwerfen?" when something changed
// (AC-005). The state changes only through core pageEditorReducer.

/**
 * What the edit mode opens with: a window of a section, e.g. "+ Zutat" in the read view (AC-002)
 * or "+ Link" (spec 0047, REQ-003).
 */
export type EditIntent =
  { kind: 'ingredient'; key?: string } | { kind: 'recipes' } | { kind: 'copy' } | { kind: 'link' };

const CHANGED_MEANWHILE_NOTICE =
  'Das Rezept wurde zwischendurch geändert. Deine Änderungen gelten, die übrigen bleiben.';
const DISCARD_TITLE = 'Änderungen verwerfen?';

export interface PageEditor {
  /** The page as edited; undefined = the page only reads. */
  draft: PageDraft | undefined;
  saving: boolean;
  /** Why "Speichern" did not save: offline, refused (AC-004). */
  error: string | undefined;
  /** The pen, "+ Zutat", "+ Rezept", "+ Link": opens the edit mode, optionally with a window (AC-002). */
  start: (intent?: EditIntent) => void;
  /** The window the edit mode opened with; the section takes it once (clearIntent). */
  intent: EditIntent | undefined;
  clearIntent: () => void;
  /** Every change of a section's fields; nothing is sent. */
  change: (draft: OpenDraft) => void;
  /** "Speichern" (AC-003). */
  save: () => void;
  /** "Abbrechen": asks first when something changed (AC-005). */
  cancel: () => void;
  /** Leaving the page (back link): asks first when something changed (AC-005), then `leave`. */
  guard: (leave: () => void) => void;
  /** "+ Rezept" while editing a collection: the recipes the window put in join "Enthält". */
  addContents: (contents: readonly CollectionContent[]) => void;
  /**
   * A draft from outside, e.g. "Mit KI ausfüllen" (spec 0040): fills the page in the edit mode
   * without saving (core fillPageDraft); the photo is saved after "Speichern" through the usual
   * photo path. The person checks it and saves or discards it.
   */
  load: (input: PageDraftInput, photo?: Blob, options?: { replace?: boolean }) => void;
  /**
   * The page as `load` would fill it, without opening it (spec 0049): the "after" of the
   * Änderungsansicht.
   */
  filled: (input: PageDraftInput, options?: { replace?: boolean; change?: boolean }) => PageDraft;
  /** The Änderungsansicht's result (spec 0049, REQ-005): the edit mode opens with it, unsaved. */
  adopt: (draft: PageDraft) => void;
  /** The page as it stands: the edit mode's draft, else as stored (spec 0062). */
  page: () => PageDraft;
  /**
   * "Übernehmen" of "Mit KI ändern" (spec 0062, REQ-010): saves `draft` from the reading page at
   * once, then "Rezept geändert" with "Rückgängig". A draft with problems, offline or a refusal
   * opens the edit mode with it and the reason instead (AC-033, AC-034); nothing is lost.
   */
  apply: (draft: PageDraft, photo?: Blob) => void;
  /** The photo "Speichern" will set (a chosen AI suggestion, spec 0040 AC-010); none = keep. */
  chosenPhoto: Blob | undefined;
  choosePhoto: (photo: Blob | undefined) => void;
  /** The recipe exists only as this draft (spec 0040, AC-001): "Speichern" creates it. */
  unsaved: boolean;
  /** The message for a field after a failed "Speichern" ("Titel fehlt"). */
  problem: (field: OpenDraftProblem['field'], key?: string) => string | undefined;
}

let idSeq = 0;
const newId = (): Id => `draft-${++idSeq}-${Date.now().toString(36)}`;

function asked(onDiscard: () => void): void {
  confirmFirst({
    title: DISCARD_TITLE,
    confirmLabel: 'Verwerfen',
    cancelLabel: 'Weiter bearbeiten',
    needsNetwork: false,
    onConfirm: onDiscard,
    testID: 'confirm-discard',
  });
}

export function usePageEditor(
  recipe: Recipe,
  options: {
    /** Spec 0040, AC-001: the recipe is not stored yet ("Neu → Mit KI ausfüllen"). */
    unsaved?: boolean;
    /** Leaves the page after "Verwerfen" of an unsaved recipe: there is nothing to show. */
    onDiscard?: () => void;
  } = {},
): PageEditor {
  const recipeId = recipe.id;
  const unsaved = options.unsaved === true;
  // Empty for a recipe; "Enthält" of a collection.
  const contents = useCollectionContents(recipeId);
  const [state, dispatch] = useReducer(pageEditorReducer, {});
  const [intent, setIntent] = useState<EditIntent>();
  // The photo handed over with a draft ("Neu → Mit KI ausfüllen", spec 0049 AC-014: the photo of
  // the page found on the web) shows as the pending photo from the first render.
  const [handedPhoto] = useState(() => peekAiDraftPhoto(recipeId));
  const photo = useRef<Blob | undefined>(handedPhoto);
  const [chosenPhoto, setChosenPhoto] = useState<Blob | undefined>(handedPhoto);
  const choosePhoto = useCallback((next: Blob | undefined) => {
    photo.current = next;
    setChosenPhoto(next);
  }, []);
  // What the save's answer reopens with when rows stay open; synced after each commit.
  const latest = useRef({ recipe, contents });
  useLayoutEffect(() => {
    latest.current = { recipe, contents };
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const changed = state.draft !== undefined && pageDraftChanged(state.draft);
  const close = useCallback(() => {
    photo.current = undefined;
    setChosenPhoto(undefined);
    setIntent(undefined);
    dismissPhotoSuggestions(recipeId);
    dispatch({ type: 'close' });
  }, [recipeId]);
  const onDiscard = options.onDiscard;
  // "Verwerfen" of a recipe that was never saved: it is gone, and so is its page.
  const discard = useCallback(() => {
    close();
    if (!unsaved) return;
    forgetUnsavedRecipe(recipeId);
    onDiscard?.();
  }, [close, unsaved, recipeId, onDiscard]);

  const start = useCallback(
    (next?: EditIntent) => {
      setIntent(next);
      if (!state.draft) dispatch({ type: 'open', draft: pageDraft(recipe, contents) });
    },
    [state.draft, recipe, contents],
  );

  const cancel = useCallback(() => {
    if (!state.draft || state.saving) return;
    if (changed) asked(discard);
    else discard();
  }, [state.draft, state.saving, changed, discard]);

  const guard = useCallback(
    (leave: () => void) => {
      if (!state.draft || !changed) {
        if (unsaved) forgetUnsavedRecipe(recipeId);
        leave();
        return;
      }
      asked(() => {
        close();
        if (unsaved) forgetUnsavedRecipe(recipeId);
        leave();
      });
    },
    [state.draft, changed, close, unsaved, recipeId],
  );

  const save = () => {
    const draft = state.draft;
    if (!draft || state.saving) return;
    if (validatePageDraft(draft).length > 0) {
      dispatch({ type: 'invalid' });
      return;
    }
    // A contained recipe taken out on another device meanwhile: its changes would go nowhere.
    if (
      draft.contents &&
      contentsRowsGone(
        draft.contents,
        contents.map((content) => content.row),
      )
    ) {
      dispatch({
        type: 'change',
        draft: withSection(draft, {
          ...contentsDraft(recipe, contents),
          section: 'contents',
        }),
      });
      dispatch({ type: 'failed', error: WRITE_REJECTED_MESSAGE });
      return;
    }
    if (unsaved) {
      // Spec 0040, AC-001: only now the recipe comes into being, with every section in one step.
      let created: ReturnType<typeof createRecipeFromPage>;
      try {
        created = createRecipeFromPage(draft);
      } catch (error) {
        dispatch({
          type: 'failed',
          error:
            error instanceof OfflineError ? OFFLINE_EDIT_HINT : errorMessage(error, FAILED_MESSAGE),
        });
        return;
      }
      const pendingPhoto = photo.current;
      forgetUnsavedRecipe(recipeId);
      if (pendingPhoto) void setRecipePhoto(recipeId, pendingPhoto).catch(() => {});
      close();
      if (created.open.length > 0) {
        const next = pageDraft(latest.current.recipe, latest.current.contents);
        dispatch({
          type: 'open',
          draft: withSection(next, addIngredientRows(next.ingredients, created.open)),
        });
      }
      toast.show({ message: 'Gespeichert' });
      return;
    }
    let result: ReturnType<typeof saveRecipePage>;
    try {
      result = saveRecipePage(draft);
    } catch (error) {
      dispatch({
        type: 'failed',
        error:
          error instanceof OfflineError ? OFFLINE_EDIT_HINT : errorMessage(error, FAILED_MESSAGE),
      });
      return;
    }
    // Gone meanwhile: the page shows "gibt es nicht mehr".
    if (!result) {
      close();
      return;
    }
    const { open } = result;
    const pendingPhoto = photo.current;
    dispatch({ type: 'saving' });
    result.confirmed.then(
      ({ changedMeanwhile }) => {
        if (pendingPhoto) void setRecipePhoto(recipeId, pendingPhoto).catch(() => {});
        if (!mounted.current) return;
        if (open.length > 0) {
          // An article deleted meanwhile: the rest is saved, these rows stay open.
          const now = latest.current;
          const next = pageDraft(now.recipe, now.contents);
          photo.current = undefined;
          dispatch({
            type: 'open',
            draft: withSection(next, addIngredientRows(next.ingredients, open)),
          });
        } else {
          close();
        }
        toast.show({ message: changedMeanwhile ? CHANGED_MEANWHILE_NOTICE : 'Gespeichert' });
      },
      () => {
        // AC-004: nothing is saved; the edit mode stays with the draft and the message.
        if (mounted.current) dispatch({ type: 'failed', error: WRITE_REJECTED_MESSAGE });
      },
    );
  };

  // "Rückgängig" (decision 6): the page as stored now, with the values from before.
  const undo = (before: PageDraft) => {
    const now = latest.current;
    const result = saveRecipePage(revertPageDraft(before, pageDraft(now.recipe, now.contents)));
    if (!result) return;
    result.confirmed.then(
      () => toast.show({ message: 'Änderung zurückgenommen' }),
      () => {},
    );
  };

  const apply = (draft: PageDraft, newPhoto?: Blob) => {
    if (state.draft || state.saving) return;
    const before = pageDraft(recipe, contents);
    const editInstead = (error?: string) => {
      if (newPhoto) choosePhoto(newPhoto);
      dispatch({ type: 'open', draft });
      dispatch(error ? { type: 'failed', error } : { type: 'invalid' });
    };
    if (validatePageDraft(draft).length > 0) {
      editInstead();
      return;
    }
    let result: ReturnType<typeof saveRecipePage>;
    try {
      result = saveRecipePage(draft);
    } catch (error) {
      editInstead(
        error instanceof OfflineError ? OFFLINE_EDIT_HINT : errorMessage(error, FAILED_MESSAGE),
      );
      return;
    }
    if (!result) return;
    const { open } = result;
    result.confirmed.then(
      ({ changedMeanwhile }) => {
        if (newPhoto) void setRecipePhoto(recipeId, newPhoto).catch(() => {});
        if (!mounted.current) return;
        if (open.length > 0) {
          // An article deleted meanwhile: the rest is saved, these rows stay open.
          const now = latest.current;
          const next = pageDraft(now.recipe, now.contents);
          dispatch({
            type: 'open',
            draft: withSection(next, addIngredientRows(next.ingredients, open)),
          });
          return;
        }
        toast.show({
          message: changedMeanwhile ? CHANGED_MEANWHILE_NOTICE : 'Rezept geändert',
          actionLabel: 'Rückgängig',
          onAction: undoAction(() => undo(before)),
        });
      },
      () => {
        if (mounted.current) editInstead(WRITE_REJECTED_MESSAGE);
      },
    );
  };

  // "Neues Rezept" with orange rows: the edit mode opens with them. Taken after the commit, so a
  // render thrown away during the navigation cannot use them up (spec 0018, E-01).
  const openHandedOverRows = useEffectEvent(() => {
    // "Neu → Mit KI ausfüllen" (spec 0040): the edit mode opens with the AI's draft.
    const handed = takeAiDraft(recipeId);
    if (handed) {
      if (handed.photo) photo.current = handed.photo;
      dispatch({
        type: 'open',
        draft: fillPageDraft(pageDraft(recipe, contents), handed.input, newId),
      });
      return;
    }
    const rows = takeHandedOverRows(recipeId);
    if (!rows) return;
    const draft = pageDraft(recipe, contents);
    dispatch({
      type: 'open',
      draft: withSection(draft, addIngredientRows(draft.ingredients, rows)),
    });
  });
  useEffect(() => openHandedOverRows(), []);

  // Android back and Escape on the web: like "Abbrechen" while the page is edited. An open window
  // or menu closes itself first.
  const onBack = useEffectEvent(() => {
    if (!state.draft) return false;
    cancel();
    return true;
  });
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const back = BackHandler.addEventListener('hardwareBackPress', () => onBack());
    return () => back.remove();
  }, []);
  const editing = state.draft !== undefined;
  // Reloading or closing the tab with changes asks the browser's own question.
  const onUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (changed) event.preventDefault();
  });
  const onEscape = useEffectEvent(() => onBack());
  useEffect(() => {
    if (!editing || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      onEscape();
    };
    const unload = (event: BeforeUnloadEvent) => onUnload(event);
    // Capture phase: react-native-web's TextInput stops its key events from bubbling.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, [editing]);

  // Stable, so the section can call it from an effect; nothing new changes nothing.
  const addContents = useCallback(
    (next: readonly CollectionContent[]) => dispatch({ type: 'contents', contents: next }),
    [],
  );
  const clearIntent = useCallback(() => setIntent(undefined), []);

  const problems = state.attempted && state.draft ? validatePageDraft(state.draft) : [];
  return {
    draft: state.draft,
    saving: state.saving === true,
    error: state.error,
    start,
    intent,
    clearIntent,
    change: (draft) => {
      if (state.draft) dispatch({ type: 'change', draft: withSection(state.draft, draft) });
    },
    save,
    cancel,
    guard,
    addContents,
    load: (input, newPhoto, loadOptions) => {
      const base = state.draft ?? pageDraft(recipe, contents);
      if (newPhoto) choosePhoto(newPhoto);
      dispatch({
        type: 'open',
        draft: fillPageDraft(base, input, newId, { replace: loadOptions?.replace === true }),
      });
    },
    filled: (input, fillOptions) =>
      fillPageDraft(state.draft ?? pageDraft(recipe, contents), input, newId, {
        replace: fillOptions?.replace === true,
        change: fillOptions?.change === true,
      }),
    adopt: (draft) => dispatch({ type: 'open', draft }),
    page: () => state.draft ?? pageDraft(recipe, contents),
    apply,
    chosenPhoto,
    choosePhoto,
    unsaved,
    problem: (field, key) =>
      problems.find((problem) => problem.field === field && problem.key === key)?.message,
  };
}
