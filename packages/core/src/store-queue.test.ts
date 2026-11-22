import { describe, expect, it } from 'vitest';

import {
  applyQueue,
  enqueue,
  PACK_BATCH_LIMIT,
  packBatch,
  parseStoredQueue,
  queueEffect,
  remapQueue,
  requeue,
  signOutWarning,
  unsentChangeCount,
  type QueuedContribution,
  type StoreQueueEntry,
} from './store-queue';
import type { Row, TableRows } from './sync-delta';

function shoppingItem(id: string, articleId: string, rest: Partial<Row> = {}): Row {
  return {
    id,
    household_id: 'h1',
    article_id: articleId,
    checked: false,
    checked_at: null,
    checked_by: null,
    check_seq: 0,
    not_available: false,
    ...rest,
  };
}

function base(): TableRows {
  return {
    articles: {
      milk: { id: 'milk', name: 'Milch', name_key: 'milch', synonym_keys: [], area_id: null },
      bread: {
        id: 'bread',
        name: 'Brot',
        name_key: 'brot',
        synonym_keys: ['baguette'],
        area_id: 'a1',
      },
      butter: { id: 'butter', name: 'Butter', name_key: 'butter', synonym_keys: [], area_id: null },
    },
    shopping_items: {
      i1: shoppingItem('i1', 'milk'),
      i2: shoppingItem('i2', 'butter', {
        checked: true,
        checked_at: '2026-11-20T09:00:00Z',
        checked_by: 'p2',
        check_seq: 3,
      }),
    },
    shopping_contributions: {
      c1: { id: 'c1', item_id: 'i2', source: { kind: 'manual' }, count: 1 },
    },
  };
}

const item = (tables: TableRows, id: string) => tables.shopping_items?.[id];

function contribution(id: string, name: string, rest: Partial<QueuedContribution> = {}) {
  return { clientContributionId: id, articleName: name, nameKey: name.toLowerCase(), ...rest };
}

function addEntry(
  clientItemId: string,
  contributions: QueuedContribution[],
): Extract<StoreQueueEntry, { kind: 'add' }> {
  return {
    kind: 'add',
    householdId: 'h1',
    clientItemId,
    clientArticleId: `art-${clientItemId}`,
    contributions,
  };
}

const check = (itemId: string, checked: boolean, seenCheckSeq = 0): StoreQueueEntry => ({
  kind: 'check',
  itemId,
  checked,
  seenCheckSeq,
});

describe('enqueue and queueEffect: checking', () => {
  it('AC-021: checking offline is queued and visible at once', () => {
    const tables = base();
    const queue = enqueue([], check('i1', true), item(tables, 'i1'));
    expect(queue).toEqual([check('i1', true)]);
    expect(item(applyQueue(tables, queue, 'h1'), 'i1')?.checked).toBe(true);
  });

  it('AC-022: unchecking queues the check_seq that was seen, also after more toggles', () => {
    const tables = base();
    let queue = enqueue([], check('i2', false, 3), item(tables, 'i2'));
    queue = enqueue(queue, check('i2', true, 3), item(tables, 'i2'));
    expect(queue).toEqual([]);
    queue = enqueue(queue, check('i2', false, 3), item(tables, 'i2'));
    // A repeated tap with the same outcome keeps the first entry and the sequence it saw.
    queue = enqueue(queue, check('i2', false, 4), item(tables, 'i2'));
    expect(queue).toEqual([check('i2', false, 3)]);
    expect(item(applyQueue(tables, queue, 'h1'), 'i2')).toMatchObject({
      checked: false,
      checked_at: null,
      checked_by: null,
    });
  });

  it('toggling back to the state the item had when first queued leaves nothing to send', () => {
    const tables = base();
    let queue = enqueue([], check('i1', true), item(tables, 'i1'));
    queue = enqueue(queue, check('i1', false), item(tables, 'i1'));
    expect(queue).toEqual([]);
  });

  it('a tap that does not change the base state is not queued', () => {
    expect(enqueue([], check('i2', true, 3), item(base(), 'i2'))).toEqual([]);
  });

  it('never coalesces across an add', () => {
    const tables = base();
    const add = addEntry('t1', [contribution('k1', 'Milch')]);
    const queue = enqueue([check('i1', true), add], check('i1', false), item(tables, 'i1'));
    expect(queue).toEqual([check('i1', true), add, check('i1', false)]);
  });

  it('coalesces checks of an item created offline after the add that created it', () => {
    const add = addEntry('t1', [contribution('k1', 'Tahini')]);
    let queue = enqueue([add], check('t1', true), undefined);
    expect(queue).toEqual([add, check('t1', true)]);
    queue = enqueue(queue, check('t1', false), undefined);
    expect(queue).toEqual([add]);
  });

  it('AC-025: checking an item that was deleted meanwhile changes nothing', () => {
    const tables = base();
    expect(queueEffect(check('gone', true), tables, 'h1')).toBe(tables);
  });

  it('AC-024: the queue survives a reload (serialised) and still shows three checked items', () => {
    const tables = base();
    tables.shopping_items = {
      ...tables.shopping_items,
      i3: shoppingItem('i3', 'bread'),
      i4: shoppingItem('i4', 'eggs'),
    };
    let queue: StoreQueueEntry[] = [];
    for (const id of ['i1', 'i3', 'i4']) queue = enqueue(queue, check(id, true), item(tables, id));

    const reloaded = JSON.parse(JSON.stringify(queue)) as StoreQueueEntry[];
    const visible = applyQueue(tables, reloaded, 'h1');
    expect(['i1', 'i3', 'i4'].map((id) => item(visible, id)?.checked)).toEqual([true, true, true]);
    expect(reloaded).toEqual(queue);
  });
});

