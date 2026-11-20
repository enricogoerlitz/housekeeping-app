// The wire between the device and the server: exactly the RPC contracts of spec 0003
// (tmp/brief/rpc-contracts.md). JSON keys are the database's snake_case. Two implementations:
// SupabaseTransport (transport-supabase.ts) and an in-memory server for tests (transport-fake.ts).
import type {
  AiSearchRequest,
  AiSearchResult,
  AssistantReply,
  AssistantRequest,
  PullRequest,
  PullResult,
  ResolveMapsLinkReply,
  RowOp,
  SpeechTokenReply,
} from '@housekeeping/core';
import { z } from 'zod';

// ---------- Errors ----------

/**
 * transient: worth retrying (network, timeout, 408, 429, 5xx); the outcome of a write is unknown.
 * permanent: the server said no (4xx, Postgres error); `code` is the server's code, e.g.
 * `invalid_email`, `row_not_found`.
 */
export class TransportError extends Error {
  constructor(
    readonly kind: 'transient' | 'permanent',
    readonly code: string,
    readonly status?: number,
  ) {
    super(`${kind}: ${code}`);
    this.name = 'TransportError';
  }
}

export function isTransient(error: unknown): boolean {
  return error instanceof TransportError && error.kind === 'transient';
}

/** True for failures caused by having no connection (as opposed to a struggling server). */
export function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TransportError &&
    error.kind === 'transient' &&
    (error.code === 'network' || error.code === 'offline' || error.code === 'timeout')
  );
}

const SERVER_CODE = /^[a-z][a-z0-9_]*$/;

/** Classifies an HTTP status and a PostgREST error body (`message` carries our error code). */
export function classifyError(
  status: number,
  error: { message?: string; code?: string },
): TransportError {
  const transient = status === 0 || status === 408 || status === 429 || status >= 500;
  const message = error.message ?? '';
  const code = SERVER_CODE.test(message)
    ? message
    : status === 0
      ? 'network'
      : error.code || `http_${status}`;
  return new TransportError(transient ? 'transient' : 'permanent', code, status);
}

// ---------- Contract shapes ----------

