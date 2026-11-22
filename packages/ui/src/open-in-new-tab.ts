export type OpenWindow = (
  url: string,
  target: string,
  features: string,
) => { opener: unknown } | null;

/**
 * Opens a page on the web in a new tab (spec 0023, REQ-009): `noopener` and `noreferrer`, so the
 * page cannot reach the app through `window.opener` and learns nothing about where it came from.
 * The caller passes only an address it checked (core linkDisplay).
 */
export function openInNewTab(url: string, open: OpenWindow): void {
  const tab = open(url, '_blank', 'noopener,noreferrer');
  // Browsers that ignore the features still hand back the tab: cut the link by hand.
  if (tab) tab.opener = null;
}