describe('enqueue and queueEffect: not available and area', () => {
  it('"nicht da" toggles coalesce like checks', () => {
    const tables = base();
    const on: StoreQueueEntry = { kind: 'notAvailable', itemId: 'i1', value: true };
    let queue = enqueue([], on, item(tables, 'i1'));
    expect(item(applyQueue(tables, queue, 'h1'), 'i1')?.not_available).toBe(true);
    queue = enqueue(
      queue,
      { kind: 'notAvailable', itemId: 'i1', value: false },
      item(tables, 'i1'),
    );
    expect(queue).toEqual([]);
  });

  it('assigning an area keeps only the last choice and vanishes when back at the base area', () => {
    const tables = base();
    const article = tables.articles?.milk;
    let queue = enqueue([], { kind: 'assignArea', articleId: 'milk', areaId: 'a1' }, article);
    queue = enqueue(queue, { kind: 'assignArea', articleId: 'milk', areaId: 'a2' }, article);
    expect(queue).toEqual([{ kind: 'assignArea', articleId: 'milk', areaId: 'a2' }]);
    expect(applyQueue(tables, queue, 'h1').articles?.milk?.area_id).toBe('a2');

    queue = enqueue(queue, { kind: 'assignArea', articleId: 'milk', areaId: null }, article);
    expect(queue).toEqual([]);
  });

  it('an area for an article that is gone changes nothing', () => {
    const tables = base();
    expect(queueEffect({ kind: 'assignArea', articleId: 'gone', areaId: 'a1' }, tables, 'h1')).toBe(
      tables,
    );
  });
});

