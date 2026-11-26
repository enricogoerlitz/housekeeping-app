import { z } from 'zod';

import { parseISODate, toISODate } from './dates';
import type { CalendarView } from './calendar';
import {
  DEFAULT_RECIPE_SORT,
  EMPTY_RECIPE_LIST_FILTER,
  type DietFilter,
  type MinRating,
  type RecipeListFilter,
  type RecipeListSort,
  type TimeLimit,
} from './recipe-list';
import {
  DEFAULT_RESTAURANT_SORT,
  EMPTY_RESTAURANT_LIST_FILTER,
  type PriceLevel,
  type RestaurantListFilter,
  type RestaurantListSort,
} from './restaurant-list';
import type { Course, Id, ISODate, RecipeKind } from './types';

// Spec 0019 "Zustand in der Adresse" (REQ-018): every parameter of every page, with its values,
// in one place. Pages read and write the address only through this list; a new window adds its
// `fenster=<name>` or its object parameter here (spec appendix). Names are German, lower case,
// without umlauts; defaults never appear in the address.

// ---------- Value schemas ----------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const Day = z
  .string()
  .refine((value) => DAY.test(value) && toISODate(parseISODate(value)) === value);
const Uuid = z.uuid();
const Flag = z.literal('1');
const Text = z.string().max(200);
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const PositiveInt = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .transform(Number);
const oneOf = <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

/** One parameter: a single value (the first of a repeated one counts) or a repeated list. */
interface OneParam<S extends z.ZodType> {
  kind: 'one';
  schema: S;
  /** The value that never appears in the address, e.g. `ansicht=woche` in the calendar. */
  fallback?: string;
}
interface ManyParam<S extends z.ZodType> {
  kind: 'many';
  schema: S;
}
type ParamSpec = OneParam<z.ZodType> | ManyParam<z.ZodType>;

const one = <S extends z.ZodType>(schema: S, fallback?: string): OneParam<S> => ({
  kind: 'one',
  schema,
  fallback,
});
const many = <S extends z.ZodType>(schema: S): ManyParam<S> => ({ kind: 'many', schema });

/** Where a detail page was opened from (REQ-006). */
export const ORIGINS = [
  'uebersicht',
  'essen',
  'kalender',
  'liste',
  'haushalt',
  'verwalten',
  'reisen',
] as const;
export type Origin = (typeof ORIGINS)[number];
const Von = one(oneOf(ORIGINS));

/** A notification hands over the household once; the page switches and removes it. */
const Haushalt = one(Uuid);

// ---------- Recipe list values ----------

const RECIPE_SORT_SLUGS = {
  recent: 'zuletzt',
  count: 'haeufig',
  rating: 'bewertung',
  new: 'neu',
  title: 'name',
  random: 'zufall',
} as const satisfies Record<RecipeListSort, string>;
const DIET_SLUGS = { vegetarian: 'vegetarisch', vegan: 'vegan' } as const satisfies Record<
  DietFilter,
  string
>;
const KIND_SLUGS = { recipe: 'rezepte', collection: 'sammlungen' } as const satisfies Record<
  RecipeKind,
  string
>;
const COURSE_SLUGS = {
  breakfast: 'fruehstueck',
  main: 'hauptgericht',
  side: 'beilage',
  dessert: 'dessert',
  snack: 'snack',
  drink: 'getraenk',
} as const satisfies Record<Course, string>;
const RESTAURANT_SORT_SLUGS = ['zuletzt', 'bewertung', 'name', 'zufall'] as const;
const values = <T extends Record<string, string>>(slugs: T) =>
  Object.values(slugs) as [T[keyof T], ...T[keyof T][]];
const invert = <K extends string, V extends string>(slugs: Record<K, V>): Record<V, K> =>
  Object.fromEntries(Object.entries(slugs).map(([key, value]) => [value, key])) as Record<V, K>;

const CALENDAR_VIEW_SLUGS = {
  week: 'woche',
  month: 'monat',
  year: 'jahr',
} as const satisfies Record<CalendarView, string>;

// ---------- The list ----------

/**
 * Every page with the parameters it reads (spec appendix). `id` is the route segment of a detail
 * page; an id that is not a uuid shows "nicht gefunden" (AC-053).
 */
