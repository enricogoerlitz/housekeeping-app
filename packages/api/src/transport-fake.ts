// An in-memory server that implements the RPC contracts of spec 0003 for unit tests: membership
// checks, the apply_changes allowlist with all-or-nothing, "Abhaken gewinnt" with check_seq, the
// add merge (core queueEffect has the same rules as the server), deletion log and sync_pull.
// Several transports (users, devices) can share one server.
import {
  compareTimestamps,
  queueEffect,
  type AiSearchRequest,
  type AiSearchResult,
  type AssistantReply,
  type AssistantRequest,
  type ResolveMapsLinkReply,
  type SpeechTokenReply,
  type PullRequest,
  type Row,
  type SmallRow,
  type TableRows,
  type Tombstone,
} from '@housekeeping/core';

import {
  COMPOSITE_TABLES,
  ID_TABLES,
  WRITABLE_COLUMNS,
  compositeId,
  withCompositeIds,
  type WritableTable,
} from './db/tables';
import {
  TransportError,
  type AddEntry,
  type AddResult,
  type ChangeOp,
  type RawPullResult,
  type Transport,
} from './transport';

type RpcName =
  | 'apply_changes'
  | 'set_shopping_item_checked'
  | 'set_shopping_item_not_available'
  | 'add_shopping_contributions'
  | 'assign_article_area'
  | 'clear_checked_items'
  | 'remove_contributions'
  | 'restore_cleared_items'
  | 'set_recipe_favorite'
  | 'set_recipe_rating'
  | 'set_restaurant_favorite'
  | 'set_restaurant_rating'
  | 'set_feedback_vote'
  | 'create_household'
  | 'invite_member'
  | 'accept_invitation'
  | 'decline_invitation'
  | 'remove_member'
  | 'resolve-maps-link'
  | 'ai-assistant'
  | 'ai-search'
  | 'speech-token'
  | 'sync_pull';

/** How the fake AI edge functions answer; an unset one answers `ai_unavailable` (503). */
export interface FakeAi {
  assistant?: (request: AssistantRequest) => AssistantReply;
  search?: (request: AiSearchRequest) => AiSearchResult;
  speechToken?: () => SpeechTokenReply;
}

interface FailureRule {
  fn: RpcName;
  error: TransportError;
  /** The server applied the call, but the answer got lost (unknown outcome). */
  afterApply: boolean;
}

export interface FakeServer {
  transport(userId: string): Transport;
  addProfile(profile: { id: string; name: string; email: string; color?: string }): void;
  addHousehold(household: Row, memberIds: string[]): void;
  /** Writes rows as an administrator would: no checks, server columns set. */
  insertRows(householdId: string, rows: Record<string, Row[]>): void;
  /** Deletes a row as an administrator would, with its tombstone. */
  deleteRow(householdId: string, table: string, id: string): void;
  rows(householdId: string, table: string): Row[];
  row(householdId: string, table: string, id: string): Row | undefined;
  /** The next call of `fn` fails with `error`. */
  failNext(fn: RpcName, error: TransportError, options?: { afterApply?: boolean }): void;
  /** Like pg_cron: forgets deletions older than `before`. */
  purgeDeletionsBefore(before: string): void;
  /** The place the edge function `resolve-maps-link` answers for a short link. */
  setMapsLink(url: string, reply: ResolveMapsLinkReply): void;
  /** The answers of the AI edge functions. */
  setAi(ai: FakeAi): void;
  calls: { userId: string; fn: string }[];
}

const SYNCED_TABLES = [...ID_TABLES, ...Object.keys(COMPOSITE_TABLES)];

/** Rows depending on a deleted row through `on delete cascade`. */
const CASCADES: Record<string, { table: string; column: string }[]> = {
  shopping_lists: [{ table: 'shopping_items', column: 'list_id' }],
  shopping_items: [{ table: 'shopping_contributions', column: 'item_id' }],
  recipes: [
    { table: 'recipe_favorites', column: 'recipe_id' },
    { table: 'recipe_ratings', column: 'recipe_id' },
  ],
  restaurants: [
    { table: 'restaurant_favorites', column: 'restaurant_id' },
    { table: 'restaurant_ratings', column: 'restaurant_id' },
  ],
  feedback: [{ table: 'feedback_votes', column: 'feedback_id' }],
};

