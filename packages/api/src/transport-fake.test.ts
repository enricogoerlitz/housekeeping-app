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
  });
}

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
      table: 'recipes',
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
    await server.transport(NADJA).applyChanges(H, [{ kind: 'delete', table: 'recipes', id: 'r1' }]);
    const delta = await enrico.syncPull({
      households: { [H]: { full: false, since: { recipes: first.serverTime } } },
    });
    expect(delta.households[H]?.rows.recipes).toEqual([]);
    expect(delta.households[H]?.tombstones).toEqual([
      { table: 'recipes', id: 'r1', deletedAt: expect.any(String) },
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

  it('refuses to delete a recipe that is in the plan (on delete restrict)', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.applyChanges(H, [plan('e1', { kind: 'recipe', recipe_id: 'r1' })]);
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'recipes', id: 'r1' }]),
    ).rejects.toMatchObject({ kind: 'permanent', code: '23503' });
    await enrico.applyChanges(H, [
      { kind: 'delete', table: 'meal_plan_entries', id: 'e1' },
      { kind: 'delete', table: 'recipes', id: 'r1' },
    ]);
    expect(server.row(H, 'recipes', 'r1')).toBeUndefined();
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
      { kind: 'insert', table: 'chores', row: { id: 'c1', title: 'Bad' } },
      { kind: 'insert', table: 'chore_events', row: { id: 'ev1', chore_id: 'c1', title: 'Bad' } },
      { kind: 'delete', table: 'chores', id: 'c1' },
    ]);
    expect(server.row(H, 'chore_events', 'ev1')).toMatchObject({ chore_id: null });
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
  });

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
