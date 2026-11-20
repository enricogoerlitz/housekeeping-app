import { normalizeText, type RowOp } from '@housekeeping/core';
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
    shopping_lists: [{ id: 'l1', name: 'Standardliste', is_default: true, store_id: null }],
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
    shopping_items: [{ id: 'i-milk', list_id: 'l1', article_id: 'a-milk' }],
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
    const [result] = await enrico.addShoppingContributions('l1', [entry('Vollmilch', 'c-new')]);
    expect(result).toMatchObject({ item_id: 'i-milk', article_id: 'a-milk' });
    await enrico.addShoppingContributions('l1', [entry('Vollmilch', 'c-new')]);
    expect(
      server.rows(H, 'shopping_contributions').filter((c) => c.item_id === 'i-milk'),
    ).toHaveLength(2);

    const [bread] = await enrico.addShoppingContributions('l1', [entry('Brot', 'c-bread')]);
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
    await enrico.addShoppingContributions('l1', [entry('Milch', 'c-again')]);
    expect(server.row(H, 'shopping_items', 'i-milk')).toMatchObject({
      checked: false,
      check_seq: 2,
    });
    expect(server.rows(H, 'shopping_contributions').map((c) => c.id)).toEqual(['c-again']);
  });

  it('clears checked items and returns them for undo', async () => {
    const enrico = server.transport(ENRICO);
    await enrico.setItemChecked('i-milk', true, 0);
    const cleared = await enrico.clearCheckedItems('l1');
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.item).toMatchObject({ id: 'i-milk' });
    expect(cleared[0]?.contributions).toHaveLength(1);
    expect(server.rows(H, 'shopping_items')).toEqual([]);

    expect(await enrico.restoreClearedItems('l1', cleared)).toBe(1);
    expect(await enrico.restoreClearedItems('l1', cleared)).toBe(0);
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

  it('refuses to delete an article that is on a list, and a reference to a missing row', async () => {
    const enrico = server.transport(ENRICO);
    await expect(
      enrico.applyChanges(H, [{ kind: 'delete', table: 'articles', id: 'a-milk' }]),
    ).rejects.toMatchObject({ code: '23503' });
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
