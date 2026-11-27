import {
  decodePageDraftBackup,
  encodePageDraftBackup,
  isPageDraftBackupKey,
  pageDraftBackupKey,
  type Id,
  type PageDraft,
} from '@housekeeping/core';
import { Platform } from 'react-native';

// Spec 0056, REQ-006 (Entscheidung 7): the changed draft of a recipe page's edit mode lives in
// this tab's session storage, so browser back, the tab bar and a reload lose nothing. Gone with
// the tab, removed by "Speichern", "Verwerfen" and sign-out. Without storage (private mode) the
// page works as before.

function storage(): Storage | undefined {
  if (Platform.OS !== 'web') return undefined;
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The kept draft of the recipe; a broken or foreign one is removed (AC-024). */
export function readPageDraftBackup(
  recipeId: Id,
): { draft: PageDraft; savedAt: string } | undefined {
  try {
    const key = pageDraftBackupKey(recipeId);
    const raw = storage()?.getItem(key);
    const backup = decodePageDraftBackup(raw, recipeId);
    if (raw && !backup) storage()?.removeItem(key);
    return backup;
  } catch {
    return undefined;
  }
}

export function writePageDraftBackup(draft: PageDraft): void {
  try {
    storage()?.setItem(
      pageDraftBackupKey(draft.recipeId),
      encodePageDraftBackup(draft, new Date().toISOString()),
    );
  } catch {
    // Full or blocked storage: the draft is only not kept.
  }
}

export function removePageDraftBackup(recipeId: Id): void {
  try {
    storage()?.removeItem(pageDraftBackupKey(recipeId));
  } catch {
    // Nothing kept.
  }
}

/** Sign-out: no recipe text of this household stays in the tab. */
export function clearPageDraftBackups(): void {
  try {
    const kept = storage();
    if (!kept) return;
    const keys = Array.from({ length: kept.length }, (_, at) => kept.key(at));
    for (const key of keys) if (key && isPageDraftBackupKey(key)) kept.removeItem(key);
  } catch {
    // Nothing kept.
  }
}
