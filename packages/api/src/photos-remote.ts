// Own photos of activities and recipes (spec 0004, REQ-004). The photo is re-encoded in the
// browser (longest side 1600 px, JPEG): that drops the camera's metadata, location included, and
// the bytes are stripped once more to be sure. It is uploaded under a new name into the
// household's folder of the private bucket, then the row's photo_path is written (diff path),
// then the old file is deleted. A refused path deletes the new file again, so no file is left
// without a row. Deleting the old file can fail (offline in that moment): that file stays as an
// orphan, an accepted rest risk (plan.md).
//
// Display: photos are downloaded with the session (the bucket is private), kept as bytes in the
// device storage next to the cache (bound to the user, cleared at sign-out) and shown through
// blob: URLs. Offline only what is stored shows (AC-011). The store keeps about 50 MB.
import type { Activity, Id, Recipe } from '@housekeeping/core';
import { useEffect, useSyncExternalStore } from 'react';

import { deviceStorage, onlineCall, WRITE_REJECTED_MESSAGE } from './backend';
import { useOffline } from './queries';
import type { Storage } from './storage';
import {
  commitConfirmed,
  getData,
  getState,
  isBackendOffline,
  OfflineError,
  peekState,
  updateData,
} from './store';
import { TransportError } from './transport';

export const PHOTO_UNUSABLE_MESSAGE = 'Dieses Bild können wir nicht verwenden';
export const PHOTO_FORBIDDEN_MESSAGE =
  'Das Foto ließ sich nicht speichern – dafür fehlt die Berechtigung';
export const PHOTO_UPLOAD_FAILED_MESSAGE =
  'Das Foto ließ sich gerade nicht hochladen – bitte noch einmal versuchen';

/** What a person may choose (AC-010); phone photos fit. */
export const PHOTO_MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Longest side of the stored photo (AC-009). */
export const PHOTO_MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;
/** Photos kept on the device; the oldest go first beyond it. */
const MEDIA_BUDGET_BYTES = 50 * 1024 * 1024;

const unusable = () => new Error(PHOTO_UNUSABLE_MESSAGE);

// ---------------------------------------------------------------------------------------------
// Preparing the chosen file (web)
// ---------------------------------------------------------------------------------------------

/** AC-010: an image of at most 15 MB, or "Dieses Bild können wir nicht verwenden". */
export function checkPhotoFile(file: Blob): void {
  if (!file.type.startsWith('image/') || file.size === 0 || file.size > PHOTO_MAX_INPUT_BYTES) {
    throw unusable();
  }
}

/** The size that fits into max × max, keeping the aspect ratio; never larger than the original. */
export function fitWithin(
  width: number,
  height: number,
  max = PHOTO_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** APP1 (Exif, XMP), APP13 (IPTC) and comments: where cameras and apps write location and names. */
const METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]);
const START_OF_SCAN = 0xda;

/**
 * The JPEG without its metadata segments; the image data is unchanged. Refuses bytes that are no
 * JPEG (PHOTO_UNUSABLE_MESSAGE).
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const at = (index: number) => bytes[index] ?? -1;
  if (at(0) !== 0xff || at(1) !== 0xd8) throw unusable();
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  for (;;) {
    if (at(offset) !== 0xff) throw unusable();
    const marker = at(offset + 1);
    if (marker === 0xff) {
      offset += 1; // fill byte before a marker
      continue;
    }
    if (marker === START_OF_SCAN) {
      parts.push(bytes.subarray(offset));
      break;
    }
    const length = (at(offset + 2) << 8) | at(offset + 3);
    const end = offset + 2 + length;
    if (at(offset + 3) < 0 || length < 2 || end > bytes.length) throw unusable();
    if (!METADATA_MARKERS.has(marker)) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

/**
 * Web only: the chosen file as the JPEG that gets stored — decoded (camera rotation applied),
 * drawn at most 1600 px on a canvas and encoded at quality 0.82, metadata stripped. Throws
 * PHOTO_UNUSABLE_MESSAGE for a file that is no usable image (AC-010).
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  checkPhotoFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw unusable();
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw unusable();
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!encoded || encoded.type !== 'image/jpeg') throw unusable();
    const bytes = stripJpegMetadata(new Uint8Array(await encoded.arrayBuffer()));
    return new Blob([bytes], { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

/** A storage or network error as the German message the photo form shows. */
export function toPhotoError(error: unknown): Error {
  if (error instanceof OfflineError) return error;
  if (error instanceof TransportError) {
    if (error.code === 'too_large' || error.code === 'invalid_mime') return unusable();
    if (error.code === 'access_denied') return new Error(PHOTO_FORBIDDEN_MESSAGE);
  }
  return new Error(PHOTO_UPLOAD_FAILED_MESSAGE);
}