/**
 * Foreign keys the commands must respect (supabase/migrations, T3): a reference must exist, and a
 * referenced row is protected (restrict) or the reference is cleared (set null).
 */
const REFERENCES: {
  table: string;
  column: string;
  target: string;
  onDelete: 'restrict' | 'set null';
}[] = [
  { table: 'meal_plan_entries', column: 'recipe_id', target: 'recipes', onDelete: 'restrict' },
  {
    table: 'meal_plan_entries',
    column: 'restaurant_id',
    target: 'restaurants',
    onDelete: 'restrict',
  },
  {
    table: 'meal_plan_entries',
    column: 'leftovers_of_entry_id',
    target: 'meal_plan_entries',
    onDelete: 'set null',
  },
  { table: 'shopping_items', column: 'article_id', target: 'articles', onDelete: 'restrict' },
  { table: 'chore_events', column: 'chore_id', target: 'chores', onDelete: 'set null' },
];

const reject = (code: string) => new TransportError('permanent', code, 400);
const foreignKey = () => new TransportError('permanent', '23503', 409);

/** meal_plan_entries_kind_complete, for the case a cleared reference can break. */
function checkPlanEntry(row: Row): void {
  if (row.kind === 'leftovers' && row.recipe_id == null && row.leftovers_of_entry_id == null) {
    throw new TransportError('permanent', '23514', 400);
  }
}

