import { normalizeText } from './text';
import type { Activity, ActivityKind, Id } from './types';

// Kinds and symbols of activities (spec 0041, REQ-001, REQ-002) and "Merken" (REQ-004).

/**
 * The fixed choice of symbols (Entscheidung 5): names of the app's icon set, each with the word a
 * screen reader says. The database checks the same names (private.is_activity_icon); a change
 * here needs a migration.
 */
export const ACTIVITY_ICONS = [
  { name: 'mountain', label: 'Berg' },
  { name: 'cake', label: 'Torte' },
  { name: 'gift', label: 'Geschenk' },
  { name: 'party-popper', label: 'Feier' },
  { name: 'dumbbell', label: 'Hantel' },
  { name: 'bike', label: 'Fahrrad' },
  { name: 'footprints', label: 'Wandern' },
  { name: 'volleyball', label: 'Ball' },
  { name: 'trophy', label: 'Pokal' },
  { name: 'waves', label: 'Wasser' },
  { name: 'sailboat', label: 'Boot' },
  { name: 'snowflake', label: 'Schnee' },
  { name: 'tent', label: 'Zelt' },
  { name: 'trees', label: 'Wald' },
  { name: 'flower-2', label: 'Blume' },
  { name: 'sun', label: 'Sonne' },
  { name: 'map', label: 'Karte' },
  { name: 'map-pin', label: 'Ort' },
  { name: 'plane', label: 'Flugzeug' },
  { name: 'train-front', label: 'Zug' },
  { name: 'car', label: 'Auto' },
  { name: 'luggage', label: 'Koffer' },
  { name: 'drama', label: 'Theater' },
  { name: 'music', label: 'Musik' },
  { name: 'film', label: 'Kino' },
  { name: 'landmark', label: 'Museum' },
  { name: 'palette', label: 'Malen' },
  { name: 'book-open', label: 'Buch' },
  { name: 'camera', label: 'Kamera' },
  { name: 'ticket', label: 'Ticket' },
  { name: 'utensils', label: 'Essen' },
  { name: 'coffee', label: 'Kaffee' },
  { name: 'wine', label: 'Wein' },
  { name: 'ice-cream-cone', label: 'Eis' },
  { name: 'users', label: 'Treffen' },
  { name: 'heart', label: 'Herz' },
  { name: 'dog', label: 'Hund' },
  { name: 'gamepad-2', label: 'Spiele' },
  { name: 'bath', label: 'Wellness' },
  { name: 'sparkles', label: 'Besonderes' },
] as const;

export type ActivityIcon = (typeof ACTIVITY_ICONS)[number]['name'];

const ICON_NAMES: ReadonlySet<string> = new Set(ACTIVITY_ICONS.map((icon) => icon.name));

export function isActivityIcon(value: string): value is ActivityIcon {
  return ICON_NAMES.has(value);
}

/** The word for a symbol ("Berg"), for screen readers and the symbol choice. */
export function activityIconLabel(icon: ActivityIcon): string {
  return ACTIVITY_ICONS.find((entry) => entry.name === icon)?.label ?? icon;
}

/** The symbol of an activity without own symbol and kind: today's mountain. */
export const DEFAULT_ACTIVITY_ICON: ActivityIcon = 'mountain';

/** The kinds a household starts with; the database seeds the same (seed_activity_kinds). */
export const DEFAULT_ACTIVITY_KINDS: readonly Omit<ActivityKind, 'id'>[] = [
  { name: 'Geburtstag', icon: 'cake' },
  { name: 'Sport', icon: 'dumbbell' },
  { name: 'Ausflug', icon: 'map' },
  { name: 'Kultur', icon: 'drama' },
  { name: 'Essen gehen', icon: 'utensils' },
  { name: 'Treffen', icon: 'users' },
  { name: 'Reise', icon: 'plane' },
  { name: 'Sonstiges', icon: 'sparkles' },
];

