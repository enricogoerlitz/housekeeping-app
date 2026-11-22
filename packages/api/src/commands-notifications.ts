// Notification commands (spec 0013, ADR-0014). The own settings row is synced like any row and
// changed on the diff path: one patch of the changed fields (the server created the row, nobody
// inserts or deletes it). The devices ("Push-Abos") are not synced: their RPCs go straight to the
// server, online only, and "Deine Geräte" is read from the server each time, never cached. The
// browser side (permission, PushManager, unsubscribe) belongs to the app.
import {
  NotificationSettingsSchema,
  type Id,
  type NotificationSettings,
  type OwnPushSubscription,
} from '@housekeeping/core';

import { onlineCall, WRITE_REJECTED_MESSAGE } from './backend';
import { commitIn, getState, OfflineError, updateData } from './store';
import { checkTime } from './times';
import { TransportError, type PushSubscriptionRow } from './transport';

/** What a member changes of her settings; id and person never change. */
export type NotificationSettingsPatch = Partial<Omit<NotificationSettings, 'id' | 'memberId'>>;

/** This browser's push subscription as the app reads it from `PushSubscription.toJSON()`. */
export interface DevicePushSubscription {
  endpoint: string;
  /** base64url, 65 bytes. */
  p256dh: string;
  /** base64url, 16 bytes. */
  auth: string;
  /** "Mac · Chrome" (core deviceLabel). */
  deviceLabel: string;
}

/** The hints of the page for refusals with a known cause (plan, Task 5). */
export const PUSH_MESSAGES = {
  invalidSubscription: 'Dieses Gerät konnte nicht angemeldet werden',
  tooManyDevices: 'Zu viele Geräte – entferne zuerst ein altes',
  rateLimited: 'Bitte kurz warten und dann noch einmal',
  notConfigured: 'Benachrichtigungen sind auf dem Server noch nicht eingerichtet',
  failed: WRITE_REJECTED_MESSAGE,
} as const;

const MESSAGE_BY_CODE: Record<string, string> = {
  invalid_subscription: PUSH_MESSAGES.invalidSubscription,
  too_many_devices: PUSH_MESSAGES.tooManyDevices,
  rate_limited: PUSH_MESSAGES.rateLimited,
  push_not_configured: PUSH_MESSAGES.notConfigured,
};

/** The German hint for an error of a device command (offline: the offline hint). */
export function pushRejectedMessage(error: unknown): string {
  if (error instanceof OfflineError) return error.message;
  if (error instanceof TransportError) return MESSAGE_BY_CODE[error.code] ?? PUSH_MESSAGES.failed;
  return PUSH_MESSAGES.failed;
}

/**
 * Changes the signed-in member's settings in a household of hers, by default the active one
 * (REQ-004; spec 0027, REQ-008: another one without switching the app): shown at once, one patch
 * of only the changed fields (AC-012), refused offline. Throws before sending when the result
 * would not be valid (five-minute times, 1–4 parts), the household is not hers or the row has not
 * arrived yet.
 */
export function updateNotificationSettings(
  patch: NotificationSettingsPatch,
  householdId: Id = getState().activeHouseholdId,
): void {
  const household = getState().households[householdId];
  if (!household) throw new Error('Diesen Haushalt gibt es hier nicht');
  const current = household.notificationSettings;
  if (!current) throw new Error('Deine Einstellungen sind noch nicht geladen');
  checkTime(patch.dailySummaryAt);
  checkTime(patch.activitiesEveAt);
  const next = NotificationSettingsSchema.parse({ ...current, ...patch });
  commitIn(householdId, { path: 'diff' }, () =>
    updateData((data) =>
      data.notificationSettings ? { ...data, notificationSettings: next } : data,
    ),
  );
}

/**
 * Registers this browser for the signed-in person (AC-004, AC-039); the address moves to her when
 * it belonged to someone else (Decision 19). Rejects with `invalid_subscription` (AC-044) or
 * `too_many_devices`; `pushRejectedMessage` turns them into the page's hints.
 */
export function registerDevicePush(subscription: DevicePushSubscription): Promise<Id> {
  return onlineCall((transport) =>
    transport.registerPushSubscription(
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.deviceLabel,
    ),
  );
}

/** "Auf diesem Gerät benachrichtigen" on or off (AC-008); `not_found` when it is not registered. */
export function setDevicePushEnabled(endpoint: string, enabled: boolean): Promise<void> {
  return onlineCall((transport) => transport.setPushSubscriptionEnabled(endpoint, enabled));
}

/** Deletes this device's subscription on the server (sign-out, forget; AC-042). */
export function unregisterDevicePush(endpoint: string): Promise<void> {
  return onlineCall((transport) => transport.unregisterPushSubscription(endpoint));
}

/** "Entfernen" in "Deine Geräte" (AC-041): false when it was no longer there. */
export function removePushDevice(id: Id): Promise<boolean> {
  return onlineCall((transport) => transport.removePushSubscription(id));
}

function toOwnPushSubscription(row: PushSubscriptionRow): OwnPushSubscription {
  return {
    id: row.id,
    label: row.device_label,
    status: row.status,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    ...(row.last_success_at === null ? {} : { lastSuccessAt: row.last_success_at }),
  };
}

/**
 * "Deine Geräte" (AC-004, AC-041): the person's own devices, this one first (`currentEndpoint` is
 * the address this browser knows). The one read that is online only: never from the cache, never
 * a push address or a key (ADR-0014). Rejects with OfflineError offline.
 */
export async function listPushDevices(currentEndpoint?: string): Promise<OwnPushSubscription[]> {
  const rows = await onlineCall((transport) => transport.listPushSubscriptions(currentEndpoint));
  return rows.map(toOwnPushSubscription);
}

/**
 * "Probe senden" to exactly this device (AC-009). Rejects with `not_found` when it is off or not
 * registered (AC-010), `push_not_configured` without the server's secrets, `rate_limited` from
 * the fourth probe in 10 minutes.
 */
export function sendTestPush(endpoint: string): Promise<void> {
  return onlineCall((transport) => transport.sendTestPush(endpoint));
}
