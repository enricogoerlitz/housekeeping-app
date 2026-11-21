import { describe, expect, it } from 'vitest';

import {
  applyQueue,
  enqueue,
  queueEffect,
  remapQueue,
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
