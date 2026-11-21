import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// What this device remembers about its push registration (plan 0013, Decision 18): whether the
// person wants notifications here (`push.wanted`) and the push address it registered last. A
// device setting: never synced, cleared at sign-out. A module store rather than part of
// `useSettings`, because sign-out and the taps in other features need it outside the page.

export interface DevicePushState {
  /** undefined = never chosen here, false = switched off here. */
  wanted?: boolean;
  endpoint?: string;
}

const STORAGE_KEY = 'housekeeping.push.v1';
const MAX_ENDPOINT = 1024;

let state: DevicePushState = {};
let loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Stored values are untrusted: anything unexpected is dropped. */
function parse(raw: string | null): DevicePushState {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return {};
    const record = value as Record<string, unknown>;
    const endpoint =
      typeof record.endpoint === 'string' &&
      record.endpoint.startsWith('https://') &&
      record.endpoint.length <= MAX_ENDPOINT
        ? record.endpoint
        : undefined;
    return {
      ...(typeof record.wanted === 'boolean' ? { wanted: record.wanted } : {}),
      ...(endpoint ? { endpoint } : {}),
    };
  } catch {
    return {};
  }
}

function emit() {
  for (const listener of listeners) listener();
}

/** Reads the stored state once; later calls wait for the same read. */
export function loadDevicePushState(): Promise<void> {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      state = parse(raw);
      emit();
    })
    .catch(() => undefined);
  return loaded;
}

export function getDevicePushState(): DevicePushState {
  return state;
}

export function setDevicePushState(patch: DevicePushState): void {
  state = { ...state, ...patch };
  for (const key of Object.keys(patch) as (keyof DevicePushState)[]) {
    if (patch[key] === undefined) delete state[key];
  }
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  emit();
}

/** Sign-out and "forget": nothing of this device's registration stays. */
export function clearDevicePushState(): void {
  state = {};
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDevicePushState(): DevicePushState {
  return useSyncExternalStore(subscribe, getDevicePushState, getDevicePushState);
}
