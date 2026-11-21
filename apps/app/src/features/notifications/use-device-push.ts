import { pushRejectedMessage, removePushDevice, sendTestPush, useOffline } from '@housekeeping/api';
import {
  thisDeviceView,
  type DeviceState,
  type OwnPushSubscription,
  type ThisDeviceView,
} from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  readDeviceSnapshot,
  runDeviceTap,
  switchDeviceOff,
  type DeviceSnapshot,
} from './device-push';
import { useDevicePushState } from './device-store';
import { currentPermission, devicePushSupport, thisDeviceLabel } from './web-push-platform';

/**
 * Asks for this device when a kind is switched on or a time is set (spec 0013, AC-007, Decision
 * 26). Call it first in the tap handler, before the write: the browser's question must come from
 * the gesture. Fire and forget; a refusal of the server shows as a toast, the setting itself is
 * saved anyway.
 */
export function useEnsureDevicePush(): () => void {
  const offline = useOffline();
  return useCallback(() => {
    runDeviceTap('kind-on', !offline).catch((error: unknown) =>
      toast.show({ message: pushRejectedMessage(error) }),
    );
  }, [offline]);
}

export type DevicesList =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'failed' }
  | { status: 'ready'; devices: OwnPushSubscription[] };

export interface ThisDevice {
  /** "Mac · Chrome · ✓ erlaubt" (AC-004). */
  title: string;
  view: ThisDeviceView;
  devicesList: DevicesList;
  busy: boolean;
  setOn: (on: boolean) => void;
  probe: () => void;
  remove: (device: OwnPushSubscription) => void;
}

/** The sections "Dieses Gerät" and "Deine Geräte" of the page (REQ-002, REQ-003, REQ-010). */
export function useThisDevice(): ThisDevice {
  const offline = useOffline();
  const stored = useDevicePushState();
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | undefined>();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const next = await readDeviceSnapshot(!offline);
    if (!mounted.current) return;
    setSnapshot(next);
  }, [offline]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // The stored part changes with every action; the browser and the server are read again then.
  const state: DeviceState = {
    ...(snapshot?.state ?? { support: devicePushSupport(), permission: currentPermission() }),
    online: !offline,
    wanted: stored.wanted,
    ...(stored.endpoint ? { storedEndpoint: stored.endpoint } : {}),
  };
  // Read again whenever the network comes or goes; until then the list is loading.
  const loading = snapshot === undefined || snapshot.state.online === offline;
  const view = thisDeviceView(state);
  const title = [thisDeviceLabel(), view.status].filter(Boolean).join(' · ');

  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    action()
      .catch((error: unknown) => toast.show({ message: pushRejectedMessage(error) }))
      .finally(() => {
        if (!mounted.current) return;
        setBusy(false);
        void refresh();
      });
  };

  const devicesList: DevicesList = offline
    ? { status: 'offline' }
    : loading
      ? { status: 'loading' }
      : snapshot?.devices
        ? { status: 'ready', devices: snapshot.devices }
        : { status: 'failed' };

  return {
    title,
    view,
    devicesList,
    busy,
    // The browser is asked first, inside the tap (runDeviceTap awaits nothing before it).
    setOn: (on) => run(() => (on ? runDeviceTap('device-on', !offline) : switchDeviceOff())),
    probe: () => {
      const endpoint = state.browser?.endpoint;
      if (!endpoint) return;
      run(async () => {
        await sendTestPush(endpoint);
        toast.show({ message: 'Probe gesendet' });
      });
    },
    remove: (device) =>
      run(async () => {
        await removePushDevice(device.id);
        toast.show({ message: `„${device.label}“ entfernt` });
      }),
  };
}