// ---------------------------------------------------------------------------------------------
// Photos on the device
// ---------------------------------------------------------------------------------------------

interface StoredMedia {
  type: string;
  bytes: ArrayBuffer;
}

interface MediaIndexEntry {
  path: string;
  size: number;
  /** When it was stored (ms): the oldest go first. */
  at: number;
}

const mediaKey = (path: string) => `media:${path}`;
const INDEX_KEY = 'media-index';

function isStoredMedia(value: unknown): value is StoredMedia {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredMedia).type === 'string' &&
    (value as StoredMedia).bytes instanceof ArrayBuffer
  );
}

function readIndex(value: unknown): MediaIndexEntry[] {
  return Array.isArray(value) ? (value as MediaIndexEntry[]) : [];
}

/**
 * Which stored photos stay: none of households no longer on the device, then the oldest go until
 * the rest fits the budget. `kept` keeps the order of the index.
 */
export function evictMedia(
  index: readonly MediaIndexEntry[],
  budgetBytes: number,
  householdIds: ReadonlySet<string>,
): { kept: MediaIndexEntry[]; dropped: string[] } {
  const dropped = new Set<string>();
  for (const entry of index) {
    if (!householdIds.has(entry.path.split('/')[0] ?? '')) dropped.add(entry.path);
  }
  let total = index.reduce((sum, entry) => (dropped.has(entry.path) ? sum : sum + entry.size), 0);
  for (const entry of [...index].sort((a, b) => a.at - b.at)) {
    if (total <= budgetBytes) break;
    if (dropped.has(entry.path)) continue;
    dropped.add(entry.path);
    total -= entry.size;
  }
  return { kept: index.filter((entry) => !dropped.has(entry.path)), dropped: [...dropped] };
}

// Index updates are read-modify-write: one at a time.
let mediaQueue: Promise<unknown> = Promise.resolve();
function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = mediaQueue.then(task, task);
  mediaQueue = run.catch(() => undefined);
  return run;
}

/**
 * Keeps a photo on the device, unless the user signed out meanwhile (that storage is cleared).
 * A full or broken storage only costs the offline copy, never the action.
 */
function rememberMedia(path: string, photo: Blob, storage: Storage): Promise<void> {
  return serially(async () => {
    const bytes = await photo.arrayBuffer();
    const index = readIndex(await storage.get(INDEX_KEY)).filter((entry) => entry.path !== path);
    index.push({ path, size: bytes.byteLength, at: Date.now() });
    const { kept, dropped } = evictMedia(
      index,
      MEDIA_BUDGET_BYTES,
      new Set(Object.keys(peekState()?.households ?? {})),
    );
    if (deviceStorage() !== storage) return;
    const stored: StoredMedia = { type: photo.type || 'image/jpeg', bytes };
    await storage.setMany([
      [mediaKey(path), stored],
      [INDEX_KEY, kept],
    ]);
    if (dropped.length > 0) await storage.del(dropped.map(mediaKey));
  }).catch((error: unknown) => {
    console.warn(`Storing a photo failed: ${error instanceof Error ? error.name : 'unknown'}`);
  });
}

function forgetMedia(path: string, storage: Storage): Promise<void> {
  return serially(async () => {
    const index = readIndex(await storage.get(INDEX_KEY)).filter((entry) => entry.path !== path);
    if (deviceStorage() !== storage) return;
    await storage.setMany([[INDEX_KEY, index]]);
    await storage.del([mediaKey(path)]);
  }).catch((error: unknown) => {
    console.warn(`Forgetting a photo failed: ${error instanceof Error ? error.name : 'unknown'}`);
  });
}