export const PAGE_PARAMS = {
  uebersicht: {
    tag: one(Day),
    fenster: one(oneOf(['neu-eintrag', 'erledigt'])),
    reise: one(Uuid),
    haushalt: Haushalt,
  },
  kalender: {
    ansicht: one(oneOf(values(CALENDAR_VIEW_SLUGS)), 'woche'),
    tag: one(Day),
    fenster: one(oneOf(['tag', 'neu-eintrag', 'neu-reise', 'aus-kalender'])),
    eintrag: one(Uuid),
    /** A Termin of a series: the series and the day the rule gives it (spec 0041, REQ-003). */
    serie: one(Uuid),
    termin: one(Day),
    zeit: one(Time),
    reise: one(Uuid),
    /** The chore window of a chore in the calendar (spec 0021, REQ-016). */
    aufgabe: one(Uuid),
    haushalt: Haushalt,
  },
  rezepte: {
    ansicht: one(oneOf(['rezepte', 'restaurants']), 'rezepte'),
    suche: one(Text),
    art: one(oneOf(values(KIND_SLUGS))),
    favoriten: one(Flag),
    ernaehrung: one(oneOf(values(DIET_SLUGS))),
    dauer: one(oneOf(['15', '30', '60', '120'])),
    'fuer-alle': one(Flag),
    selten: one(Flag),
    gang: many(oneOf(values(COURSE_SLUGS))),
    kueche: many(Text),
    /** Tag keys, all of them must fit (spec 0037, REQ-006). */
    schlagwort: many(Text),
    bewertung: one(oneOf(['4', '4.5'])),
    preis: many(oneOf(['1', '2', '3', '4'])),
    sortierung: one(oneOf([...values(RECIPE_SORT_SLUGS), ...RESTAURANT_SORT_SLUGS])),
    // "bearbeiten" and "einplanen" for the restaurant chosen next to the list (spec 0024).
    fenster: one(oneOf(['neu', 'neu-restaurant', 'bearbeiten', 'einplanen'])),
    restaurant: one(Uuid),
    link: one(z.string().max(2000)),
    name: one(Text),
    von: Von,
  },
  rezept: {
    id: one(Uuid),
    von: Von,
    portionen: one(PositiveInt),
    variante: one(Uuid),
    fenster: one(oneOf(['einplanen', 'sammlung', 'vorratscheck'])),
  },
  kochen: {
    id: one(Uuid),
    schritt: one(PositiveInt),
    variante: one(Uuid),
    portionen: one(PositiveInt),
  },
  restaurant: {
    id: one(Uuid),
    von: Von,
    fenster: one(oneOf(['einplanen', 'route', 'bearbeiten'])),
  },
  aktivitaeten: {
    suche: one(Text),
    favoriten: one(Flag),
    sortierung: one(oneOf(['name', 'bewertung', 'zuletzt']), 'name'),
    aktivitaet: one(Uuid),
    // "arten": the kinds under "Verwalten" (spec 0041, REQ-001).
    fenster: one(oneOf(['neu-aktivitaet', 'einplanen', 'bearbeiten', 'arten'])),
    von: Von,
  },
  aktivitaet: {
    id: one(Uuid),
    von: Von,
    fenster: one(oneOf(['einplanen', 'bearbeiten'])),
  },
  liste: {
    posten: one(Uuid),
    fenster: one(oneOf(['vorratscheck', 'aus-kalender'])),
    tag: one(Day),
  },
  einkaufen: {},
  haushalt: {
    ansicht: one(oneOf(['anstehend', 'alle', 'verlauf']), 'anstehend'),
    aufgabe: one(Uuid),
    verlauf: one(Uuid),
    person: one(Uuid),
    'nur-aufgabe': one(Uuid),
    fenster: one(oneOf(['neu-aufgabe', 'erledigt'])),
    haushalt: Haushalt,
  },
  artikel: {
    filter: one(
      oneOf([
        'ohne-bereich',
        'vorrat',
        'neu-aus-rezepten',
        'aehnliche-namen',
        'unbenutzt',
        'ernaehrung-unbekannt',
      ]),
    ),
    bereich: one(Uuid),
    suche: one(Text),
    sortierung: one(oneOf(['name', 'neu']), 'name'),
    artikel: one(Uuid),
    fenster: one(oneOf(['neu-artikel'])),
    von: Von,
  },
  maerkte: {
    ansicht: one(oneOf(['maerkte', 'bereiche']), 'maerkte'),
    markt: one(Uuid),
    fenster: one(oneOf(['neu-markt', 'neu-bereich'])),
    von: Von,
  },
  markt: {
    id: one(Uuid),
    von: Von,
  },
  reisetaschen: {
    tasche: one(Uuid),
    reise: one(Uuid),
    von: Von,
  },
  reisetasche: {
    id: one(Uuid),
    von: Von,
  },
  reisen: {
    reise: one(Uuid),
    fenster: one(oneOf(['neu-reise'])),
    // Spec 0030, REQ-003: the filter "Zeitraum", a year or a month of the start.
    zeitraum: one(z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/)),
    von: Von,
  },
  verwalten: {},
  einstellungen: {
    abschnitt: one(oneOf(['profil', 'darstellung', 'ki', 'benachrichtigungen'])),
    fenster: one(oneOf(['profil'])),
  },
  benachrichtigungen: {
    'fuer-haushalt': one(Uuid),
  },
  mitglieder: {
    fenster: one(oneOf(['umbenennen'])),
    von: Von,
  },
  feedback: {
    filter: one(oneOf(['neu', 'angenommen', 'abgelehnt', 'erledigt'])),
    feedback: one(Uuid),
    von: Von,
  },
  /** The Web Share target keeps the names the manifest gives it. */
  teilen: {
    url: one(z.string()),
    text: one(z.string()),
  },
} as const satisfies Record<string, Record<string, ParamSpec>>;

