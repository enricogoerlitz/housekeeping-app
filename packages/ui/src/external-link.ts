import { Linking, Platform } from 'react-native';

import { openInNewTab } from './open-in-new-tab';

/** openInNewTab in the browser; the system's handler elsewhere. */
export function openExternalLink(url: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    openInNewTab(url, (href, target, features) => window.open(href, target, features));
    return;
  }
  Linking.openURL(url).catch(() => undefined);
}
