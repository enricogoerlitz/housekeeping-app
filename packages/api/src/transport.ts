// The wire between the device and the server: exactly the RPCs of supabase/migrations
// (docs/architecture/sync.md). JSON keys are the database's snake_case. Two implementations:
// SupabaseTransport (transport-supabase.ts) and an in-memory server for tests (transport-fake.ts).
import {
  PushSubscriptionStatusSchema,
  type AiImageReply,
  type AiImageRequest,
  type AiSearchRequest,
  type AiSearchResult,
  type AssistantReply,
  type AssistantRequest,
  type PullRequest,
  type PullResult,
  type FetchImageRequest,
  type FetchVideoReply,
  type FetchVideoRequest,
  type RecipeDraftReply,
  type RecipeDraftRequest,
  type ResolveMapsLinkReply,
  type RowOp,
  type SpeechTokenReply,
} from '@housekeeping/core';
import { z } from 'zod';

// ---------- Errors ----------

/**
 * transient: worth retrying (network, timeout, 408, 429, 5xx); the outcome of a write is unknown.
 * permanent: the server said no (4xx, Postgres error); `code` is the server's code, e.g.
 * `invalid_email`, `row_not_found`. Photo storage: `too_large` (413), `invalid_mime` (415),
 * `access_denied` (403), `already_exists` (409), `not_found` (404).
 */