const loading = new Map<string, Promise<Blob | undefined>>();

async function fetchPhoto(path: string): Promise<Blob | undefined> {
  const storage = deviceStorage();
  // Photos of a household that left the device are not shown (they go with the next eviction).
  const householdId = path.split('/')[0] ?? '';
  if (!storage || !peekState()?.households[householdId]) return undefined;
  const stored = await storage.get(mediaKey(path));
  if (isStoredMedia(stored)) return new Blob([stored.bytes], { type: stored.type });
  if (isBackendOffline()) return undefined;
  try {
    const photo = await onlineCall((transport) => transport.downloadMedia(path));
    await rememberMedia(path, photo, storage);
    return photo;
  } catch (error) {
    // Gone, foreign or no network: no photo, the screen shows its placeholder.
    if (!(error instanceof TransportError) && !(error instanceof OfflineError)) {
      console.warn(`Loading a photo failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
    return undefined;
  }
}

/** The photo from the device storage, else downloaded (online) and stored; undefined if neither. */
export function loadPhoto(path: string): Promise<Blob | undefined> {
  const running = loading.get(path);
  if (running) return running;
  const task = fetchPhoto(path).finally(() => loading.delete(path));
  loading.set(path, task);
  return task;
}

/** What a screen shows for a photo: `uri` once it is there (blob: URL), `loading` while fetched. */
export interface PhotoView {
  uri?: string;
  loading: boolean;
}

const LOADING: PhotoView = Object.freeze({ loading: true });
const NO_PHOTO: PhotoView = Object.freeze({ loading: false });

/** A photo some screen shows: one blob: URL while any screen holds it. */
interface ShownPhoto {
  refs: number;
  view: PhotoView;
  fetching: boolean;
}

// The photos on screen are an external store for useSyncExternalStore: every change replaces the
// view object of its path and notifies, so React re-reads the snapshot after a photo loaded.
const shown = new Map<string, ShownPhoto>();
const photoListeners = new Set<() => void>();

function notifyPhotos(): void {
  for (const listener of photoListeners) listener();
}

export function subscribePhotos(onChange: () => void): () => void {
  photoListeners.add(onChange);
  return () => {
    photoListeners.delete(onChange);
  };
}

/** The current view of a photo; the same object until it changes. */
export function photoView(path: string | undefined): PhotoView {
  if (!path) return NO_PHOTO;
  return shown.get(path)?.view ?? LOADING;
}

function fetchShown(path: string, entry: ShownPhoto): void {
  if (entry.fetching) return;
  entry.fetching = true;
  void loadPhoto(path).then((photo) => {
    entry.fetching = false;
    // Every screen let go meanwhile: no URL to create.
    if (shown.get(path) !== entry) return;
    entry.view = photo ? { uri: URL.createObjectURL(photo), loading: false } : NO_PHOTO;
    notifyPhotos();
  });
}

/**
 * A screen shows the photo: it is loaded (device storage, else downloaded) unless it is already
 * there; a photo that could not be loaded is tried again. Returns the release; the URL is revoked
 * after the last screen let go — after the current commit, so a screen that re-mounts keeps it.
 */
export function showPhoto(path: string): () => void {
  let entry = shown.get(path);
  if (!entry) {
    entry = { refs: 0, view: LOADING, fetching: false };
    shown.set(path, entry);
  }
  entry.refs += 1;
  if (!entry.view.uri) fetchShown(path, entry);
  const held = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.refs -= 1;
    if (held.refs > 0) return;
    queueMicrotask(() => {
      if (shown.get(path) !== held || held.refs > 0) return;
      shown.delete(path);
      if (held.view.uri) URL.revokeObjectURL(held.view.uri);
    });
  };
}

/**
 * A stored photo for an Image: `uri` once it is there (blob: URL), `loading` while it is fetched.
 * Offline only photos loaded before show (AC-011); back online it tries again.
 */
export function usePhoto(path: string | undefined): PhotoView {
  const offline = useOffline();
  const view = useSyncExternalStore(
    subscribePhotos,
    () => photoView(path),
    () => photoView(path),
  );
  // `offline` re-runs the effect, so a photo that could not be loaded is tried again online.
  useEffect(() => {
    if (!path) return;
    return showPhoto(path);
  }, [path, offline]);
  return view;
}

// ---------------------------------------------------------------------------------------------
// Setting and removing
// ---------------------------------------------------------------------------------------------

type PhotoTable = 'activities' | 'recipes';

function photoPathOf(table: PhotoTable, id: Id): string | undefined {
  const data = getData();
  const row: Activity | Recipe | undefined =
    table === 'activities'
      ? data.activities.find((activity) => activity.id === id)
      : data.recipes.find((recipe) => recipe.id === id);
  if (!row)
    throw new Error(table === 'activities' ? 'Aktivität nicht gefunden' : 'Rezept nicht gefunden');
  return row.photoPath;
}

function writePhotoPath(table: PhotoTable, id: Id, photoPath: string | undefined): void {
  updateData((data) =>
    table === 'activities'
      ? {
          ...data,
          activities: data.activities.map((activity) =>
            activity.id === id ? { ...activity, photoPath } : activity,
          ),
        }
      : {
          ...data,
          recipes: data.recipes.map((recipe) =>
            recipe.id === id ? { ...recipe, photoPath } : recipe,
          ),
        },
  );
}

/** Deleting a file must not fail the action that made it unused; a leftover file is logged. */
async function removeQuietly(path: string): Promise<void> {
  try {
    await onlineCall((transport) => transport.removeMedia([path]));
  } catch (error) {
    console.warn(
      `Removing a photo failed: ${error instanceof TransportError ? error.code : 'unknown'}`,
    );
  }
  const storage = deviceStorage();
  if (storage) await forgetMedia(path, storage);
}

async function setPhoto(table: PhotoTable, id: Id, photo: Blob): Promise<void> {
  if (isBackendOffline()) throw new OfflineError();
  const old = photoPathOf(table, id);
  const path = `${getState().activeHouseholdId}/${table}/${id}/${crypto.randomUUID()}.jpg`;
  try {
    await onlineCall((transport) => transport.uploadMedia(path, photo));
  } catch (error) {
    throw toPhotoError(error);
  }
  const storage = deviceStorage();
  if (storage) await rememberMedia(path, photo, storage);
  try {
    await commitConfirmed({ path: 'diff' }, () => writePhotoPath(table, id, path));
  } catch (error) {
    await removeQuietly(path);
    throw error instanceof OfflineError ? error : new Error(WRITE_REJECTED_MESSAGE);
  }
  if (old) await removeQuietly(old);
}

async function removePhoto(table: PhotoTable, id: Id): Promise<void> {
  if (isBackendOffline()) throw new OfflineError();
  const old = photoPathOf(table, id);
  if (!old) return;
  await commitConfirmed({ path: 'diff' }, () => writePhotoPath(table, id, undefined));
  await removeQuietly(old);
}

/**
 * Sets the activity's own photo (a JPEG from preparePhoto) and deletes the one it replaces
 * (AC-009). Online only (OfflineError); German messages from toPhotoError.
 */
export function setActivityPhoto(activityId: Id, photo: Blob): Promise<void> {
  return setPhoto('activities', activityId, photo);
}

/** Removes the activity's photo: the path is cleared, then the file is deleted. */
export function removeActivityPhoto(activityId: Id): Promise<void> {
  return removePhoto('activities', activityId);
}

/** Sets the recipe's own photo; it is shown instead of the sample photo (AC-017). */
export function setRecipePhoto(recipeId: Id, photo: Blob): Promise<void> {
  return setPhoto('recipes', recipeId, photo);
}

/** Removes the recipe's own photo; the sample photo shows again (AC-018). */
export function removeRecipePhoto(recipeId: Id): Promise<void> {
  return removePhoto('recipes', recipeId);
}
