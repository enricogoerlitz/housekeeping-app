import {
  generateImagesAsync,
  loadPhotoFromAddress,
  OfflineError,
  preparePhoto,
} from '@housekeeping/api';
import {
  IMAGE_EDIT_MAX_SIDE,
  type AiImageContext,
  type Id,
  type PageDraftInput,
  type Recipe,
} from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';

// What "Mit KI ausfüllen" (spec 0040) hands to the recipe page. A new recipe exists only here
// until "Speichern" (AC-001: nothing is in the database before): its page shows it from this
// module and opens the edit mode with the draft. The photo suggestions of "Foto generieren"
// (REQ-003) are made in the background meanwhile and never stored; "Übernehmen" picks one for the
// draft, which saves it with "Speichern" through the usual photo path.

export interface HandedOverDraft {
  input: PageDraftInput;
  /** The photo chosen in "Neu"; saved with "Speichern". */
  photo?: Blob;
}

const unsaved = new Map<Id, Recipe>();
const drafts = new Map<Id, HandedOverDraft>();

/** "Neu → Mit KI ausfüllen": the recipe as a draft only, opened in the edit mode with `input`. */
export function handOverNewRecipe(recipe: Recipe, input: PageDraftInput, photo?: Blob): void {
  unsaved.set(recipe.id, recipe);
  drafts.set(recipe.id, photo ? { input, photo } : { input });
}

/** The recipe that exists only as a draft, for its page; undefined once saved or never made. */
export function unsavedRecipe(recipeId: Id): Recipe | undefined {
  return unsaved.get(recipeId);
}

/** After "Speichern" or "Verwerfen". */
export function forgetUnsavedRecipe(recipeId: Id): void {
  unsaved.delete(recipeId);
  drafts.delete(recipeId);
}

/** The photo handed over with the draft, without taking it (the page shows it from the start). */
export function peekAiDraftPhoto(recipeId: Id): Blob | undefined {
  return drafts.get(recipeId)?.photo;
}

/** The draft handed over for this page, once; call it from an effect, not while rendering. */
export function takeAiDraft(recipeId: Id): HandedOverDraft | undefined {
  const draft = drafts.get(recipeId);
  drafts.delete(recipeId);
  return draft;
}

// ---------- Photo suggestions (REQ-003) ----------

export interface PhotoSuggestion {
  photo: Blob;
  uri: string;
}

export type PhotoSuggestions =
  | { status: 'loading' }
  | { status: 'done'; photos: PhotoSuggestion[]; failed: number }
  | { status: 'failed'; message: string };

const PHOTO_SUGGESTIONS_FAILED_MESSAGE =
  'Die Fotovorschläge sind gerade nicht gelungen. Du kannst es im Foto-Fenster unter „KI“ noch einmal versuchen.';

const suggestions = new Map<Id, PhotoSuggestions>();
const listeners = new Set<() => void>();
let round = 0;
const rounds = new Map<Id, number>();
/**
 * What the suggestions are made from: the draft's image prompt, its title and description as the
 * context (spec 0052), a TikTok cover; and for "Neu generieren" the person's wish.
 */
interface SuggestionRequest {
  prompt: string;
  context?: AiImageContext;
  coverUrl?: string;
  extra?: string;
}
/** The request of the first round, for "Neu generieren". */
const requests = new Map<Id, SuggestionRequest>();

function set(recipeId: Id, next: PhotoSuggestions | undefined): void {
  const previous = suggestions.get(recipeId);
  if (previous?.status === 'done')
    for (const photo of previous.photos) URL.revokeObjectURL(photo.uri);
  if (next) suggestions.set(recipeId, next);
  else suggestions.delete(recipeId);
  for (const listener of listeners) listener();
}

/** A TikTok cover as the reference, shrunk like "Aus diesem Foto"; undefined when it fails. */
async function reference(coverUrl: string | undefined): Promise<Blob | undefined> {
  if (!coverUrl) return undefined;
  try {
    return await preparePhoto(await loadPhotoFromAddress(coverUrl), IMAGE_EDIT_MAX_SIDE);
  } catch {
    return undefined;
  }
}

/**
 * AC-010: three suggestions from the draft's image prompt; with a TikTok link its cover is the
 * model's reference (REQ-006). A newer round for the same recipe replaces an older one.
 */
export function startPhotoSuggestions(recipeId: Id, request: SuggestionRequest): void {
  requests.set(recipeId, request);
  generate(recipeId, request);
}

/**
 * "Neu generieren" (spec 0045, REQ-006): three new suggestions from the draft's image prompt with
 * the person's wish (AC-017), which goes as its own field (spec 0052, AC-011). A photo taken
 * before stays the draft's until another is taken (AC-018): it lives in the editor, not here.
 */
export function regeneratePhotoSuggestions(recipeId: Id, extra: string): void {
  const request = requests.get(recipeId);
  if (!request) return;
  generate(recipeId, { ...request, extra });
}

function generate(recipeId: Id, request: SuggestionRequest): void {
  round += 1;
  const mine = round;
  rounds.set(recipeId, mine);
  set(recipeId, { status: 'loading' });
  void (async () => {
    try {
      const image = await reference(request.coverUrl);
      const result = await generateImagesAsync({
        prompt: request.prompt,
        styles: [],
        ...(image ? { image } : {}),
        ...(request.extra ? { extra: request.extra } : {}),
        ...(request.context ? { context: request.context } : {}),
      });
      if (rounds.get(recipeId) !== mine) return;
      set(recipeId, {
        status: 'done',
        photos: result.images.map((photo) => ({ photo, uri: URL.createObjectURL(photo) })),
        failed: result.failed,
      });
    } catch (error) {
      if (rounds.get(recipeId) !== mine) return;
      set(recipeId, {
        status: 'failed',
        message:
          error instanceof OfflineError ? OFFLINE_EDIT_HINT : PHOTO_SUGGESTIONS_FAILED_MESSAGE,
      });
    }
  })();
}

/** Closes the suggestions (saved, discarded, or the person dismissed them). */
export function dismissPhotoSuggestions(recipeId: Id): void {
  rounds.delete(recipeId);
  requests.delete(recipeId);
  set(recipeId, undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePhotoSuggestions(recipeId: Id): PhotoSuggestions | undefined {
  return useSyncExternalStore(
    subscribe,
    () => suggestions.get(recipeId),
    () => undefined,
  );
}
