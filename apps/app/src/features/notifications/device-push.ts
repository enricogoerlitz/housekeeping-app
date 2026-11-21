import {
  listPushDevices,
  registerDevicePush,
  setDevicePushEnabled,
  unregisterDevicePush,
  type DevicePushSubscription,
} from '@housekeeping/api';
import {
  deviceAction,
  serverDeviceStatus,
  type DeviceAction,
  type DeviceState,
  type OwnPushSubscription,
} from '@housekeeping/core';

import {
  clearDevicePushState,
  getDevicePushState,
  loadDevicePushState,
  setDevicePushState,
} from './device-store';
import {
  browserSubscription,
  currentBrowserSubscription,
  currentPermission,
  devicePushSupport,
  requestPermission,
  subscribeBrowser,
  unsubscribeBrowser,
} from './web-push-platform';

// Registering this device for Web Push (spec 0013, REQ-002, Decision 18 and 26). What to do next
// is decided in core (`deviceAction`); here are the browser calls and the RPCs in their order.

/** What the app knows without waiting: enough to decide whether to ask for permission. */
function quickState(online: boolean): DeviceState {
  const stored = getDevicePushState();
  return {
    support: devicePushSupport(),
    online,
    permission: currentPermission(),
    wanted: stored.wanted,
    ...(stored.endpoint ? { storedEndpoint: stored.endpoint } : {}),
  };
}

export interface DeviceSnapshot {
  state: DeviceState;
  /** "Deine Geräte"; undefined offline or when the server could not be asked. */
  devices?: OwnPushSubscription[];
}

/**
 * The whole state: the browser's subscription and what the server says about it. The list of
 * devices is the one online-only read (ADR-0014), never cached.
 */
export async function readDeviceSnapshot(online: boolean): Promise<DeviceSnapshot> {
  const base = quickState(online);
  const browser = base.support === 'supported' ? await browserSubscription() : undefined;
  const withBrowser: DeviceState = browser ? { ...base, browser } : base;
  if (!online) return { state: withBrowser };
  try {
    const devices = await listPushDevices(browser?.endpoint);
    return {
      state: browser ? { ...withBrowser, server: serverDeviceStatus(devices) } : withBrowser,
      devices,
    };
  } catch {
    return { state: withBrowser };
  }
}

async function register(subscription: DevicePushSubscription): Promise<void> {
  await registerDevicePush(subscription);
  setDevicePushState({ wanted: true, endpoint: subscription.endpoint });
}

/** Best effort: the address is gone from the browser anyway; the server learns it at 404/410. */
async function unregisterQuietly(endpoint: string): Promise<void> {
  await unregisterDevicePush(endpoint).catch(() => undefined);
}

async function execute(action: DeviceAction, state: DeviceState): Promise<void> {
  switch (action.type) {
    case 'none':
    case 'request-permission':
      return;
    case 'subscribe':
      return register(await subscribeBrowser());
    case 'resubscribe': {
      const old = await unsubscribeBrowser();
      if (old) await unregisterQuietly(old);
      return register(await subscribeBrowser());
    }
    case 'register': {
      const subscription = await currentBrowserSubscription();
      if (!subscription) return;
      await register(subscription);
      if (action.staleEndpoint && action.staleEndpoint !== subscription.endpoint) {
        await unregisterQuietly(action.staleEndpoint);
      }
      return;
    }
    case 'enable':
      if (!state.browser) return;
      await setDevicePushEnabled(state.browser.endpoint, true);
      setDevicePushState({ wanted: true, endpoint: state.browser.endpoint });
      return;
    case 'forget': {
      const endpoint = await unsubscribeBrowser();
      if (endpoint && state.server !== undefined && state.server !== 'missing') {
        await unregisterQuietly(endpoint);
      }
      clearDevicePushState();
      return;
    }
  }
}

export type DeviceTapResult = 'done' | 'denied' | 'dismissed' | 'skipped';

/**
 * A tap that wants notifications on this device: "Auf diesem Gerät benachrichtigen" (device-on),
 * switching on a kind or setting a time (kind-on; AC-007). The browser is asked as the very first
 * step, before anything is awaited (Safari needs the gesture). Rejects with the server's refusal
 * (`pushRejectedMessage` makes the hint).
 */
export async function runDeviceTap(
  trigger: 'device-on' | 'kind-on',
  online: boolean,
): Promise<DeviceTapResult> {
  const quick = quickState(online);
  const first = deviceAction(quick, trigger);
  if (first.type === 'none') return 'skipped';
  if (first.type === 'request-permission') {
    const answer = await requestPermission();
    if (answer === 'denied') return 'denied';
    if (answer !== 'granted') return 'dismissed';
  }
  const { state } = await readDeviceSnapshot(online);
  await execute(deviceAction(state, trigger), state);
  if (trigger === 'device-on') setDevicePushState({ wanted: true });
  return 'done';
}

/** "Auf diesem Gerät benachrichtigen" off (AC-008): the subscription stays, switched off. */
export async function switchDeviceOff(): Promise<void> {
  const browser = await browserSubscription();
  if (browser) await setDevicePushEnabled(browser.endpoint, false);
  setDevicePushState({ wanted: false });
}

/**
 * Opening the app with network (Decision 18): re-register a changed subscription (AC-039), forget
 * one removed elsewhere (AC-041) or whose permission was withdrawn. Never asks (AC-003).
 */
export async function syncDeviceOnStart(online: boolean): Promise<void> {
  if (!online || devicePushSupport() !== 'supported') return;
  await loadDevicePushState();
  if (getDevicePushState().wanted === undefined) return;
  const { state } = await readDeviceSnapshot(online);
  await execute(deviceAction(state, 'start'), state);
}

/**
 * Sign-out (AC-042): the browser drops its subscription (also offline), the server forgets it
 * with network, and this device forgets it was registered. Runs in `beforeSignOut`.
 */
export async function signOutDevicePush(): Promise<void> {
  try {
    const endpoint = await unsubscribeBrowser();
    if (endpoint) await unregisterQuietly(endpoint);
  } finally {
    clearDevicePushState();
  }
}
