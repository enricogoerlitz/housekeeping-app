import {
  pageQuery,
  readPageParams,
  SECTION_START,
  sectionOfPath,
  sectionOfStartPath,
  startPageHref,
  type Origin,
  type PageKey,
  type PageParams,
} from '@housekeeping/core';
import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useNavigation,
  usePathname,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Spec 0019 "Zustand in der Adresse": the only place of the app that reads route parameters
// (AC-054). Pages read and write their parameters through `usePageParams`, with the names and
// values of the list in core (`PAGE_PARAMS`), and follow one history rule (Decision 4): view,
// filter, search, sort, paging and the selection on wide screens replace the current entry;
// opening a window adds one, so the browser's Back, the swipe back, Escape, a tap outside and ✕
// close it alike (REQ-013).

type Raw = Record<string, string | string[] | undefined>;
type Query = Record<string, string | string[] | undefined>;

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

// ---------- Windows in the browser history ----------

/**
 * A window opened by the person: the browser entry below it (same router entry id, the address
 * without the window) and how to tell the router that the window is closed.
 */
interface WindowEntry {
  entryId: unknown;
  base: string;
  close: () => void;
}
const windows: WindowEntry[] = [];

function location(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}
function entryId(): unknown {
  return (window.history.state as { id?: unknown } | null)?.id;
}

// The router does not know a history entry that only differs in a window's parameters (it would
// remount the page to restore it). The window entry is a copy of the page's own entry; going back
// to that copy is caught here first, before the router's own listener, and only closes the window.
if (isWeb) {
  window.addEventListener(
    'popstate',
    (event) => {
      const top = windows[windows.length - 1];
      if (!top || entryId() !== top.entryId || location() !== top.base) return;
      windows.pop();
      event.stopImmediatePropagation();
      top.close();
    },
    true,
  );
}

function openWindowEntry(apply: () => void, close: () => void): void {
  if (!isWeb) return apply();
  const base = location();
  window.history.pushState(window.history.state, '', base);
  windows.push({ entryId: entryId(), base, close });
  apply();
}

/** True when the window shown was opened in this session: closing it goes back one entry. */
function ownWindowOnTop(): boolean {
  const top = windows[windows.length - 1];
  return isWeb && top !== undefined && entryId() === top.entryId && location() !== top.base;
}

// ---------- Reading and writing a page's parameters ----------

export interface PageAddress<K extends PageKey> {
  /** The valid parameters of the page; invalid ones are ignored and removed (AC-034, AC-039). */
  params: PageParams<K>;
  /** Changes parameters in place (view, filter, search, sort, paging, selection). */
  replace: (patch: PageParams<K>) => void;
  /** Opens a window: the address changes in a new history entry. */
  open: (patch: PageParams<K>) => void;
  /**
   * Closes a window: back one entry when it was opened here, otherwise (the address was loaded
   * with it) the parameters change in place, so ✕ never leaves the app (AC-042).
   */
  close: (patch: PageParams<K>) => void;
}

export function usePageParams<K extends PageKey>(page: K): PageAddress<K> {
  const raw = useLocalSearchParams<Raw>();
  // On the page's own route: router.setParams would set them on the focused route above it.
  const navigation = useNavigation();
  const rawKey = JSON.stringify(raw);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the parameters' content, not identity
  const read = useMemo(() => readPageParams(page, raw), [page, rawKey]);

  const setParams = useCallback(
    (query: Query) => (navigation.setParams as unknown as (params: Query) => void)(query),
    [navigation],
  );
  const replace = useCallback(
    (patch: PageParams<K>) => setParams(pageQuery(page, patch)),
    [page, setParams],
  );

  // Invalid values and defaults leave the address (the route id stays, it is part of the path).
  const invalid = read.invalid.filter((name) => name !== 'id').join(',');
  useEffect(() => {
    if (invalid) setParams(Object.fromEntries(invalid.split(',').map((name) => [name, undefined])));
  }, [invalid, setParams]);

  const values = read.values;
  const open = useCallback(
    (patch: PageParams<K>) => {
      const before = Object.fromEntries(
        Object.keys(patch).map((name) => [name, (values as Record<string, unknown>)[name]]),
      ) as PageParams<K>;
      openWindowEntry(
        () => replace(patch),
        () => replace(before),
      );
    },
    [replace, values],
  );
  const close = useCallback(
    (patch: PageParams<K>) => {
      if (ownWindowOnTop()) window.history.back();
      else replace(patch);
    },
    [replace],
  );
  return { params: values, replace, open, close };
}