describe('queueEffect: adding', () => {
  it('appends to the open item of the article found by name key or synonym key', () => {
    const tables = base();
    tables.shopping_items = { ...tables.shopping_items, i3: shoppingItem('i3', 'bread') };
    const next = queueEffect(
      addEntry('t1', [contribution('k1', 'Baguette', { count: 2, note: 'hell' })]),
      tables,
      'h1',
    );
    expect(next.shopping_items?.t1).toBeUndefined();
    expect(next.shopping_contributions?.k1).toEqual({
      id: 'k1',
      item_id: 'i3',
      source: { kind: 'manual' },
      count: 2,
      qty: null,
      unit: null,
      note: 'hell',
    });
  });

  it('reopens a checked item with only the new contribution', () => {
    const next = queueEffect(addEntry('t1', [contribution('k1', 'Butter')]), base(), 'h1');
    expect(item(next, 'i2')).toMatchObject({
      checked: false,
      checked_at: null,
      checked_by: null,
      not_available: false,
    });
    expect(Object.keys(next.shopping_contributions ?? {})).toEqual(['k1']);
  });

  it('creates a new item, and an article for an unknown name, under the client ids', () => {
    const next = queueEffect(
      addEntry('t1', [contribution('k1', 'Tahini', { qty: 300, unit: 'g' })]),
      base(),
      'h1',
    );
    expect(next.articles?.['art-t1']).toMatchObject({ name: 'Tahini', name_key: 'tahini' });
    expect(item(next, 't1')).toMatchObject({
      household_id: 'h1',
      article_id: 'art-t1',
      checked: false,
      check_seq: 0,
    });
    expect(next.shopping_contributions?.k1).toMatchObject({ item_id: 't1', qty: 300, unit: 'g' });
  });

  it('AC-023: two offline adds of the same name end up as one item with both contributions', () => {
    const queue = [
      addEntry('t1', [contribution('k1', 'Brot')]),
      addEntry('t2', [contribution('k2', 'Brot', { count: 2 })]),
    ];
    const visible = applyQueue(base(), queue, 'h1');
    const bread = Object.values(visible.shopping_items ?? {}).filter(
      (row) => row.article_id === 'bread',
    );
    expect(bread.map((row) => row.id)).toEqual(['t1']);
    const contributions = Object.values(visible.shopping_contributions ?? {}).filter(
      (row) => row.item_id === 't1',
    );
    expect(contributions.map((row) => row.id)).toEqual(['k1', 'k2']);
  });

  it('ADR-0012: an add for another household changes nothing in this household', () => {
    const tables = base();
    const entry = { ...addEntry('t1', [contribution('k1', 'Brot')]), householdId: 'h2' };
    expect(queueEffect(entry, tables, 'h1')).toBe(tables);
  });

  it('rejects an add whose contributions name different articles, or none', () => {
    expect(() =>
      enqueue(
        [],
        addEntry('t1', [contribution('k1', 'Brot'), contribution('k2', 'Milch')]),
        undefined,
      ),
    ).toThrow(/one article/);
    expect(() => enqueue([], addEntry('t1', []), undefined)).toThrow(/one article/);
  });
});

describe('remapQueue', () => {
  it('rewrites temporary item and article ids to the ones the server returned', () => {
    const untouched = check('i1', true);
    const queue: StoreQueueEntry[] = [
      check('t1', true),
      { kind: 'notAvailable', itemId: 't1', value: true },
      { kind: 'assignArea', articleId: 'art-t1', areaId: 'a1' },
      untouched,
    ];
    const next = remapQueue(queue, { t1: 'real-item', 'art-t1': 'real-article' });
    expect(next).toEqual([
      check('real-item', true),
      { kind: 'notAvailable', itemId: 'real-item', value: true },
      { kind: 'assignArea', articleId: 'real-article', areaId: 'a1' },
      untouched,
    ]);
    expect(next[3]).toBe(untouched);
  });
});

describe('parseStoredQueue', () => {
  it('AC-024: keeps every valid entry of a stored queue, in order', () => {
    const queue: StoreQueueEntry[] = [
      check('i1', true, 2),
      { kind: 'notAvailable', itemId: 'i1', value: true },
      addEntry('t1', [contribution('k1', 'Milch', { count: 2, unit: 'l', note: 'bio' })]),
      { kind: 'assignArea', articleId: 'milk', areaId: null },
    ];
    expect(parseStoredQueue(JSON.parse(JSON.stringify(queue)))).toEqual({
      entries: queue,
      dropped: 0,
    });
  });

  it('nothing stored is an empty queue, not a loss', () => {
    expect(parseStoredQueue(undefined)).toEqual({ entries: [], dropped: 0 });
  });

  it('drops entries that do not have the shape of a store action and counts them', () => {
    const valid = check('i1', true);
    const stored: unknown[] = [
      { kind: 'check', itemId: 'i2', checked: 'yes', seenCheckSeq: 0 },
      valid,
      { kind: 'delete', itemId: 'i1' },
      { kind: 'assignArea', articleId: 'milk' },
      addEntry('t1', [contribution('k1', 'Milch'), contribution('k2', 'Brot')]),
      addEntry('t2', []),
      'check',
      null,
    ];
    expect(parseStoredQueue(stored)).toEqual({ entries: [valid], dropped: 7 });
  });

  it('a stored value that is no list at all counts as one lost entry', () => {
    expect(parseStoredQueue({ kind: 'check' })).toEqual({ entries: [], dropped: 1 });
  });
});

function packingItemRow(id: string, rest: Partial<Row> = {}): Row {
  return {
    id,
    household_id: 'h1',
    list_bag_id: 'l1',
    name: id,
    quantity: null,
    per_day: null,
    packed: false,
    packed_at: null,
    packed_by: null,
    pack_seq: 0,
    sort: 0,
    ...rest,
  };
}