/** AC-005: the own symbol, else the kind's, else the default. */
export function activityIconOf(
  activity: Pick<Activity, 'icon' | 'kindId'>,
  kindsById: Record<Id, ActivityKind | undefined>,
): ActivityIcon {
  if (activity.icon) return activity.icon;
  const kind = activity.kindId === undefined ? undefined : kindsById[activity.kindId];
  return kind?.icon ?? DEFAULT_ACTIVITY_ICON;
}

/** activity_kinds_name_valid. */
export const KIND_NAME_MAX_LENGTH = 40;

// The same rule as the database check: no control characters (they would reach notifications).
const CONTROL = /[\u0000-\u001f\u007f]/;

/** "Name fehlt" or "Höchstens 40 Zeichen"; undefined when the name can be saved. */
export function kindNameProblem(name: string): string | undefined {
  const clean = name.trim();
  if (clean === '' || CONTROL.test(clean)) return 'Name fehlt';
  if (clean.length > KIND_NAME_MAX_LENGTH) return `Höchstens ${KIND_NAME_MAX_LENGTH} Zeichen`;
  return undefined;
}

/** A kind of the same normalised name (unique name_key), other than `ownId`. */
export function findDuplicateKind(
  name: string,
  kinds: readonly ActivityKind[],
  ownId?: Id,
): ActivityKind | undefined {
  const key = normalizeText(name);
  if (key === '') return undefined;
  return kinds.find((kind) => kind.id !== ownId && normalizeText(kind.name) === key);
}

export type RememberFilter = 'remembered' | 'all' | 'forgotten';

/** The filter of the list; it always opens with the first, "Gemerkt" (AC-013). */
export const REMEMBER_FILTERS: readonly { value: RememberFilter; label: string }[] = [
  { value: 'remembered', label: 'Gemerkt' },
  { value: 'all', label: 'Alle' },
  { value: 'forgotten', label: 'Nicht gemerkt' },
];

/** AC-012: the activities the filter shows, in their order. */
export function filterRemembered<T extends Pick<Activity, 'remembered'>>(
  activities: readonly T[],
  filter: RememberFilter,
): T[] {
  if (filter === 'all') return [...activities];
  const wanted = filter === 'remembered';
  return activities.filter((activity) => activity.remembered === wanted);
}

/** AC-016: how many activities each filter would show, for the counts in its menu. */
export function countRememberFilters(
  activities: readonly Pick<Activity, 'remembered'>[],
): Record<RememberFilter, number> {
  const remembered = activities.filter((activity) => activity.remembered).length;
  return {
    remembered,
    all: activities.length,
    forgotten: activities.length - remembered,
  };
}

/**
 * AC-013: whether the address leaves the list, so it opens with "Gemerkt" again. An activity
 * opened from it (its own page on phones and from the tiles) does not: back on the list the
 * chosen filter stays, and an activity that is not remembered is still there.
 */
export function leavesActivityList(pathname: string): boolean {
  return pathname !== '/aktivitaeten' && !pathname.startsWith('/aktivitaet/');
}

export interface ActivityEmptyState {
  title: string;
  /** Only for a search: no other word helps an empty filter. */
  text?: string;
  /** "Alle zeigen" (all activities, without "Favoriten") while a filter narrows the list. */
  showAll: boolean;
}

/**
 * The empty list of "Aktivitäten" with activities in the household, worded like recipes and
 * articles: "Keine Aktivitäten für „xyzzy““ for a search, else the filter that hides them —
 * "Keine Aktivitäten unter „Gemerkt““, or "… für diese Filter" with "Favoriten".
 */
export function activityEmptyState(
  query: string,
  remember: RememberFilter,
  favoritesOnly: boolean,
): ActivityEmptyState {
  const showAll = favoritesOnly || remember !== 'all';
  const shown = query.trim();
  if (shown !== '') {
    return {
      title: `Keine Aktivitäten für „${shown}“`,
      text: 'Probiere ein anderes Wort.',
      showAll,
    };
  }
  if (favoritesOnly || remember === 'all') {
    return { title: 'Keine Aktivitäten für diese Filter', showAll };
  }
  const label = REMEMBER_FILTERS.find((entry) => entry.value === remember)?.label ?? '';
  return { title: `Keine Aktivitäten unter „${label}“`, showAll };
}
