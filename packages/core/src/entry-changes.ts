// What closing the window of a plan entry sends (spec 0021, REQ-009, Entscheidung 24): only the
// fields the person changed compared to what the window opened with. The window's draft comes from
// the cache when it opens; comparing with the cache at closing instead would send every stale value
// once a delta sync brought newer server state, and overwrite it.
import type { PortionState } from './entry-edit';
import type { Id, MealPlanEntry, PlanEntryVariant, TimeOfDay } from './types';

/** What the entry window holds: the typed fields, who is there and how much, the reminder text. */
export interface EntryDraft extends PortionState {
  /** "Was gibt es?" of a free text, as typed. */
  text: string;
  /** "Zusatz", as typed. */
  note: string;
  /** "Uhrzeit (optional)" of a restaurant or activity. */
  startsAt: TimeOfDay | undefined;
  /** "Woran erinnern?"; the opening value while the reminder is off. */
  reminderText: string;
}

/** The changed fields; a removed time is null. Leaving a field out leaves it as it is. */
export interface EntryChanges {
  text?: string;
  note?: string;
  startsAt?: TimeOfDay | null;
  eaterIds?: Id[];
  guests?: number;
  portions?: number;
  variants?: PlanEntryVariant[];
  reminderText?: string;
}

const sameIds = (a: readonly Id[], b: readonly Id[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** Portions per variant; rows with 0 are not stored, so they do not count. */
function split(variants: readonly PlanEntryVariant[]): string {
  const totals = new Map<Id, number>();
  for (const row of variants)
    totals.set(row.variantId, (totals.get(row.variantId) ?? 0) + row.portions);
  return [...totals]
    .filter(([, portions]) => portions !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, portions]) => `${id}:${portions}`)
    .join(',');
}

/**
 * The fields of `draft` that differ from `opened`, limited to what the kind of entry has: the text
 * only for a free text, the time only for restaurants and activities, people and guests for
 * recipes, restaurants and activities, portions and variants for recipes and restaurants. Text,
 * Zusatz and reminder text compare trimmed; people compare as a set, variants by their portions.
 * Nothing changed is `{}`: closing then writes nothing.
 */
export function changedEntryFields(
  kind: MealPlanEntry['kind'],
  opened: EntryDraft,
  draft: EntryDraft,
): EntryChanges {
  const changes: EntryChanges = {};
  const timed = kind === 'restaurant' || kind === 'activity';
  const eats = kind === 'recipe' || kind === 'restaurant';
  if (kind === 'text' && draft.text.trim() !== opened.text.trim()) changes.text = draft.text;
  if (draft.note.trim() !== opened.note.trim()) changes.note = draft.note;
  if (timed && draft.startsAt !== opened.startsAt) changes.startsAt = draft.startsAt ?? null;
  if (eats || kind === 'activity') {
    if (!sameIds(draft.eaterIds, opened.eaterIds)) changes.eaterIds = draft.eaterIds;
    if (draft.guests !== opened.guests) changes.guests = draft.guests;
  }
  if (eats) {
    if (draft.portions !== opened.portions) changes.portions = draft.portions;
    if (draft.variants.length > 0 && split(draft.variants) !== split(opened.variants)) {
      changes.variants = draft.variants;
    }
  }
  if (draft.reminderText.trim() !== opened.reminderText.trim()) {
    changes.reminderText = draft.reminderText;
  }
  return changes;
}