export type PageKey = keyof typeof PAGE_PARAMS;

type ValueOf<P> =
  P extends OneParam<infer S> ? z.output<S> : P extends ManyParam<infer S> ? z.output<S>[] : never;

/** The parameters of a page as read from or written to the address; all optional. */
export type PageParams<K extends PageKey> = {
  -readonly [N in keyof (typeof PAGE_PARAMS)[K]]?: ValueOf<(typeof PAGE_PARAMS)[K][N]>;
};

/** Raw route parameters as the router hands them over. */
export type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export interface ReadParams<K extends PageKey> {
  values: PageParams<K>;
  /**
   * Parameters of this page that are in the address but should not be: invalid values (ignored,
   * AC-034, AC-039) or a default. The page removes them, so the address shows what it shows.
   */
  invalid: string[];
}

function specsOf(page: PageKey): Readonly<Record<string, ParamSpec>> {
  return PAGE_PARAMS[page];
}

/** Reads the page's parameters; anything invalid is ignored and reported (REQ-017, REQ-018). */
export function readPageParams<K extends PageKey>(page: K, raw: RawParams): ReadParams<K> {
  const result: Record<string, unknown> = {};
  const invalid: string[] = [];
  for (const [name, spec] of Object.entries(specsOf(page))) {
    const value = raw[name];
    if (value === undefined) continue;
    const list: readonly string[] = typeof value === 'string' ? [value] : value;
    if (spec.kind === 'one') {
      const first = list[0];
      const parsed = first === undefined ? undefined : spec.schema.safeParse(first);
      if (parsed?.success) {
        result[name] = parsed.data;
        if (first === spec.fallback) invalid.push(name);
      } else invalid.push(name);
    } else {
      const parsed = list.flatMap((entry) => {
        const item = spec.schema.safeParse(entry);
        return item.success ? [item.data] : [];
      });
      if (parsed.length > 0) result[name] = parsed;
      if (parsed.length !== list.length) invalid.push(name);
    }
  }
  return { values: result as PageParams<K>, invalid };
}

/** The value as it stands in the address, or undefined when it is left out. */
function written(spec: ParamSpec, value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const list = (Array.isArray(value) ? value : [value]).map(String).filter((v) => v.trim() !== '');
  if (list.length === 0) return undefined;
  if (spec.kind === 'one') {
    const [first] = list;
    return first === undefined || first === spec.fallback ? undefined : [first];
  }
  return list;
}

