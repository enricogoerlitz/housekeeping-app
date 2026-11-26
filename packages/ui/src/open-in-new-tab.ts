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

/** The parts of an `<a>` element openByLink sets. */
export interface LinkElement {
  href: string;
  target: string;
  rel: string;
  click: () => void;
}

export interface LinkDocument {
  create: () => LinkElement;
  append: (link: LinkElement) => void;
  remove: (link: LinkElement) => void;
}

/**
 * Opens a page through a tapped link (spec 0034, REQ-011): in the installed iOS web app
 * `window.open` leaves an empty window with ✕ behind (WebKit bug 199029); a real link with
 * `target=_blank` opens the page in the system's browser view and comes back to the app. Same
 * protection as openInNewTab: no opener, no referrer.
 */
export function openByLink(url: string, document: LinkDocument): void {
  const link = document.create();
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.append(link);
  link.click();
  document.remove(link);
}
