import { openByLink, openExternalLink } from '@housekeeping/ui';

import { installedIosApp, webWindow } from './open-route';

/**
 * Opens a web page (a recipe's link, a restaurant's or an activity's website): in the installed
 * iPhone web app through a tapped link, so no empty window with ✕ stays behind (spec 0034,
 * REQ-011, like "Route" in spec 0029); everywhere else in a new tab as before.
 */
export function openLink(url: string): void {
  const view = webWindow();
  if (!view || !installedIosApp(view) || typeof document === 'undefined') {
    openExternalLink(url);
    return;
  }
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  openByLink(url, {
    create: () => anchor,
    append: () => document.body.appendChild(anchor),
    remove: () => anchor.remove(),
  });
}