/**
 * The page's values as query parameters, in the order of the list; defaults and empty values
 * are left out. Undefined clears a parameter.
 */
export function pageQuery<K extends PageKey>(
  page: K,
  values: PageParams<K>,
): Record<string, string | string[] | undefined> {
  const query: Record<string, string | string[] | undefined> = {};
  const given = values as Record<string, unknown>;
  for (const [name, spec] of Object.entries(specsOf(page))) {
    if (!(name in given)) continue;
    const list = written(spec, given[name]);
    query[name] = list === undefined ? undefined : spec.kind === 'one' ? list[0] : list;
  }
  return query;
}

/**
 * Every parameter of the page as it was in `values`, the others cleared: what going back to the
 * entry below a window restores (spec 0019, REQ-013). A window can change parameters it did not
 * open with (new article → that article), and those must not survive the way back.
 */
export function pageParamsBefore<K extends PageKey>(page: K, values: PageParams<K>): PageParams<K> {
  const given = values as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(specsOf(page)).map((name) => [name, given[name]]),
  ) as PageParams<K>;
}

// ---------- Recipe list ----------

export interface RecipeListAddressState {
  query: string;
  filter: RecipeListFilter;
  sort: RecipeListSort;
}

const RECIPE_SORT_OF = invert(RECIPE_SORT_SLUGS);
const DIET_OF = invert(DIET_SLUGS);
const KIND_OF = invert(KIND_SLUGS);
const COURSE_OF = invert(COURSE_SLUGS);

/**
 * Search, filter and sort of "Essen → Rezepte" from the address (AC-032, AC-034). Without a sort
 * in the address the one stored on the device applies (spec 0036, REQ-002).
 */
export function recipeListFromParams(
  values: PageParams<'rezepte'>,
  storedSort: RecipeListSort = DEFAULT_RECIPE_SORT,
): RecipeListAddressState {
  const sortSlug = values.sortierung;
  const sort: RecipeListSort =
    sortSlug !== undefined && sortSlug in RECIPE_SORT_OF
      ? RECIPE_SORT_OF[sortSlug as keyof typeof RECIPE_SORT_OF]
      : storedSort;
  const filter: RecipeListFilter = {
    ...EMPTY_RECIPE_LIST_FILTER,
    favorites: values.favoriten === '1',
    fitsAll: values['fuer-alle'] === '1',
    rare: values.selten === '1',
    courses: (values.gang ?? []).map((slug) => COURSE_OF[slug]),
    cuisines: values.kueche ?? [],
    tags: values.schlagwort ?? [],
  };
  if (values.art) filter.kind = KIND_OF[values.art];
  if (values.ernaehrung) filter.diet = DIET_OF[values.ernaehrung];
  if (values.dauer) filter.maxMinutes = Number(values.dauer) as TimeLimit;
  if (values.bewertung) filter.minRating = Number(values.bewertung) as MinRating;
  return { query: values.suche ?? '', filter, sort };
}

/** The address values of the recipe list; undefined clears the parameter. */
export function recipeListToParams(state: RecipeListAddressState): PageParams<'rezepte'> {
  const { filter } = state;
  return {
    suche: state.query.trim() === '' ? undefined : state.query,
    art: filter.kind ? KIND_SLUGS[filter.kind] : undefined,
    favoriten: filter.favorites ? '1' : undefined,
    ernaehrung: filter.diet ? DIET_SLUGS[filter.diet] : undefined,
    dauer: filter.maxMinutes
      ? (String(filter.maxMinutes) as '15' | '30' | '60' | '120')
      : undefined,
    'fuer-alle': filter.fitsAll ? '1' : undefined,
    selten: filter.rare ? '1' : undefined,
    gang: filter.courses.map((course) => COURSE_SLUGS[course]),
    kueche: [...filter.cuisines],
    schlagwort: [...filter.tags],
    bewertung: filter.minRating ? (String(filter.minRating) as '4' | '4.5') : undefined,
    sortierung: state.sort === DEFAULT_RECIPE_SORT ? undefined : RECIPE_SORT_SLUGS[state.sort],
  };
}

