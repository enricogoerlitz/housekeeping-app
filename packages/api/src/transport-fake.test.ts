import { normalizeText, type Row, type RowOp } from '@housekeeping/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeServer, type FakeServer } from './transport-fake';
import { TransportError, type AddEntry } from './transport';

const ENRICO = 'u-enrico';
const NADJA = 'u-nadja';
const STRANGER = 'u-stranger';
const H = 'h-1';

let server: FakeServer;

function seed() {
  server = createFakeServer();
  server.addProfile({ id: ENRICO, name: 'Enrico', email: 'enrico@example.com' });
  server.addProfile({ id: NADJA, name: 'Nadja', email: 'nadja@example.com' });
  server.addProfile({ id: STRANGER, name: 'Fremd', email: 'fremd@example.com' });
  server.addHousehold({ id: H, name: 'Enrico & Nadja' }, [ENRICO, NADJA]);
  server.insertRows(H, {
    articles: [
      {
        id: 'a-milk',
        name: 'Milch',
        name_key: normalizeText('Milch'),
        synonyms: ['Vollmilch'],
        synonym_keys: [normalizeText('Vollmilch')],
        area_id: null,
        diet: 'vegetarian',
        is_pantry: false,
      },
    ],
    shopping_items: [{ id: 'i-milk', article_id: 'a-milk' }],
    shopping_contributions: [
      { id: 'c-milk', item_id: 'i-milk', source: { kind: 'manual' }, count: 1 },
    ],
    recipes: [{ id: 'r1', title: 'Dal', servings: 2, course: 'main' }],
    restaurants: [{ id: 'rest1', name: 'Trattoria' }],
  });
}

const weekly = { type: 'weekly', every: 1, weekdays: [5] };

/** A complete_chore op as the app sends it, for a chore never done and not yet due. */
const completion = (choreId: string, eventId: string, extra: Record<string, unknown> = {}) => ({
  chore_id: choreId,
  event_id: eventId,
  kind: 'done',
  done_on: '2026-11-20',
  done_by: ENRICO,
  seen: { next_due_on: null, last_done_on: null, next_assignee_id: null, latest_event_id: null },
  next_due_on: '2026-11-27',
  next_assignee_id: null,
  ...extra,
});

const entry = (name: string, contributionId: string): AddEntry => ({
  client_item_id: `item-${contributionId}`,
  client_article_id: `article-${contributionId}`,
  article_name: name,
  name_key: normalizeText(name),
  contributions: [
    { id: contributionId, source: { kind: 'manual' }, count: 1, qty: null, unit: null, note: null },
  ],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
  seed();
});

describe('fake server: store RPCs ("Abhaken gewinnt", sync.md)', () => {
  it('checks, and unchecks only while check_seq is still the one seen', async () => {
    const enrico = server.transport(ENRICO);
    const nadja = server.transport(NADJA);
    expect(await enrico.setItemChecked('i-milk', true, 0)).toEqual({
      item_id: 'i-milk',
      checked: true,
      check_seq: 1,
    });
    expect(server.row(H, 'shopping_items', 'i-milk')).toMatchObject({ checked_by: ENRICO });
    // Nadja unchecks, then checks again: the seq moved on.
    await nadja.setItemChecked('i-milk', false, 1);
    await nadja.setItemChecked('i-milk', true, 2);
    // Enrico's offline uncheck still carries seq 1: checking wins.
    expect(await enrico.setItemChecked('i-milk', false, 1)).toMatchObject({ checked: true });
    expect(await enrico.setItemChecked('i-milk', false, 3)).toMatchObject({
      checked: false,
      check_seq: 4,
    });
  });

  it('answers null for an item that is gone, and for one of a foreign household', async () => {
    expect(await server.transport(ENRICO).setItemChecked('nope', true, 0)).toBeNull();
    expect(await server.transport(STRANGER).setItemChecked('i-milk', true, 0)).toBeNull();
    expect(await server.transport(STRANGER).setItemNotAvailable('i-milk', true)).toBeNull();
  });

  it('adds to the open item, resolves synonyms and is idempotent per contribution id', async () => {
    const enrico = server.transport(ENRICO);
    const [result] = await enrico.addShoppingContributions(H, [entry('Vollmilch', 'c-new')]);
    expect(result).toMatchObject({ item_id: 'i-milk', article_id: 'a-milk' });
    await enrico.addShoppingContributions(H, [entry('Vollmilch', 'c-new')]);
    expect(
      server.rows(H, 'shopping_contributions').filter((c) => c.item_id === 'i-milk'),
    ).toHaveLength(2);

    const [bread] = await enrico.addShoppingContributions(H, [entry('Brot', 'c-bread')]);
    expect(bread).toMatchObject({
      item_id: 'item-c-bread',
      article_id: 'article-c-bread',
    });
    expect(server.row(H, 'articles', 'article-c-bread')).toMatchObject({
      name: 'Brot',
      diet: 'unknown',
      area_id: null,
    });
  });

  it('reopens a checked item with only the new contribution and bumps check_seq', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setItemChecked('i-milk', true, 0);
    await enrico.addShoppingContributions(H, [entry('Milch', 'c-again')]);
    expect(server.row(H, 'shopping_items', 'i-milk')).toMatchObject({
      checked: false,
      check_seq: 2,
    });
    expect(server.rows(H, 'shopping_contributions').map((c) => c.id)).toEqual(['c-again']);
  });

  it('clears checked items and returns them for undo', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setItemChecked('i-milk', true, 0);
    const cleared = await enrico.clearCheckedItems(H);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.item).toMatchObject({ id: 'i-milk' });
    expect(cleared[0]?.contributions).toHaveLength(1);
    expect(server.rows(H, 'shopping_items')).toEqual([]);

    expect(await enrico.restoreClearedItems(H, cleared)).toBe(1);
    expect(await enrico.restoreClearedItems(H, cleared)).toBe(0);
    expect(server.row(H, 'shopping_items', 'i-milk')).toMatchObject({ checked: true });
    expect(server.rows(H, 'shopping_contributions')).toHaveLength(1);
  });

  it('assigns an area only when article and area exist', async () => {
    const enrico = server.transport(ENRICO);
    expect(await enrico.assignArticleArea('a-milk', 'no-area')).toBeNull();
    expect(await enrico.assignArticleArea('a-milk', null)).toEqual({
      article_id: 'a-milk',
      area_id: null,
    });
  });

  it('what one call adds, one call removes: up to 1000 contributions (like the database)', async () => {
    const transport = server.transport(ENRICO);
    const bulk = (key: string, count: number): AddEntry => ({
      ...entry(`Artikel ${key}`, `c-${key}`),
      contributions: Array.from({ length: count }, (_, index) => ({
        id: `c-${key}-${index}`,
        source: { kind: 'manual' },
        count: 1,
        qty: null,
        unit: null,
        note: null,
      })),
    });
    const keys = Array.from({ length: 10 }, (_, index) => `k${index}`);
    await expect(
      transport.addShoppingContributions(H, [...keys.map((key) => bulk(key, 100)), bulk('x', 1)]),
    ).rejects.toMatchObject({ code: 'too_many_changes' });
    await transport.addShoppingContributions(
      H,
      keys.map((key) => bulk(key, 100)),
    );
    const ids = keys.flatMap((key) =>
      Array.from({ length: 100 }, (_, index) => `c-${key}-${index}`),
    );
    await expect(transport.removeContributions([...ids, 'c-extra'])).rejects.toMatchObject({
      code: 'too_many_changes',
    });
    expect(await transport.removeContributions(ids)).toBe(1000);
    expect(server.rows(H, 'shopping_items').map((row) => row.id)).toEqual(['i-milk']);
  });

  it('removes contributions and items that became empty', async () => {
    expect(await server.transport(ENRICO).removeContributions(['c-milk'])).toBe(1);
    expect(server.rows(H, 'shopping_items')).toEqual([]);
  });
});

describe('fake server: apply_changes (ADR-0011)', () => {
  it('applies inserts, patches and deletes in one go and sets the server columns', async () => {
    const ops: RowOp[] = [
      { kind: 'insert', table: 'recipes', row: { id: 'r2', title: 'Curry', course: 'main' } },
      { kind: 'patch', table: 'recipes', id: 'r1', changes: { title: 'Linsen-Dal' } },
      { kind: 'patch', table: 'households', id: H, changes: { name: 'Zuhause' } },
    ];
    expect(await server.transport(ENRICO).applyChanges(H, ops)).toMatchObject({ applied: 3 });
    expect(server.row(H, 'recipes', 'r2')).toMatchObject({
      household_id: H,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(server.row(H, 'recipes', 'r1')).toMatchObject({ title: 'Linsen-Dal' });
  });

  it.each([
    ['unknown table', { kind: 'insert', table: 'profiles', row: { id: 'x' } }, 'invalid_change'],
    [
      'store-only column',
      { kind: 'patch', table: 'shopping_items', id: 'i-milk', changes: { checked: true } },
      'invalid_change',
    ],
    [
      'server column',
      { kind: 'patch', table: 'recipes', id: 'r1', changes: { updated_at: 'x' } },
      'invalid_change',
    ],
    [
      'patch of a missing row',
      { kind: 'patch', table: 'recipes', id: 'gone', changes: { title: 'x' } },
      'row_not_found',
    ],
    [
      'foreign household_id',
      { kind: 'insert', table: 'recipes', row: { id: 'r9', household_id: 'h-2', title: 'x' } },
      'invalid_change',
    ],
  ] as const)('rejects %s and changes nothing (AC-020)', async (_, op, code) => {
    const valid: RowOp = {
      kind: 'insert',
      table: 'recipes',
      row: { id: 'r3', title: 'Erst gültig' },
    };
    await expect(
      server.transport(ENRICO).applyChanges(H, [valid, op as RowOp]),
    ).rejects.toMatchObject({ kind: 'permanent', code });
    expect(server.row(H, 'recipes', 'r3')).toBeUndefined();
  });

  it('rejects writes into a household the caller is not a member of', async () => {
    await expect(
      server
        .transport(STRANGER)
        .applyChanges(H, [
          { kind: 'patch', table: 'recipes', id: 'r1', changes: { title: 'Gekapert' } },
        ]),
    ).rejects.toMatchObject({ kind: 'permanent', code: 'not_member' });
  });

  it('rejects too many deletes', async () => {
    const deletes: RowOp[] = Array.from({ length: 21 }, (_, index) => ({
      kind: 'delete',
      table: 'restaurants',
      id: `r-${index}`,
    }));
    await expect(server.transport(ENRICO).applyChanges(H, deletes)).rejects.toMatchObject({
      code: 'too_many_changes',
    });
  });

  it('counts the ids of remove_contributions as deletes (like the database)', async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `c-${index}`);
    await expect(
      server.transport(ENRICO).applyChanges(H, [{ kind: 'remove_contributions', ids }]),
    ).rejects.toMatchObject({ code: 'too_many_changes' });
  });

  it('counts the entries of add_contributions as ops (like the database)', async () => {
    const inserts: RowOp[] = Array.from({ length: 150 }, (_, index) => ({
      kind: 'insert',
      table: 'areas',
      row: { id: `area-${index}`, name: `Gang ${index}`, sort: index },
    }));
    const entries = Array.from({ length: 51 }, (_, index) =>
      entry(`Artikel ${index}`, `c-${index}`),
    );
    await expect(
      server
        .transport(ENRICO)
        .applyChanges(H, [...inserts, { kind: 'add_contributions', entries }]),
    ).rejects.toMatchObject({ code: 'too_many_changes' });
    expect(server.row(H, 'areas', 'area-0')).toBeUndefined();
  });

  it('allows 200 add entries in one call', async () => {
    const entries = Array.from({ length: 200 }, (_, index) =>
      entry(`Artikel ${index}`, `c-${index}`),
    );
    await expect(
      server.transport(ENRICO).applyChanges(H, [{ kind: 'add_contributions', entries }]),
    ).resolves.toMatchObject({ applied: 1 });
  });

  it('caps the contributions of one call at 500 (like the database)', async () => {
    const big = (key: string, count: number): AddEntry => ({
      ...entry(`Artikel ${key}`, `c-${key}`),
      contributions: Array.from({ length: count }, (_, index) => ({
        id: `c-${key}-${index}`,
        source: { kind: 'manual' },
        count: 1,
        qty: null,
        unit: null,
        note: null,
      })),
    });
    const transport = server.transport(ENRICO);
    await expect(
      transport.applyChanges(H, [
        {
          kind: 'add_contributions',
          entries: ['a', 'b', 'c'].map((k) => big(k, 100)),
        },
        {
          kind: 'add_contributions',
          entries: [big('d', 100), big('e', 100), big('f', 1)],
        },
      ]),
    ).rejects.toMatchObject({ code: 'too_many_changes' });
    await expect(
      transport.applyChanges(H, [
        {
          kind: 'add_contributions',
          entries: ['a', 'b', 'c', 'd', 'e'].map((k) => big(k, 100)),
        },
      ]),
    ).resolves.toMatchObject({ applied: 1 });
  });

  it('can be told to fail, before or after applying', async () => {
    const op: RowOp = { kind: 'patch', table: 'recipes', id: 'r1', changes: { title: 'A' } };
    server.failNext('apply_changes', new TransportError('permanent', 'boom'));
    await expect(server.transport(ENRICO).applyChanges(H, [op])).rejects.toMatchObject({
      code: 'boom',
    });
    expect(server.row(H, 'recipes', 'r1')).toMatchObject({ title: 'Dal' });

    server.failNext('apply_changes', new TransportError('transient', 'network'), {
      afterApply: true,
    });
    await expect(server.transport(ENRICO).applyChanges(H, [op])).rejects.toMatchObject({
      kind: 'transient',
    });
    expect(server.row(H, 'recipes', 'r1')).toMatchObject({ title: 'A' });
  });
});