function packingTables(): TableRows {
  return {
    packing_items: {
      p1: packingItemRow('p1'),
      p2: packingItemRow('p2'),
      p3: packingItemRow('p3'),
      p4: packingItemRow('p4'),
      p5: packingItemRow('p5'),
      ladekabel: packingItemRow('ladekabel', {
        packed: true,
        packed_at: '2026-12-30T09:00:00Z',
        packed_by: 'p2',
        pack_seq: 3,
      }),
    },
  };
}

const pack = (
  itemId: string,
  packed: boolean,
  seenPackSeq = 0,
  householdId = 'h1',
): Extract<StoreQueueEntry, { kind: 'pack' }> => ({
  kind: 'pack',
  householdId,
  itemId,
  packed,
  seenPackSeq,
});

const packed = (tables: TableRows, id: string) => tables.packing_items?.[id]?.packed;

describe('enqueue and queueEffect: packing (ADR-0013)', () => {
  it('AC-021: packing and unpacking again before sending leaves nothing in the queue', () => {
    const tables = packingTables();
    let queue = enqueue([], pack('p1', true), tables.packing_items?.p1);
    expect(queue).toEqual([pack('p1', true)]);
    queue = enqueue(queue, pack('p1', false), tables.packing_items?.p1);
    expect(queue).toEqual([]);
  });

  it('AC-022: five Packstücke packed offline are five entries, visible and kept over a reload', () => {
    const tables = packingTables();
    let queue: StoreQueueEntry[] = [];
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    for (const id of ids) queue = enqueue(queue, pack(id, true), tables.packing_items?.[id]);
    expect(queue).toHaveLength(5);

    const reloaded = parseStoredQueue(JSON.parse(JSON.stringify(queue)));
    expect(reloaded).toEqual({ entries: queue, dropped: 0 });
    const visible = applyQueue(tables, reloaded.entries, 'h1');
    expect(ids.map((id) => packed(visible, id))).toEqual([true, true, true, true, true]);
  });

  it('AC-023: unpacking queues the pack_seq that was seen and clears who and when', () => {
    const tables = packingTables();
    const queue = enqueue([], pack('ladekabel', false, 3), tables.packing_items?.ladekabel);
    expect(queue).toEqual([pack('ladekabel', false, 3)]);
    expect(applyQueue(tables, queue, 'h1').packing_items?.ladekabel).toMatchObject({
      packed: false,
      packed_at: null,
      packed_by: null,
      pack_seq: 3,
    });
  });

  it('a pack that does not change the base state is not queued', () => {
    const tables = packingTables();
    expect(enqueue([], pack('ladekabel', true, 3), tables.packing_items?.ladekabel)).toEqual([]);
  });

  it('packing and checking the same id are separate actions', () => {
    const queue = enqueue([check('p1', true)], pack('p1', true), packingTables().packing_items?.p1);
    expect(queue).toEqual([check('p1', true), pack('p1', true)]);
  });

  it('AC-024, AC-040: packing a Packstück that is gone meanwhile changes nothing', () => {
    const tables = packingTables();
    expect(queueEffect(pack('gone', true), tables, 'h1')).toBe(tables);
  });

  it('ADR-0012: a pack entry of another household changes nothing in this household', () => {
    const tables = packingTables();
    expect(queueEffect(pack('p1', true, 0, 'h2'), tables, 'h1')).toBe(tables);
  });

  it('pack entries keep their ids when temporary ids are remapped', () => {
    const entry = pack('p1', true);
    expect(remapQueue([entry], { p1: 'other' })).toEqual([entry]);
  });
});

describe('packBatch (ADR-0013)', () => {
  it('AC-026: a contiguous run of pack entries at the front goes as one call', () => {
    const run = [pack('p1', true), pack('p2', true), pack('p3', true)];
    expect(packBatch([...run, check('i1', true), pack('p4', true)])).toEqual(run);
  });

  it('stops at a check, an add and an entry of another household', () => {
    const add = addEntry('t1', [contribution('k1', 'Milch')]);
    expect(packBatch([pack('p1', true), add, pack('p2', true)])).toEqual([pack('p1', true)]);
    expect(packBatch([pack('p1', true), pack('p2', true, 0, 'h2')])).toEqual([pack('p1', true)]);
    expect(packBatch([check('i1', true), pack('p1', true)])).toEqual([]);
    expect(packBatch([])).toEqual([]);
  });

  it('cuts a run after 200 entries', () => {
    const queue = Array.from({ length: 230 }, (_, index) => pack(`p${index}`, true));
    expect(PACK_BATCH_LIMIT).toBe(200);
    expect(packBatch(queue)).toEqual(queue.slice(0, 200));
  });

  it('security check 0012: stops before a second entry for the same Packstück', () => {
    const queue = [pack('p1', true), pack('p2', true), pack('p1', false, 1), pack('p3', true)];
    expect(packBatch(queue)).toEqual([pack('p1', true), pack('p2', true)]);
  });
});

