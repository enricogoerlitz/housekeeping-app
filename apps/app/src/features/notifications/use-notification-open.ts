import { switchHousehold, useOffline } from '@housekeeping/api';
import { notificationTargetHref, parseNotificationTarget } from '@housekeeping/core';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { syncDeviceOnStart } from './device-push';
import { loadDevicePushState } from './device-store';
import { onWorkerOpen } from './web-push-platform';

/**
 * A tap on a notification while the app is open (spec 0013, AC-037): the service worker posts the
 * path; it is checked once more (AC-038, anything unknown → "Übersicht"), an own household other
 * than the active one becomes active (Decision 12), then the page opens. A cold start comes as an
 * address instead (`openWindow`), which the pages read themselves (`usePageParams`).
 */
function useNotificationOpen(): void {
  const router = useRouter();
  useEffect(
    () =>
      onWorkerOpen((path) => {
        const target = parseNotificationTarget(path);
        if ('householdId' in target && target.householdId) switchHousehold(target.householdId);
        // Only the four checked addresses of core come out here.
        router.navigate(notificationTargetHref(target) as Href);
      }),
    [router],
  );
}

/**
 * Opening the app with network (Decision 18, AC-039, AC-041): once per start, and once more the
 * first time the network comes back if it was missing. Never asks for permission (AC-003).
 */
function useDeviceSyncOnStart(): void {
  const offline = useOffline();
  const done = useRef(false);
  useEffect(() => {
    void loadDevicePushState();
  }, []);
  useEffect(() => {
    if (offline || done.current) return;
    done.current = true;
    syncDeviceOnStart(true).catch(() => undefined);
  }, [offline]);
}

/** Both, mounted once inside the signed-in app. */
export function NotificationBridge() {
  useNotificationOpen();
  useDeviceSyncOnStart();
  return null;
}