// ---------- Restaurant list ----------

export interface RestaurantListAddressState {
  query: string;
  filter: RestaurantListFilter;
  sort: RestaurantListSort;
}

const RESTAURANT_SORT_OF: Record<string, RestaurantListSort> = {
  zuletzt: 'lastVisit',
  bewertung: 'rating',
  name: 'title',
  zufall: 'random',
};
const RESTAURANT_SORT_SLUG: Record<RestaurantListSort, (typeof RESTAURANT_SORT_SLUGS)[number]> = {
  lastVisit: 'zuletzt',
  rating: 'bewertung',
  title: 'name',
  random: 'zufall',
};

/** Search, filter and sort of "Essen → Restaurants" from the address (AC-043). */
export function restaurantListFromParams(
  values: PageParams<'rezepte'>,
  storedSort: RestaurantListSort = DEFAULT_RESTAURANT_SORT,
): RestaurantListAddressState {
  const filter: RestaurantListFilter = {
    ...EMPTY_RESTAURANT_LIST_FILTER,
    favorites: values.favoriten === '1',
    cuisines: values.kueche ?? [],
    tags: values.schlagwort ?? [],
    priceLevels: (values.preis ?? []).map((level) => Number(level) as PriceLevel),
  };
  if (values.bewertung) filter.minRating = Number(values.bewertung) as MinRating;
  return {
    query: values.suche ?? '',
    filter,
    sort:
      values.sortierung === undefined
        ? storedSort
        : (RESTAURANT_SORT_OF[values.sortierung] ?? DEFAULT_RESTAURANT_SORT),
  };
}

/** The address values of the restaurant list; undefined clears the parameter. */
export function restaurantListToParams(state: RestaurantListAddressState): PageParams<'rezepte'> {
  const { filter } = state;
  return {
    suche: state.query.trim() === '' ? undefined : state.query,
    favoriten: filter.favorites ? '1' : undefined,
    kueche: [...filter.cuisines],
    schlagwort: [...filter.tags],
    bewertung: filter.minRating ? (String(filter.minRating) as '4' | '4.5') : undefined,
    preis: filter.priceLevels.map((level) => String(level) as '1' | '2' | '3' | '4'),
    sortierung:
      state.sort === DEFAULT_RESTAURANT_SORT ? undefined : RESTAURANT_SORT_SLUG[state.sort],
  };
}

/** Every list parameter of "Essen", cleared: switching the view starts from these. */
export const FOOD_LIST_CLEARED: PageParams<'rezepte'> = {
  suche: undefined,
  art: undefined,
  favoriten: undefined,
  ernaehrung: undefined,
  dauer: undefined,
  'fuer-alle': undefined,
  selten: undefined,
  gang: undefined,
  kueche: undefined,
  schlagwort: undefined,
  bewertung: undefined,
  preis: undefined,
  sortierung: undefined,
};

// ---------- Calendar ----------

const CALENDAR_VIEW_OF = invert(CALENDAR_VIEW_SLUGS);

/** View and chosen day of the calendar; without them the week of today (AC-039). */
export function calendarFromParams(
  values: PageParams<'kalender'>,
  today: ISODate,
): { view: CalendarView; day: ISODate } {
  return {
    view: values.ansicht ? CALENDAR_VIEW_OF[values.ansicht] : 'week',
    day: values.tag ?? today,
  };
}

export function calendarViewSlug(view: CalendarView): PageParams<'kalender'>['ansicht'] {
  return CALENDAR_VIEW_SLUGS[view];
}

// ---------- Cooking mode ----------

/** The step index for `schritt` (1-based) of `count` steps; too far gives the last (AC-046). */
export function cookingStepFromParam(step: number | undefined, count: number): number {
  if (count <= 0 || step === undefined) return 0;
  return Math.min(step, count) - 1;
}

// ---------- Navigation ----------

/**
 * The section a detail page belongs to: its origin from `von`, or its own section when `von` is
 * missing or unknown (REQ-006, AC-018).
 */
export function sectionOfOrigin(von: string | undefined, own: Origin): Origin {
  return (ORIGINS as readonly string[]).includes(von ?? '') ? (von as Origin) : own;
}

