import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders into the page's body, beside react-native-web's Modal layers: inside the app every View
 * starts its own stacking context (`z-index: 0`), so nothing in it can rise above an open window.
 */
export function TopLayer(props: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{props.children}</>;
  return createPortal(props.children, document.body);
}
