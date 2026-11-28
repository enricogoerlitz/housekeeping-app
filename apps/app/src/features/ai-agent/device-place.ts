import {
  decodeRecentPlaces,
  encodeRecentPlaces,
  roundCoordinate,
  type AgentPlace,
} from '@housekeeping/core';
import { Platform } from 'react-native';

// Spec 0066, REQ-003/REQ-004: where the KI-Agent looks. The device's location comes from the
// browser only when a message is sent (the browser asks once); "Zuletzt" lives on this device in
// localStorage and is cleared at sign-out. Nothing here is ever sent but with a message.

export const NO_LOCATION_HINT = 'Standort nicht verfügbar';

/** Preview 28.11.: a message never waits longer for the location (a fix of 5 min counts). */
const LOCATION_MS = 3_000;

/**
 * The device location rounded to ≈ 100 m (REQ-003: nothing more leaves the device), or undefined
 * without permission, without a fix or within 3 s.
 */
export function deviceLocation(): Promise<{ lat: number; lng: number } | undefined> {
  const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
  if (!geo) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) =>
        resolve({
          lat: roundCoordinate(position.coords.latitude),
          lng: roundCoordinate(position.coords.longitude),
        }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: LOCATION_MS, maximumAge: 5 * 60_000 },
    );
  });
}

/**
 * Spec 0067: for a question that is not about going out, the location only when the browser
 * already allows it — never a permission prompt for "Milch auf die Liste".
 */
export async function deviceLocationIfAllowed(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!permissions) return undefined;
    const status = await permissions.query({ name: 'geolocation' });
    return status.state === 'granted' ? await deviceLocation() : undefined;
  } catch {
    return undefined;
  }
}

const RECENT_KEY = 'housekeeping.ki-agent.zuletzt.v1';

function storage(): Storage | undefined {
  if (Platform.OS !== 'web') return undefined;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readRecentPlaces(): AgentPlace[] {
  try {
    return decodeRecentPlaces(storage()?.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

export function writeRecentPlaces(places: readonly AgentPlace[]): void {
  try {
    storage()?.setItem(RECENT_KEY, encodeRecentPlaces(places));
  } catch {
    // Full or blocked storage: "Zuletzt" is only not kept.
  }
}

/** Sign-out: no place of this person stays on the device (AC-013). */
export function clearRecentPlaces(): void {
  try {
    storage()?.removeItem(RECENT_KEY);
  } catch {
    // Nothing kept.
  }
}
