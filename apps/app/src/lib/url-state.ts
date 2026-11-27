import {
  forgetPlace,
  EMPTY_PLACE,
  isOwnWindowOnTop,
  openerOf,
  originBackPlan,
  originFor as originForPlace,
  pageParamsBefore,
  pageQuery,
  placeAfter,
  readPageParams,
  tabPressAction,
  windowClosedByBack,
  type Origin,
  type PageKey,
  type PageParams,
  type PlaceState,
  type WindowEntry,
} from '@housekeeping/core';
import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useNavigation,
  usePathname,
  useRouter,
} from 'expo-router';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { scrollShownToTop } from '@housekeeping/ui';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

// Spec 0019 "Zustand in der Adresse": the only place of the app that reads route parameters
// (AC-054). Pages read and write their parameters through `usePageParams`, with the names and
// values of the list in core (`PAGE_PARAMS`), and follow one history rule (Decision 4): view,
// filter, search, sort, paging and the selection on wide screens replace the current entry;
// opening a window adds one, so the browser's Back, the swipe back, Escape, a tap outside and ✕
// close it alike (REQ-013). The decisions are pure functions in core (place.ts); this file only
// connects them to the router and the browser history.

type Raw = Record<string, string | string[] | undefined>;
type Query = Record<string, string | string[] | undefined>;

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

// ---------- Windows in the browser history ----------

const windows: WindowEntry[] = [];
// Between ✕ (history back) and the popstate that restores the page, a change of parameters would
// be undone by that restore: it waits and applies after it (e.g. selecting what the window
// just created).
let closingWindow = false;
const afterClose: (() => void)[] = [];

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
      const top = windowClosedByBack(windows, entryId(), location());
      closingWindow = false;
      if (top) {
        windows.pop();
        event.stopImmediatePropagation();
        top.close();
      }
      afterClose.splice(0).forEach((apply) => apply());
    },
    true,
  );
}

/** Runs `apply` once a window closing by ✕ has left the history, or at once when none is. */
export function afterWindowClosed(apply: () => void): void {
  if (closingWindow) afterClose.push(apply);
  else apply();
}

function openWindowEntry(apply: () => void, close: () => void): void {
  if (!isWeb) return apply();
  const base = location();
  window.history.pushState(window.history.state, '', base);
  windows.push({ entryId: entryId(), base, close });
  apply();
}

function ownWindowOnTop(): boolean {
  return isWeb && isOwnWindowOnTop(windows, entryId(), location());
}

// ---------- Reading and writing a page's parameters ----------

export interface PageAddress<K extends PageKey> {
  /** The valid parameters of the page; invalid ones are ignored and removed (AC-034, AC-039). */
  params: PageParams<K>;
  /** Changes parameters in place (view, filter, search, sort, paging, selection). */
  replace: (patch: PageParams<K>) => void;
  /**
   * Opens a window: the address changes in a new history entry. `below` changes the entry under
   * the window too, e.g. to the view the window belongs to (spec 0036, AC-017).
   */
  open: (patch: PageParams<K>, below?: PageParams<K>) => void;
  /**
   * Closes a window: back one entry when it was opened here, otherwise (the address was loaded
   * with it) the parameters change in place, so ✕ never leaves the app (AC-042).
   */
  close: (patch: PageParams<K>) => void;
}

const PreviewAddressContext = createContext<
  { page: PageKey; params: Record<string, unknown> } | undefined
>(undefined);

/**
 * Draws a page as it would show with `params`, e.g. the neighbour tab beside a tab swipe (spec
 * 0034, REQ-007): `usePageParams(page)` inside reads these and writes nothing.
 */
export function PagePreview<K extends PageKey>(props: {
  page: K;
  params: PageParams<K>;
  children: ReactNode;
}) {
  return createElement(
    PreviewAddressContext.Provider,
    { value: { page: props.page, params: props.params as Record<string, unknown> } },
    props.children,
  );
}

const ignore = () => undefined;

export function usePageParams<K extends PageKey>(page: K): PageAddress<K> {
  const preview = useContext(PreviewAddressContext);
  const previewing = preview?.page === page;
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
    (patch: PageParams<K>) => {
      afterWindowClosed(() => setParams(pageQuery(page, patch)));
    },
    [page, setParams],
  );

  // Invalid values and defaults leave the address (the route id stays, it is part of the path).
  const invalid = read.invalid.filter((name) => name !== 'id').join(',');
  useEffect(() => {
    if (invalid && !previewing)
      setParams(Object.fromEntries(invalid.split(',').map((name) => [name, undefined])));
  }, [invalid, previewing, setParams]);

  const values = read.values;
  const open = useCallback(
    (patch: PageParams<K>, below?: PageParams<K>) => {
      // Back to the entry below restores its whole address, also what changed inside the window.
      const before = pageParamsBefore(page, { ...values, ...below });
      openWindowEntry(
        () => replace(patch),
        () => replace(before),
      );
    },
    [page, replace, values],
  );
  const close = useCallback(
    (patch: PageParams<K>) => {
      if (ownWindowOnTop()) {
        closingWindow = true;
        window.history.back();
      } else replace(patch);
    },
    [replace],
  );
  if (previewing) {
    return {
      params: preview.params as PageParams<K>,
      replace: ignore,
      open: ignore,
      close: ignore,
    };
  }
  return { params: values, replace, open, close };
}

// ---------- Where the person is: sections, origins, start pages ----------

let place: PlaceState = EMPTY_PLACE;
const placeListeners = new Set<() => void>();

function subscribePlace(listener: () => void): () => void {
  placeListeners.add(listener);
  return () => placeListeners.delete(listener);
}
const placeSnapshot = () => place.current;

/** Call right before `router.replace` of a whole address (see `forgetPlace` in core). */
export function forgetCurrentPlace(): void {
  place = forgetPlace(place);
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
    place = placeAfter(place, pathname, params);
    for (const listener of placeListeners) listener();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the parameters' content
  }, [pathname, key]);
  return null;
}

/** The section highlighted in the tab bar and the sidebar (REQ-006). */
export function useActiveSection(): Origin | undefined {
  return useSyncExternalStore(subscribePlace, placeSnapshot, placeSnapshot)?.section;
}

/**
 * Choosing a section in the tab bar or the sidebar: its start page, also from inside it; on that
 * start page a second tap scrolls it to the top (spec 0057, REQ-002).
 */
export function usePressSection(): (section: Origin) => void {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  return useCallback(
    (section: Origin) => {
      const action = tabPressAction(place, section);
      if (action.kind === 'top') scrollShownToTop(!reducedMotion);
      else router.navigate(action.href as never);
    },
    [router, reducedMotion],
  );
}

/**
 * The `von` for a detail page of section `own` opened from here: the current section when it is
 * another one, so the page names it and leads back to it (REQ-006).
 */
export function originFor(own: Origin): Origin | undefined {
  return originForPlace(place, own);
}

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
  const pathname = usePathname();
  // The address the page was opened from, as it was while the page rendered first.
  const [opener] = useState(() => openerOf(place, pathname));
  const plan = originBackPlan({ von, own, opener, place, home });
  const { historyBack, href } = plan;
  const back = useCallback(() => {
    if (!historyBack) router.navigate(href as never);
    else if (isWeb) window.history.back();
    else router.back();
  }, [historyBack, href, router]);
  return { section: plan.section, label: plan.label, back };
}