describe('requeue (security check 0012: transient failure while sending)', () => {
  it('AC-027: a counter entry queued during the failed run cancels its sent entry', () => {
    const sent = [pack('p1', true), pack('p2', true), pack('p3', true)];
    const queued = [pack('p2', false), check('i1', true)];
    expect(requeue(sent, queued)).toEqual([pack('p1', true), pack('p3', true), check('i1', true)]);
    expect(packBatch(requeue(sent, queued))).toEqual([pack('p1', true), pack('p3', true)]);
  });

  it('a check counter entry cancels the sent check the same way', () => {
    expect(requeue([check('i1', true)], [check('i1', false), check('i2', true)])).toEqual([
      check('i2', true),
    ]);
  });

  it('keeps the sent entries in front and in order when nothing cancels', () => {
    const sent = [pack('p1', true), pack('p2', true)];
    const queued = [pack('p3', true), check('i1', true)];
    expect(requeue(sent, queued)).toEqual([...sent, ...queued]);
  });

  it('never merges across an add, so the order relative to it is kept', () => {
    const add = addEntry('t9', [contribution('c9', 'Salz')]);
    expect(requeue([check('i1', true)], [add, check('i1', false)])).toEqual([
      check('i1', true),
      add,
      check('i1', false),
    ]);
  });
});

describe('parseStoredQueue: packing', () => {
  it('a stored queue from before packing reads unchanged', () => {
    const old: StoreQueueEntry[] = [
      check('i1', true, 2),
      { kind: 'notAvailable', itemId: 'i1', value: true },
    ];
    expect(parseStoredQueue(JSON.parse(JSON.stringify(old)))).toEqual({ entries: old, dropped: 0 });
  });

  it('broken pack entries are counted and dropped', () => {
    const valid = pack('p1', true, 2);
    const stored: unknown[] = [
      valid,
      { kind: 'pack', householdId: 'h1', itemId: 'p2', packed: 'yes', seenPackSeq: 0 },
      { kind: 'pack', householdId: 'h1', itemId: 'p3', packed: true, seenPackSeq: -1 },
      { kind: 'pack', householdId: 'h1', itemId: 'p4', packed: true, seenPackSeq: 1.5 },
      { kind: 'pack', householdId: '', itemId: 'p5', packed: true, seenPackSeq: 0 },
      { kind: 'pack', itemId: 'p6', packed: true, seenPackSeq: 0 },
      { kind: 'pack', householdId: 'h1', itemId: '', packed: false, seenPackSeq: 0 },
    ];
    expect(parseStoredQueue(stored)).toEqual({ entries: [valid], dropped: 6 });
  });
});

describe('unsentChangeCount and signOutWarning: sign-out with unsent changes (spec 0018, REQ-005)', () => {
  it('AC-013: counts every waiting entry of the store queue, store actions and packing', () => {
    const queue: StoreQueueEntry[] = [
      check('i1', true),
      { kind: 'notAvailable', itemId: 'i2', value: true },
      addEntry('t1', [contribution('c1', 'Salz')]),
      { kind: 'assignArea', articleId: 'milk', areaId: 'a1' },
      pack('p1', true),
      pack('p2', true),
    ];
    expect(unsentChangeCount(queue)).toBe(6);
  });

  it('AC-013: three checks offline are "3 Änderungen"', () => {
    const queue = [check('i1', true), check('i2', true), check('i3', true)];
    expect(signOutWarning(unsentChangeCount(queue))).toBe(
      '3 Änderungen sind noch nicht gesendet. Beim Abmelden gehen sie verloren.',
    );
  });

  it('AC-013: one waiting change is named in the singular', () => {
    expect(signOutWarning(unsentChangeCount([pack('p1', true)]))).toBe(
      '1 Änderung ist noch nicht gesendet. Beim Abmelden geht sie verloren.',
    );
  });

  it('AC-014: an empty queue needs no question', () => {
    expect(unsentChangeCount([])).toBe(0);
    expect(signOutWarning(0)).toBeUndefined();
  });
});
