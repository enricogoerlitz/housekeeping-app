// "Normal" or "KI zuerst" (spec 0067, REQ-001, decision 14): the person's own view, in her own
// synced rows of notification_settings and only through set_app_view — an online write, one RPC,
// shown at once (ADR-0011) and synced to her other devices like the row; offline it is refused
// and the last synced view stays (AC-003).
import type { AppView } from '@housekeeping/core';

import { commit, updateData } from './store';

export function setAppView(view: AppView): void {
  commit({ path: 'rpc', send: (transport) => transport.setAppView(view) }, () =>
    updateData((data) =>
      data.notificationSettings
        ? { ...data, notificationSettings: { ...data.notificationSettings, appView: view } }
        : data,
    ),
  );
}