describe('fake server: sync_pull', () => {
  it('sends changed rows and tombstones since the cursor, small tables in full', async () => {
    const enrico = server.transport(ENRICO);
    const first = await enrico.syncPull({ households: { [H]: { full: true } } });
    expect(first.households[H]?.full).toBe(true);
    expect(first.households[H]?.rows.recipes).toHaveLength(1);
    expect(first.small.household_members).toHaveLength(2);
    expect(first.small.profiles?.map((profile) => profile.id).sort()).toEqual([ENRICO, NADJA]);

    vi.setSystemTime(new Date('2026-11-20T10:05:00Z'));
    await server
      .transport(NADJA)
      .applyChanges(H, [{ kind: 'delete', table: 'restaurants', id: 'rest1' }]);
    const delta = await enrico.syncPull({
      households: { [H]: { full: false, since: { restaurants: first.serverTime } } },
    });
    expect(delta.households[H]?.rows.restaurants).toEqual([]);
    expect(delta.households[H]?.tombstones).toEqual([
      { table: 'restaurants', id: 'rest1', deletedAt: expect.any(String) },
    ]);
  });

  it('gives composite-key rows their "a:b" id', async () => {
    await server.transport(NADJA).setRecipeFavorite('r1', true);
    const pull = await server.transport(ENRICO).syncPull({ households: { [H]: { full: true } } });
    expect(pull.households[H]?.rows.recipe_favorites?.[0]).toMatchObject({
      id: `r1:${NADJA}`,
      member_id: NADJA,
    });
  });

  it('answers only households the caller belongs to', async () => {
    const pull = await server.transport(STRANGER).syncPull({ households: { [H]: { full: true } } });
    expect(pull.households).toEqual({});
    expect(pull.small.households).toEqual([]);
  });

  it('signals subscribers of the household after a write', async () => {
    const signal = vi.fn();
    server.transport(NADJA).subscribe(H, signal);
    await server.transport(ENRICO).setItemChecked('i-milk', true, 0);
    await Promise.resolve();
    expect(signal).toHaveBeenCalled();
  });
});

describe('fake server: households and invitations', () => {
  it('invites by address, rejects an invalid one and lets the invited person accept', async () => {
    const enrico = server.transport(ENRICO);
    await expect(enrico.inviteMember(H, 'nadja@')).rejects.toMatchObject({
      code: 'invalid_email',
    });
    const created = await enrico.createHousehold('WG Köln', null);
    const invitation = await enrico.inviteMember(created, 'Nadja@Example.com');
    await server.transport(NADJA).acceptInvitation(invitation);
    const pull = await server.transport(NADJA).syncPull({ households: {} });
    expect(
      pull.small.household_members?.filter((member) => member.household_id === created),
    ).toHaveLength(2);
  });

  it('removes a member, but never the last one', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.removeMember(H, NADJA);
    await expect(enrico.removeMember(H, ENRICO)).rejects.toMatchObject({ code: 'last_member' });
  });
});

describe('fake server: foreign keys like the database (spec 0003, T3)', () => {
  const plan = (id: string, row: Record<string, unknown>) => ({
    kind: 'insert' as const,
    table: 'meal_plan_entries',
    row: { id, slot_id: 's1', eater_ids: [], ...row },
  });

  it('refuses to delete a restaurant that is in the plan (on delete restrict)', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [plan('e1', { kind: 'restaurant', restaurant_id: 'rest1' })]);
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'restaurants', id: 'rest1' }]),
    ).rejects.toMatchObject({
      kind: 'permanent',
      code: '23503',
      constraint: 'meal_plan_entries_restaurant_fkey',
    });
    await enrico.applyChanges(H, [
      { kind: 'delete', table: 'meal_plan_entries', id: 'e1' },
      { kind: 'delete', table: 'restaurants', id: 'rest1' },
    ]);
    expect(server.row(H, 'restaurants', 'rest1')).toBeUndefined();
  });

  it('spec 0008, E2: never deletes a recipe through apply_changes (delete_recipe only)', async () => {
    await expect(
      server.transport(ENRICO).applyChanges(H, [{ kind: 'delete', table: 'recipes', id: 'r1' }]),
    ).rejects.toMatchObject({ kind: 'permanent', code: 'invalid_change' });
    expect(server.row(H, 'recipes', 'r1')).toBeDefined();
  });

  it('refuses to delete an article directly (delete_article only), and a reference to a missing row', async () => {
    const enrico = server.transport(ENRICO);
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'articles', id: 'a-milk' }]),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    await expect(
      enrico.applyChanges(H, [plan('e2', { kind: 'recipe', recipe_id: 'r-missing' })]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('clears leftovers links and chore links (on delete set null) and checks the leftovers rule', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [
      plan('e1', { kind: 'text', text: 'Gulasch' }),
      plan('e2', { kind: 'leftovers', recipe_id: 'r1', leftovers_of_entry_id: 'e1' }),
      plan('e3', { kind: 'leftovers', leftovers_of_entry_id: 'e1' }),
    ]);
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'meal_plan_entries', id: 'e1' }]),
    ).rejects.toMatchObject({ code: '23514' });
    await enrico.applyChanges(H, [
      { kind: 'delete', table: 'meal_plan_entries', id: 'e3' },
      { kind: 'delete', table: 'meal_plan_entries', id: 'e1' },
    ]);
    expect(server.row(H, 'meal_plan_entries', 'e2')).toMatchObject({
      leftovers_of_entry_id: null,
    });

    await enrico.applyChanges(H, [
      { kind: 'insert', table: 'chores', row: { id: 'c1', title: 'Bad', recurrence: weekly } },
      { kind: 'complete_chore', completion: completion('c1', 'ev1') as never },
      { kind: 'delete', table: 'chores', id: 'c1' },
    ]);
    expect(server.row(H, 'chore_events', 'ev1')).toMatchObject({ chore_id: null, title: 'Bad' });
  });
});

describe('fake server: per-member RPCs and edge functions', () => {
  it('can make a favourite fail like any other RPC', async () => {
    server.failNext('set_recipe_favorite', new TransportError('permanent', 'recipe_not_found'));
    await expect(server.transport(ENRICO).setRecipeFavorite('r1', true)).rejects.toMatchObject({
      code: 'recipe_not_found',
    });
    expect(server.calls.at(-1)).toEqual({ userId: ENRICO, fn: 'set_recipe_favorite' });
  });

  it('resolves a known short link and refuses an unknown one with not_a_maps_link', async () => {
    const reply = { name: 'Café Fleur', mapsUrl: 'https://www.google.com/maps/place/Fleur' };
    server.setMapsLink('https://maps.app.goo.gl/abc', reply);
    const enrico = server.transport(ENRICO);
    await expect(enrico.resolveMapsLink('https://maps.app.goo.gl/abc')).resolves.toEqual(reply);
    await expect(enrico.resolveMapsLink('https://maps.app.goo.gl/x')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'not_a_maps_link',
      status: 422,
    });
  });
});

