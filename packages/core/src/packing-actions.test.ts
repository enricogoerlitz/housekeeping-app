import { describe, expect, it } from 'vitest';

import { packAllEntries, packEntry, resetEntries, undoPackAll } from './packing-actions';
import { applyQueue, enqueue, type StoreQueueEntry } from './store-queue';
import type { Row, TableRows } from './sync-delta';
import type { PackingItem } from './types';

function item(id: string, packed: boolean, packSeq = packed ? 1 : 0): PackingItem {
  return { id, listBagId: 'l-kultur', name: id, packed, packSeq, sort: 0 };
}

function row(entry: PackingItem): Row {
  return {
    id: entry.id,
    household_id: 'h1',
    list_bag_id: entry.listBagId,
    name: entry.name,
    packed: entry.packed,
    packed_at: entry.packed ? '2026-12-30T09:00:00Z' : null,
    packed_by: entry.packed ? 'm-nadja' : null,
    pack_seq: entry.packSeq,
    sort: entry.sort,
  };
}

function tablesOf(items: PackingItem[]): TableRows {
  return { packing_items: Object.fromEntries(items.map((entry) => [entry.id, row(entry)])) };
}

function enqueueAll(
  queue: StoreQueueEntry[],
  entries: StoreQueueEntry[],
  tables: TableRows,
): StoreQueueEntry[] {
  return entries.reduce((next, entry) => {
    const id = entry.kind === 'pack' ? entry.itemId : '';
    return enqueue(next, entry, tables.packing_items?.[id]);
  }, queue);
}

/** "Kulturbeutel": 7 open, the last 2 packed. */
const kulturbeutel = [
  ...Array.from({ length: 7 }, (_, index) => item(`k${index + 1}`, false)),
  item('k8', true),
  item('k9', true, 4),
];

describe('Alles einpacken (AC-026, AC-027)', () => {
  it('AC-026: 7 open and 2 packed give exactly 7 entries', () => {
    const entries = packAllEntries('h1', kulturbeutel);
    expect(entries.map((entry) => entry.itemId)).toEqual([
      'k1',
      'k2',
      'k3',
      'k4',
      'k5',
      'k6',
      'k7',
    ]);
    expect(entries[0]).toEqual({
      kind: 'pack',
      householdId: 'h1',
      itemId: 'k1',
      packed: true,
      seenPackSeq: 0,
    });
    const tables = tablesOf(kulturbeutel);
    const visible = applyQueue(tables, enqueueAll([], entries, tables), 'h1');
    expect(Object.values(visible.packing_items ?? {}).every((entry) => entry.packed)).toBe(true);
  });

  it('AC-026, AC-027: "Rückgängig" before sending leaves nothing, also offline', () => {
    const tables = tablesOf(kulturbeutel);
    const entries = packAllEntries('h1', kulturbeutel);
    let queue = enqueueAll([], entries, tables);
    // What the page shows: all packed, the counters still those of the server.
    const shown = kulturbeutel.map((entry) => ({ ...entry, packed: true }));
    const undo = undoPackAll(
      'h1',
      entries.map((entry) => entry.itemId),
      shown,
    );
    queue = enqueueAll(queue, undo, tables);
    expect(queue).toEqual([]);
  });

  it('AC-026: "Rückgängig" after sending gives 7 counter entries with the confirmed counter', () => {
    const entries = packAllEntries('h1', kulturbeutel);
    // The server confirmed the 7: each is packed with pack_seq 1 now.
    const confirmed = kulturbeutel.map((entry) =>
      entry.packed ? entry : item(entry.id, true, entry.packSeq + 1),
    );
    const tables = tablesOf(confirmed);
    const undo = undoPackAll(
      'h1',
      entries.map((entry) => entry.itemId),
      confirmed,
    );
    const queue = enqueueAll([], undo, tables);
    expect(queue).toHaveLength(7);
    expect(queue.every((entry) => entry.kind === 'pack' && !entry.packed)).toBe(true);
    expect(queue.map((entry) => (entry.kind === 'pack' ? entry.seenPackSeq : -1))).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ]);
    const visible = applyQueue(tables, queue, 'h1');
    expect(visible.packing_items?.k8?.packed).toBe(true);
    expect(visible.packing_items?.k9?.packed).toBe(true);
  });

  it('AC-024: "Rückgängig" skips Packstücke that are gone meanwhile', () => {
    expect(undoPackAll('h1', ['k1', 'gone'], [item('k1', true)])).toEqual([
      packEntry('h1', item('k1', true), false),
    ]);
  });
});

describe('Für die Rückreise zurücksetzen (AC-028, AC-030)', () => {
  const all = Array.from({ length: 30 }, (_, index) => item(`p${index + 1}`, true, index + 1));

  it('AC-028: 30 packed give 30 entries with the pack_seq that was seen', () => {
    const entries = resetEntries('h1', [...all, item('open', false)]);
    expect(entries).toHaveLength(30);
    expect(entries.every((entry) => !entry.packed && entry.householdId === 'h1')).toBe(true);
    expect(entries.map((entry) => entry.seenPackSeq)).toEqual(all.map((entry) => entry.packSeq));
    const tables = tablesOf(all);
    const visible = applyQueue(tables, enqueueAll([], entries, tables), 'h1');
    expect(Object.values(visible.packing_items ?? {}).some((entry) => entry.packed)).toBe(false);
  });

  it('AC-030: the entry keeps the seen counter, so the server keeps a newer pack', () => {
    // Nadja packed "Reisepass" again online; the device still saw pack_seq 1.
    const [reisepass] = resetEntries('h1', [item('reisepass', true, 1)]);
    expect(reisepass).toEqual({
      kind: 'pack',
      householdId: 'h1',
      itemId: 'reisepass',
      packed: false,
      seenPackSeq: 1,
    });
  });

  it('nothing packed gives no entries', () => {
    expect(resetEntries('h1', [item('a', false)])).toEqual([]);
    expect(packAllEntries('h1', [item('a', true)])).toEqual([]);
  });
});
