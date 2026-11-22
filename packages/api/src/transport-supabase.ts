// Transport over supabase-js: one RPC per call, answers validated with Zod, errors classified.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AiSearchResultSchema,
  AssistantReplySchema,
  ResolveMapsLinkReplySchema,
  SpeechTokenReplySchema,
  type PullResult,
} from '@housekeeping/core';
import { z } from 'zod';

import { withCompositeIds } from './db/tables';
import {
  AddResultSchema,
  AdjustResultSchema,
  ApplyChangesResultSchema,
  AssignAreaResultSchema,
  CheckResultSchema,
  ClearedItemsSchema,
  DeletedArticleSchema,
  DeletedRecipeSchema,
  ManualAmountResultSchema,
  MergeArticlesResultSchema,
  MergeAreasResultSchema,
  NotAvailableResultSchema,
  PackResultSchema,
  PushSubscriptionRowSchema,
  RawPullResultSchema,
  RestoredRecipeSchema,
  TransportError,
  classifyError,
  isRolledBack,
  type Transport,
} from './transport';

type RpcReply = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  status: number;
};

/** storage-js answers `{ data, error }`; a refused request has `status` and `statusCode`. */
type StorageReply = { data: unknown; error: unknown };

/**
 * storage-js 2.119: `download(path, options, parameters)` hands `parameters` to fetch (HTTP cache
 * mode, abort signal); `upload` takes no fetch parameters, so an upload cannot be cancelled.
 */
interface StorageBucketLike {
  upload(
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean; cacheControl: string },
  ): PromiseLike<StorageReply>;
  download(
    path: string,
    options: Record<string, never>,
    parameters: { cache: 'no-store'; signal: AbortSignal },
  ): PromiseLike<StorageReply>;
  remove(paths: string[]): PromiseLike<StorageReply>;
}

/** The private bucket of the photos (supabase/migrations/…_storage_household_media.sql). */
const MEDIA_BUCKET = 'household-media';

/** Storage status (from the answer's body: the HTTP status is 400 for most refusals) → code. */
const STORAGE_CODES: Record<number, string> = {
  403: 'access_denied',
  404: 'not_found',
  409: 'already_exists',
  413: 'too_large',
  415: 'invalid_mime',
};

/** A storage-js error: with an answer it is classified by its status, without one it is the network. */
function classifyStorageError(error: unknown): TransportError {
  const fields = (typeof error === 'object' && error !== null ? error : {}) as {
    status?: unknown;
    statusCode?: unknown;
  };
  if (typeof fields.status !== 'number') return new TransportError('transient', 'network', 0);
  const fromBody = Number(fields.statusCode);
  const status = Number.isInteger(fromBody) && fromBody > 0 ? fromBody : fields.status;
  return classifyError(status, { message: STORAGE_CODES[status] ?? '', code: '' });
}

interface ChannelLike {
  on(type: 'broadcast', filter: { event: string }, handler: () => void): ChannelLike;
  subscribe(): unknown;
}

/** The part of supabase-js the transport uses. */
export interface SupabaseLike {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): { abortSignal(signal: AbortSignal): PromiseLike<RpcReply> };
  channel(topic: string, options: { config: { private: boolean } }): ChannelLike;
  removeChannel(channel: ChannelLike): Promise<unknown>;
  realtime: { setAuth(): Promise<void> };
  functions: {
    invoke(
      name: string,
      options: { body: unknown },
    ): Promise<{ data: unknown; error: FunctionError | null }>;
  };
  storage: { from(bucket: string): StorageBucketLike };
}

/** supabase-js `FunctionsHttpError` carries the response; fetch and relay errors carry none. */
interface FunctionError {
  name?: string;
  message: string;
  context?: { status?: number; json?: () => Promise<unknown> };
}

/**
 * supabase-js types `rpc` per generated function; the RPCs of spec 0003 are added by migrations
 * that land in parallel, so the transport calls them by name and validates every answer instead.
 */
export function fromSupabaseClient(client: SupabaseClient): SupabaseLike {
  return client as unknown as SupabaseLike;
}

export interface SupabaseTransportOptions {
  /** A call that takes longer counts as a transient failure. */
  timeoutMs?: number;
  /** The same for photo uploads and downloads (up to 2 MiB). */
  mediaTimeoutMs?: number;
}

