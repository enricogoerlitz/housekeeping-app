import {
  isInstalledIosApp,
  routeOpening,
  type MapsApp,
  type RouteOpening,
} from '@housekeeping/core';
import { Linking, Platform } from 'react-native';

/** Google Maps not installed: the website opens after this long (spec 0029, AC-017). */
const FALLBACK_MS = 1500;

interface WebWindow {
  navigator: { userAgent: string; maxTouchPoints?: number; standalone?: boolean };
  matchMedia?: (query: string) => { matches: boolean };
  location: { href: string };
  document: { visibilityState: string; hasFocus?: () => boolean };
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function webWindow(): WebWindow | undefined {
  if (Platform.OS !== 'web') return undefined;
  return globalThis as unknown as WebWindow;
}

function installedIosApp(view: WebWindow): boolean {
  return isInstalledIosApp({
    userAgent: view.navigator.userAgent,
    maxTouchPoints: view.navigator.maxTouchPoints ?? 0,
    standalone:
      view.navigator.standalone === true ||
      view.matchMedia?.('(display-mode: standalone)').matches === true,
  });
}

/**
 * Opens a map app with the place as destination (spec 0029, REQ-004): by its scheme in the same
 * window in the installed iPhone web app, so no empty browser window stays behind; else as before
 * in a new tab.
 */
export function openRoute(app: MapsApp, place: Parameters<typeof routeOpening>[1]): void {
  const view = webWindow();
  const opening: RouteOpening = routeOpening(app, place, {
    installedIosApp: view ? installedIosApp(view) : false,
  });
  if (opening.kind === 'new-tab' || !view) {
    Linking.openURL(opening.url).catch(() => undefined);
    return;
  }
  const fallback = opening.fallback;
  if (fallback) {
    // The app opened when the page lost the focus or went to the background in the meantime.
    let left = false;
    const leave = () => {
      left = true;
    };
    const events = ['blur', 'pagehide', 'visibilitychange'];
    for (const type of events) view.addEventListener(type, leave);
    setTimeout(() => {
      for (const type of events) view.removeEventListener(type, leave);
      const stillHere =
        !left &&
        view.document.visibilityState === 'visible' &&
        (view.document.hasFocus?.() ?? true);
      if (stillHere) Linking.openURL(fallback).catch(() => undefined);
    }, FALLBACK_MS);
  }
  view.location.href = opening.url;
}