/** The start page of each section (REQ-005). */
export const SECTION_START: Record<Origin, string> = {
  uebersicht: '/',
  essen: '/rezepte',
  kalender: '/kalender',
  liste: '/liste',
  haushalt: '/haushalt',
  verwalten: '/verwalten',
  reisen: '/reisen',
};

export function sectionOfStartPath(pathname: string): Origin | undefined {
  return ORIGINS.find((origin) => SECTION_START[origin] === pathname);
}

const OWN_SECTION: readonly [prefix: string, section: Origin][] = [
  ['/rezepte', 'essen'],
  ['/rezept/', 'essen'],
  ['/restaurant/', 'essen'],
  ['/kalender', 'kalender'],
  ['/liste', 'liste'],
  ['/einkaufen', 'liste'],
  ['/haushalt', 'haushalt'],
  ['/reisen', 'reisen'],
];

/**
 * The section a page highlights in the tab bar and the sidebar: always the section of the page
 * itself, a start page its own, a detail page the section it lives in (spec 0035, REQ-002; `von`
 * only names the target of "Zurück", spec 0019 REQ-006). Pages under "Verwalten" (activities,
 * articles, stores, bags, members, feedback, settings) belong to "Verwalten".
 */
export function sectionOfPath(pathname: string): Origin {
  return (
    sectionOfStartPath(pathname) ??
    OWN_SECTION.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix))?.[1] ??
    'verwalten'
  );
}

/**
 * Parameters that show an object or open a window (spec appendix). A section's start page drops
 * them when the section is chosen again (REQ-005), so it shows no window and no detail.
 */
export const OBJECT_PARAMS = [
  'eintrag',
  'aufgabe',
  'verlauf',
  'posten',
  'artikel',
  'restaurant',
  'aktivitaet',
  'markt',
  'tasche',
  'reise',
  'feedback',
] as const;
const OPENING_PARAMS = new Set<string>([
  ...OBJECT_PARAMS,
  'fenster',
  'zeit',
  'link',
  'name',
  'haushalt',
]);

/** The address of a start page as left, without what opens a window or a detail (AC-012, AC-013). */
export function startPageHref(href: string): string {
  const at = href.indexOf('?');
  if (at < 0) return href;
  const path = href.slice(0, at);
  try {
    const kept = href
      .slice(at + 1)
      .split('&')
      .filter((pair) => {
        if (pair === '') return false;
        const name = decodeURIComponent(pair.split('=')[0] ?? '');
        decodeURIComponent(pair.split('=')[1] ?? '');
        return !OPENING_PARAMS.has(name);
      });
    return kept.length > 0 ? `${path}?${kept.join('&')}` : path;
  } catch {
    return path;
  }
}

// ---------- Sign-in ----------

const CONTROL = /[\u0000-\u001f\u007f]/;
const RETURN_PATH = /^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?]*$/;

/**
 * The address to return to after signing in (REQ-016, Decision 8): only a path of this app,
 * beginning with exactly one `/`, without a scheme, a host, a backslash or control characters;
 * the root gives nothing, the app opens the overview anyway (AC-047, AC-048).
 */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  if (!RETURN_PATH.test(value) || value.startsWith('//')) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  if (decoded.startsWith('//') || decoded.includes('\\') || CONTROL.test(decoded)) {
    return undefined;
  }
  return value === '/' ? undefined : value;
}

// ---------- Ids from the address ----------

export type AddressedId =
  /** In the active household. */
  | { status: 'shown' }
  /** In another own household: the app switches there and says so (AC-051). */
  | { status: 'switch'; householdId: Id }
  /** In no own household, or deleted: "nicht gefunden", nothing of the object (AC-050). */
  | { status: 'missing' };

/**
 * Where an id from the address lives, given the own households whose local data hold it. Only
 * own households count, so an address never shows a foreign household's data (REQ-017).
 */
export function resolveAddressedId(activeHouseholdId: Id, owners: readonly Id[]): AddressedId {
  if (owners.includes(activeHouseholdId)) return { status: 'shown' };
  const [other] = owners;
  return other === undefined ? { status: 'missing' } : { status: 'switch', householdId: other };
}
