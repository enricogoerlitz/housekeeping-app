import { AccessibilityInfo, Platform } from 'react-native';

let region: HTMLElement | undefined;

/**
 * Reads a short message to screen-reader users, e.g. "Milch abgehakt". Native platforms use their
 * announcement API; on the web (where that is a no-op) a polite live region carries the text.
 */
export function announce(message: string): void {
  if (Platform.OS !== 'web') {
    AccessibilityInfo.announceForAccessibility(message);
    return;
  }
  if (typeof document === 'undefined') return;
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('data-testid', 'announcer');
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(region);
  }
  const live = region;
  // Emptying first makes a repeated message ("Milch abgehakt" twice) count as a change.
  live.textContent = '';
  setTimeout(() => {
    live.textContent = message;
  }, 50);
}