const ContributionSchema = z.object({
  id: z.string(),
  source: z.unknown(),
  count: z.number().nullable(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
});

export const AddEntrySchema = z.object({
  client_item_id: z.string(),
  client_article_id: z.string(),
  article_name: z.string(),
  name_key: z.string(),
  contributions: z.array(ContributionSchema),
});
export type AddEntry = z.infer<typeof AddEntrySchema>;

/** A row operation, or one of the domain operations `apply_changes` allows. */
export type ChangeOp =
  | RowOp
  | { kind: 'add_contributions'; list_id: string; entries: AddEntry[] }
  | { kind: 'remove_contributions'; ids: string[] };

export const ApplyChangesResultSchema = z.object({
  applied: z.number(),
  results: z.array(z.unknown()),
});
export type ApplyChangesResult = z.infer<typeof ApplyChangesResultSchema>;

export const CheckResultSchema = z
  .object({ item_id: z.string(), checked: z.boolean(), check_seq: z.number() })
  .nullable();
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const NotAvailableResultSchema = z
  .object({ item_id: z.string(), not_available: z.boolean() })
  .nullable();
export type NotAvailableResult = z.infer<typeof NotAvailableResultSchema>;

export const AddResultSchema = z.array(
  z.object({
    client_item_id: z.string(),
    item_id: z.string(),
    client_article_id: z.string(),
    article_id: z.string(),
  }),
);
export type AddResult = z.infer<typeof AddResultSchema>;

export const AssignAreaResultSchema = z
  .object({ article_id: z.string(), area_id: z.string().nullable() })
  .nullable();
export type AssignAreaResult = z.infer<typeof AssignAreaResultSchema>;

const LooseRowSchema = z.record(z.string(), z.unknown());

export const ClearedItemsSchema = z.array(
  z.object({ item: LooseRowSchema, contributions: z.array(LooseRowSchema).nullable() }),
);
export type ClearedItems = z.infer<typeof ClearedItemsSchema>;

/** sync_pull as sent: composite-key rows have no `id` yet (see db/tables.ts). */
export const RawPullResultSchema = z.object({
  serverTime: z.string(),
  small: z.record(z.string(), z.array(LooseRowSchema)),
  households: z.record(
    z.string(),
    z.object({
      full: z.boolean(),
      rows: z.record(
        z.string(),
        z.array(z.looseObject({ id: z.string().optional(), updated_at: z.string() })),
      ),
      tombstones: z.array(z.object({ table: z.string(), id: z.string(), deletedAt: z.string() })),
    }),
  ),
});
export type RawPullResult = z.infer<typeof RawPullResultSchema>;

export interface Transport {
  // Generic write (ADR-0011)
  applyChanges(householdId: string, ops: readonly ChangeOp[]): Promise<ApplyChangesResult>;
  // Store queue and list
  setItemChecked(itemId: string, checked: boolean, seenCheckSeq: number): Promise<CheckResult>;
  setItemNotAvailable(itemId: string, value: boolean): Promise<NotAvailableResult>;
  addShoppingContributions(listId: string, entries: readonly AddEntry[]): Promise<AddResult>;
  assignArticleArea(articleId: string, areaId: string | null): Promise<AssignAreaResult>;
  clearCheckedItems(listId: string): Promise<ClearedItems>;
  removeContributions(ids: readonly string[]): Promise<number>;
  /** Undo of clearCheckedItems: puts the items back checked, with their contributions. */
  restoreClearedItems(listId: string, items: ClearedItems): Promise<number>;
  // Per member
  setRecipeFavorite(recipeId: string, favorite: boolean): Promise<void>;
  setRecipeRating(recipeId: string, stars: number | null): Promise<void>;
  setRestaurantFavorite(restaurantId: string, favorite: boolean): Promise<void>;
  setRestaurantRating(restaurantId: string, stars: number | null): Promise<void>;
  setFeedbackVote(feedbackId: string, voted: boolean): Promise<void>;
  // Household, invitation, membership
  createHousehold(name: string, starter: unknown): Promise<string>;
  inviteMember(householdId: string, email: string): Promise<string>;
  acceptInvitation(invitationId: string): Promise<string>;
  declineInvitation(invitationId: string): Promise<void>;
  removeMember(householdId: string, profileId: string): Promise<void>;
  // Edge functions
  /** Follows a short map link on the server (`resolve-maps-link`); `not_a_maps_link` when none. */
  resolveMapsLink(url: string): Promise<ResolveMapsLinkReply>;
  /** The assistant (`ai-assistant`): an answer, maybe with a proposal; it never changes data. */
  askAssistant(request: AssistantRequest): Promise<AssistantReply>;
  /** The AI recipe search (`ai-search`). */
  aiSearch(request: AiSearchRequest): Promise<AiSearchResult>;
  /** A short-lived token for streaming speech to Azure (`speech-token`); never the key. */
  speechToken(): Promise<SpeechTokenReply>;
  // Sync
  syncPull(request: PullRequest): Promise<PullResult>;
  /** Realtime: calls `onSignal` when the household changed. Only a signal, never data. */
  subscribe(householdId: string, onSignal: () => void): () => void;
}

/** A transport with the developer switch "Offline simulieren": blocked, every call fails. */
export interface SwitchableTransport extends Transport {
  setBlocked(blocked: boolean): void;
  isBlocked(): boolean;
}

/** Wraps a transport so that it can be switched off; signals are dropped while blocked. */
export function switchable(inner: Transport): SwitchableTransport {
  let blocked = false;
  const guard =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      blocked ? Promise.reject(new TransportError('transient', 'offline')) : call(...args);
  return {
    applyChanges: guard(inner.applyChanges.bind(inner)),
    setItemChecked: guard(inner.setItemChecked.bind(inner)),
    setItemNotAvailable: guard(inner.setItemNotAvailable.bind(inner)),
    addShoppingContributions: guard(inner.addShoppingContributions.bind(inner)),
    assignArticleArea: guard(inner.assignArticleArea.bind(inner)),
    clearCheckedItems: guard(inner.clearCheckedItems.bind(inner)),
    removeContributions: guard(inner.removeContributions.bind(inner)),
    restoreClearedItems: guard(inner.restoreClearedItems.bind(inner)),
    setRecipeFavorite: guard(inner.setRecipeFavorite.bind(inner)),
    setRecipeRating: guard(inner.setRecipeRating.bind(inner)),
    setRestaurantFavorite: guard(inner.setRestaurantFavorite.bind(inner)),
    setRestaurantRating: guard(inner.setRestaurantRating.bind(inner)),
    setFeedbackVote: guard(inner.setFeedbackVote.bind(inner)),
    createHousehold: guard(inner.createHousehold.bind(inner)),
    inviteMember: guard(inner.inviteMember.bind(inner)),
    acceptInvitation: guard(inner.acceptInvitation.bind(inner)),
    declineInvitation: guard(inner.declineInvitation.bind(inner)),
    removeMember: guard(inner.removeMember.bind(inner)),
    resolveMapsLink: guard(inner.resolveMapsLink.bind(inner)),
    askAssistant: guard(inner.askAssistant.bind(inner)),
    aiSearch: guard(inner.aiSearch.bind(inner)),
    speechToken: guard(inner.speechToken.bind(inner)),
    syncPull: guard(inner.syncPull.bind(inner)),
    subscribe: (householdId, onSignal) =>
      inner.subscribe(householdId, () => {
        if (!blocked) onSignal();
      }),
    setBlocked: (value) => {
      blocked = value;
    },
    isBlocked: () => blocked,
  };
}
