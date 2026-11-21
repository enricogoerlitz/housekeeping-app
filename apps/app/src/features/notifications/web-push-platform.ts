import type { DevicePushSubscription } from '@housekeeping/api';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  deviceLabel,
  pushSupport,
  type PushPermission,
  type PushSupport,
} from '@housekeeping/core';
import { Platform } from 'react-native';

// The browser side of Web Push (spec 0013, ADR-0014): permission, the service worker's
// PushManager and the subscription. Native builds have no Web Push (non-goal): everything here
// reports "unsupported" there. The service worker exists only in the web export (Decision 24).

// Expo inlines EXPO_PUBLIC_* values only for static reads. The public key only; the private key
// never reaches the app (AC-046).
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;

/** How long to wait for the service worker before giving up (it registers after `load`). */
const WORKER_READY_MS = 10_000;

const isWeb = Platform.OS === 'web' && typeof navigator !== 'undefined';

function standalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
  );
}

function touchMac(): boolean {
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** What this browser can do (AC-006); `dev-no-worker` on the development server. */
export function devicePushSupport(): PushSupport {
  if (!isWeb) return pushSupport({ ...NO_WEB, web: false });
  return pushSupport({
    web: true,
    dev: __DEV__,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || touchMac(),
    ipad: /iPad/.test(navigator.userAgent) || touchMac(),
    standalone: standalone(),
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: typeof window !== 'undefined' && 'PushManager' in window,
    notification: typeof window !== 'undefined' && 'Notification' in window,
  });
}

const NO_WEB = {
  web: false,
  dev: false,
  ios: false,
  ipad: false,
  standalone: false,
  serviceWorker: false,
  pushManager: false,
  notification: false,
};

export function currentPermission(): PushPermission {
  if (!isWeb || typeof Notification === 'undefined') return 'default';
  return Notification.permission;
}

/**
 * Asks the browser. Must be the first call of a tap handler (Safari needs the user gesture,
 * Decision 26); nothing may be awaited before it.
 */
export function requestPermission(): Promise<PushPermission> {
  if (!isWeb || typeof Notification === 'undefined') return Promise.resolve('default');
  return Notification.requestPermission();
}

/** "Mac · Chrome", "iPhone · App" (core deviceLabel). */
export function thisDeviceLabel(): string {
  if (!isWeb) return 'Browser';
  return deviceLabel({
    userAgent: navigator.userAgent,
    standalone: standalone(),
    touch: touchMac(),
  });
}

/**
 * The service worker's registration. `wait` waits for it to become ready (it registers after
 * `load`), at most WORKER_READY_MS; without, only an existing registration counts, so sign-out
 * never waits on the development server, which has none.
 */
async function workerRegistration(wait = true): Promise<ServiceWorkerRegistration | undefined> {
  if (!isWeb || !('serviceWorker' in navigator)) return undefined;
  if (!wait) return navigator.serviceWorker.getRegistration('/');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), WORKER_READY_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function vapidKey(): Uint8Array | undefined {
  return VAPID_PUBLIC_KEY ? base64UrlToBytes(VAPID_PUBLIC_KEY) : undefined;
}

/** Whether a subscription was made with today's public key (a new key needs a new one, AC-039). */
function keyMatches(subscription: PushSubscription): boolean {
  const key = subscription.options.applicationServerKey;
  if (!key || !VAPID_PUBLIC_KEY) return false;
  const expected = vapidKey();
  return (
    expected !== undefined && bytesToBase64Url(new Uint8Array(key)) === bytesToBase64Url(expected)
  );
}

export interface BrowserSubscription {
  endpoint: string;
  keyMatches: boolean;
}

/** The browser's current push subscription, if any. */
export async function browserSubscription(): Promise<BrowserSubscription | undefined> {
  const registration = await workerRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return undefined;
  return { endpoint: subscription.endpoint, keyMatches: keyMatches(subscription) };
}

/** A new subscription with the public key, as the server registers it. */
export async function subscribeBrowser(): Promise<DevicePushSubscription> {
  const registration = await workerRegistration();
  const key = vapidKey();
  if (!registration || !key) throw new Error('Push is not available in this build');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key as Uint8Array<ArrayBuffer>,
  });
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    deviceLabel: thisDeviceLabel(),
  };
}

/** The current subscription as the server registers it, without making a new one. */
export async function currentBrowserSubscription(): Promise<DevicePushSubscription | undefined> {
  const registration = await workerRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return undefined;
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    deviceLabel: thisDeviceLabel(),
  };
}

/**
 * Drops the browser's subscription; works without network (AC-042). Returns its address, so the
 * caller can also unregister it on the server.
 */
export async function unsubscribeBrowser(): Promise<string | undefined> {
  const registration = await workerRegistration(false);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return undefined;
  await subscription.unsubscribe().catch(() => false);
  return subscription.endpoint;
}

/**
 * The service worker's `{type: 'open', path}` after a tap on a notification while a window is open
 * (sw-template.js). The path is untrusted: the caller checks it with core.
 */
export function onWorkerOpen(listener: (path: string) => void): () => void {
  if (!isWeb || !('serviceWorker' in navigator)) return () => undefined;
  const handle = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null) return;
    const record = data as Record<string, unknown>;
    if (record.type === 'open' && typeof record.path === 'string') listener(record.path);
  };
  navigator.serviceWorker.addEventListener('message', handle);
  return () => navigator.serviceWorker.removeEventListener('message', handle);
}
