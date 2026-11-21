import type { PackEntry } from './store-queue';
import type { Id, PackingItem } from './types';

// Which Packstücke get a store-queue entry for the pack actions (spec 0012, REQ-004 to REQ-006;
// ADR-0013). `items` are the Packstücke as the page shows them: their `packSeq` is the counter the
// device last saw from the server. The caller enqueues the entries one by one, so `enqueue`
// collapses them with what is still queued.

/** The entry for packing (`packed`) or unpacking one Packstück. */
export function packEntry(householdId: Id, item: PackingItem, packed: boolean): PackEntry {
  return { kind: 'pack', householdId, itemId: item.id, packed, seenPackSeq: item.packSeq };
}

/** "Alles einpacken" (AC-026): one entry per open Packstück of the bag. */
export function packAllEntries(householdId: Id, items: readonly PackingItem[]): PackEntry[] {
  return items.filter((item) => !item.packed).map((item) => packEntry(householdId, item, true));
}

/**
 * "Rückgängig" after "Alles einpacken" (AC-026, AC-027): unpacks exactly the Packstücke that were
 * packed by it (`packedIds`), so the ones packed before stay. While their entries are still queued
 * the counter entries cancel them; once sent they carry the confirmed counter. Packstücke that are
 * gone meanwhile get no entry.
 */
export function undoPackAll(
  householdId: Id,
  packedIds: readonly Id[],
  items: readonly PackingItem[],
): PackEntry[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return packedIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [packEntry(householdId, item, false)] : [];
  });
}

/**
 * "Für die Rückreise zurücksetzen" (AC-028): one entry per packed Packstück of the packing list.
 * Each carries the counter that was seen, so a Packstück packed again elsewhere meanwhile stays
 * packed on the server ("Abhaken gewinnt", AC-030).
 */
export function resetEntries(householdId: Id, items: readonly PackingItem[]): PackEntry[] {
  return items.filter((item) => item.packed).map((item) => packEntry(householdId, item, false));
}
