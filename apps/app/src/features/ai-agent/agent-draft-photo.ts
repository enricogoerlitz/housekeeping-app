import { useSyncExternalStore } from 'react';

// Spec 0067, REQ-011: the photo taken in the chat for the recipe draft ("Als Foto nehmen" with
// `for: draft`), kept while the page is open; "Prüfen und anlegen" hands it to the editor with the
// draft, which saves it with "Anlegen" through the usual photo path. A Google image keeps its page
// as the source. Never stored before that.

export interface DraftPhoto {
  photo: Blob;
  uri: string;
  /** The page a Google image is on. */
  sourceUrl?: string;
}

let current: DraftPhoto | undefined;
const listeners = new Set<() => void>();

export function setDraftPhoto(photo: Blob, sourceUrl?: string): void {
  if (current) URL.revokeObjectURL(current.uri);
  current = { photo, uri: URL.createObjectURL(photo), ...(sourceUrl ? { sourceUrl } : {}) };
  for (const listener of listeners) listener();
}

/** "Neuer Chat" and leaving the page forget it. */
export function clearDraftPhoto(): void {
  if (current) URL.revokeObjectURL(current.uri);
  current = undefined;
  for (const listener of listeners) listener();
}

export function useDraftPhoto(): DraftPhoto | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
