import type { Id } from './types';

// "Teilen" (spec 0047, REQ-001): only the address of the page in the app goes to the share menu
// of the device (or is copied); a collection lives at "/rezept/<id>" like a recipe.

export type ShareTarget = { kind: 'recipe' | 'restaurant' | 'activity'; id: Id };

const PATHS: Record<ShareTarget['kind'], string> = {
  recipe: 'rezept',
  restaurant: 'restaurant',
  activity: 'aktivitaet',
};

/** The address of the page in the app; undefined without the app's origin (AC-004). */
export function shareLink(origin: string | undefined, target: ShareTarget): string | undefined {
  const base = origin?.trim().replace(/\/+$/, '');
  if (!base) return undefined;
  return `${base}/${PATHS[target.kind]}/${encodeURIComponent(target.id)}`;
}
