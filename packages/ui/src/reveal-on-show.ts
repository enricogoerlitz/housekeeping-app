import { useEffect, useRef } from 'react';
import { Platform, type HostInstance } from 'react-native';

import { revealInScrollParent } from './scroll-reveal';

/**
 * For something that appears later inside a window, e.g. an error after a request: when `shown`
 * becomes set, the nearest scroll area scrolls just far enough to show it, so it never stays
 * below the fold or behind the window's footer. The page itself stays put. The web only: there
 * the view is the DOM node.
 */
export function useRevealOnShow(shown: unknown) {
  const ref = useRef<HostInstance>(null);
  useEffect(() => {
    if (!shown || Platform.OS !== 'web') return;
    revealInScrollParent(ref.current, { align: 'nearest' });
  }, [shown]);
  return ref;
}
