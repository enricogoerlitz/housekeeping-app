import { shareLink, type ShareTarget } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import { Platform } from 'react-native';

import { copyText } from './clipboard';

// "Teilen" (spec 0047, REQ-001; before spec 0042, REQ-004): only the address of the page in the
// app goes to the share menu of the device; without a menu it is copied: "Link kopiert".

interface WebShare {
  share?: (data: { url: string }) => Promise<void>;
}

function webShare(): WebShare | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { navigator?: WebShare }).navigator;
}

function appOrigin(): string | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { location?: { origin?: string } }).location?.origin;
}

/**
 * Shares in the tap (the browser asks for it right inside the press). Cancelling the menu does
 * nothing; without a menu or when the browser refuses, the link is copied (AC-003, AC-004).
 */
export async function shareTarget(target: ShareTarget): Promise<void> {
  const url = shareLink(appOrigin(), target);
  if (!url) {
    toast.show({ message: 'Teilen hat nicht geklappt.' });
    return;
  }
  const navigator = webShare();
  if (typeof navigator?.share === 'function') {
    try {
      await navigator.share({ url });
      return;
    } catch (error) {
      if ((error as { name?: string } | undefined)?.name === 'AbortError') return;
    }
  }
  toast.show({ message: (await copyText(url)) ? 'Link kopiert' : 'Teilen hat nicht geklappt.' });
}
