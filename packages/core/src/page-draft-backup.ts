import { z } from 'zod';

import { formatShortDate, toISODate } from './dates';
import type { PageDraft } from './page-editor';
import type { Id } from './types';

// The backup of the recipe page's edit mode (spec 0056, REQ-006; solves spec 0037, OFFEN 12):
// browser back and the tab bar leave the page without asking, so the app keeps the changed
// draft in the browser tab and offers it when the page opens again. The app does the storage;
// this is the format and its check. The draft keeps its `base` and `seenUpdatedAt`, so a later
// "Speichern" sends only what changed (spec 0037, AC-006).

const PREFIX = 'housekeeping.recipe-draft.';

/** The storage key of a recipe's backup. */
export function pageDraftBackupKey(recipeId: Id): string {
  return `${PREFIX}${recipeId}`;
}

/** Whether a storage key is a backup (sign-out removes them all). */
export function isPageDraftBackupKey(key: string): boolean {
  return key.startsWith(PREFIX);
}

// The shape every page draft has; the rows and sections inside stay as the app wrote them.
const section = (name: string) => z.looseObject({ section: z.literal(name) });
const BackupSchema = z.object({
  savedAt: z.iso.datetime(),
  draft: z.looseObject({
    recipeId: z.string().min(1),
    kind: z.enum(['recipe', 'collection']),
    seenUpdatedAt: z.string().optional(),
    head: section('head').extend({ title: z.string(), base: z.looseObject({}) }),
    classification: section('classification').optional(),
    ingredients: section('ingredients').extend({
      rows: z.array(z.looseObject({ key: z.string(), amountText: z.string() })),
      variants: z.array(z.looseObject({ id: z.string(), name: z.string() })),
      base: z.looseObject({}),
    }),
    steps: section('steps').optional(),
    notes: section('notes').extend({ notes: z.string() }),
    links: section('links').extend({ links: z.array(z.looseObject({ url: z.string() })) }),
    contents: section('contents').optional(),
  }),
});

/** The text kept for `draft`, changed at `savedAt` (ISO). */
export function encodePageDraftBackup(draft: PageDraft, savedAt: string): string {
  return JSON.stringify({ savedAt, draft });
}

/**
 * The kept draft of `recipeId`; undefined for nothing, broken text, another recipe or a shape
 * the page cannot open (AC-024).
 */
export function decodePageDraftBackup(
  raw: string | null | undefined,
  recipeId: Id,
): { draft: PageDraft; savedAt: string } | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = BackupSchema.safeParse(value);
  if (!parsed.success || parsed.data.draft.recipeId !== recipeId) return undefined;
  // Checked above as far as the page reads it; the rest is what this app wrote itself.
  return { draft: parsed.data.draft as unknown as PageDraft, savedAt: parsed.data.savedAt };
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** "Ungespeicherte Änderungen von 17:42", on another day "… vom 26.11. um 09:07". */
export function pageDraftBackupNotice(savedAt: string, now: Date): string {
  const at = new Date(savedAt);
  const time = `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
  const day = toISODate(at);
  if (day === toISODate(now)) return `Ungespeicherte Änderungen von ${time}`;
  return `Ungespeicherte Änderungen vom ${formatShortDate(day)} um ${time}`;
}
