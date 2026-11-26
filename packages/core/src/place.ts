import {
  SECTION_START,
  sectionOfPath,
  sectionOfStartPath,
  startPageHref,
  type Origin,
  type RawParams,
} from './url-params';

// Where the person is (spec 0019, REQ-005, REQ-006): the current address with its section and
// each section's start page as last left. The app keeps one PlaceState and feeds it every address
// the router shows; the decisions about "Zurück", the tab bar and windows in the browser history
// are the functions below (spec 0031, REQ-009).

export interface Place {
  href: string;
  section: Origin;
}

export interface PlaceState {
  current?: Place;
  /** The last address on another path, for a page that mounts after the router showed it. */
  previous?: Place;
  startPages: Partial<Record<Origin, string>>;
}

const pathOf = (place: Place | undefined) => place?.href.split('?')[0];

export const EMPTY_PLACE: PlaceState = { startPages: {} };

/** The query of an address as the router holds it, without the route id that is in the path. */
export function placeQuery(params: RawParams): string {
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(params)) {
    if (name === 'id' || value === undefined) continue;
    for (const entry of typeof value === 'string' ? [value] : value) {
      pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(entry)}`);
    }
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/** The state after the router showed `pathname` with `params`. */
export function placeAfter(state: PlaceState, pathname: string, params: RawParams): PlaceState {
  const href = pathname + placeQuery(params);
  const start = sectionOfStartPath(pathname);
  return {
    current: { href, section: sectionOfPath(pathname) },
    previous: pathOf(state.current) === pathname ? state.previous : state.current,
    startPages: start ? { ...state.startPages, [start]: startPageHref(href) } : state.startPages,
  };
}

/**
 * Before the address is replaced (back to the remembered address after signing in): the entry
 * below is then not the current address, so nothing shown so far may be an opener (AC-018). The
 * start pages stay.
 */
export function forgetPlace(state: PlaceState): PlaceState {
  return { startPages: state.startPages };
}

/** The start page of a section as last left, without window and detail (REQ-005). */
export function sectionHref(state: PlaceState, section: Origin): string {
  return state.startPages[section] ?? SECTION_START[section];
}

/**
 * The `von` for a detail page of section `own` opened from here: the current section when it is
 * another one, so the page names it and leads back to it (REQ-006).
 */
export function originFor(state: PlaceState, own: Origin): Origin | undefined {
  const section = state.current?.section;
  return section === undefined || section === own ? undefined : section;
}

/**
 * The address a page at `pathname` was opened from: the current one while the page renders
 * first. A page in a tab that mounts only after the router showed it (expo-router mounts tabs
 * lazily) finds itself as the current address; then it is the one before. After a deep link
 * there is none before, which is no origin.
 */
export function openerOf(state: PlaceState, pathname: string): Place | undefined {
  if (state.current && pathOf(state.current) !== pathname) return state.current;
  return state.previous && pathOf(state.previous) !== pathname ? state.previous : undefined;
}

/**
 * The quick view beside a start page's list (wide screens), opened from another section: its ✕
 * and the header's "‹ Kalender" lead back there (spec 0035, REQ-002). Without `von`, or from the
 * own section, ✕ only closes it.
 */
export function quickViewOrigin(von: Origin | undefined, own: Origin): Origin | undefined {
  return von === undefined || von === own ? undefined : von;
}

const SECTION_LABEL: Record<Origin, string> = {
  uebersicht: 'Übersicht',
  essen: 'Essen',
  kalender: 'Kalender',
  liste: 'Liste',
  haushalt: 'Haushalt',
  verwalten: 'Verwalten',
  reisen: 'Reisen',
};

export interface OriginBackPlan {
  section: Origin;
  /** "‹ Übersicht": the name of the origin. */
  label: string;
  /** Back one history entry: the entry below is the origin, with its state. */
  historyBack: boolean;
  /** Otherwise this address. */
  href: string;
}

/**
 * "Zurück" of a detail page (REQ-006): to the previous entry when that is the origin or the
 * page's own list, otherwise to the origin's start page; never out of the app (AC-018). `von` is the page's parameter, `own`
 * its section without one, `home` its own list instead of the section's start (e.g. "Märkte").
 */
export function originBackPlan(input: {
  von: Origin | undefined;
  own: Origin;
  opener: Place | undefined;
  place: PlaceState;
  home?: { label: string; href: string };
}): OriginBackPlan {
  const { von, own, opener, place, home } = input;
  const section = von ?? own;
  const ownList = von === undefined ? home : undefined;
  return {
    section,
    label: ownList?.label ?? SECTION_LABEL[section],
    historyBack:
      opener !== undefined &&
      (opener.section === section || (ownList !== undefined && pathOf(opener) === ownList.href)),
    href: ownList?.href ?? sectionHref(place, section),
  };
}

/**
 * A window opened by the person on the web: the browser entry below it (same router entry id, the
 * address without the window) and how to tell the router that the window is closed.
 */
export interface WindowEntry {
  entryId: unknown;
  base: string;
  close: () => void;
}

/**
 * The window a browser Back closes: the top one, when Back went to the copy of its page's entry
 * below it. Any other Back belongs to the router.
 */
export function windowClosedByBack(
  windows: readonly WindowEntry[],
  entryId: unknown,
  location: string,
): WindowEntry | undefined {
  const top = windows[windows.length - 1];
  return top && entryId === top.entryId && location === top.base ? top : undefined;
}

/** True when the window shown was opened in this session: closing it goes back one entry (AC-042). */
export function isOwnWindowOnTop(
  windows: readonly WindowEntry[],
  entryId: unknown,
  location: string,
): boolean {
  const top = windows[windows.length - 1];
  return top !== undefined && entryId === top.entryId && location !== top.base;
}