describe('fake server: activities and photos (spec 0004)', () => {
  const H2 = 'h-2';
  const activity = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    kind: 'insert' as const,
    table: 'activities',
    row: { id, name, name_key: normalizeText(name), tags: [], ...extra },
  });
  const jpeg = (size = 10) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

  it('sets the creator to the caller, refuses a second activity with the same name_key', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [activity('act1', 'Bouldern', { created_by: NADJA })]);
    expect(server.row(H, 'activities', 'act1')).toMatchObject({ created_by: ENRICO });
    await expect(enrico.applyChanges(H, [activity('act2', 'bouldern')])).rejects.toMatchObject({
      kind: 'permanent',
      code: '23505',
    });
  });

  it('protects a planned activity (restrict), deletes its favourites and ratings with it', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [
      activity('act1', 'Bouldern'),
      {
        kind: 'insert',
        table: 'meal_plan_entries',
        row: { id: 'e1', slot_id: 's1', kind: 'activity', activity_id: 'act1', eater_ids: [] },
      },
    ]);
    await enrico.setActivityFavorite('act1', true);
    await server.transport(NADJA).setActivityRating('act1', 4);
    expect(server.rows(H, 'activity_ratings')).toEqual([
      expect.objectContaining({ id: `act1:${NADJA}`, stars: 4 }),
    ]);
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'activities', id: 'act1' }]),
    ).rejects.toMatchObject({ code: '23503' });
    await enrico.applyChanges(H, [
      { kind: 'delete', table: 'meal_plan_entries', id: 'e1' },
      { kind: 'delete', table: 'activities', id: 'act1' },
    ]);
    expect(server.rows(H, 'activity_favorites')).toEqual([]);
    expect(server.rows(H, 'activity_ratings')).toEqual([]);
    await expect(enrico.setActivityRating('act1', 3)).rejects.toMatchObject({
      code: 'activity_not_found',
    });
    await expect(server.transport(STRANGER).setActivityFavorite('x', true)).rejects.toMatchObject({
      code: 'activity_not_found',
    });
  });

  it('accepts a photo_path only in the row’s own folder of its household, named <uuid>.jpg', async () => {
    const enrico = server.transport(ENRICO);
    const file = `${crypto.randomUUID()}.jpg`;
    await enrico.applyChanges(H, [
      activity('act1', 'Bouldern', { photo_path: `${H}/activities/act1/${file}` }),
    ]);
    for (const path of [
      `${H2}/activities/act1/${file}`,
      `${H}/recipes/act1/${file}`,
      `${H}/activities/act2/${file}`,
      `${H}/activities/act1/x/${file}`,
      `${H}/activities/act1/p.jpg`,
      `${H}/activities/act1/${file.toUpperCase().replace('.JPG', '.jpg')}`,
      `${H}/activities/act1/${file.replace('.jpg', '.png')}`,
      `${H}/activities/act1/${file}.html`,
    ]) {
      await expect(
        enrico.applyChanges(H, [
          { kind: 'patch', table: 'activities', id: 'act1', changes: { photo_path: path } },
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await enrico.applyChanges(H, [
      {
        kind: 'patch',
        table: 'recipes',
        id: 'r1',
        changes: { photo_path: `${H}/recipes/r1/${file}` },
      },
    ]);
    expect(server.row(H, 'recipes', 'r1')).toMatchObject({ photo_path: `${H}/recipes/r1/${file}` });
  });

  it('AC-012: stores photos per household; a stranger can neither read, write nor delete them', async () => {
    server.addHousehold({ id: H2, name: 'Fremd' }, [STRANGER]);
    const enrico = server.transport(ENRICO);
    const stranger = server.transport(STRANGER);
    const name = () => `${crypto.randomUUID()}.jpg`;
    const path = `${H}/activities/act1/${name()}`;
    await enrico.uploadMedia(path, jpeg());
    expect(server.media(path)?.size).toBe(10);
    expect((await server.transport(NADJA).downloadMedia(path)).size).toBe(10);

    await expect(stranger.downloadMedia(path)).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      stranger.uploadMedia(`${H}/activities/act1/${name()}`, jpeg()),
    ).rejects.toMatchObject({
      kind: 'permanent',
      code: 'access_denied',
      status: 403,
    });
    await stranger.removeMedia([path]);
    expect(server.media(path)).toBeDefined();
    await expect(enrico.uploadMedia(`${H2}/activities/a/${name()}`, jpeg())).rejects.toMatchObject({
      code: 'access_denied',
    });
    await expect(enrico.uploadMedia(`${H}/chores/a/${name()}`, jpeg())).rejects.toMatchObject({
      code: 'access_denied',
    });
    // Like the storage policies: the file name is <uuid>.jpg, nothing else.
    for (const file of ['p.jpg', `${crypto.randomUUID()}.svg`, `${crypto.randomUUID()}.jpg.html`]) {
      await expect(enrico.uploadMedia(`${H}/activities/a/${file}`, jpeg())).rejects.toMatchObject({
        code: 'access_denied',
      });
    }
  });

  it('a download whose signal aborted fails as aborted', async () => {
    const enrico = server.transport(ENRICO);
    const path = `${H}/activities/act1/${crypto.randomUUID()}.jpg`;
    await enrico.uploadMedia(path, jpeg());
    const stop = new AbortController();
    stop.abort();
    await expect(enrico.downloadMedia(path, stop.signal)).rejects.toMatchObject({
      kind: 'transient',
      code: 'aborted',
    });
  });

  it('refuses another type, more than 2 MiB and a second upload to the same name', async () => {
    const enrico = server.transport(ENRICO);
    const path = `${H}/recipes/r1/${crypto.randomUUID()}.jpg`;
    await expect(
      enrico.uploadMedia(path, new Blob(['<svg/>'], { type: 'image/svg+xml' })),
    ).rejects.toMatchObject({ code: 'invalid_mime', status: 415 });
    await expect(enrico.uploadMedia(path, jpeg(2 * 1024 * 1024 + 1))).rejects.toMatchObject({
      code: 'too_large',
      status: 413,
    });
    await enrico.uploadMedia(path, jpeg(2 * 1024 * 1024));
    await expect(enrico.uploadMedia(path, jpeg())).rejects.toMatchObject({
      code: 'already_exists',
      status: 409,
    });
    await enrico.removeMedia([path, `${H}/recipes/r1/none.jpg`]);
    expect(server.media(path)).toBeUndefined();
    await expect(enrico.downloadMedia(path)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('creates new households with Vormittag, Mittag and Abend', async () => {
    const id = await server.transport(ENRICO).createHousehold('Neu', null);
    const pull = await server.transport(ENRICO).syncPull({ households: {} });
    const household = pull.small.households?.find((row) => row.id === id);
    expect(
      (household?.meal_slots as { name: string; sort: number }[]).map((slot) => [
        slot.name,
        slot.sort,
      ]),
    ).toEqual([
      ['Vormittag', 0],
      ['Mittag', 1],
      ['Abend', 2],
    ]);
  });
});

describe("fake server: the household's shopping list (ADR-0012, like the database)", () => {
  const milkRow = (id: string, count: number, kind = 'manual') => ({
    id,
    item_id: 'i-milk',
    source: kind === 'manual' ? { kind } : { kind, recipeId: 'r1', label: 'Dal (Fr)' },
    count,
    qty: null,
    unit: null,
    note: null,
  });
  const milkCounts = () =>
    server
      .rows(H, 'shopping_contributions')
      .filter((row) => row.item_id === 'i-milk')
      .map((row) => [row.id, row.count]);

  it('ADR-0012: there is no list table, no list_id and no default_list_id to write', async () => {
    const enrico = server.transport(ENRICO);
    const refused = [
      { kind: 'insert', table: 'shopping_lists', row: { id: 'l2', name: 'Drogerie' } },
      { kind: 'patch', table: 'shopping_lists', id: 'l1', changes: { name: 'Einkaufsliste' } },
      {
        kind: 'insert',
        table: 'shopping_items',
        row: { id: 'i-x', list_id: 'l1', article_id: 'a-milk' },
      },
      { kind: 'patch', table: 'households', id: H, changes: { default_list_id: 'l1' } },
    ] satisfies RowOp[];
    for (const op of refused) {
      await expect(enrico.applyChanges(H, [op])).rejects.toMatchObject({ code: 'invalid_change' });
    }
    const id = await enrico.createHousehold('Neu', null);
    const pull = await enrico.syncPull({ households: { [id]: { full: true } } });
    expect(pull.small.households?.find((row) => row.id === id)).not.toHaveProperty(
      'default_list_id',
    );
    expect(pull.households[id]?.rows).not.toHaveProperty('shopping_lists');
  });

  it('ADR-0012: adding puts the item into the household; one open item per article', async () => {
    const enrico = server.transport(ENRICO);
    const [added] = await enrico.addShoppingContributions(H, [entry('Duschgel', 'c-d')]);
    expect(server.row(H, 'shopping_items', added?.item_id ?? '')).toMatchObject({
      article_id: added?.article_id,
      checked: false,
    });
    await expect(
      enrico.applyChanges(H, [
        { kind: 'insert', table: 'shopping_items', row: { id: 'i-milk-2', article_id: 'a-milk' } },
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await enrico.setItemChecked('i-milk', true, 0);
    await expect(
      enrico.applyChanges(H, [
        { kind: 'insert', table: 'shopping_items', row: { id: 'i-milk-2', article_id: 'a-milk' } },
      ]),
    ).resolves.toMatchObject({ applied: 1 });
  });

  it('B1: a foreign household is refused with not_member on add, clear and restore', async () => {
    const stranger = server.transport(STRANGER);
    const notMember = { kind: 'permanent', code: 'not_member' };
    await expect(
      stranger.addShoppingContributions(H, [entry('Seife', 'c-x')]),
    ).rejects.toMatchObject(notMember);
    await expect(stranger.clearCheckedItems(H)).rejects.toMatchObject(notMember);
    await expect(stranger.clearShoppingList(H)).rejects.toMatchObject(notMember);
    await expect(stranger.restoreClearedItems(H, [])).rejects.toMatchObject(notMember);
    expect(server.rows(H, 'shopping_items')).toHaveLength(1);
  });

  it('every clear stays undoable: ≤ 1000 items and ≤ 5000 contributions (like the database)', async () => {
    const enrico = server.transport(ENRICO);
    const tooMany = { kind: 'permanent', code: 'too_many_changes' };
    const items = Array.from({ length: 1001 }, (_, index) => ({
      id: `i-${index}`,
      article_id: 'a-milk',
      checked: true,
    }));
    server.insertRows(H, { shopping_items: items });
    await expect(enrico.clearCheckedItems(H)).rejects.toMatchObject(tooMany);
    await expect(enrico.clearShoppingList(H)).rejects.toMatchObject(tooMany);
    expect(server.rows(H, 'shopping_items')).toHaveLength(1002);

    server.insertRows(H, {
      shopping_contributions: Array.from({ length: 5000 }, (_, index) => milkRow(`c-${index}`, 1)),
    });
    const contributions = server.rows(H, 'shopping_contributions');
    await expect(
      enrico.restoreClearedItems(H, [{ item: items[0] ?? {}, contributions }]),
    ).rejects.toMatchObject(tooMany);
    // Builds 1000 items and 5000 contributions; slow under parallel load, not a hang.
  }, 30_000);

  it('a clear with more than 5000 contributions is refused and deletes nothing', async () => {
    server.insertRows(H, {
      shopping_contributions: Array.from({ length: 5000 }, (_, index) => milkRow(`c-${index}`, 1)),
    });
    await expect(server.transport(ENRICO).clearShoppingList(H)).rejects.toMatchObject({
      code: 'too_many_changes',
    });
    expect(server.rows(H, 'shopping_contributions')).toHaveLength(5001);
  });

  it('AC-014 / AC-016: + raises the newest manual count; − takes manual first, then the newest', async () => {
    server.insertRows(H, {
      shopping_contributions: [milkRow('c-plan-1', 1, 'recipe'), milkRow('c-plan-2', 1, 'recipe')],
    });
    const enrico = server.transport(ENRICO);
    expect(await enrico.adjustItemCount('i-milk', 1)).toEqual({
      item_id: 'i-milk',
      count: 4,
      removed: false,
    });
    expect(milkCounts()).toEqual([
      ['c-milk', 2],
      ['c-plan-1', 1],
      ['c-plan-2', 1],
    ]);
    await enrico.adjustItemCount('i-milk', -1);
    await enrico.adjustItemCount('i-milk', -1);
    expect(milkCounts()).toEqual([
      ['c-plan-1', 1],
      ['c-plan-2', 1],
    ]);
    await enrico.adjustItemCount('i-milk', -1);
    expect(milkCounts()).toHaveLength(1);
  });

  it('AC-015: − on the last piece deletes the item and returns it for the undo', async () => {
    const enrico = server.transport(ENRICO);
    const before = server.row(H, 'shopping_items', 'i-milk');
    const answer = await enrico.adjustItemCount('i-milk', -1);
    expect(answer).toMatchObject({ item_id: 'i-milk', count: 0, removed: true, item: before });
    expect(answer?.removed && answer.contributions).toEqual([
      expect.objectContaining({ id: 'c-milk', count: 1 }),
    ]);
    expect(server.row(H, 'shopping_items', 'i-milk')).toBeUndefined();
    expect(await enrico.adjustItemCount('i-milk', 1)).toBeNull();
    if (!answer?.removed) throw new Error('not removed');
    expect(
      await enrico.restoreClearedItems(H, [
        { item: answer.item, contributions: answer.contributions },
      ]),
    ).toBe(1);
    expect(server.row(H, 'shopping_items', 'i-milk')).toMatchObject({ checked: false });
  });

  it('refuses ± beyond 0…99 and a delta of 0, and items of other households', async () => {
    const enrico = server.transport(ENRICO);
    await expect(enrico.adjustItemCount('i-milk', 0)).rejects.toMatchObject({
      code: 'invalid_value',
    });
    await expect(enrico.adjustItemCount('i-milk', -2)).rejects.toMatchObject({
      code: 'invalid_value',
    });
    await expect(enrico.adjustItemCount('i-milk', 99)).rejects.toMatchObject({
      code: 'invalid_value',
    });
    expect(await enrico.adjustItemCount('i-milk', 98)).toMatchObject({ count: 99 });
    expect(await server.transport(STRANGER).adjustItemCount('i-milk', -1)).toBeNull();
  });

  it('AC-035 / AC-037: clears the whole list; restore keeps the check state and joins open items', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setItemChecked('i-milk', true, 0);
    await enrico.addShoppingContributions(H, [entry('Brot', 'c-brot')]);
    const cleared = await enrico.clearShoppingList(H);
    expect(cleared).toHaveLength(2);
    expect(server.rows(H, 'shopping_items')).toEqual([]);
    await expect(server.transport(STRANGER).clearShoppingList(H)).rejects.toMatchObject({
      code: 'not_member',
    });
    // Nadja adds Brot again before the undo.
    await server.transport(NADJA).addShoppingContributions(H, [entry('Brot', 'c-brot-2')]);
    expect(await enrico.restoreClearedItems(H, cleared)).toBe(2);
    expect(await enrico.restoreClearedItems(H, cleared)).toBe(0);
    const items = server.rows(H, 'shopping_items');
    expect(items).toHaveLength(2);
    expect(server.row(H, 'shopping_items', 'i-milk')).toMatchObject({ checked: true });
    const bread = items.find((item) => item.id !== 'i-milk');
    expect(
      server
        .rows(H, 'shopping_contributions')
        .filter((row) => row.item_id === bread?.id)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['c-brot', 'c-brot-2']);
  });

  it('AC-022: a contribution note longer than 200 characters is refused', async () => {
    await expect(
      server.transport(ENRICO).applyChanges(H, [
        {
          kind: 'patch',
          table: 'shopping_contributions',
          id: 'c-milk',
          changes: { note: 'x'.repeat(201) },
        },
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('fake server: article catalog (spec 0007, like the database)', () => {
  const H2 = 'h-2';
  const article = (id: string, name: string, rest: Record<string, unknown> = {}): Row => {
    const synonyms = (rest.synonyms as string[] | undefined) ?? [];
    return {
      id,
      name,
      name_key: normalizeText(name),
      synonyms,
      synonym_keys: synonyms.map(normalizeText),
      area_id: null,
      diet: 'unknown',
      is_pantry: false,
      default_shopping_rule: null,
      needs_review: false,
      ...rest,
    };
  };
  const ingredient = (id: string, articleId: string, rest: Record<string, unknown> = {}) => ({
    id,
    articleId,
    shoppingRule: 'count',
    ...rest,
  });
  const contribution = (id: string, itemId: string, rest: Record<string, unknown> = {}) => ({
    id,
    item_id: itemId,
    source: { kind: 'manual' },
    count: 1,
    qty: null,
    unit: null,
    note: null,
    ...rest,
  });

  beforeEach(() => {
    server.addHousehold({ id: H2, name: 'WG Köln' }, [STRANGER]);
    server.insertRows(H2, {
      areas: [{ id: 'area-keller', name: 'Keller', sort: 0 }],
      articles: [article('a-kokosnuss', 'Kokosnuss')],
    });
    server.insertRows(H, {
      areas: [
        { id: 'area-konserven', name: 'Konserven & Saucen', sort: 0 },
        { id: 'area-drogerie', name: 'Drogerie', sort: 1 },
        { id: 'area-hygiene', name: 'Drogerie & Hygiene', sort: 2 },
      ],
      articles: [
        article('a-mk', 'Milchkokos', {
          synonyms: ['Kokosdrink'],
          area_id: 'area-konserven',
          is_pantry: true,
          needs_review: true,
        }),
        article('a-km', 'Kokosmilch', { diet: 'vegan' }),
        article('a-df', 'Drachenfrucht'),
        article('a-seife', 'Seife', { area_id: 'area-drogerie' }),
      ],
      stores: [
        {
          id: 'store-rewe',
          name: 'Rewe',
          area_order: ['area-drogerie', 'area-hygiene'],
          hidden_area_ids: ['area-drogerie'],
        },
      ],
      recipes: [
        {
          id: 'r-curry',
          title: 'Curry',
          servings: 2,
          course: 'main',
          ingredients: [
            ingredient('i1', 'a-mk', { shoppingNote: 'Bio' }),
            ingredient('i2', 'a-km'),
          ],
        },
      ],
      shopping_items: [
        { id: 'i-mk', article_id: 'a-mk' },
        { id: 'i-km', article_id: 'a-km' },
      ],
      shopping_contributions: [
        contribution('c-mk', 'i-mk', { note: 'Bio' }),
        contribution('c-km', 'i-km', {
          source: { kind: 'recipe', recipeId: 'r-curry', label: 'Mango-Curry (Sa)' },
        }),
      ],
    });
  });

  describe('delete_article', () => {
    it('AC-033: deletes an unused article with a tombstone and returns its row', async () => {
      const enrico = server.transport(ENRICO);
      const deleted = await enrico.deleteArticle('a-df');
      expect(deleted).toMatchObject({ id: 'a-df', household_id: H, name: 'Drachenfrucht' });
      expect(server.row(H, 'articles', 'a-df')).toBeUndefined();
      const pull = await enrico.syncPull({ households: { [H]: { full: false, since: {} } } });
      expect(pull.households[H]?.tombstones).toContainEqual(
        expect.objectContaining({ table: 'articles', id: 'a-df' }),
      );
    });

    it('AC-034: refuses an article in a recipe, open or checked on the list', async () => {
      const enrico = server.transport(ENRICO);
      await expect(enrico.deleteArticle('a-km')).rejects.toMatchObject({ code: 'article_in_use' });
      await enrico.applyChanges(H, [
        { kind: 'patch', table: 'recipes', id: 'r-curry', changes: { ingredients: [] } },
      ]);
      await expect(enrico.deleteArticle('a-km')).rejects.toMatchObject({ code: 'article_in_use' });
      await enrico.setItemChecked('i-km', true, 0);
      await expect(enrico.deleteArticle('a-km')).rejects.toMatchObject({ code: 'article_in_use' });
      expect(server.row(H, 'articles', 'a-km')).toBeDefined();
    });

    it('a foreign or missing article is not found', async () => {
      await expect(server.transport(ENRICO).deleteArticle('a-kokosnuss')).rejects.toMatchObject({
        code: 'article_not_found',
      });
      await expect(server.transport(STRANGER).deleteArticle('a-df')).rejects.toMatchObject({
        code: 'article_not_found',
      });
      expect(server.row(H2, 'articles', 'a-kokosnuss')).toBeDefined();
    });

    it('AC-033: "Rückgängig" inserts the returned row again through apply_changes', async () => {
      const enrico = server.transport(ENRICO);
      await enrico.deleteArticle('a-df');
      await enrico.applyChanges(H, [
        {
          kind: 'insert',
          table: 'articles',
          row: { ...article('a-df', 'Drachenfrucht'), household_id: H },
        },
      ]);
      expect(server.row(H, 'articles', 'a-df')).toMatchObject({ name: 'Drachenfrucht' });
    });
  });

  describe('merge_articles', () => {
    it('AC-036: recipes, the open item and the synonyms move to the target, the source goes', async () => {
      const result = await server.transport(ENRICO).mergeArticles('a-mk', 'a-km');
      expect(result).toEqual({ recipes: 1, items: 1 });
      expect(server.row(H, 'recipes', 'r-curry')?.ingredients).toEqual([
        ingredient('i1', 'a-km', { shoppingNote: 'Bio' }),
        ingredient('i2', 'a-km'),
      ]);
      expect(server.row(H, 'shopping_items', 'i-mk')).toBeUndefined();
      expect(
        server
          .rows(H, 'shopping_contributions')
          .filter((row) => row.item_id === 'i-km')
          .map((row) => row.id),
      ).toEqual(['c-mk', 'c-km']);
      expect(server.row(H, 'articles', 'a-mk')).toBeUndefined();
      expect(server.row(H, 'articles', 'a-km')).toMatchObject({
        synonyms: ['Milchkokos', 'Kokosdrink'],
        synonym_keys: ['milchkokos', 'kokosdrink'],
      });
    });

    it('AC-038: empty data of the target are filled, Vorrat stays, the target is reviewed', async () => {
      await server.transport(ENRICO).mergeArticles('a-mk', 'a-km');
      expect(server.row(H, 'articles', 'a-km')).toMatchObject({
        area_id: 'area-konserven',
        diet: 'vegan',
        is_pantry: false,
        needs_review: false,
      });
    });

    it('AC-040: checking or "nicht da" on the source item reaches the target item', async () => {
      const enrico = server.transport(ENRICO);
      await enrico.mergeArticles('a-mk', 'a-km');
      expect(await enrico.setItemChecked('i-mk', true, 0)).toMatchObject({
        item_id: 'i-km',
        checked: true,
      });
      // Unchecking a replaced item does nothing: the seq seen belongs to the old item.
      expect(await enrico.setItemChecked('i-mk', false, 0)).toMatchObject({
        item_id: 'i-km',
        checked: true,
      });
      expect(await enrico.setItemNotAvailable('i-mk', true)).toEqual({
        item_id: 'i-km',
        not_available: true,
      });
      expect(await server.transport(STRANGER).setItemChecked('i-mk', true, 0)).toBeNull();
    });

    it('AC-041: the same article, a foreign target and a foreign caller are refused; nothing changes', async () => {
      const enrico = server.transport(ENRICO);
      await expect(enrico.mergeArticles('a-mk', 'a-mk')).rejects.toMatchObject({
        code: 'invalid_value',
      });
      await expect(enrico.mergeArticles('a-mk', 'a-kokosnuss')).rejects.toMatchObject({
        code: 'article_not_found',
      });
      await expect(server.transport(STRANGER).mergeArticles('a-mk', 'a-km')).rejects.toMatchObject({
        code: 'article_not_found',
      });
      expect(server.row(H, 'articles', 'a-mk')).toBeDefined();
      expect(server.row(H2, 'articles', 'a-kokosnuss')).toBeDefined();
    });

    it('open question 11: more than 30 synonyms are refused and nothing changes', async () => {
      const enrico = server.transport(ENRICO);
      const words = Array.from({ length: 29 }, (_, index) => `Wort ${index}`);
      await enrico.applyChanges(H, [
        {
          kind: 'patch',
          table: 'articles',
          id: 'a-km',
          changes: { synonyms: words, synonym_keys: words.map(normalizeText) },
        },
      ]);
      await expect(enrico.mergeArticles('a-mk', 'a-km')).rejects.toMatchObject({
        code: 'too_many_synonyms',
      });
      expect(server.row(H, 'articles', 'a-mk')).toBeDefined();
      expect(server.row(H, 'shopping_items', 'i-mk')).toBeDefined();
    });

    it('open question 11: more than 2000 characters in all synonyms are refused like too many', async () => {
      const enrico = server.transport(ENRICO);
      const words = ['a'.repeat(995), 'b'.repeat(995)];
      await enrico.applyChanges(H, [
        {
          kind: 'patch',
          table: 'articles',
          id: 'a-km',
          changes: { synonyms: words, synonym_keys: words },
        },
      ]);
      await expect(enrico.mergeArticles('a-mk', 'a-km')).rejects.toMatchObject({
        code: 'too_many_synonyms',
      });
      expect(server.row(H, 'articles', 'a-mk')).toBeDefined();
    });
  });

  describe('merge_areas', () => {
    it('AC-054: moves the articles, removes the source from every store and deletes it', async () => {
      expect(await server.transport(ENRICO).mergeAreas('area-drogerie', 'area-hygiene')).toBe(1);
      expect(server.row(H, 'articles', 'a-seife')).toMatchObject({ area_id: 'area-hygiene' });
      expect(server.row(H, 'stores', 'store-rewe')).toMatchObject({
        area_order: ['area-hygiene'],
        hidden_area_ids: [],
      });
      expect(server.row(H, 'areas', 'area-drogerie')).toBeUndefined();
    });

    it('AC-056: a foreign area and the same area are refused', async () => {
      await expect(
        server.transport(ENRICO).mergeAreas('area-keller', 'area-hygiene'),
      ).rejects.toMatchObject({ code: 'area_not_found' });
      await expect(
        server.transport(ENRICO).mergeAreas('area-hygiene', 'area-hygiene'),
      ).rejects.toMatchObject({ code: 'invalid_value' });
      expect(server.row(H2, 'areas', 'area-keller')).toBeDefined();
    });

    it('E9: deleting an area clears it on its articles; deleting the default store clears it', async () => {
      const enrico = server.transport(ENRICO);
      await enrico.applyChanges(H, [
        { kind: 'patch', table: 'households', id: H, changes: { default_store_id: 'store-rewe' } },
      ]);
      await enrico.applyChanges(H, [
        { kind: 'delete', table: 'areas', id: 'area-drogerie' },
        { kind: 'delete', table: 'stores', id: 'store-rewe' },
      ]);
      expect(server.row(H, 'articles', 'a-seife')).toMatchObject({ area_id: null });
      const pull = await enrico.syncPull({ households: {} });
      expect(pull.small.households?.find((row) => row.id === H)).toMatchObject({
        default_store_id: null,
      });
    });
  });

  describe('ingredients point to an article of the household', () => {
    const save = (ingredients: unknown[]) =>
      server
        .transport(ENRICO)
        .applyChanges(H, [
          { kind: 'patch', table: 'recipes', id: 'r-curry', changes: { ingredients } },
        ]);

    it.each([
      ['without articleId', [{ id: 'x', shoppingRule: 'count' }]],
      ['with an unknown article', [ingredient('x', 'a-missing')]],
      ['with a foreign article', [ingredient('x', 'a-kokosnuss')]],
      [
        'with a Hinweis over 200 characters',
        [ingredient('x', 'a-km', { prepNote: 'x'.repeat(201) })],
      ],
      ['with a Hinweis of null', [ingredient('x', 'a-km', { prepNote: null })]],
      ['that is no object', ['Kokosmilch']],
    ])('AC-006: refuses an ingredient %s; the recipe stays', async (_, ingredients) => {
      await expect(save(ingredients)).rejects.toMatchObject({
        kind: 'permanent',
        code: 'ingredient_article_invalid',
      });
      expect(server.row(H, 'recipes', 'r-curry')?.ingredients).toHaveLength(2);
    });

    it('AC-011: accepts an article of the household with a Hinweis of 200 characters', async () => {
      await save([ingredient('x', 'a-km', { prepNote: 'x'.repeat(200) })]);
      expect(server.row(H, 'recipes', 'r-curry')?.ingredients).toHaveLength(1);
    });
  });

  describe('names are unique per household (E6)', () => {
    const insert = (row: Row, householdId = H, userId = ENRICO) =>
      server
        .transport(userId)
        .applyChanges(householdId, [{ kind: 'insert', table: 'articles', row }]);

    it('AC-031: a synonym that is the name or a synonym of another article is taken', async () => {
      await expect(
        insert(article('a-x', 'Kokos-Milch', { synonyms: ['Milchkokos'] })),
      ).rejects.toMatchObject({ code: 'name_taken' });
      await expect(
        insert(article('a-x', 'Kokos-Milch', { synonyms: ['kokosdrink'] })),
      ).rejects.toMatchObject({ code: 'name_taken' });
    });

    it("AC-030: a name that is another article's name or synonym is taken", async () => {
      await expect(insert(article('a-x', 'kokosmilch'))).rejects.toMatchObject({ code: '23505' });
      await expect(insert(article('a-x', 'Kokosdrink'))).rejects.toMatchObject({
        code: 'name_taken',
      });
    });

    it('the own name as synonym is refused (articles_name_key_not_synonym)', async () => {
      await expect(
        insert(article('a-x', 'Kokos-Milch', { synonyms: ['kokos-milch'] })),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('AC-052: an area name in another case is taken; other households may use it', async () => {
      const enrico = server.transport(ENRICO);
      await expect(
        enrico.applyChanges(H, [
          { kind: 'insert', table: 'areas', row: { id: 'area-x', name: 'drogerie', sort: 9 } },
        ]),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        enrico.applyChanges(H, [
          { kind: 'patch', table: 'areas', id: 'area-hygiene', changes: { name: 'DROGERIE' } },
        ]),
      ).rejects.toMatchObject({ code: '23505' });
      await server
        .transport(STRANGER)
        .applyChanges(H2, [
          { kind: 'insert', table: 'areas', row: { id: 'area-y', name: 'Drogerie', sort: 1 } },
        ]);
      await insert(article('a-y', 'Milchkokos'), H2, STRANGER);
      expect(server.row(H2, 'articles', 'a-y')).toBeDefined();
    });
  });
});

describe('fake server: chore entries only by complete_chore / remove_chore_event (spec 0011)', () => {
  const H2 = 'h-2';
  beforeEach(async () => {
    server.addHousehold({ id: H2, name: 'Fremd' }, [STRANGER]);
    await server.transport(ENRICO).applyChanges(H, [
      {
        kind: 'insert',
        table: 'chores',
        row: { id: 'c1', title: 'Bad putzen', recurrence: weekly, next_due_on: '2026-11-20' },
      },
      {
        kind: 'insert',
        table: 'chores',
        row: { id: 'c-once', title: 'Glühbirne', recurrence: { type: 'once' } },
      },
      {
        kind: 'insert',
        table: 'chores',
        row: { id: 'c-need', title: 'Fenster Küche', recurrence: { type: 'asNeeded' } },
      },
      {
        kind: 'insert',
        table: 'chores',
        row: {
          id: 'c-flex',
          title: 'Pflanzen gießen',
          recurrence: { type: 'flexible', everyDays: 3 },
          next_due_on: '2026-11-23',
          last_done_on: '2026-11-20',
        },
      },
    ]);
  });
  const book = (userId: string, op: Record<string, unknown>, householdId = H) =>
    server
      .transport(userId)
      .applyChanges(householdId, [{ kind: 'complete_chore', completion: op } as never]);
  const seenBath = {
    next_due_on: '2026-11-20',
    last_done_on: null,
    next_assignee_id: null,
    latest_event_id: null,
  };

  it('AC-028: books with the seen state, records the state before and moves the date', async () => {
    const result = await book(ENRICO, completion('c1', 'ev1', { seen: seenBath }));
    expect(result.results).toEqual([{ event_id: 'ev1' }]);
    expect(server.row(H, 'chore_events', 'ev1')).toMatchObject({
      chore_id: 'c1',
      title: 'Bad putzen',
      kind: 'done',
      done_by: ENRICO,
      prev_recorded: true,
      prev_next_due_on: '2026-11-20',
      prev_last_done_on: null,
    });
    expect(server.row(H, 'chores', 'c1')).toMatchObject({
      next_due_on: '2026-11-27',
      last_done_on: '2026-11-20',
    });
  });

  it('AC-031: a second booking with the old seen state is already_done with who and when', async () => {
    await book(NADJA, completion('c1', 'ev1', { seen: seenBath, done_by: NADJA }));
    const error = await book(ENRICO, completion('c1', 'ev2', { seen: seenBath })).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ kind: 'permanent', code: 'already_done' });
    expect((error as TransportError).detail).toEqual({
      done_by: NADJA,
      done_at: server.row(H, 'chore_events', 'ev1')?.created_at,
    });
    expect(server.rows(H, 'chore_events')).toHaveLength(1);
    expect(server.row(H, 'chores', 'c1')).toMatchObject({ next_due_on: '2026-11-27' });
  });

  it('AC-031: the same state but an entry newer than the one seen is already_done (flexible, anyone)', async () => {
    const seenFlex = {
      next_due_on: '2026-11-23',
      last_done_on: '2026-11-20',
      next_assignee_id: null,
      latest_event_id: null,
    };
    const flex = { seen: seenFlex, next_due_on: '2026-11-23' };
    await book(NADJA, completion('c-flex', 'ev1', { ...flex, done_by: NADJA }));
    expect(server.row(H, 'chores', 'c-flex')).toMatchObject({
      next_due_on: '2026-11-23',
      last_done_on: '2026-11-20',
    });
    await expect(book(ENRICO, completion('c-flex', 'ev2', flex))).rejects.toMatchObject({
      code: 'already_done',
      detail: { done_by: NADJA },
    });
    await expect(
      book(
        ENRICO,
        completion('c-flex', 'ev2', { ...flex, seen: { ...seenFlex, latest_event_id: 7 } }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    await book(
      ENRICO,
      completion('c-flex', 'ev2', { ...flex, seen: { ...seenFlex, latest_event_id: 'ev1' } }),
    );
    expect(server.rows(H, 'chore_events').map((row) => row.id)).toEqual(['ev1', 'ev2']);
  });

  it('a changed chore without an entry that day is chore_changed', async () => {
    await expect(
      book(ENRICO, completion('c1', 'ev1', { seen: { ...seenBath, next_due_on: '2026-11-19' } })),
    ).rejects.toMatchObject({ code: 'chore_changed' });
  });

  it('AC-043 / AC-044: "bei Bedarf" keeps no date; a date for it is invalid_change', async () => {
    await book(ENRICO, completion('c-need', 'ev1', { next_due_on: null }));
    expect(server.row(H, 'chores', 'c-need')).toMatchObject({
      next_due_on: null,
      last_done_on: '2026-11-20',
    });
    await expect(
      book(
        ENRICO,
        completion('c-need', 'ev2', {
          seen: {
            next_due_on: null,
            last_done_on: '2026-11-20',
            next_assignee_id: null,
            latest_event_id: 'ev1',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_change' });
  });

  it('done "einmalig" deletes the chore with a tombstone; the entry keeps its title', async () => {
    await book(ENRICO, completion('c-once', 'ev1', { next_due_on: null }));
    expect(server.row(H, 'chores', 'c-once')).toBeUndefined();
    expect(server.row(H, 'chore_events', 'ev1')).toMatchObject({
      chore_id: null,
      title: 'Glühbirne',
    });
  });

  it('"skipped" moves only the date; a later "done" the day before keeps the later last time', async () => {
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath, kind: 'skipped' }));
    expect(server.row(H, 'chores', 'c1')).toMatchObject({ next_due_on: '2026-11-27' });
    expect(server.row(H, 'chores', 'c1')?.last_done_on ?? null).toBeNull();
    await book(
      ENRICO,
      completion('c1', 'ev2', {
        seen: {
          next_due_on: '2026-11-27',
          last_done_on: null,
          next_assignee_id: null,
          latest_event_id: 'ev1',
        },
      }),
    );
    await book(
      ENRICO,
      completion('c1', 'ev3', {
        done_on: '2026-11-19',
        seen: {
          next_due_on: '2026-11-27',
          last_done_on: '2026-11-20',
          next_assignee_id: null,
          latest_event_id: 'ev2',
        },
      }),
    );
    expect(server.row(H, 'chores', 'c1')).toMatchObject({ last_done_on: '2026-11-20' });
  });

  it.each([
    ['a kind other than done/skipped', { kind: 'spontaneous' }],
    ['a day before today − 3', { done_on: '2026-11-16' }],
    ['a day after today + 1', { done_on: '2026-11-22' }],
    ['a date not after the day', { next_due_on: '2026-11-20' }],
    ['an unknown field', { title: 'Fremder Titel' }],
    ['a recorded state from the device', { prev_next_due_on: '2026-01-01' }],
    ['no seen state', { seen: undefined }],
  ])('refuses %s with invalid_change and books nothing', async (_, extra) => {
    await expect(
      book(ENRICO, completion('c1', 'ev1', { seen: seenBath, ...extra })),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    expect(server.rows(H, 'chore_events')).toEqual([]);
  });

  it('refuses a person outside the household (23503) and a taken entry id (23505)', async () => {
    await expect(
      book(ENRICO, completion('c1', 'ev1', { seen: seenBath, done_by: STRANGER })),
    ).rejects.toMatchObject({ code: '23503' });
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath }));
    await expect(
      book(ENRICO, completion('c-need', 'ev1', { next_due_on: null })),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('AC-055: a foreign household is not_member; a chore of another household is chore_not_found', async () => {
    await expect(book(STRANGER, completion('c1', 'ev1', { seen: seenBath }))).rejects.toMatchObject(
      { code: 'not_member' },
    );
    await expect(
      book(STRANGER, completion('c1', 'ev1', { seen: seenBath }), H2),
    ).rejects.toMatchObject({ code: 'chore_not_found' });
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath }));
    await expect(
      server.transport(STRANGER).applyChanges(H2, [{ kind: 'remove_chore_event', id: 'ev1' }]),
    ).rejects.toMatchObject({ code: 'chore_event_not_found' });
    expect(server.row(H, 'chore_events', 'ev1')).toBeDefined();
  });

  it('refuses insert and delete of chore events through row ops; patches chore_id and done_by only', async () => {
    const enrico = server.transport(ENRICO);
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath }));
    await expect(
      enrico.applyChanges(H, [
        { kind: 'insert', table: 'chore_events', row: { id: 'ev9', title: 'x', kind: 'done' } },
      ]),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'chore_events', id: 'ev1' }]),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    for (const changes of [
      { title: 'x' },
      { prev_next_due_on: '2026-01-01' },
      { kind: 'skipped' },
    ]) {
      await expect(
        enrico.applyChanges(H, [{ kind: 'patch', table: 'chore_events', id: 'ev1', changes }]),
      ).rejects.toMatchObject({ code: 'invalid_change' });
    }
    await enrico.applyChanges(H, [
      { kind: 'patch', table: 'chore_events', id: 'ev1', changes: { done_by: NADJA } },
    ]);
    expect(server.row(H, 'chore_events', 'ev1')).toMatchObject({ done_by: NADJA });
  });

  it('AC-060: removing the latest entry restores the state before; an older one only goes', async () => {
    const enrico = server.transport(ENRICO);
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath, done_on: '2026-11-19' }));
    await book(
      ENRICO,
      completion('c1', 'ev2', {
        seen: {
          next_due_on: '2026-11-27',
          last_done_on: '2026-11-19',
          next_assignee_id: null,
          latest_event_id: 'ev1',
        },
        next_due_on: '2026-12-04',
      }),
    );
    expect(
      (await enrico.applyChanges(H, [{ kind: 'remove_chore_event', id: 'ev1' }])).results,
    ).toEqual([{ restored: false }]);
    expect(server.row(H, 'chores', 'c1')).toMatchObject({ next_due_on: '2026-12-04' });
    expect(
      (await enrico.applyChanges(H, [{ kind: 'remove_chore_event', id: 'ev2' }])).results,
    ).toEqual([{ restored: true }]);
    expect(server.row(H, 'chores', 'c1')).toMatchObject({
      next_due_on: '2026-11-27',
      last_done_on: '2026-11-19',
    });
    expect(server.rows(H, 'chore_events')).toEqual([]);
    await expect(
      enrico.applyChanges(H, [{ kind: 'remove_chore_event', id: 'ev2' }]),
    ).rejects.toMatchObject({ code: 'chore_event_not_found' });
  });

  it('removing for a chore that is "bei Bedarf" by now leaves its date empty', async () => {
    const enrico = server.transport(ENRICO);
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath }));
    await enrico.applyChanges(H, [
      {
        kind: 'patch',
        table: 'chores',
        id: 'c1',
        changes: { recurrence: { type: 'asNeeded' }, next_due_on: null },
      },
    ]);
    await enrico.applyChanges(H, [{ kind: 'remove_chore_event', id: 'ev1' }]);
    expect(server.row(H, 'chores', 'c1')).toMatchObject({ next_due_on: null, last_done_on: null });
  });

  it('"bei Bedarf" with a date is refused as a row too (chores_as_needed_never_due)', async () => {
    await expect(
      server
        .transport(ENRICO)
        .applyChanges(H, [
          { kind: 'patch', table: 'chores', id: 'c-need', changes: { next_due_on: '2026-11-30' } },
        ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('remove_chore_event counts as a delete: more than 20 are too_many_changes', async () => {
    const ops = Array.from({ length: 21 }, (_, index) => ({
      kind: 'remove_chore_event' as const,
      id: `ev${index}`,
    }));
    await expect(server.transport(ENRICO).applyChanges(H, ops)).rejects.toMatchObject({
      code: 'too_many_changes',
    });
  });

  it('complete_chore counts as a delete (a one-off chore goes): 21 bookings are too_many_changes', async () => {
    const ops = Array.from({ length: 21 }, (_, index) => ({
      kind: 'complete_chore' as const,
      completion: completion('c-once', `ev${index}`, { next_due_on: null }),
    }));
    await expect(server.transport(ENRICO).applyChanges(H, ops as never)).rejects.toMatchObject({
      code: 'too_many_changes',
    });
    expect(server.row(H, 'chores', 'c-once')).toBeDefined();
  });

  it('AC-053: chore_id goes from null to a chore again, never to another chore or back to null', async () => {
    const enrico = server.transport(ENRICO);
    await book(ENRICO, completion('c1', 'ev1', { seen: seenBath }));
    for (const chore_id of ['c-need', null]) {
      await expect(
        enrico.applyChanges(H, [
          { kind: 'patch', table: 'chore_events', id: 'ev1', changes: { chore_id } },
        ]),
      ).rejects.toMatchObject({ code: 'invalid_change' });
    }
    await book(ENRICO, completion('c-once', 'ev2', { next_due_on: null }));
    await enrico.applyChanges(H, [
      { kind: 'patch', table: 'chore_events', id: 'ev2', changes: { chore_id: 'c-need' } },
    ]);
    expect(server.row(H, 'chore_events', 'ev2')).toMatchObject({ chore_id: 'c-need' });
  });

  it('AC-060: the second of two bookings in one call is the latest booked, whatever the ids', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [
      { kind: 'complete_chore', completion: completion('c1', 'ev-z', { seen: seenBath }) },
      {
        kind: 'complete_chore',
        completion: completion('c1', 'ev-a', {
          seen: {
            next_due_on: '2026-11-27',
            last_done_on: '2026-11-20',
            next_assignee_id: null,
            latest_event_id: 'ev-z',
          },
          next_due_on: '2026-12-04',
        }),
      },
    ] as never);
    expect(
      String(server.row(H, 'chore_events', 'ev-a')?.created_at) >
        String(server.row(H, 'chore_events', 'ev-z')?.created_at),
    ).toBe(true);
    expect(
      (await enrico.applyChanges(H, [{ kind: 'remove_chore_event', id: 'ev-a' }])).results,
    ).toEqual([{ restored: true }]);
    expect(server.row(H, 'chores', 'c1')).toMatchObject({ next_due_on: '2026-11-27' });
  });
});

describe('fake server: ratings in half steps (spec 0011)', () => {
  it('AC-017 / AC-026: stores 4.5 and 0.5, refuses 4.3, 4.25, 0, 5.5, −1 and NaN; the old value stays', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setRecipeRating('r1', 4.5);
    expect(server.row(H, 'recipe_ratings', `r1:${ENRICO}`)).toMatchObject({ stars: 4.5 });
    await enrico.setRecipeRating('r1', 0.5);
    for (const stars of [4.3, 4.25, 0, 5.5, -1, Number.NaN]) {
      await expect(enrico.setRecipeRating('r1', stars)).rejects.toMatchObject({
        code: 'invalid_stars',
      });
    }
    expect(server.row(H, 'recipe_ratings', `r1:${ENRICO}`)).toMatchObject({ stars: 0.5 });
  });

  it('Offene Frage 7: the same value again is written, updated_at moves on', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setRecipeRating('r1', 4);
    const first = String(server.row(H, 'recipe_ratings', `r1:${ENRICO}`)?.updated_at);
    vi.advanceTimersByTime(1000);
    await enrico.setRecipeRating('r1', 4);
    const second = String(server.row(H, 'recipe_ratings', `r1:${ENRICO}`)?.updated_at);
    expect(second > first).toBe(true);
  });
});

describe('fake server: delete_recipe and restore_recipe (spec 0008, T1)', () => {
  const PHOTO = `${H}/recipes/r1/0b6f7a3e-1c1d-4a5e-9f00-123456789abc.jpg`;
  const entryRow = (id: string, row: Record<string, unknown>): Row => ({
    id,
    slot_id: 's-evening',
    kind: 'recipe',
    recipe_id: 'r1',
    eater_ids: [ENRICO, NADJA],
    guests: 0,
    portions: 2,
    variants: [{ variantId: 'v-tofu', portions: 2 }],
    cook_id: NADJA,
    sort: 0,
    not_cooked: false,
    ...row,
  });

  beforeEach(async () => {
    server.insertRows(H, {
      recipes: [
        {
          id: 'r1',
          title: 'Halloumi-Pfanne',
          servings: 2,
          course: 'main',
          photo_path: PHOTO,
          variants: [{ id: 'v-tofu', name: 'mit Tofu', isDefault: true }],
          ingredients: [{ id: 'i1', articleId: 'a-milk', shoppingRule: 'count' }],
        },
      ],
      meal_plan_entries: [
        entryRow('e-mon', { date: '2026-11-16' }),
        entryRow('e-today', { date: '2026-11-20' }),
        entryRow('e-sat', { date: '2026-11-21' }),
        entryRow('e-noted', { date: null }),
        entryRow('e-left', {
          date: '2026-11-17',
          kind: 'leftovers',
          leftovers_of_entry_id: 'e-mon',
        }),
        entryRow('e-other', { date: '2026-11-21', kind: 'text', recipe_id: null, text: 'Pizza' }),
      ],
    });
    await server.transport(NADJA).setRecipeRating('r1', 5);
    await server.transport(ENRICO).setRecipeRating('r1', 4.5);
    await server.transport(NADJA).setRecipeFavorite('r1', true);
  });

  it('AC-043: up to today free text with the title, later and noted entries gone, ratings and favourites gone', async () => {
    expect(await server.transport(ENRICO).deleteRecipe('r1', '2026-11-20')).toEqual({
      converted: 3,
      removed: 2,
      collections: 0,
    });
    expect(server.row(H, 'recipes', 'r1')).toBeUndefined();
    for (const id of ['e-mon', 'e-today']) {
      expect(server.row(H, 'meal_plan_entries', id)).toMatchObject({
        kind: 'text',
        recipe_id: null,
        variants: [],
        text: 'Halloumi-Pfanne',
        eater_ids: [ENRICO, NADJA],
        cook_id: NADJA,
      });
    }
    expect(server.row(H, 'meal_plan_entries', 'e-left')).toMatchObject({
      kind: 'text',
      text: 'Reste von Halloumi-Pfanne',
      leftovers_of_entry_id: 'e-mon',
    });
    expect(server.row(H, 'meal_plan_entries', 'e-sat')).toBeUndefined();
    expect(server.row(H, 'meal_plan_entries', 'e-noted')).toBeUndefined();
    expect(server.row(H, 'meal_plan_entries', 'e-other')).toMatchObject({ text: 'Pizza' });
    expect(server.rows(H, 'recipe_ratings')).toEqual([]);
    expect(server.rows(H, 'recipe_favorites')).toEqual([]);
    const pull = await server.transport(NADJA).syncPull({
      households: { [H]: { full: false, since: { recipes: '2026-11-20T09:00:00Z' } } },
    });
    expect(pull.households[H]?.tombstones.map((t) => `${t.table}:${t.id}`).sort()).toEqual(
      [
        'meal_plan_entries:e-noted',
        'meal_plan_entries:e-sat',
        `recipe_favorites:r1:${NADJA}`,
        `recipe_ratings:r1:${ENRICO}`,
        `recipe_ratings:r1:${NADJA}`,
        'recipes:r1',
      ].sort(),
    );
  });

  it('AC-044: restore brings back recipe, photo, both ratings, the favourite and every entry; only once', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.deleteRecipe('r1', '2026-11-20');
    expect(await enrico.restoreRecipe('r1')).toBe(true);
    expect(server.row(H, 'recipes', 'r1')).toMatchObject({
      title: 'Halloumi-Pfanne',
      photo_path: PHOTO,
    });
    expect(server.row(H, 'recipe_ratings', `r1:${NADJA}`)).toMatchObject({ stars: 5 });
    expect(server.row(H, 'recipe_ratings', `r1:${ENRICO}`)).toMatchObject({ stars: 4.5 });
    expect(server.row(H, 'recipe_favorites', `r1:${NADJA}`)).toBeDefined();
    for (const id of ['e-mon', 'e-today', 'e-sat', 'e-noted']) {
      expect(server.row(H, 'meal_plan_entries', id)).toMatchObject({
        kind: 'recipe',
        recipe_id: 'r1',
        variants: [{ variantId: 'v-tofu', portions: 2 }],
      });
    }
    expect(server.row(H, 'meal_plan_entries', 'e-left')).toMatchObject({
      kind: 'leftovers',
      recipe_id: 'r1',
      text: null,
    });
    await expect(enrico.restoreRecipe('r1')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'recipe_not_restorable',
    });
  });

  it('negative: only the person who deleted can restore; a foreign member can do neither', async () => {
    await expect(server.transport(STRANGER).deleteRecipe('r1', '2026-11-20')).rejects.toMatchObject(
      { code: 'recipe_not_found' },
    );
    expect(server.row(H, 'recipes', 'r1')).toBeDefined();
    expect(server.rows(H, 'meal_plan_entries')).toHaveLength(6);

    await server.transport(ENRICO).deleteRecipe('r1', '2026-11-20');
    for (const user of [NADJA, STRANGER]) {
      await expect(server.transport(user).restoreRecipe('r1')).rejects.toMatchObject({
        code: 'recipe_not_restorable',
      });
    }
    expect(server.row(H, 'recipes', 'r1')).toBeUndefined();
    await expect(server.transport(ENRICO).deleteRecipe('r1', '2026-11-20')).rejects.toMatchObject({
      code: 'recipe_not_found',
    });
  });

  it('negative: a device date more than one day off is invalid_value and changes nothing', async () => {
    for (const today of ['2026-11-18', '2026-11-22']) {
      await expect(server.transport(ENRICO).deleteRecipe('r1', today)).rejects.toMatchObject({
        kind: 'permanent',
        code: 'invalid_value',
      });
    }
    expect(server.row(H, 'recipes', 'r1')).toBeDefined();
    expect(server.row(H, 'meal_plan_entries', 'e-sat')).toBeDefined();
    await expect(server.transport(ENRICO).deleteRecipe('r1', '2026-11-21')).resolves.toEqual({
      converted: 4,
      removed: 1,
      collections: 0,
    });
  });

  it('failure: after 1 hour the snapshot is gone', async () => {
    await server.transport(ENRICO).deleteRecipe('r1', '2026-11-20');
    vi.setSystemTime(new Date('2026-11-20T11:00:01Z'));
    await expect(server.transport(ENRICO).restoreRecipe('r1')).rejects.toMatchObject({
      code: 'recipe_not_restorable',
    });
  });

  it('failure: a changed free-text entry stays, a removed member is left out', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.deleteRecipe('r1', '2026-11-20');
    await enrico.applyChanges(H, [
      { kind: 'patch', table: 'meal_plan_entries', id: 'e-mon', changes: { text: 'Pfanne' } },
    ]);
    await enrico.removeMember(H, NADJA);
    expect(await enrico.restoreRecipe('r1')).toBe(true);
    expect(server.row(H, 'meal_plan_entries', 'e-mon')).toMatchObject({
      kind: 'text',
      text: 'Pfanne',
    });
    expect(server.row(H, 'meal_plan_entries', 'e-sat')).toMatchObject({
      eater_ids: [ENRICO],
      cook_id: null,
    });
    expect(server.row(H, 'recipe_ratings', `r1:${NADJA}`)).toBeUndefined();
    expect(server.row(H, 'recipe_favorites', `r1:${NADJA}`)).toBeUndefined();
    expect(server.row(H, 'recipe_ratings', `r1:${ENRICO}`)).toMatchObject({ stars: 4.5 });
  });

  it('failure: an article gone in between fails the restore as a whole; the snapshot stays', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.deleteRecipe('r1', '2026-11-20');
    server.deleteRow(H, 'shopping_items', 'i-milk');
    await enrico.deleteArticle('a-milk');
    await expect(enrico.restoreRecipe('r1')).rejects.toMatchObject({
      code: 'ingredient_article_invalid',
    });
    expect(server.row(H, 'recipes', 'r1')).toBeUndefined();
    expect(server.row(H, 'meal_plan_entries', 'e-sat')).toBeUndefined();
    expect(server.row(H, 'meal_plan_entries', 'e-mon')).toMatchObject({ kind: 'text' });
  });

  it('a recipe that exists again answers false and changes nothing', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.deleteRecipe('r1', '2026-11-20');
    server.insertRows(H, { recipes: [{ id: 'r1', title: 'Neu', servings: 2, course: 'main' }] });
    expect(await enrico.restoreRecipe('r1')).toBe(false);
    expect(server.row(H, 'recipes', 'r1')).toMatchObject({ title: 'Neu' });
    expect(server.row(H, 'meal_plan_entries', 'e-sat')).toBeUndefined();
  });

  it('an id taken in another household meanwhile is not restorable (never false)', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.deleteRecipe('r1', '2026-11-20');
    server.addHousehold({ id: 'h-2', name: 'WG' }, [STRANGER]);
    server.insertRows('h-2', {
      recipes: [{ id: 'r1', title: 'Besetzt', servings: 2, course: 'main' }],
    });
    await expect(enrico.restoreRecipe('r1')).rejects.toMatchObject({
      kind: 'permanent',
      code: 'recipe_not_restorable',
    });
    expect(server.row(H, 'recipes', 'r1')).toBeUndefined();
    expect(server.row('h-2', 'recipes', 'r1')).toMatchObject({ title: 'Besetzt' });
  });

  it('E3: leftovers without a recipe of a removed entry go too, and come back with their links', async () => {
    server.insertRows(H, {
      meal_plan_entries: [
        entryRow('e-rest-sat', {
          date: '2026-11-22',
          kind: 'leftovers',
          recipe_id: null,
          variants: [],
          leftovers_of_entry_id: 'e-sat',
        }),
        entryRow('e-rest-rest', {
          date: '2026-11-19',
          kind: 'leftovers',
          recipe_id: null,
          variants: [],
          leftovers_of_entry_id: 'e-rest-sat',
        }),
      ],
    });
    const enrico = server.transport(ENRICO);
    expect(await enrico.deleteRecipe('r1', '2026-11-20')).toEqual({
      converted: 3,
      removed: 4,
      collections: 0,
    });
    expect(server.row(H, 'meal_plan_entries', 'e-rest-sat')).toBeUndefined();
    expect(server.row(H, 'meal_plan_entries', 'e-rest-rest')).toBeUndefined();
    expect(await enrico.restoreRecipe('r1')).toBe(true);
    expect(server.row(H, 'meal_plan_entries', 'e-rest-sat')).toMatchObject({
      leftovers_of_entry_id: 'e-sat',
    });
    expect(server.row(H, 'meal_plan_entries', 'e-rest-rest')).toMatchObject({
      leftovers_of_entry_id: 'e-rest-sat',
    });
  });

  it('E6: planning the deleted recipe fails its foreign key (23503, meal_plan_entries_recipe_fkey)', async () => {
    await server.transport(ENRICO).deleteRecipe('r1', '2026-11-20');
    await expect(
      server
        .transport(NADJA)
        .applyChanges(H, [
          { kind: 'insert', table: 'meal_plan_entries', row: entryRow('e-new', { date: null }) },
        ]),
    ).rejects.toMatchObject({
      kind: 'permanent',
      code: '23503',
      constraint: 'meal_plan_entries_recipe_fkey',
    });
  });
});

describe('fake server: packing (spec 0012, like the database)', () => {
  const FOREIGN = 'h-2';
  /** A seven-day trip with one bag: an open, a packed (pack_seq 3) and a "je Tag" Packstück. */
  function seedPacking() {
    server.addHousehold({ id: FOREIGN, name: 'Fremd' }, [STRANGER]);
    server.insertRows(H, {
      trips: [{ id: 'abs-1', from_on: '2027-01-01', to_on: '2027-01-07' }],
      trip_members: [{ id: 'tm-1', trip_id: 'abs-1', member_id: ENRICO }],
      packing_bags: [{ id: 'bag-strand', name: 'Strand', member_id: null, sort: 0 }],
      packing_bag_items: [
        {
          id: 'bi-1',
          bag_id: 'bag-strand',
          name: 'Badehose',
          quantity: 2,
          per_day: false,
          sort: 0,
        },
      ],
      packing_list_bags: [
        { id: 'lb-1', trip_id: 'abs-1', bag_id: 'bag-strand', name: 'Strand', sort: 0 },
      ],
      packing_items: [
        { id: 'p-open', list_bag_id: 'lb-1', name: 'Badehose', quantity: 2, sort: 0 },
        {
          id: 'p-packed',
          list_bag_id: 'lb-1',
          name: 'Sonnenbrille',
          sort: 1,
          packed: true,
          packed_at: '2026-11-19T10:00:00.000Z',
          packed_by: NADJA,
          pack_seq: 3,
        },
        { id: 'p-day', list_bag_id: 'lb-1', name: 'T-Shirts', quantity: 7, per_day: 1, sort: 2 },
      ],
    });
    server.insertRows(FOREIGN, {
      trips: [{ id: 'abs-x', from_on: '2027-01-01', to_on: '2027-01-02' }],
      trip_members: [{ id: 'tm-x', trip_id: 'abs-x', member_id: STRANGER }],
      packing_list_bags: [{ id: 'lb-x', trip_id: 'abs-x', bag_id: null, name: 'X', sort: 0 }],
      packing_items: [{ id: 'p-x', list_bag_id: 'lb-x', name: 'Fremd', sort: 0 }],
    });
  }
  const change = (item_id: string, packed: boolean, seen_pack_seq = 0) => ({
    item_id,
    packed,
    seen_pack_seq,
  });
  const state = (id: string) => {
    const row = server.row(H, 'packing_items', id);
    return (
      row && {
        packed: row.packed,
        pack_seq: row.pack_seq,
        packed_by: row.packed_by ?? null,
        packed_at: row.packed_at ?? null,
      }
    );
  };

  beforeEach(seedPacking);

  it('ADR-0013 rule table, like packing_rpcs.test.sql', async () => {
    const enrico = server.transport(ENRICO);
    // not packed + pack → packed (pack_seq + 1, packed_by, packed_at)
    expect(await enrico.setPackingItemsPacked(H, [change('p-open', true)])).toEqual([
      { item_id: 'p-open', packed: true, pack_seq: 1 },
    ]);
    expect(state('p-open')).toMatchObject({ packed: true, pack_seq: 1, packed_by: ENRICO });
    expect(state('p-open')?.packed_at).toEqual(expect.any(String));
    // packed + pack → unchanged
    expect(await enrico.setPackingItemsPacked(H, [change('p-packed', true, 0)])).toEqual([
      { item_id: 'p-packed', packed: true, pack_seq: 3 },
    ]);
    expect(state('p-packed')?.packed_by).toBe(NADJA);
    // packed + unpack with another seq → stays packed ("Abhaken gewinnt", AC-023)
    expect(await enrico.setPackingItemsPacked(H, [change('p-packed', false, 2)])).toEqual([
      { item_id: 'p-packed', packed: true, pack_seq: 3 },
    ]);
    // packed + unpack with the seq seen → not packed
    expect(await enrico.setPackingItemsPacked(H, [change('p-packed', false, 3)])).toEqual([
      { item_id: 'p-packed', packed: false, pack_seq: 4 },
    ]);
    expect(state('p-packed')).toEqual({
      packed: false,
      pack_seq: 4,
      packed_by: null,
      packed_at: null,
    });
    // not packed + unpack → unchanged
    expect(await enrico.setPackingItemsPacked(H, [change('p-packed', false, 4)])).toEqual([
      { item_id: 'p-packed', packed: false, pack_seq: 4 },
    ]);
  });

  it('AC-026 / AC-030: one call for a run; missing and foreign ids are skipped (AC-024, AC-040, AC-025)', async () => {
    const enrico = server.transport(ENRICO);
    const answer = await enrico.setPackingItemsPacked(H, [
      change('p-day', true),
      change('p-gone', true),
      change('p-x', true),
      change('p-packed', false, 1),
    ]);
    expect(answer).toEqual([
      { item_id: 'p-day', packed: true, pack_seq: 1 },
      { item_id: 'p-packed', packed: true, pack_seq: 3 },
    ]);
    expect(server.row(FOREIGN, 'packing_items', 'p-x')).toMatchObject({ packed: false });
  });

  it('AC-025: a foreign household is not_member; bad input is invalid_change / too_many_changes', async () => {
    const enrico = server.transport(ENRICO);
    await expect(
      enrico.setPackingItemsPacked(FOREIGN, [change('p-x', true)]),
    ).rejects.toMatchObject({ code: 'not_member' });
    const refused = (changes: unknown) =>
      expect(
        enrico.setPackingItemsPacked(H, changes as ReturnType<typeof change>[]),
      ).rejects.toMatchObject({ code: 'invalid_change' });
    await refused([]);
    await refused([{ ...change('p-open', true), name: 'x' }]);
    await refused([{ item_id: 'p-open', packed: true }]);
    await refused([{ ...change('p-open', true), packed: 'true' }]);
    await refused([change('p-open', true, -1)]);
    await refused([change('p-open', true, 1.5)]);
    await refused([change('p-open', true), change('p-open', false)]);
    await expect(
      enrico.setPackingItemsPacked(
        H,
        Array.from({ length: 201 }, (_, index) => change(`p-${index}`, true)),
      ),
    ).rejects.toMatchObject({ code: 'too_many_changes' });
    expect(state('p-open')).toMatchObject({ packed: false, pack_seq: 0 });
  });

  it('inserts start open; "je Tag" is computed from the trip; no patch of the packed state', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [
      {
        kind: 'insert',
        table: 'packing_items',
        row: { id: 'p-new', list_bag_id: 'lb-1', name: 'Socken', quantity: 1, per_day: 2, sort: 3 },
      },
    ]);
    expect(server.row(H, 'packing_items', 'p-new')).toMatchObject({
      quantity: 14,
      packed: false,
      pack_seq: 0,
    });
    for (const op of [
      {
        kind: 'insert',
        table: 'packing_items',
        row: { id: 'p-cheat', list_bag_id: 'lb-1', name: 'X', sort: 0, packed: true },
      },
      { kind: 'patch', table: 'packing_items', id: 'p-open', changes: { pack_seq: 4 } },
      { kind: 'patch', table: 'packing_list_bags', id: 'lb-1', changes: { name: 'Neu' } },
    ] as RowOp[]) {
      await expect(enrico.applyChanges(H, [op])).rejects.toMatchObject({ code: 'invalid_change' });
    }
  });

  it('AC-037: changing the duration recalculates open "je Tag" items, packed ones keep theirs', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setPackingItemsPacked(H, [change('p-day', true)]);
    await enrico.applyChanges(H, [
      {
        kind: 'insert',
        table: 'packing_items',
        row: {
          id: 'p-day2',
          list_bag_id: 'lb-1',
          name: 'Socken',
          quantity: 7,
          per_day: 1,
          sort: 4,
        },
      },
      { kind: 'patch', table: 'trips', id: 'abs-1', changes: { to_on: '2027-01-05' } },
    ]);
    expect(server.row(H, 'packing_items', 'p-day2')?.quantity).toBe(5);
    expect(server.row(H, 'packing_items', 'p-day')?.quantity).toBe(7);
    expect(server.row(H, 'packing_items', 'p-open')?.quantity).toBe(2);
    // Spec 0022: a bag stays at its trip.
    await expect(
      enrico.applyChanges(H, [
        { kind: 'patch', table: 'packing_list_bags', id: 'lb-1', changes: { trip_id: 'abs-x' } },
      ]),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    // 365 days × 99 is capped at 9999.
    await enrico.applyChanges(H, [
      { kind: 'patch', table: 'trips', id: 'abs-1', changes: { to_on: '2027-12-31' } },
      {
        kind: 'insert',
        table: 'packing_items',
        row: { id: 'p-max', list_bag_id: 'lb-1', name: 'Viel', quantity: 99, per_day: 99, sort: 5 },
      },
    ]);
    expect(server.row(H, 'packing_items', 'p-max')?.quantity).toBe(9999);
  });

  it('AC-038 / AC-009: cascades and set null leave tombstones; bag names are unique', async () => {
    const enrico = server.transport(ENRICO);
    await expect(
      enrico.applyChanges(H, [
        { kind: 'insert', table: 'packing_bags', row: { id: 'bag-2', name: 'strand', sort: 1 } },
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      enrico.applyChanges(H, [
        {
          kind: 'insert',
          table: 'packing_list_bags',
          row: { id: 'lb-2', trip_id: 'abs-1', bag_id: 'bag-strand', name: 'Strand', sort: 1 },
        },
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      enrico.applyChanges(H, [
        {
          kind: 'insert',
          table: 'packing_list_bags',
          row: { id: 'lb-3', trip_id: 'abs-x', name: 'Fremd', sort: 1 },
        },
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      enrico.applyChanges(H, [
        {
          kind: 'insert',
          table: 'packing_bags',
          row: { id: 'bag-3', name: 'Für Fremde', member_id: STRANGER, sort: 1 },
        },
      ]),
    ).rejects.toMatchObject({ code: '23503' });

    await enrico.applyChanges(H, [{ kind: 'delete', table: 'packing_bags', id: 'bag-strand' }]);
    expect(server.row(H, 'packing_bag_items', 'bi-1')).toBeUndefined();
    expect(server.row(H, 'packing_list_bags', 'lb-1')).toMatchObject({ bag_id: null });
    expect(server.rows(H, 'packing_items')).toHaveLength(3);

    await enrico.applyChanges(H, [{ kind: 'delete', table: 'trips', id: 'abs-1' }]);
    expect(server.rows(H, 'packing_list_bags')).toEqual([]);
    expect(server.rows(H, 'trip_members')).toEqual([]);
    expect(server.rows(H, 'packing_items')).toEqual([]);
    const pulled = await enrico.syncPull({ households: { [H]: { full: false, since: {} } } });
    const tombstones = pulled.households[H]?.tombstones.map((t) => `${t.table}:${t.id}`) ?? [];
    expect(tombstones).toEqual(
      expect.arrayContaining([
        'packing_bags:bag-strand',
        'packing_bag_items:bi-1',
        'packing_list_bags:lb-1',
        'packing_items:p-open',
        'packing_items:p-packed',
        'packing_items:p-day',
      ]),
    );
  });

  it('AC-034 / AC-035: restore_packing_items brings back the packed state, bounded', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [{ kind: 'delete', table: 'packing_list_bags', id: 'lb-1' }]);
    const result = await enrico.applyChanges(H, [
      {
        kind: 'insert',
        table: 'packing_list_bags',
        row: { id: 'lb-1', trip_id: 'abs-1', bag_id: 'bag-strand', name: 'Strand', sort: 0 },
      },
      {
        kind: 'restore_packing_items',
        items: [
          {
            id: 'p-packed',
            list_bag_id: 'lb-1',
            name: 'Sonnenbrille',
            sort: 1,
            packed: true,
            packed_at: '2030-01-01T00:00:00.000Z',
            packed_by: NADJA,
            pack_seq: 2_000_000,
          },
          { id: 'p-day', list_bag_id: 'lb-1', name: 'T-Shirts', quantity: 1, per_day: 1, sort: 2 },
        ],
      },
    ]);
    expect(result.results[0]).toEqual({ restored: 2 });
    expect(state('p-packed')).toMatchObject({ packed: true, packed_by: NADJA, pack_seq: 999_000 });
    expect(Date.parse(String(state('p-packed')?.packed_at))).toBeLessThanOrEqual(Date.now());
    expect(server.row(H, 'packing_items', 'p-day')).toMatchObject({ quantity: 7, packed: false });

    await expect(
      enrico.applyChanges(H, [
        {
          kind: 'restore_packing_items',
          items: [{ id: 'p-y', list_bag_id: 'lb-1', name: 'Y', packed: true, packed_by: STRANGER }],
        },
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      enrico.applyChanges(H, [
        {
          kind: 'restore_packing_items',
          items: [{ id: 'p-packed', list_bag_id: 'lb-1', name: 'Y' }],
        },
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      enrico.applyChanges(H, [
        {
          kind: 'restore_packing_items',
          items: Array.from({ length: 201 }, (_, index) => ({
            id: `p-r${index}`,
            list_bag_id: 'lb-1',
            name: 'R',
          })),
        },
      ]),
    ).rejects.toMatchObject({ code: 'too_many_changes' });
  });

  it('removing a member clears "für" and "gepackt von"', async () => {
    await server.transport(ENRICO).removeMember(H, NADJA);
    expect(server.row(H, 'packing_items', 'p-packed')).toMatchObject({ packed_by: null });
  });
});

describe('fake server: collections (spec 0009, like the database after T1)', () => {
  const collection = (id: string, extra: Record<string, unknown> = {}): Row => ({
    id,
    kind: 'collection',
    title: id,
    servings: 6,
    course: null,
    ...extra,
  });
  const contained = (id: string, collectionId: string, recipeId: string, extra = {}): RowOp => ({
    kind: 'insert',
    table: 'collection_recipes',
    row: { id, collection_id: collectionId, recipe_id: recipeId, sort: 0, ...extra },
  });
  const apply = (ops: RowOp[], user = ENRICO, household = H) =>
    server.transport(user).applyChanges(household, ops);

  beforeEach(async () => {
    server.insertRows(H, {
      recipes: [
        { id: 'r2', title: 'Kartoffelsalat', servings: 4, course: 'side' },
        {
          id: 'r3',
          title: 'Grillgemüse',
          servings: 4,
          course: 'side',
          variants: [{ id: 'v-vegan', name: 'vegan', isDefault: true }],
        },
        collection('c-grill'),
        collection('c-sommer'),
      ],
    });
    await apply([contained('cr-1', 'c-grill', 'r2'), contained('cr-2', 'c-grill', 'r3')]);
  });

  it('E2, E3: a collection needs course null and none of the recipe fields; kind is insert only', async () => {
    await expect(
      apply([
        { kind: 'insert', table: 'recipes', row: { id: 'c-x', kind: 'collection', title: 'X' } },
      ]),
    ).rejects.toMatchObject({ kind: 'permanent', code: '23514' });
    for (const field of [
      { total_minutes: 30 },
      { cuisine: 'Italienisch' },
      { tags: ['grill'] },
      { variants: [{ id: 'v', name: 'v', isDefault: true }] },
      { steps: [{ id: 's', text: 'Grillen' }] },
      { lead_time: { text: 'Marinieren', hours: 12 } },
      { ingredients: [{ id: 'i', articleId: 'a-milk', shoppingRule: 'count', variantId: 'v' }] },
    ]) {
      await expect(
        apply([{ kind: 'insert', table: 'recipes', row: collection('c-x', field) }]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      apply([{ kind: 'insert', table: 'recipes', row: { id: 'r-x', title: 'X', course: null } }]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      apply([{ kind: 'insert', table: 'recipes', row: { id: 'r-x', kind: 'other', title: 'X' } }]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      apply([{ kind: 'patch', table: 'recipes', id: 'r2', changes: { kind: 'collection' } }]),
    ).rejects.toMatchObject({ code: 'invalid_change' });
    await apply([{ kind: 'patch', table: 'recipes', id: 'c-grill', changes: { servings: 10 } }]);
    await expect(
      apply([{ kind: 'patch', table: 'recipes', id: 'c-grill', changes: { course: 'main' } }]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(server.row(H, 'recipes', 'c-grill')).toMatchObject({ servings: 10, course: null });
  });

  it('AC-009: no collection in a collection, no recipe as container, no collection in itself', async () => {
    for (const [collectionId, recipeId] of [
      ['c-grill', 'c-sommer'],
      ['r2', 'r3'],
      ['c-grill', 'c-grill'],
    ]) {
      await expect(
        apply([contained('cr-x', String(collectionId), String(recipeId))]),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'collection_recipe_kind_invalid' });
    }
    expect(server.rows(H, 'collection_recipes').map((row) => row.id)).toEqual(['cr-1', 'cr-2']);
  });

  it('AC-010, AC-011: twice is 23505; a foreign or deleted recipe 23503; a foreign member is not_member', async () => {
    await expect(apply([contained('cr-x', 'c-grill', 'r2')])).rejects.toMatchObject({
      code: '23505',
    });
    server.addHousehold({ id: 'h-2', name: 'WG' }, [STRANGER]);
    server.insertRows('h-2', { recipes: [{ id: 'r-pizza', title: 'Pizza', course: 'main' }] });
    await expect(apply([contained('cr-x', 'c-grill', 'r-pizza')])).rejects.toMatchObject({
      code: '23503',
      constraint: 'collection_recipes_recipe_fkey',
    });
    await expect(
      apply([contained('cr-x', 'c-grill', 'r1')], STRANGER, 'h-2'),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(apply([contained('cr-x', 'c-grill', 'r1')], STRANGER)).rejects.toMatchObject({
      code: 'not_member',
    });
    const pull = await server.transport(STRANGER).syncPull({
      households: { 'h-2': { full: true } },
    });
    expect(pull.households[H]).toBeUndefined();
    expect(pull.households['h-2']?.rows.collection_recipes ?? []).toEqual([]);
  });

  it('E4: servings 1–100, variant 1–64 characters; only servings, variant and order are patched', async () => {
    for (const extra of [
      { servings: 0 },
      { servings: 101 },
      { variant_id: '' },
      { variant_id: 'v'.repeat(65) },
    ]) {
      await expect(apply([contained('cr-x', 'c-sommer', 'r2', extra)])).rejects.toMatchObject({
        code: '23514',
      });
    }
    await apply([
      {
        kind: 'patch',
        table: 'collection_recipes',
        id: 'cr-2',
        changes: { servings: 8, variant_id: 'v-vegan', sort: 3 },
      },
    ]);
    expect(server.row(H, 'collection_recipes', 'cr-2')).toMatchObject({
      servings: 8,
      variant_id: 'v-vegan',
      sort: 3,
    });
    for (const changes of [{ collection_id: 'c-sommer' }, { recipe_id: 'r1' }]) {
      await expect(
        apply([{ kind: 'patch', table: 'collection_recipes', id: 'cr-2', changes }]),
      ).rejects.toMatchObject({ code: 'invalid_change' });
    }
    await expect(
      apply([{ kind: 'patch', table: 'collection_recipes', id: 'cr-gone', changes: { sort: 1 } }]),
    ).rejects.toMatchObject({ code: 'row_not_found' });
  });

  it('E15: the 51st recipe is too_many_collection_recipes; a collection with its rows in one call', async () => {
    const recipes = Array.from({ length: 49 }, (_, index) => ({
      id: `rx-${index}`,
      title: `Rezept ${index}`,
      course: 'main',
    }));
    server.insertRows(H, { recipes });
    await apply(
      recipes.slice(0, 48).map((row, index) => contained(`crx-${index}`, 'c-grill', row.id)),
    );
    await expect(apply([contained('crx-49', 'c-grill', 'rx-48')])).rejects.toMatchObject({
      code: 'too_many_collection_recipes',
    });
    await apply([
      { kind: 'insert', table: 'recipes', row: collection('c-neu') },
      contained('cr-neu', 'c-neu', 'r2'),
    ]);
    expect(server.row(H, 'collection_recipes', 'cr-neu')).toBeDefined();
    await expect(
      apply([
        { kind: 'insert', table: 'recipes', row: collection('c-halb') },
        contained('cr-halb', 'c-halb', 'c-grill'),
      ]),
    ).rejects.toMatchObject({ code: 'collection_recipe_kind_invalid' });
    expect(server.row(H, 'recipes', 'c-halb')).toBeUndefined();
  });

  it('AC-032: deleting a collection takes its rows with tombstones, the recipes stay; restore brings all back', async () => {
    await apply([
      { kind: 'patch', table: 'collection_recipes', id: 'cr-2', changes: { servings: 8, sort: 1 } },
    ]);
    const before = server.rows(H, 'collection_recipes');
    const enrico = server.transport(ENRICO);
    expect(await enrico.deleteRecipe('c-grill', '2026-11-20')).toEqual({
      converted: 0,
      removed: 0,
      collections: 0,
    });
    expect(server.rows(H, 'collection_recipes')).toEqual([]);
    expect(server.row(H, 'recipes', 'r2')).toBeDefined();
    const pull = await server.transport(NADJA).syncPull({
      households: { [H]: { full: false, since: { recipes: '2026-11-20T09:00:00Z' } } },
    });
    expect(
      pull.households[H]?.tombstones
        .filter((tombstone) => tombstone.table === 'collection_recipes')
        .map((tombstone) => tombstone.id)
        .sort(),
    ).toEqual(['cr-1', 'cr-2']);
    expect(await enrico.restoreRecipe('c-grill')).toBe(true);
    expect(server.row(H, 'recipes', 'c-grill')).toMatchObject({ kind: 'collection' });
    const strip = (rows: Row[]) =>
      rows.map(({ id, collection_id, recipe_id, servings, variant_id, sort }) => ({
        id,
        collection_id,
        recipe_id,
        servings: servings ?? null,
        variant_id: variant_id ?? null,
        sort,
      }));
    expect(strip(server.rows(H, 'collection_recipes'))).toEqual(strip(before));
  });

  it('AC-033: a recipe in two collections counts 2; a collection deleted meanwhile is skipped on restore', async () => {
    await apply([contained('cr-3', 'c-sommer', 'r2', { servings: 3, sort: 4 })]);
    const enrico = server.transport(ENRICO);
    expect(await enrico.deleteRecipe('r2', '2026-11-20')).toMatchObject({ collections: 2 });
    expect(server.rows(H, 'collection_recipes').map((row) => row.id)).toEqual(['cr-2']);
    await enrico.deleteRecipe('c-sommer', '2026-11-20');
    expect(await enrico.restoreRecipe('r2')).toBe(true);
    expect(
      server
        .rows(H, 'collection_recipes')
        .map((row) => row.id)
        .sort(),
    ).toEqual(['cr-1', 'cr-2']);
  });

  it('E11: restore fails as a whole when a collection is full by now; the recipe stays deleted', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.deleteRecipe('r2', '2026-11-20');
    const recipes = Array.from({ length: 49 }, (_, index) => ({
      id: `rx-${index}`,
      title: `Rezept ${index}`,
      course: 'main',
    }));
    server.insertRows(H, { recipes });
    await apply(recipes.map((row, index) => contained(`crx-${index}`, 'c-grill', row.id)));
    await expect(enrico.restoreRecipe('r2')).rejects.toMatchObject({
      code: 'too_many_collection_recipes',
    });
    expect(server.row(H, 'recipes', 'r2')).toBeUndefined();
  });
});

describe('fake server: entry reminders (spec 0017, like the database)', () => {
  // Friday 20.11.2026, 11:00 in Berlin (the household's zone).
  const SATURDAY = '2026-11-21';
  const lasagne = (extra: Row = { id: 'e-lasagne' }): Row => ({
    date: SATURDAY,
    slot_id: 'slot-dinner',
    kind: 'recipe',
    recipe_id: 'r1',
    eater_ids: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...extra,
  });
  const insert = (row: Row): RowOp => ({ kind: 'insert', table: 'meal_plan_entries', row });
  const patch = (changes: Record<string, unknown>): RowOp => ({
    kind: 'patch',
    table: 'meal_plan_entries',
    id: 'e-lasagne',
    changes,
  });
  const apply = (...ops: RowOp[]) => server.transport(ENRICO).applyChanges(H, ops);
  const stored = () => server.row(H, 'meal_plan_entries', 'e-lasagne');

  it('AC-002: an entry is inserted with its reminder; the time reads back with seconds', async () => {
    await apply(
      insert(
        lasagne({
          id: 'e-lasagne',
          reminder_day_offset: 1,
          reminder_at: '18:00',
          reminder_text: 'Fleisch auftauen',
        }),
      ),
    );
    expect(stored()).toMatchObject({
      reminder_day_offset: 1,
      reminder_at: '18:00:00',
      reminder_text: 'Fleisch auftauen',
    });
  });

  it('an entry without a reminder has three nulls', async () => {
    await apply(insert(lasagne()));
    expect(stored()).toMatchObject({
      reminder_day_offset: null,
      reminder_at: null,
      reminder_text: null,
    });
  });

  it.each([
    [
      'a time outside 5-minute steps (AC-012, AC-013)',
      { reminder_day_offset: 0, reminder_at: '17:03' },
    ],
    ['a day after the entry (AC-013)', { reminder_day_offset: -1, reminder_at: '18:00' }],
    [
      'more than 366 days before',
      { date: '2028-01-01', reminder_day_offset: 367, reminder_at: '18:00' },
    ],
    ['a time without a day', { reminder_at: '18:00' }],
    ['a day without a time', { reminder_day_offset: 1 }],
    ['a text without a time', { reminder_text: 'Käse' }],
    [
      '81 characters (AC-015)',
      { reminder_day_offset: 1, reminder_at: '18:00', reminder_text: 'x'.repeat(81) },
    ],
    [
      'a line break (AC-015)',
      { reminder_day_offset: 1, reminder_at: '18:00', reminder_text: 'Käse\nkaufen' },
    ],
    [
      'spaces at the edges',
      { reminder_day_offset: 1, reminder_at: '18:00', reminder_text: ' Käse' },
    ],
    ['an empty text', { reminder_day_offset: 1, reminder_at: '18:00', reminder_text: '' }],
  ] as const)('refuses %s with 23514', async (_, reminder) => {
    await apply(insert(lasagne()));
    await expect(apply(patch(reminder))).rejects.toMatchObject({ code: '23514' });
    expect(stored()).toMatchObject({ reminder_at: null, reminder_day_offset: null });
  });

  it('REQ-002: an entry without a day takes no reminder', async () => {
    await expect(
      apply(
        insert(
          lasagne({ id: 'e-lasagne', date: null, reminder_day_offset: 0, reminder_at: '17:00' }),
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('AC-011, AC-013: a moment in the past is refused on insert and on change, in the household zone', async () => {
    const today = (at: string) =>
      lasagne({ id: 'e-lasagne', date: '2026-11-20', reminder_day_offset: 0, reminder_at: at });
    await expect(apply(insert(today('11:00')))).rejects.toMatchObject({
      code: 'reminder_in_past',
    });
    // 10:00 UTC is 11:00 in Berlin: 11:30 lies in the future there.
    await apply(insert(today('11:30')));
    await expect(apply(patch({ reminder_at: '10:00' }))).rejects.toMatchObject({
      code: 'reminder_in_past',
    });
    // Only the text changes: the moment is not judged again.
    vi.setSystemTime(new Date('2026-11-20T10:45:00Z'));
    await apply(patch({ reminder_text: 'Käse' }));
    expect(stored()).toMatchObject({ reminder_at: '11:30:00', reminder_text: 'Käse' });
  });

  it('AC-022: moving the entry is never refused, even when the reminder then lies in the past', async () => {
    await apply(insert(lasagne({ id: 'e-lasagne', reminder_day_offset: 1, reminder_at: '18:00' })));
    await apply(patch({ date: '2026-11-20' }));
    expect(stored()).toMatchObject({ date: '2026-11-20', reminder_day_offset: 1 });
  });

  it('AC-023: back to "Vorgemerkt" clears the reminder, also when only the date is sent (v2026.11.1)', async () => {
    await apply(
      insert(
        lasagne({
          id: 'e-lasagne',
          reminder_day_offset: 0,
          reminder_at: '17:00',
          reminder_text: 'Käse kaufen',
        }),
      ),
    );
    await apply(patch({ date: null }));
    expect(stored()).toMatchObject({
      date: null,
      reminder_day_offset: null,
      reminder_at: null,
      reminder_text: null,
    });
    // Undo sends date and reminder together; the date changes, so the moment is not judged.
    vi.setSystemTime(new Date('2026-11-21T17:30:00Z'));
    await apply(
      patch({
        date: SATURDAY,
        reminder_day_offset: 0,
        reminder_at: '17:00:00',
        reminder_text: 'Käse kaufen',
      }),
    );
    expect(stored()).toMatchObject({ date: SATURDAY, reminder_at: '17:00:00' });
  });

  it('REQ-007: a new member’s settings have "Erinnerungen an Einträgen" on; she can switch it', async () => {
    const own = server.rows(H, 'notification_settings').find((row) => row.member_id === ENRICO);
    expect(own).toMatchObject({ entry_reminders_enabled: true });
    await apply({
      kind: 'patch',
      table: 'notification_settings',
      id: String(own?.id),
      changes: { entry_reminders_enabled: false },
    });
    expect(server.row(H, 'notification_settings', String(own?.id))).toMatchObject({
      entry_reminders_enabled: false,
    });
  });

  it('AC-027: nobody switches another member’s kind', async () => {
    const theirs = server.rows(H, 'notification_settings').find((row) => row.member_id === NADJA);
    await expect(
      apply({
        kind: 'patch',
        table: 'notification_settings',
        id: String(theirs?.id),
        changes: { entry_reminders_enabled: false },
      }),
    ).rejects.toMatchObject({ code: 'row_not_found' });
    expect(server.row(H, 'notification_settings', String(theirs?.id))).toMatchObject({
      entry_reminders_enabled: true,
    });
  });
});