export function createFakeServer(): FakeServer {
  let lastMicros = 0;
  const profiles = new Map<string, SmallRow>();
  const households = new Map<string, SmallRow>();
  let members: SmallRow[] = [];
  let invitations: SmallRow[] = [];
  const data = new Map<string, TableRows>();
  let deletions: (Tombstone & { householdId: string })[] = [];
  const subscribers = new Map<string, Set<() => void>>();
  const failures: FailureRule[] = [];
  const calls: { userId: string; fn: string }[] = [];
  const mapsLinks = new Map<string, ResolveMapsLinkReply>();
  let ai: FakeAi = {};
  const aiUnavailable = () => new TransportError('transient', 'ai_unavailable', 503);

  /** Server clock with microseconds, strictly increasing like `now()` in separate transactions. */
  function now(): string {
    lastMicros = Math.max(lastMicros + 1, Date.now() * 1000);
    const ms = Math.floor(lastMicros / 1000);
    const micros = String(lastMicros % 1000).padStart(3, '0');
    return new Date(ms).toISOString().replace('Z', `${micros}Z`);
  }

  const isMember = (userId: string, householdId: string) =>
    members.some((member) => member.household_id === householdId && member.profile_id === userId);
  const householdsOf = (userId: string) =>
    members.filter((member) => member.profile_id === userId).map((m) => String(m.household_id));

  function notify(householdId: string): void {
    for (const listener of subscribers.get(householdId) ?? []) queueMicrotask(listener);
  }

  /**
   * Stores the outcome of a transaction: new or changed rows get their timestamps, removed rows a
   * tombstone. Rows are compared by identity, as every change creates a new row object.
   */
  function commit(householdId: string, before: TableRows, after: TableRows): void {
    const time = now();
    const next: TableRows = {};
    for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const old = before[table] ?? {};
      const rows: Record<string, Row> = {};
      for (const [id, row] of Object.entries(after[table] ?? {})) {
        if (old[id] === row) rows[id] = row;
        else
          rows[id] = {
            ...row,
            household_id: householdId,
            created_at: old[id]?.created_at ?? row.created_at ?? time,
            updated_at: time,
          };
      }
      for (const id of Object.keys(old)) {
        if (!(id in rows)) deletions.push({ householdId, table, id, deletedAt: time });
      }
      next[table] = rows;
    }
    data.set(householdId, next);
    notify(householdId);
  }

  /** Runs a write on a copy of the household's tables; nothing is stored when it throws. */
  function transaction<T>(householdId: string, write: (tables: TableRows) => [TableRows, T]): T {
    const before = data.get(householdId) ?? {};
    const [after, result] = write(before);
    commit(householdId, before, after);
    return result;
  }

  function failure(fn: RpcName): FailureRule | undefined {
    const index = failures.findIndex((rule) => rule.fn === fn);
    return index < 0 ? undefined : failures.splice(index, 1)[0];
  }

  async function run<T>(userId: string, fn: RpcName, body: () => T): Promise<T> {
    calls.push({ userId, fn });
    await Promise.resolve();
    const rule = failure(fn);
    if (rule && !rule.afterApply) throw rule.error;
    const result = body();
    if (rule) throw rule.error;
    return result;
  }

  function withRow(tables: TableRows, table: string, row: Row): TableRows {
    return { ...tables, [table]: { ...tables[table], [row.id]: row } };
  }

  /** Deletes rows like the database; `enforce` false = an administrator ignoring restrict. */
  function withoutRows(
    tables: TableRows,
    table: string,
    ids: Iterable<string>,
    enforce = true,
  ): TableRows {
    let next = tables;
    for (const id of ids) {
      if (!next[table]?.[id]) continue;
      const kept = { ...next[table] };
      delete kept[id];
      next = { ...next, [table]: kept };
      for (const reference of REFERENCES.filter((candidate) => candidate.target === table)) {
        for (const row of Object.values(next[reference.table] ?? {})) {
          if (row[reference.column] !== id) continue;
          if (reference.onDelete === 'restrict') {
            if (enforce) throw foreignKey();
            continue;
          }
          const cleared = { ...row, [reference.column]: null };
          if (enforce && reference.table === 'meal_plan_entries') checkPlanEntry(cleared);
          next = withRow(next, reference.table, cleared);
        }
      }
      for (const cascade of CASCADES[table] ?? []) {
        const dependent = Object.values(next[cascade.table] ?? {})
          .filter((row) => row[cascade.column] === id)
          .map((row) => row.id);
        next = withoutRows(next, cascade.table, dependent, enforce);
      }
    }
    return next;
  }

  /** The household holding a row the user can see (RLS), or undefined. */
  function locate(userId: string, table: string, id: string): string | undefined {
    return householdsOf(userId).find((householdId) => data.get(householdId)?.[table]?.[id]);
  }

  // ---------- apply_changes ----------

  function checkReferences(
    tables: TableRows,
    table: string,
    written: Row | Record<string, unknown>,
  ) {
    for (const reference of REFERENCES.filter((candidate) => candidate.table === table)) {
      const value = written[reference.column];
      if (value == null) continue;
      if (!tables[reference.target]?.[String(value)]) throw foreignKey();
    }
  }

  function checkColumns(table: string, columns: string[], insert: boolean): void {
    if (!Object.hasOwn(WRITABLE_COLUMNS, table)) throw reject('invalid_change');
    const allowed = new Set<string>(WRITABLE_COLUMNS[table as WritableTable]);
    if (insert) {
      allowed.add('id');
      allowed.add('household_id');
    }
    if (columns.some((column) => !allowed.has(column))) throw reject('invalid_change');
  }

  function addContributions(
    tables: TableRows,
    listId: string,
    entries: readonly AddEntry[],
  ): [TableRows, AddResult] {
    if (!tables.shopping_lists?.[listId]) throw new TransportError('permanent', 'list_not_found');
    let next = tables;
    const results: AddResult = [];
    for (const entry of entries) {
      const fresh = entry.contributions.filter(
        (contribution) => !next.shopping_contributions?.[contribution.id],
      );
      const before = next;
      if (fresh.length > 0) {
        next = queueEffect(
          {
            kind: 'add',
            listId,
            clientItemId: entry.client_item_id,
            clientArticleId: entry.client_article_id,
            contributions: fresh.map((contribution) => ({
              clientContributionId: contribution.id,
              articleName: entry.article_name,
              nameKey: entry.name_key,
              count: contribution.count ?? undefined,
              qty: contribution.qty ?? undefined,
              unit: contribution.unit ?? undefined,
              note: contribution.note ?? undefined,
            })),
          },
          next,
        );
        for (const contribution of fresh) {
          const row = next.shopping_contributions?.[contribution.id];
          if (row)
            next = withRow(next, 'shopping_contributions', { ...row, source: contribution.source });
        }
        // Reopening a checked item is a change of `checked`: count it like the server does.
        for (const [id, item] of Object.entries(next.shopping_items ?? {})) {
          const old = before.shopping_items?.[id];
          if (old?.checked === true && item.checked === false) {
            next = withRow(next, 'shopping_items', {
              ...item,
              check_seq: Number(old.check_seq ?? 0) + 1,
            });
          }
        }
        const article = next.articles?.[entry.client_article_id];
        if (article && !before.articles?.[entry.client_article_id]) {
          next = withRow(next, 'articles', {
            ...article,
            synonyms: [],
            diet: 'unknown',
            is_pantry: false,
          });
        }
      }
      const article = Object.values(next.articles ?? {}).find(
        (candidate) =>
          candidate.name_key === entry.name_key ||
          (Array.isArray(candidate.synonym_keys) &&
            candidate.synonym_keys.includes(entry.name_key)),
      );
      const firstContribution = entry.contributions[0];
      const itemId = firstContribution
        ? String(next.shopping_contributions?.[firstContribution.id]?.item_id)
        : entry.client_item_id;
      results.push({
        client_item_id: entry.client_item_id,
        item_id: itemId,
        client_article_id: entry.client_article_id,
        article_id: article?.id ?? entry.client_article_id,
      });
    }
    return [next, results];
  }

  function removeContributionRows(tables: TableRows, ids: readonly string[]): [TableRows, number] {
    const existing = ids.filter((id) => tables.shopping_contributions?.[id]);
    const itemIds = new Set(
      existing.map((id) => String(tables.shopping_contributions?.[id]?.item_id)),
    );
    let next = withoutRows(tables, 'shopping_contributions', existing);
    const empty = [...itemIds].filter(
      (itemId) =>
        !Object.values(next.shopping_contributions ?? {}).some((row) => row.item_id === itemId),
    );
    next = withoutRows(next, 'shopping_items', empty);
    return [next, existing.length];
  }

  function applyChanges(userId: string, householdId: string, ops: readonly ChangeOp[]) {
    if (!isMember(userId, householdId)) throw new TransportError('permanent', 'not_member', 403);
    const deletes = ops.filter((op) => op.kind === 'delete').length;
    if (ops.length > 200 || deletes > 20) throw reject('too_many_changes');

    let householdPatch: Record<string, unknown> | undefined;
    const result = transaction(householdId, (before) => {
      let tables = before;
      const results: unknown[] = [];
      for (const op of ops) {
        if (op.kind === 'add_contributions') {
          const [next, added] = addContributions(tables, op.list_id, op.entries);
          tables = next;
          results.push(added);
        } else if (op.kind === 'remove_contributions') {
          const [next, removed] = removeContributionRows(tables, op.ids);
          tables = next;
          results.push(removed);
        } else if (op.kind === 'insert') {
          if (op.table === 'households') throw reject('invalid_change');
          checkColumns(op.table, Object.keys(op.row), true);
          if (op.row.household_id !== undefined && op.row.household_id !== householdId) {
            throw reject('invalid_change');
          }
          if (tables[op.table]?.[op.row.id])
            throw new TransportError('permanent', 'duplicate', 409);
          const defaults =
            op.table === 'shopping_items'
              ? {
                  checked: false,
                  checked_at: null,
                  checked_by: null,
                  check_seq: 0,
                  not_available: false,
                }
              : {};
          tables = withRow(tables, op.table, {
            ...defaults,
            ...op.row,
            ...(op.table === 'feedback' ? { author_id: userId } : {}),
          });
          checkReferences(tables, op.table, op.row);
        } else if (op.kind === 'patch') {
          checkColumns(op.table, Object.keys(op.changes), false);
          if (op.table === 'households') {
            if (op.id !== householdId) throw new TransportError('permanent', 'row_not_found', 404);
            householdPatch = { ...householdPatch, ...op.changes };
            continue;
          }
          const row = tables[op.table]?.[op.id];
          if (!row) throw new TransportError('permanent', 'row_not_found', 404);
          tables = withRow(tables, op.table, { ...row, ...op.changes });
          checkReferences(tables, op.table, op.changes);
        } else {
          if (!Object.hasOwn(WRITABLE_COLUMNS, op.table) || op.table === 'households') {
            throw reject('invalid_change');
          }
          tables = withoutRows(tables, op.table, [op.id]);
        }
      }
      return [tables, { applied: ops.length, results }];
    });
    if (householdPatch) {
      const household = households.get(householdId);
      if (household)
        households.set(householdId, { ...household, ...householdPatch, updated_at: now() });
    }
    return result;
  }

  // ---------- sync_pull ----------

  function syncPull(userId: string, request: PullRequest): RawPullResult {
    const serverTime = now();
    const mine = new Set(householdsOf(userId));
    const email = profiles.get(userId)?.email;
    const openInvitations = invitations.filter(
      (invitation) => invitation.email === email && invitation.accepted_at === null,
    );
    const visibleHouseholds = new Set([
      ...mine,
      ...openInvitations.map((invitation) => String(invitation.household_id)),
    ]);
    const coMembers = new Set(
      members.filter((m) => mine.has(String(m.household_id))).map((m) => String(m.profile_id)),
    );
    coMembers.add(userId);

    const answer: RawPullResult['households'] = {};
    for (const [householdId, wanted] of Object.entries(request.households)) {
      if (!mine.has(householdId)) continue;
      const tables = data.get(householdId) ?? {};
      const rows: Record<string, (Row & { updated_at: string })[]> = {};
      const tombstones: Tombstone[] = [];
      for (const table of SYNCED_TABLES) {
        const since = wanted.full ? undefined : wanted.since[table];
        rows[table] = Object.values(tables[table] ?? {})
          .filter(
            (row) => since === undefined || compareTimestamps(String(row.updated_at), since) > 0,
          )
          .map((row) => {
            const copy = { ...row, updated_at: String(row.updated_at) };
            // The database has no id column for composite keys; the client builds it.
            if (Object.hasOwn(COMPOSITE_TABLES, table)) delete (copy as Partial<Row>).id;
            return copy;
          });
        for (const deletion of deletions) {
          if (deletion.householdId !== householdId || deletion.table !== table) continue;
          if (since !== undefined && compareTimestamps(deletion.deletedAt, since) <= 0) continue;
          tombstones.push({ table, id: deletion.id, deletedAt: deletion.deletedAt });
        }
      }
      answer[householdId] = { full: wanted.full, rows, tombstones };
    }
    return {
      serverTime,
      small: {
        profiles: [...profiles.values()].filter((profile) => coMembers.has(String(profile.id))),
        households: [...households.values()].filter((h) => visibleHouseholds.has(String(h.id))),
        household_members: members.filter((m) => mine.has(String(m.household_id))),
        household_invitations: invitations.filter(
          (invitation) => mine.has(String(invitation.household_id)) || invitation.email === email,
        ),
      },
      households: answer,
    };
  }

  // ---------- per-member rows ----------

  function setMemberRow(
    userId: string,
    table: keyof typeof COMPOSITE_TABLES,
    parentTable: string,
    parentId: string,
    notFound: string,
    row: Record<string, unknown> | undefined,
  ): void {
    const householdId = locate(userId, parentTable, parentId);
    if (!householdId) throw new TransportError('permanent', notFound, 404);
    const [parentColumn] = COMPOSITE_TABLES[table];
    const id = compositeId(table, { [parentColumn]: parentId, member_id: userId });
    transaction(householdId, (tables) => [
      row
        ? withRow(tables, table, { id, [parentColumn]: parentId, member_id: userId, ...row })
        : withoutRows(tables, table, [id]),
      undefined,
    ]);
  }

  function rating(stars: number | null): Record<string, unknown> | undefined {
    if (stars === null) return undefined;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw reject('invalid_stars');
    return { stars };
  }

  // ---------- the transport per user ----------

  function transport(userId: string): Transport {
    return {
      applyChanges: (householdId, ops) =>
        run(userId, 'apply_changes', () => applyChanges(userId, householdId, ops)),

      setItemChecked: (itemId, checked, seenCheckSeq) =>
        run(userId, 'set_shopping_item_checked', () => {
          const householdId = locate(userId, 'shopping_items', itemId);
          if (!householdId) return null;
          return transaction(householdId, (tables) => {
            const item = tables.shopping_items?.[itemId];
            if (!item) return [tables, null];
            const seq = Number(item.check_seq ?? 0);
            const answer = (row: Row) => ({
              item_id: row.id,
              checked: row.checked === true,
              check_seq: Number(row.check_seq ?? 0),
            });
            if (checked) {
              if (item.checked === true) return [tables, answer(item)];
              const next = {
                ...item,
                checked: true,
                checked_at: now(),
                checked_by: userId,
                check_seq: seq + 1,
                not_available: false,
              };
              return [withRow(tables, 'shopping_items', next), answer(next)];
            }
            // Checking wins: unchecking only applies to the state the device has seen.
            if (item.checked !== true || seq !== seenCheckSeq) return [tables, answer(item)];
            const open = Object.values(tables.shopping_items ?? {}).find(
              (other) =>
                other.id !== itemId &&
                other.list_id === item.list_id &&
                other.article_id === item.article_id &&
                other.checked !== true,
            );
            if (open) {
              let next = tables;
              for (const contribution of Object.values(tables.shopping_contributions ?? {})) {
                if (contribution.item_id === itemId) {
                  next = withRow(next, 'shopping_contributions', {
                    ...contribution,
                    item_id: open.id,
                  });
                }
              }
              next = withoutRows(next, 'shopping_items', [itemId]);
              return [next, answer(open)];
            }
            const next = {
              ...item,
              checked: false,
              checked_at: null,
              checked_by: null,
              check_seq: seq + 1,
            };
            return [withRow(tables, 'shopping_items', next), answer(next)];
          });
        }),

      setItemNotAvailable: (itemId, value) =>
        run(userId, 'set_shopping_item_not_available', () => {
          const householdId = locate(userId, 'shopping_items', itemId);
          if (!householdId) return null;
          return transaction(householdId, (tables) => {
            const item = tables.shopping_items?.[itemId];
            if (!item) return [tables, null];
            return [
              withRow(tables, 'shopping_items', { ...item, not_available: value }),
              { item_id: itemId, not_available: value },
            ];
          });
        }),

      addShoppingContributions: (listId, entries) =>
        run(userId, 'add_shopping_contributions', () => {
          const householdId = locate(userId, 'shopping_lists', listId);
          if (!householdId) throw new TransportError('permanent', 'list_not_found', 404);
          return transaction(householdId, (tables) => addContributions(tables, listId, entries));
        }),

      assignArticleArea: (articleId, areaId) =>
        run(userId, 'assign_article_area', () => {
          const householdId = locate(userId, 'articles', articleId);
          if (!householdId) return null;
          return transaction(householdId, (tables) => {
            const article = tables.articles?.[articleId];
            if (!article || (areaId !== null && !tables.areas?.[areaId])) return [tables, null];
            return [
              withRow(tables, 'articles', { ...article, area_id: areaId }),
              { article_id: articleId, area_id: areaId },
            ];
          });
        }),

      clearCheckedItems: (listId) =>
        run(userId, 'clear_checked_items', () => {
          const householdId = locate(userId, 'shopping_lists', listId);
          if (!householdId) throw new TransportError('permanent', 'list_not_found', 404);
          return transaction(householdId, (tables) => {
            const checked = Object.values(tables.shopping_items ?? {}).filter(
              (item) => item.list_id === listId && item.checked === true,
            );
            const cleared = checked.map((item) => ({
              item,
              contributions: Object.values(tables.shopping_contributions ?? {}).filter(
                (contribution) => contribution.item_id === item.id,
              ),
            }));
            return [
              withoutRows(
                tables,
                'shopping_items',
                checked.map((item) => item.id),
              ),
              cleared,
            ];
          });
        }),

      restoreClearedItems: (listId, items) =>
        run(userId, 'restore_cleared_items', () => {
          const householdId = locate(userId, 'shopping_lists', listId);
          if (!householdId) throw new TransportError('permanent', 'list_not_found', 404);
          return transaction(householdId, (tables) => {
            let next = tables;
            let restored = 0;
            for (const { item, contributions } of items) {
              const id = String(item.id);
              if (next.shopping_items?.[id]) continue;
              next = withRow(next, 'shopping_items', { ...item, id, list_id: listId });
              for (const contribution of contributions ?? []) {
                next = withRow(next, 'shopping_contributions', {
                  ...contribution,
                  id: String(contribution.id),
                  item_id: id,
                });
              }
              restored += 1;
            }
            return [next, restored];
          });
        }),

      removeContributions: (ids) =>
        run(userId, 'remove_contributions', () => {
          if (ids.length > 200) throw reject('too_many_changes');
          let removed = 0;
          for (const householdId of householdsOf(userId)) {
            const mineIds = ids.filter((id) => data.get(householdId)?.shopping_contributions?.[id]);
            if (mineIds.length === 0) continue;
            removed += transaction(householdId, (tables) =>
              removeContributionRows(tables, mineIds),
            );
          }
          return removed;
        }),

      setRecipeFavorite: (recipeId, favorite) =>
        run(userId, 'set_recipe_favorite', () =>
          setMemberRow(
            userId,
            'recipe_favorites',
            'recipes',
            recipeId,
            'recipe_not_found',
            favorite ? {} : undefined,
          ),
        ),
      setRecipeRating: (recipeId, stars) =>
        run(userId, 'set_recipe_rating', () =>
          setMemberRow(
            userId,
            'recipe_ratings',
            'recipes',
            recipeId,
            'recipe_not_found',
            rating(stars),
          ),
        ),
      setRestaurantFavorite: (restaurantId, favorite) =>
        run(userId, 'set_restaurant_favorite', () =>
          setMemberRow(
            userId,
            'restaurant_favorites',
            'restaurants',
            restaurantId,
            'restaurant_not_found',
            favorite ? {} : undefined,
          ),
        ),
      setRestaurantRating: (restaurantId, stars) =>
        run(userId, 'set_restaurant_rating', () =>
          setMemberRow(
            userId,
            'restaurant_ratings',
            'restaurants',
            restaurantId,
            'restaurant_not_found',
            rating(stars),
          ),
        ),
      setFeedbackVote: (feedbackId, voted) =>
        run(userId, 'set_feedback_vote', () =>
          setMemberRow(
            userId,
            'feedback_votes',
            'feedback',
            feedbackId,
            'feedback_not_found',
            voted ? {} : undefined,
          ),
        ),

      createHousehold: (name) =>
        run(userId, 'create_household', () => {
          const trimmed = name.trim();
          if (!trimmed || trimmed.length > 80) throw reject('invalid_name');
          const id = crypto.randomUUID();
          const listId = crypto.randomUUID();
          const time = now();
          households.set(id, {
            id,
            name: trimmed,
            meal_slots: [
              { id: crypto.randomUUID(), name: 'Mittag', sort: 0 },
              { id: crypto.randomUUID(), name: 'Abend', sort: 1 },
            ],
            default_list_id: listId,
            default_store_id: null,
            created_at: time,
            updated_at: time,
          });
          members.push({
            household_id: id,
            profile_id: userId,
            created_at: time,
            updated_at: time,
          });
          transaction(id, (tables) => [
            withRow(tables, 'shopping_lists', {
              id: listId,
              name: 'Standardliste',
              is_default: true,
              store_id: null,
            }),
            undefined,
          ]);
          return id;
        }),

      inviteMember: (householdId, email) =>
        run(userId, 'invite_member', () => {
          if (!isMember(userId, householdId))
            throw new TransportError('permanent', 'not_member', 403);
          const address = email.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(address)) throw reject('invalid_email');
          const already = members.some(
            (m) =>
              m.household_id === householdId &&
              profiles.get(String(m.profile_id))?.email === address,
          );
          if (already) throw new TransportError('permanent', 'already_member', 409);
          const time = now();
          const id = crypto.randomUUID();
          invitations.push({
            id,
            household_id: householdId,
            email: address,
            invited_by: userId,
            accepted_at: null,
            created_at: time,
            updated_at: time,
          });
          notify(householdId);
          return id;
        }),

      acceptInvitation: (invitationId) =>
        run(userId, 'accept_invitation', () => {
          const email = profiles.get(userId)?.email;
          const invitation = invitations.find(
            (candidate) => candidate.id === invitationId && candidate.email === email,
          );
          if (!invitation) throw new TransportError('permanent', 'invitation_not_found', 404);
          const time = now();
          invitations = invitations.map((candidate) =>
            candidate === invitation
              ? { ...candidate, accepted_at: time, updated_at: time }
              : candidate,
          );
          const householdId = String(invitation.household_id);
          members.push({
            household_id: householdId,
            profile_id: userId,
            created_at: time,
            updated_at: time,
          });
          notify(householdId);
          return householdId;
        }),

      declineInvitation: (invitationId) =>
        run(userId, 'decline_invitation', () => {
          const email = profiles.get(userId)?.email;
          const before = invitations.length;
          invitations = invitations.filter(
            (candidate) => !(candidate.id === invitationId && candidate.email === email),
          );
          if (invitations.length === before) {
            throw new TransportError('permanent', 'invitation_not_found', 404);
          }
        }),

      removeMember: (householdId, profileId) =>
        run(userId, 'remove_member', () => {
          if (!isMember(userId, householdId))
            throw new TransportError('permanent', 'not_member', 403);
          if (!isMember(profileId, householdId)) {
            throw new TransportError('permanent', 'member_not_found', 404);
          }
          if (members.filter((m) => m.household_id === householdId).length === 1) {
            throw new TransportError('permanent', 'last_member', 400);
          }
          members = members.filter(
            (m) => !(m.household_id === householdId && m.profile_id === profileId),
          );
          notify(householdId);
        }),

      resolveMapsLink: (url) =>
        run(userId, 'resolve-maps-link', () => {
          const reply = mapsLinks.get(url);
          if (!reply) throw new TransportError('permanent', 'not_a_maps_link', 422);
          return reply;
        }),
      askAssistant: (request) =>
        run(userId, 'ai-assistant', () => {
          if (!ai.assistant) throw aiUnavailable();
          return ai.assistant(request);
        }),
      aiSearch: (request) =>
        run(userId, 'ai-search', () => {
          if (!ai.search) throw aiUnavailable();
          return ai.search(request);
        }),
      speechToken: () =>
        run(userId, 'speech-token', () => {
          if (!ai.speechToken) throw aiUnavailable();
          return ai.speechToken();
        }),

      syncPull: (request) =>
        run(userId, 'sync_pull', () => withCompositeIds(syncPull(userId, request))),

      subscribe: (householdId, onSignal) => {
        const listeners = subscribers.get(householdId) ?? new Set();
        subscribers.set(householdId, listeners);
        // Realtime authorises per message (RLS on realtime.messages): no signal for non-members.
        const listener = () => {
          if (isMember(userId, householdId)) onSignal();
        };
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }

  return {
    transport,
    calls,
    addProfile(profile) {
      const time = now();
      profiles.set(profile.id, {
        color: '#3E6C8E',
        diet_preference: 'flexible',
        dislikes: [],
        ...profile,
        email: profile.email.toLowerCase(),
        created_at: time,
        updated_at: time,
      });
    },
    addHousehold(household, memberIds) {
      const time = now();
      households.set(household.id, {
        meal_slots: [],
        default_list_id: null,
        default_store_id: null,
        ...household,
        created_at: time,
        updated_at: time,
      });
      for (const profileId of memberIds) {
        members.push({
          household_id: household.id,
          profile_id: profileId,
          created_at: time,
          updated_at: time,
        });
      }
    },
    insertRows(householdId, rows) {
      const before = data.get(householdId) ?? {};
      let after = before;
      for (const [table, list] of Object.entries(rows)) {
        for (const row of list) {
          const defaults =
            table === 'shopping_items'
              ? {
                  checked: false,
                  checked_at: null,
                  checked_by: null,
                  check_seq: 0,
                  not_available: false,
                }
              : {};
          after = withRow(after, table, { ...defaults, ...row });
        }
      }
      commit(householdId, before, after);
    },
    deleteRow(householdId, table, id) {
      const before = data.get(householdId) ?? {};
      commit(householdId, before, withoutRows(before, table, [id], false));
    },
    rows: (householdId, table) => Object.values(data.get(householdId)?.[table] ?? {}),
    row: (householdId, table, id) => data.get(householdId)?.[table]?.[id],
    failNext(fn, error, options = {}) {
      failures.push({ fn, error, afterApply: options.afterApply ?? false });
    },
    setMapsLink(url, reply) {
      mapsLinks.set(url, reply);
    },
    setAi(next) {
      ai = next;
    },
    purgeDeletionsBefore(before) {
      deletions = deletions.filter(
        (deletion) => compareTimestamps(deletion.deletedAt, before) >= 0,
      );
    },
  };
}