export function createSupabaseTransport(
  client: SupabaseLike,
  options: SupabaseTransportOptions = {},
): Transport {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const mediaTimeoutMs = options.mediaTimeoutMs ?? 60_000;

  /** One RPC; a call Postgres rolled back for a deadlock or serialization failure is sent once more. */
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await callOnce(fn, args);
    } catch (error) {
      if (!isRolledBack(error)) throw error;
      return callOnce(fn, args);
    }
  }

  async function callOnce(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const reply = await client.rpc(fn, args).abortSignal(controller.signal);
      if (timedOut) throw new TransportError('transient', 'timeout', 0);
      if (reply.error) throw classifyError(reply.status, reply.error);
      return reply.data;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError('transient', timedOut ? 'timeout' : 'network', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async function parsed<S extends z.ZodType>(
    schema: S,
    fn: string,
    args: Record<string, unknown>,
  ): Promise<z.infer<S>> {
    const result = schema.safeParse(await call(fn, args));
    if (!result.success) throw new TransportError('permanent', 'invalid_response');
    return result.data;
  }

  /** An edge function: errors are `{ error: code }` with an HTTP status (core ErrorReply). */
  async function invoke(name: string, body: unknown): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TransportError('transient', 'timeout', 0)), timeoutMs);
    });
    try {
      const reply = await Promise.race([client.functions.invoke(name, { body }), timeout]);
      if (!reply.error) return reply.data;
      const status = reply.error.context?.status;
      if (status === undefined) throw new TransportError('transient', 'network', 0);
      const answer: unknown = await reply.error.context?.json?.().catch(() => undefined);
      const code =
        typeof answer === 'object' && answer !== null && 'error' in answer
          ? String(answer.error)
          : '';
      throw classifyError(status, { message: code });
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError('transient', 'network', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  /** An edge function whose answer must match the core contract (ai-contract.ts). */
  async function invokeParsed<S extends z.ZodType>(
    schema: S,
    name: string,
    body: unknown,
  ): Promise<z.infer<S>> {
    const result = schema.safeParse(await invoke(name, body));
    if (!result.success) throw new TransportError('permanent', 'invalid_response');
    return result.data;
  }

  /**
   * A storage request in the photo bucket; its data, or the classified error. It gives up after
   * the media timeout or when the caller's signal aborts (sign-out), and the signal it hands the
   * request aborts then too, so a request that can be cancelled does not keep running.
   */
  async function media(
    request: (bucket: StorageBucketLike, signal: AbortSignal) => PromiseLike<StorageReply>,
    caller?: AbortSignal,
  ): Promise<unknown> {
    if (caller?.aborted) throw new TransportError('transient', 'aborted', 0);
    const controller = new AbortController();
    let timedOut = false;
    const stopped = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new TransportError('transient', timedOut ? 'timeout' : 'aborted', 0)),
      );
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, mediaTimeoutMs);
    const cancel = () => controller.abort();
    caller?.addEventListener('abort', cancel);
    try {
      const reply = await Promise.race([
        request(client.storage.from(MEDIA_BUCKET), controller.signal),
        stopped,
      ]);
      if (reply.error) throw classifyStorageError(reply.error);
      return reply.data;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError('transient', 'network', 0);
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener('abort', cancel);
    }
  }

  async function nothing(fn: string, args: Record<string, unknown>): Promise<void> {
    await call(fn, args);
  }

  async function id(fn: string, args: Record<string, unknown>): Promise<string> {
    const data = await call(fn, args);
    if (typeof data !== 'string') throw new TransportError('permanent', 'invalid_response');
    return data;
  }

  return {
    applyChanges: (householdId, ops) =>
      parsed(ApplyChangesResultSchema, 'apply_changes', {
        p_household_id: householdId,
        p_ops: ops,
      }),
    setItemChecked: (itemId, checked, seenCheckSeq, onList) =>
      parsed(CheckResultSchema, 'set_shopping_item_checked', {
        p_item_id: itemId,
        p_checked: checked,
        p_seen_check_seq: seenCheckSeq,
        p_on_list: onList ?? false,
      }),
    setItemNotAvailable: (itemId, value) =>
      parsed(NotAvailableResultSchema, 'set_shopping_item_not_available', {
        p_item_id: itemId,
        p_value: value,
      }),
    setPackingItemsPacked: (householdId, changes) =>
      parsed(PackResultSchema, 'set_packing_items_packed', {
        p_household_id: householdId,
        p_changes: changes,
      }),
    addShoppingContributions: (householdId, entries) =>
      parsed(AddResultSchema, 'add_shopping_contributions', {
        p_household_id: householdId,
        p_entries: entries,
      }),
    assignArticleArea: (articleId, areaId) =>
      parsed(AssignAreaResultSchema, 'assign_article_area', {
        p_article_id: articleId,
        p_area_id: areaId,
      }),
    clearCheckedItems: (householdId) =>
      parsed(ClearedItemsSchema, 'clear_checked_items', { p_household_id: householdId }),
    clearShoppingList: (householdId) =>
      parsed(ClearedItemsSchema, 'clear_shopping_list', { p_household_id: householdId }),
    adjustItemCount: (itemId, delta) =>
      parsed(AdjustResultSchema, 'adjust_item_count', { p_item_id: itemId, p_delta: delta }),
    removeContributions: async (ids) => {
      const data = await call('remove_contributions', { p_ids: ids });
      if (typeof data !== 'number') throw new TransportError('permanent', 'invalid_response');
      return data;
    },
    setManualAmount: (itemId, amount) =>
      parsed(ManualAmountResultSchema, 'set_manual_amount', {
        p_item_id: itemId,
        p_count: amount.count ?? null,
        p_qty: amount.qty ?? null,
        p_unit: amount.unit ?? null,
      }),
    removeItemContributions: (itemId, ids) =>
      parsed(ClearedItemsSchema.nullable(), 'remove_item_contributions', {
        p_item_id: itemId,
        p_ids: ids,
      }),
    createStore: async (householdId, storeId, name, copyFrom) => {
      await call('create_store', {
        p_household_id: householdId,
        p_store_id: storeId,
        p_name: name,
        p_copy_from: copyFrom,
      });
    },
    restoreClearedItems: async (householdId, items) => {
      const data = await call('restore_cleared_items', {
        p_household_id: householdId,
        p_items: items,
      });
      if (typeof data !== 'number') throw new TransportError('permanent', 'invalid_response');
      return data;
    },
    deleteArticle: (articleId) =>
      parsed(DeletedArticleSchema, 'delete_article', { p_article_id: articleId }),
    mergeArticles: (sourceId, targetId) =>
      parsed(MergeArticlesResultSchema, 'merge_articles', {
        p_source_id: sourceId,
        p_target_id: targetId,
      }),
    mergeAreas: (sourceId, targetId) =>
      parsed(MergeAreasResultSchema, 'merge_areas', {
        p_source_id: sourceId,
        p_target_id: targetId,
      }),
    deleteRecipe: (recipeId, today, withList) =>
      parsed(DeletedRecipeSchema, 'delete_recipe', {
        recipe_id: recipeId,
        today,
        ...(withList ? { with_list: true } : {}),
      }),
    restoreRecipe: (recipeId) =>
      parsed(RestoredRecipeSchema, 'restore_recipe', { recipe_id: recipeId }),
    setRecipeFavorite: (recipeId, favorite) =>
      nothing('set_recipe_favorite', { recipe_id: recipeId, favorite }),
    setRecipeRating: (recipeId, stars) =>
      nothing('set_recipe_rating', { recipe_id: recipeId, stars }),
    setRestaurantFavorite: (restaurantId, favorite) =>
      nothing('set_restaurant_favorite', { restaurant_id: restaurantId, favorite }),
    setRestaurantRating: (restaurantId, stars) =>
      nothing('set_restaurant_rating', { restaurant_id: restaurantId, stars }),
    setActivityFavorite: (activityId, favorite) =>
      nothing('set_activity_favorite', { activity_id: activityId, favorite }),
    setActivityRating: (activityId, stars) =>
      nothing('set_activity_rating', { activity_id: activityId, stars }),
    setFeedbackVote: (feedbackId, voted) =>
      nothing('set_feedback_vote', { feedback_id: feedbackId, voted }),
    createHousehold: (name, starter) => id('create_household', { name, starter }),
    inviteMember: (householdId, email) => id('invite_member', { household_id: householdId, email }),
    acceptInvitation: (invitationId) => id('accept_invitation', { invitation_id: invitationId }),
    declineInvitation: (invitationId) =>
      nothing('decline_invitation', { invitation_id: invitationId }),
    removeMember: (householdId, profileId) =>
      nothing('remove_member', { household_id: householdId, profile_id: profileId }),
    withdrawInvitation: (invitationId) =>
      nothing('withdraw_invitation', { invitation_id: invitationId }),
    updateProfile: (profile) =>
      nothing('update_profile', {
        name: profile.name,
        color: profile.color,
        diet_preference: profile.dietPreference,
        dislikes: [...profile.dislikes],
      }),
    householdMediaNames: (householdId) =>
      parsed(z.array(z.string()), 'household_media_names', { household_id: householdId }),
    deleteHousehold: (householdId) => nothing('delete_household', { household_id: householdId }),
    registerPushSubscription: (endpoint, p256dh, auth, deviceLabel) =>
      id('register_push_subscription', {
        p_endpoint: endpoint,
        p_p256dh: p256dh,
        p_auth: auth,
        p_device_label: deviceLabel,
      }),
    setPushSubscriptionEnabled: (endpoint, enabled) =>
      nothing('set_push_subscription_enabled', { p_endpoint: endpoint, p_enabled: enabled }),
    unregisterPushSubscription: (endpoint) =>
      nothing('unregister_push_subscription', { p_endpoint: endpoint }),
    removePushSubscription: async (subscriptionId) => {
      const data = await call('remove_push_subscription', { p_id: subscriptionId });
      if (typeof data !== 'boolean') throw new TransportError('permanent', 'invalid_response');
      return data;
    },
    listPushSubscriptions: (currentEndpoint) =>
      parsed(z.array(PushSubscriptionRowSchema), 'list_push_subscriptions', {
        p_current_endpoint: currentEndpoint ?? null,
      }),
    sendTestPush: (endpoint) => nothing('send_test_push', { p_endpoint: endpoint }),
    resolveMapsLink: (url) =>
      invokeParsed(ResolveMapsLinkReplySchema, 'resolve-maps-link', { url }),
    askAssistant: (request) => invokeParsed(AssistantReplySchema, 'ai-assistant', request),
    aiSearch: (request) => invokeParsed(AiSearchResultSchema, 'ai-search', request),
    speechToken: () => invokeParsed(SpeechTokenReplySchema, 'speech-token', {}),
    uploadMedia: async (path, photo) => {
      let sent: PromiseLike<StorageReply> | undefined;
      try {
        // cacheControl '0' (max-age=0): no browser or CDN keeps a copy of the photo, so nothing
        // of it stays on a device after sign-out except the photo store that is cleared then.
        await media((bucket) => {
          sent = bucket.upload(path, photo, {
            contentType: 'image/jpeg',
            upsert: false,
            cacheControl: '0',
          });
          return sent;
        });
      } catch (error) {
        // The upload cannot be cancelled (storage-js): if it still lands after the timeout, the
        // caller has given up on it and no row will name it, so the file is removed again.
        if (error instanceof TransportError && error.code === 'timeout' && sent) {
          Promise.resolve(sent).then(
            (reply) => {
              if (!reply.error) void media((bucket) => bucket.remove([path])).catch(() => {});
            },
            () => {},
          );
        }
        throw error;
      }
    },
    downloadMedia: async (path, signal) => {
      // no-store: the photo never enters the browser's HTTP cache, which sign-out cannot clear.
      const data = await media(
        (bucket, stop) => bucket.download(path, {}, { cache: 'no-store', signal: stop }),
        signal,
      );
      if (!(data instanceof Blob)) throw new TransportError('permanent', 'invalid_response');
      return data;
    },
    removeMedia: async (paths) => {
      await media((bucket) => bucket.remove([...paths]));
    },
    syncPull: async (request): Promise<PullResult> => {
      const raw = await parsed(RawPullResultSchema, 'sync_pull', { p_request: request });
      try {
        return withCompositeIds(raw);
      } catch {
        throw new TransportError('permanent', 'invalid_response');
      }
    },
    subscribe: (householdId, onSignal) => {
      const channel = client
        .channel(`household:${householdId}`, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => onSignal());
      // Private channels authorise with the session's access token (RLS on realtime.messages).
      void client.realtime.setAuth().then(() => channel.subscribe());
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