export class TransportError extends Error {
  constructor(
    readonly kind: 'transient' | 'permanent',
    readonly code: string,
    readonly status?: number,
    /** What the server added to the error as JSON (`detail`), e.g. who was faster for already_done. */
    readonly detail?: unknown,
    /**
     * The constraint a foreign key error (23503) names, e.g. `meal_plan_entries_recipe_fkey`
     * when the recipe was deleted meanwhile (spec 0008, E6).
     */
    readonly constraint?: string,
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
/**
 * SQLSTATEs our database functions raise on purpose (`row_not_found`, `last_member` …).
 * PostgREST answers P0001 with 400 and P0002 with 500; retrying cannot change either answer.
 */
const RAISED = new Set(['P0001', 'P0002']);
/**
 * Deadlock and serialization failure: Postgres rolled the whole transaction back, so the call
 * changed nothing and is safe to send again (the transport retries once).
 */
const ROLLED_BACK = new Set(['40P01', '40001']);

export function isRolledBack(error: unknown): boolean {
  return error instanceof TransportError && ROLLED_BACK.has(error.code);
}

/** The `detail` of a raised error, sent by PostgREST as `details`; only JSON is kept. */
function parseDetail(details: string | undefined): unknown {
  if (!details) return undefined;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return undefined;
  }
}

/** Postgres' message for a foreign key error names the constraint. */
const FOREIGN_KEY_MESSAGE = /violates foreign key constraint "([a-z0-9_]+)"/;

/** Classifies an HTTP status and a PostgREST error body (`message` carries our error code). */
export function classifyError(
  status: number,
  error: { message?: string; code?: string; details?: string },
): TransportError {
  const transient =
    ROLLED_BACK.has(error.code ?? '') ||
    (!RAISED.has(error.code ?? '') &&
      (status === 0 || status === 408 || status === 429 || status >= 500));
  const message = error.message ?? '';
  const code = SERVER_CODE.test(message)
    ? message
    : status === 0
      ? 'network'
      : error.code || `http_${status}`;
  return new TransportError(
    transient ? 'transient' : 'permanent',
    code,
    status,
    parseDetail(error.details),
    FOREIGN_KEY_MESSAGE.exec(message)?.[1],
  );
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

/**
 * complete_chore (spec 0011): books an entry only while the chore still shows the state the device
 * saw (`seen`, with its latest booked entry); date and person afterwards are computed by core
 * (completionOutcome).
 */
export interface ChoreCompletion {
  chore_id: string;
  event_id: string;
  kind: 'done' | 'skipped';
  done_on: string;
  done_by: string;
  seen: {
    next_due_on: string | null;
    last_done_on: string | null;
    next_assignee_id: string | null;
    /**
     * The latest booked entry of the chore (core latestBookedEvent), null without any: a second
     * booking of a flexible chore for anyone on the same day leaves the rest unchanged (AC-031).
     */
    latest_event_id: string | null;
  };
  next_due_on: string | null;
  /** Only for "done"; "skipped" keeps the person. */
  next_assignee_id?: string | null;
}

/**
 * change_chore_event_day (spec 0026, REQ-007): moves an entry to another day. With the chore's
 * state the device saw; for the latest booked entry the chore's next date (computed by core
 * dayChangeOutcome) follows, the last time is computed by the server.
 */
export interface ChoreEventDayChange {
  event_id: string;
  done_on: string;
  /** The chore's state as complete_chore compares it; left out for an entry of a deleted chore. */
  seen?: ChoreCompletion['seen'];
  next_due_on?: string | null;
}

/**
 * One Packstück as restore_packing_items puts it back (spec 0012, "Rückgängig" after removing):
 * with its packed state, which only the server writes. The server bounds the values.
 */
export interface RestorePackingItem {
  id: string;
  list_bag_id: string;
  name: string;
  quantity?: number | null;
  per_day_quantity?: number | null;
  sort?: number;
  packed?: boolean;
  packed_at?: string | null;
  packed_by?: string | null;
  pack_seq?: number;
  bag_item_id?: string | null;
  from_bag?: boolean;
}

/** A Packstück of a packing list as adopt_bag_changes inserts or updates it (spec 0022). */
export interface AdoptPackingItem {
  id: string;
  name: string;
  quantity?: number | null;
  per_day_quantity?: number | null;
  sort?: number;
  bag_item_id?: string | null;
  from_bag?: boolean;
}

/** adopt_bag_changes (spec 0022, REQ-012): touches only Packstücke still open on the server. */
export interface AdoptBagChange {
  list_bag_id: string;
  insert?: AdoptPackingItem[];
  update?: Omit<AdoptPackingItem, 'sort' | 'bag_item_id' | 'from_bag'>[];
  delete?: string[];
}

/** A row operation, or one of the domain operations `apply_changes` allows. */
export type ChangeOp =
  | RowOp
  | { kind: 'add_contributions'; entries: AddEntry[] }
  | { kind: 'remove_contributions'; ids: string[] }
  /**
   * Spec 0021, REQ-007/REQ-015: the entries' contributions on open items go, `entries` are added
   * like add_contributions, emptied open items go; one delete however many contributions.
   */
  | { kind: 'replace_entry_contributions'; entry_ids: string[]; entries: AddEntry[] }
  | { kind: 'complete_chore'; completion: ChoreCompletion }
  | { kind: 'remove_chore_event'; id: string }
  | { kind: 'change_chore_event_day'; change: ChoreEventDayChange }
  | { kind: 'restore_packing_items'; items: RestorePackingItem[] }
  | { kind: 'adopt_bag_changes'; change: AdoptBagChange };

/** One change of set_packing_items_packed (ADR-0013). */
export interface PackChange {
  item_id: string;
  packed: boolean;
  seen_pack_seq: number;
}

/** The answer of set_packing_items_packed: the found Packstücke; missing ones are left out. */
export const PackResultSchema = z.array(
  z.object({ item_id: z.string(), packed: z.boolean(), pack_seq: z.number() }),
);
export type PackResult = z.infer<typeof PackResultSchema>;

/** already_done (spec 0011, AC-031): who booked the chore that day, and when. */
export const AlreadyDoneDetailSchema = z.object({ done_by: z.string(), done_at: z.string() });

export const ApplyChangesResultSchema = z.object({
  applied: z.number(),
  results: z.array(z.unknown()),
});
export type ApplyChangesResult = z.infer<typeof ApplyChangesResultSchema>;

/** save_recipe_page (spec 0037, AC-006): whether the recipe changed since the edit mode opened. */
export const SavedRecipePageSchema = z
  .object({ changed_meanwhile: z.boolean(), updated_at: z.string().nullable().optional() })
  .transform((row) => ({
    changedMeanwhile: row.changed_meanwhile,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  }));
export type SavedRecipePage = z.infer<typeof SavedRecipePageSchema>;

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

/**
 * adjust_item_count (spec 0006): the count afterwards; when the tap removed the item, the item and
 * its contributions as they were before, for restore_cleared_items. Null: the item is gone.
 */
export const AdjustResultSchema = z
  .discriminatedUnion('removed', [
    z.object({ item_id: z.string(), count: z.number(), removed: z.literal(false) }),
    z.object({
      item_id: z.string(),
      count: z.number(),
      removed: z.literal(true),
      item: LooseRowSchema,
      contributions: z.array(LooseRowSchema),
    }),
  ])
  .nullable();
export type AdjustResult = z.infer<typeof AdjustResultSchema>;

/** set_manual_amount (spec 0025): a count or a quantity with an optional unit; none = empty. */
export interface ManualAmount {
  count?: number;
  qty?: number;
  unit?: string;
}

/** set_manual_amount: like adjust_item_count, the removed item comes back with restore. */
export const ManualAmountResultSchema = z
  .discriminatedUnion('removed', [
    z.object({ item_id: z.string(), removed: z.literal(false) }),
    z.object({
      item_id: z.string(),
      removed: z.literal(true),
      item: LooseRowSchema,
      contributions: z.array(LooseRowSchema),
    }),
  ])
  .nullable();
export type ManualAmountResult = z.infer<typeof ManualAmountResultSchema>;

/** delete_article (spec 0007): the deleted row as stored, for "Rückgängig". */
export const DeletedArticleSchema = z.looseObject({ id: z.string() });
export type DeletedArticle = z.infer<typeof DeletedArticleSchema>;

/** merge_articles (spec 0007): the recipes rewritten and the items of the source moved. */
export const MergeArticlesResultSchema = z.object({ recipes: z.number(), items: z.number() });
export type MergeArticlesResult = z.infer<typeof MergeArticlesResultSchema>;

/** merge_areas (spec 0007): how many articles moved. */
export const MergeAreasResultSchema = z.number();

/**
 * delete_recipe (spec 0008, E3): how many plan entries became free text and how many went, and
 * from how many collections the recipe was taken (spec 0009, E11; 0 for a collection).
 */
export const DeletedRecipeSchema = z.object({
  converted: z.number(),
  removed: z.number(),
  collections: z.number(),
});
export type DeletedRecipe = z.infer<typeof DeletedRecipeSchema>;

/** restore_recipe (spec 0008, E4): false when the recipe exists again already. */
export const RestoredRecipeSchema = z.boolean();

/**
 * remove_recipe_video (spec 0046, AC-017): the video taken out of the recipe's list, so the app
 * deletes its files; null when the recipe had no such video.
 */
export const RemovedRecipeVideoSchema = z
  .object({ path: z.string(), url: z.string().optional(), poster: z.string().optional() })
  .nullable();

/**
 * delete_restaurant / delete_activity (spec 0024, REQ-010): how many plan entries became free text
 * and how many went.
 */
export const DeletedPlaceSchema = z.object({ converted: z.number(), removed: z.number() });
export type DeletedPlace = z.infer<typeof DeletedPlaceSchema>;

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

/**
 * One row of `list_push_subscriptions` (spec 0013): strict, so an answer that carried a push
 * address or a key would be refused rather than passed on (ADR-0014).
 */
export const PushSubscriptionRowSchema = z.strictObject({
  id: z.string(),
  device_label: z.string(),
  status: PushSubscriptionStatusSchema,
  is_current: z.boolean(),
  created_at: z.string(),
  last_success_at: z.string().nullable(),
});
export type PushSubscriptionRow = z.infer<typeof PushSubscriptionRowSchema>;

export interface Transport {
  // Generic write (ADR-0011)
  applyChanges(householdId: string, ops: readonly ChangeOp[]): Promise<ApplyChangesResult>;
  /**
   * The recipe page in one step (spec 0037, REQ-001): `ops` as for applyChanges, limited to the
   * page's rows (the recipe, new articles, its collection rows, plan entries of a removed
   * variant), in one transaction. `seenUpdatedAt` is the recipe's `updated_at` when the edit mode
   * opened; the answer says whether the row changed since (AC-006). The change is applied either
   * way. `row_not_found` when the recipe is gone or foreign, `invalid_change` for other rows.
   */
  saveRecipePage(
    householdId: string,
    recipeId: string,
    seenUpdatedAt: string | undefined,
    ops: readonly ChangeOp[],
  ): Promise<SavedRecipePage>;
  // Store queue and list
  /** `onList`: checked on "Liste", not in "Einkaufen" (spec 0025, REQ-006). */
  setItemChecked(
    itemId: string,
    checked: boolean,
    seenCheckSeq: number,
    onList?: boolean,
  ): Promise<CheckResult>;
  setItemNotAvailable(itemId: string, value: boolean): Promise<NotAvailableResult>;
  /** Puts entries on the household's shopping list; `not_member` for a foreign household. */
  addShoppingContributions(householdId: string, entries: readonly AddEntry[]): Promise<AddResult>;
  assignArticleArea(articleId: string, areaId: string | null): Promise<AssignAreaResult>;
  /**
   * Packs and unpacks Packstücke of the household in one transaction ("Abhaken gewinnt" via
   * pack_seq, ADR-0013); 1–200 changes. `not_member` for a foreign household.
   */
  setPackingItemsPacked(householdId: string, changes: readonly PackChange[]): Promise<PackResult>;
  clearCheckedItems(householdId: string): Promise<ClearedItems>;
  /** "Liste leeren": every item, open and checked, returned for the undo. */
  clearShoppingList(householdId: string): Promise<ClearedItems>;
  /** One tap on + (delta > 0) or − (delta < 0); `invalid_value` beyond 0…99×. */
  adjustItemCount(itemId: string, delta: number): Promise<AdjustResult>;
  removeContributions(ids: readonly string[]): Promise<number>;
  /**
   * "Von Hand" (spec 0025, REQ-003): all manual contributions of the item become one with this
   * amount (count or qty with unit; none = no manual one). Removing the last contribution removes
   * the item and returns it for the undo; null when the item is gone. `invalid_value`.
   */
  setManualAmount(itemId: string, amount: ManualAmount): Promise<ManualAmountResult>;
  /**
   * ✕ at an origin, or removing a whole item (spec 0025): the given contributions of the item go,
   * the item with them when nothing is left. Returns what restoreClearedItems puts back; null when
   * the item is gone.
   */
  removeItemContributions(itemId: string, ids: readonly string[]): Promise<ClearedItems | null>;
  /**
   * Undo of clearing: open items come back open (joining an open item of the same article),
   * checked ones checked. Returns how many came back.
   */
  restoreClearedItems(householdId: string, items: ClearedItems): Promise<number>;
  // Catalog (spec 0007)
  /**
   * Deletes an unused article and returns its row. `article_in_use` when a recipe or an item
   * (open or checked) uses it, `article_not_found` when it is missing or foreign.
   */
  deleteArticle(articleId: string): Promise<DeletedArticle>;
  /**
   * Merges the source into the target (one transaction). `invalid_value` for the same id,
   * `article_not_found`, `too_many_synonyms` (nothing changes).
   */
  mergeArticles(sourceId: string, targetId: string): Promise<MergeArticlesResult>;
  /** Moves the articles of one area to another and deletes the source; `area_not_found`. */
  mergeAreas(sourceId: string, targetId: string): Promise<number>;
  /**
   * "+ Neuer Markt" (spec 0025, REQ-015): with `copyFrom` the walking order and hidden areas of
   * that store are copied once. `not_member`, `store_not_found`.
   */
  createStore(
    householdId: string,
    storeId: string,
    name: string,
    copyFrom: string | null,
  ): Promise<void>;
  // Recipes (spec 0008)
  /**
   * Deletes a recipe (the only way, E2): entries up to `today` (the device's date, at most one day
   * off the server's) become free text, later and noted ones go, ratings and favourites go; the
   * server keeps a snapshot for 1 hour. `recipe_not_found` when missing or foreign,
   * `invalid_value` for a date too far off. With `withList` ("Zutaten auch von der Liste nehmen",
   * spec 0023, Decision 15) the contributions of the entries that go leave open items in the same
   * transaction and come back with restoreRecipe.
   */
  deleteRecipe(recipeId: string, today: string, withList?: boolean): Promise<DeletedRecipe>;
  /**
   * "Rückgängig" of delete_recipe, only for the person who deleted, within 1 hour; false when the
   * recipe exists again. `recipe_not_restorable` otherwise; a check error (e.g.
   * `ingredient_article_invalid`) when an article or meal slot is gone meanwhile.
   */
  restoreRecipe(recipeId: string): Promise<boolean>;
  // Restaurants and activities (spec 0024, REQ-010)
  /**
   * Deletes a restaurant (the only way): entries up to `today` become free text with the name,
   * later and noted ones go; the server keeps a snapshot for 1 hour. `restaurant_not_found` when
   * missing or foreign, `invalid_value` for a date too far off.
   */
  deleteRestaurant(restaurantId: string, today: string): Promise<DeletedPlace>;
  /** "Rückgängig" of delete_restaurant; false when it exists again. `restaurant_not_restorable`. */
  restoreRestaurant(restaurantId: string): Promise<boolean>;
  /** Like deleteRestaurant; the free text carries the Zusatz. `activity_not_found`. */
  deleteActivity(activityId: string, today: string): Promise<DeletedPlace>;
  /** "Rückgängig" of delete_activity; false when it exists again. `activity_not_restorable`. */
  restoreActivity(activityId: string): Promise<boolean>;
  // Chores (spec 0031, REQ-016)
  /**
   * Deletes a chore with a snapshot of the ids of its entries for 1 hour; the entries stay in the
   * history without the link. `chore_not_found` when missing or foreign.
   */
  deleteChore(choreId: string): Promise<void>;
  /**
   * "Rückgängig" of delete_chore: the chore and exactly its entries again; false when it exists
   * again. `chore_not_restorable`.
   */
  restoreChore(choreId: string): Promise<boolean>;
  // Per member
  setRecipeFavorite(recipeId: string, favorite: boolean): Promise<void>;
  setRecipeRating(recipeId: string, stars: number | null): Promise<void>;
  // The videos of a recipe (spec 0046): only these functions write recipes.videos.
  /** The poster of a video; false when the recipe has no such video or it has a poster already. */
  setRecipeVideoPoster(
    householdId: string,
    recipeId: string,
    path: string,
    poster: string,
  ): Promise<boolean>;
  /** Takes the video out of the recipe's list and returns it; null when it is not there. */
  removeRecipeVideo(
    householdId: string,
    recipeId: string,
    path: string,
  ): Promise<z.infer<typeof RemovedRecipeVideoSchema>>;
  setRestaurantFavorite(restaurantId: string, favorite: boolean): Promise<void>;
  setRestaurantRating(restaurantId: string, stars: number | null): Promise<void>;
  setActivityFavorite(activityId: string, favorite: boolean): Promise<void>;
  setActivityRating(activityId: string, stars: number | null): Promise<void>;
  setFeedbackVote(feedbackId: string, voted: boolean): Promise<void>;
  // Household, invitation, membership
  createHousehold(name: string, starter: unknown): Promise<string>;
  inviteMember(householdId: string, email: string): Promise<string>;
  acceptInvitation(invitationId: string): Promise<string>;
  declineInvitation(invitationId: string): Promise<void>;
  removeMember(householdId: string, profileId: string): Promise<void>;
  /** Spec 0027: a member withdraws an invitation of her household; `invitation_not_found`. */
  withdrawInvitation(invitationId: string): Promise<void>;
  /**
   * Spec 0027: the caller's own profile; `invalid_name`, `invalid_color`, `invalid_diet`,
   * `invalid_dislikes`.
   */
  updateProfile(profile: {
    name: string;
    color: string;
    dietPreference: string;
    dislikes: readonly string[];
  }): Promise<void>;
  /**
   * Spec 0027, 0031 (D-12): the last member starts deleting the household: it is closed to new
   * members, and the names of its photos come back for the app to delete. `not_last_member`.
   */
  beginHouseholdDeletion(householdId: string): Promise<string[]>;
  /**
   * Spec 0027: the last member deletes the household; `not_member`, `not_last_member`,
   * `media_remaining` (nothing is deleted then).
   */
  deleteHousehold(householdId: string): Promise<void>;
  // Push devices (spec 0013, ADR-0014): only the caller's own, online only, never cached.
  /**
   * Registers this browser's subscription for the caller (upsert by address: it moves to her).
   * `invalid_subscription`, `too_many_devices`; returns the subscription's id.
   */
  registerPushSubscription(
    endpoint: string,
    p256dh: string,
    auth: string,
    deviceLabel: string,
  ): Promise<string>;
  /** "Auf diesem Gerät benachrichtigen"; `not_found` for an address that is not the caller's. */
  setPushSubscriptionEnabled(endpoint: string, enabled: boolean): Promise<void>;
  /** Deletes this device's subscription (sign-out); an unknown address is no error. */
  unregisterPushSubscription(endpoint: string): Promise<void>;
  /** "Entfernen": true when an own subscription was deleted, false for a foreign or unknown id. */
  removePushSubscription(id: string): Promise<boolean>;
  /** "Deine Geräte": never an address or a key; `is_current` for `currentEndpoint`. */
  listPushSubscriptions(currentEndpoint?: string): Promise<PushSubscriptionRow[]>;
  /** "Probe senden" to this device; `not_found`, `push_not_configured`, `rate_limited`. */
  sendTestPush(endpoint: string): Promise<void>;
  // Edge functions
  /** Follows a short map link on the server (`resolve-maps-link`); `not_a_maps_link` when none. */
  resolveMapsLink(url: string): Promise<ResolveMapsLinkReply>;
  /**
   * The image at a public address, loaded by the server (`fetch-image`, spec 0039) as raw bytes;
   * `not_an_image` (422) when there is none, `forbidden` (403) for a foreign household.
   */
  fetchImage(request: FetchImageRequest): Promise<Blob>;
  /**
   * "Video speichern" (`fetch-video`, spec 0043, spec 0046): the server loads the TikTok video into
   * household-videos and adds it to the recipe's videos; `not_a_tiktok_link`, `video_unavailable`,
   * `video_too_large`, `video_exists` (that link's video is there; all permanent), `forbidden`.
   */
  fetchVideo(request: FetchVideoRequest): Promise<FetchVideoReply>;
  /** The assistant (`ai-assistant`): an answer, maybe with a proposal; it never changes data. */
  askAssistant(request: AssistantRequest): Promise<AssistantReply>;
  /** The AI recipe search (`ai-search`). */
  aiSearch(request: AiSearchRequest): Promise<AiSearchResult>;
  /** A short-lived token for streaming speech to Azure (`speech-token`); never the key. */
  speechToken(): Promise<SpeechTokenReply>;
  /** "Mit KI ausfüllen" (`ai-recipe-draft`, spec 0040): a draft, nothing is saved. */
  aiRecipeDraft(request: RecipeDraftRequest): Promise<RecipeDraftReply>;
  /** Three image variants (`ai-image`, spec 0040): never stored by the server. */
  aiImage(request: AiImageRequest): Promise<AiImageReply>;
  // Photo storage: the private bucket household-media, path <household>/<activities|recipes>/<id>/<file>
  /** Stores a JPEG under a new name (never overwrites). */
  uploadMedia(path: string, photo: Blob): Promise<void>;
  /**
   * The stored file; `not_found` for a missing one and for one of a foreign household. `signal`
   * cancels the download (`aborted`), e.g. at sign-out.
   */
  downloadMedia(path: string, signal?: AbortSignal): Promise<Blob>;
  /** Deletes what the caller may delete; missing or foreign paths are left alone. */
  removeMedia(paths: readonly string[]): Promise<void>;
  // Video storage (spec 0043): the private bucket household-videos, <household>/recipes/<id>/<uuid>.mp4
  /** The stored video, never into the HTTP cache; `not_found` for a missing or foreign one. */
  downloadVideo(path: string, signal?: AbortSignal): Promise<Blob>;
  /** Deletes what the caller may delete; missing or foreign paths are left alone. */
  removeVideos(paths: readonly string[]): Promise<void>;
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
    saveRecipePage: guard(inner.saveRecipePage.bind(inner)),
    setItemChecked: guard(inner.setItemChecked.bind(inner)),
    setItemNotAvailable: guard(inner.setItemNotAvailable.bind(inner)),
    addShoppingContributions: guard(inner.addShoppingContributions.bind(inner)),
    assignArticleArea: guard(inner.assignArticleArea.bind(inner)),
    setPackingItemsPacked: guard(inner.setPackingItemsPacked.bind(inner)),
    clearCheckedItems: guard(inner.clearCheckedItems.bind(inner)),
    clearShoppingList: guard(inner.clearShoppingList.bind(inner)),
    adjustItemCount: guard(inner.adjustItemCount.bind(inner)),
    removeContributions: guard(inner.removeContributions.bind(inner)),
    setManualAmount: guard(inner.setManualAmount.bind(inner)),
    removeItemContributions: guard(inner.removeItemContributions.bind(inner)),
    createStore: guard(inner.createStore.bind(inner)),
    restoreClearedItems: guard(inner.restoreClearedItems.bind(inner)),
    deleteArticle: guard(inner.deleteArticle.bind(inner)),
    mergeArticles: guard(inner.mergeArticles.bind(inner)),
    mergeAreas: guard(inner.mergeAreas.bind(inner)),
    deleteRecipe: guard(inner.deleteRecipe.bind(inner)),
    restoreRecipe: guard(inner.restoreRecipe.bind(inner)),
    setRecipeVideoPoster: guard(inner.setRecipeVideoPoster.bind(inner)),
    removeRecipeVideo: guard(inner.removeRecipeVideo.bind(inner)),
    deleteRestaurant: guard(inner.deleteRestaurant.bind(inner)),
    restoreRestaurant: guard(inner.restoreRestaurant.bind(inner)),
    deleteActivity: guard(inner.deleteActivity.bind(inner)),
    restoreActivity: guard(inner.restoreActivity.bind(inner)),
    deleteChore: guard(inner.deleteChore.bind(inner)),
    restoreChore: guard(inner.restoreChore.bind(inner)),
    setRecipeFavorite: guard(inner.setRecipeFavorite.bind(inner)),
    setRecipeRating: guard(inner.setRecipeRating.bind(inner)),
    setRestaurantFavorite: guard(inner.setRestaurantFavorite.bind(inner)),
    setRestaurantRating: guard(inner.setRestaurantRating.bind(inner)),
    setActivityFavorite: guard(inner.setActivityFavorite.bind(inner)),
    setActivityRating: guard(inner.setActivityRating.bind(inner)),
    setFeedbackVote: guard(inner.setFeedbackVote.bind(inner)),
    createHousehold: guard(inner.createHousehold.bind(inner)),
    inviteMember: guard(inner.inviteMember.bind(inner)),
    acceptInvitation: guard(inner.acceptInvitation.bind(inner)),
    declineInvitation: guard(inner.declineInvitation.bind(inner)),
    removeMember: guard(inner.removeMember.bind(inner)),
    withdrawInvitation: guard(inner.withdrawInvitation.bind(inner)),
    updateProfile: guard(inner.updateProfile.bind(inner)),
    beginHouseholdDeletion: guard(inner.beginHouseholdDeletion.bind(inner)),
    deleteHousehold: guard(inner.deleteHousehold.bind(inner)),
    registerPushSubscription: guard(inner.registerPushSubscription.bind(inner)),
    setPushSubscriptionEnabled: guard(inner.setPushSubscriptionEnabled.bind(inner)),
    unregisterPushSubscription: guard(inner.unregisterPushSubscription.bind(inner)),
    removePushSubscription: guard(inner.removePushSubscription.bind(inner)),
    listPushSubscriptions: guard(inner.listPushSubscriptions.bind(inner)),
    sendTestPush: guard(inner.sendTestPush.bind(inner)),
    resolveMapsLink: guard(inner.resolveMapsLink.bind(inner)),
    fetchImage: guard(inner.fetchImage.bind(inner)),
    fetchVideo: guard(inner.fetchVideo.bind(inner)),
    askAssistant: guard(inner.askAssistant.bind(inner)),
    aiSearch: guard(inner.aiSearch.bind(inner)),
    speechToken: guard(inner.speechToken.bind(inner)),
    aiRecipeDraft: guard(inner.aiRecipeDraft.bind(inner)),
    aiImage: guard(inner.aiImage.bind(inner)),
    uploadMedia: guard(inner.uploadMedia.bind(inner)),
    downloadMedia: guard(inner.downloadMedia.bind(inner)),
    removeMedia: guard(inner.removeMedia.bind(inner)),
    downloadVideo: guard(inner.downloadVideo.bind(inner)),
    removeVideos: guard(inner.removeVideos.bind(inner)),
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