// ---------- Where the person is: sections, origins, start pages ----------

interface Place {
  href: string;
  section: Origin;
}
let current: Place | undefined;
const startPages: Partial<Record<Origin, string>> = {};
const placeListeners = new Set<() => void>();

function subscribePlace(listener: () => void): () => void {
  placeListeners.add(listener);
  return () => placeListeners.delete(listener);
}
const placeSnapshot = () => current;

function queryString(params: Raw): string {
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(params)) {
    if (name === 'id' || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(entry)}`);
    }
  }
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/**
 * Mount once inside the router: remembers the current address, its section and each section's
 * start page as last left (REQ-005).
 */
export function PlaceTracker(): null {
  const pathname = usePathname();
  const params = useGlobalSearchParams<Raw>();
  const key = JSON.stringify(params);
  useEffect(() => {
    // From the router, not from the browser's address: on the web the router writes that only
    // after this effect, so it would still be the page before (Zurück from "Verwalten" left "/"
    // remembered as "/verwalten", and "Übersicht" then opened "Verwalten" again).
    const href = pathname + queryString(params);
    const von = typeof params.von === 'string' ? params.von : undefined;
    current = { href, section: sectionOfPath(pathname, von) };
    const start = sectionOfStartPath(pathname);
    if (start) startPages[start] = startPageHref(href);
    for (const listener of placeListeners) listener();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the parameters' content
  }, [pathname, key]);
  return null;
}

/** The section highlighted in the tab bar and the sidebar (REQ-006). */
export function useActiveSection(): Origin | undefined {
  return useSyncExternalStore(subscribePlace, placeSnapshot, placeSnapshot)?.section;
}

/** The start page of a section as last left, without window and detail (REQ-005). */
export function sectionHref(section: Origin): string {
  return startPages[section] ?? SECTION_START[section];
}

/** Choosing a section in the tab bar or the sidebar: its start page, also from inside it. */
export function useOpenSection(): (section: Origin) => void {
  const router = useRouter();
  return useCallback((section: Origin) => router.navigate(sectionHref(section) as never), [router]);
}

/**
 * The `von` for a detail page of section `own` opened from here: the current section when it is
 * another one, so the page names it and leads back to it (REQ-006).
 */
export function originFor(own: Origin): Origin | undefined {
  const section = current?.section;
  return section === undefined || section === own ? undefined : section;
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

export interface OriginBack {
  section: Origin;
  /** "‹ Übersicht": the name of the origin. */
  label: string;
  back: () => void;
}

/**
 * "Zurück" of a detail page (REQ-006): to the previous entry when that is the origin (with its
 * state), otherwise to the origin's start page; never out of the app (AC-018). `von` is the
 * page's parameter, `own` its section without one.
 */
export function useOriginBack(
  von: Origin | undefined,
  own: Origin,
  /** Without `von`: the page's own list instead of the section's start, e.g. "Märkte". */
  home?: { label: string; href: string },
): OriginBack {
  const router = useRouter();
  const section = von ?? own;
  const fallback = von === undefined && home ? home.href : sectionHref(section);
  // The address the page was opened from: still the current one while it renders first. After
  // a deep link the router may mount the page again once it is ready; then "current" is the page
  // itself, which is no origin.
  const pathname = usePathname();
  const [opener] = useState(() =>
    current && current.href.split('?')[0] !== pathname ? current : undefined,
  );
  const back = useCallback(() => {
    if (opener && opener.section === section) {
      if (isWeb) window.history.back();
      else router.back();
      return;
    }
    router.navigate(fallback as never);
  }, [opener, router, section, fallback]);
  const label = von === undefined && home ? home.label : SECTION_LABEL[section];
  return { section, label, back };
}
