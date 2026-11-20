// Transport over supabase-js: one RPC per call, answers validated with Zod, errors classified.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PullResult } from '@housekeeping/core';
import type { z } from 'zod';

import { withCompositeIds } from './db/tables';
import {
  AddResultSchema,
  ApplyChangesResultSchema,
  AssignAreaResultSchema,
  CheckResultSchema,
  ClearedItemsSchema,
  NotAvailableResultSchema,
  RawPullResultSchema,
  TransportError,
  classifyError,
  type Transport,
} from './transport';

type RpcReply = {
  data: unknown;
  error: { message: string; code?: string } | null;
  status: number;
};

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
}

export function createSupabaseTransport(
  client: SupabaseLike,
  options: SupabaseTransportOptions = {},
): Transport {
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
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
    setItemChecked: (itemId, checked, seenCheckSeq) =>
      parsed(CheckResultSchema, 'set_shopping_item_checked', {
        p_item_id: itemId,
        p_checked: checked,
        p_seen_check_seq: seenCheckSeq,
      }),
    setItemNotAvailable: (itemId, value) =>
      parsed(NotAvailableResultSchema, 'set_shopping_item_not_available', {
        p_item_id: itemId,
        p_value: value,
      }),
    addShoppingContributions: (listId, entries) =>
      parsed(AddResultSchema, 'add_shopping_contributions', {
        p_list_id: listId,
        p_entries: entries,
      }),
    assignArticleArea: (articleId, areaId) =>
      parsed(AssignAreaResultSchema, 'assign_article_area', {
        p_article_id: articleId,
        p_area_id: areaId,
      }),
    clearCheckedItems: (listId) =>
      parsed(ClearedItemsSchema, 'clear_checked_items', { p_list_id: listId }),
    removeContributions: async (ids) => {
      const data = await call('remove_contributions', { p_ids: ids });
      if (typeof data !== 'number') throw new TransportError('permanent', 'invalid_response');
      return data;
    },
    restoreClearedItems: async (listId, items) => {
      const data = await call('restore_cleared_items', { p_list_id: listId, p_items: items });
      if (typeof data !== 'number') throw new TransportError('permanent', 'invalid_response');
      return data;
    },
    setRecipeFavorite: (recipeId, favorite) =>
      nothing('set_recipe_favorite', { recipe_id: recipeId, favorite }),
    setRecipeRating: (recipeId, stars) =>
      nothing('set_recipe_rating', { recipe_id: recipeId, stars }),
    setRestaurantFavorite: (restaurantId, favorite) =>
      nothing('set_restaurant_favorite', { restaurant_id: restaurantId, favorite }),
    setRestaurantRating: (restaurantId, stars) =>
      nothing('set_restaurant_rating', { restaurant_id: restaurantId, stars }),
    setFeedbackVote: (feedbackId, voted) =>
      nothing('set_feedback_vote', { feedback_id: feedbackId, voted }),
    createHousehold: (name, starter) => id('create_household', { name, starter }),
    inviteMember: (householdId, email) => id('invite_member', { household_id: householdId, email }),
    acceptInvitation: (invitationId) => id('accept_invitation', { invitation_id: invitationId }),
    declineInvitation: (invitationId) =>
      nothing('decline_invitation', { invitation_id: invitationId }),
    removeMember: (householdId, profileId) =>
      nothing('remove_member', { household_id: householdId, profile_id: profileId }),
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
