/**
 * "Kacheln" or "Liste" per area, chosen on this device (spec 0038, REQ-001): tiles show big
 * photos and open the entry's own page; the list shows smaller entries, which open beside it in
 * the quick view on wide screens.
 */
export type ListView = 'tiles' | 'list';

export type ListViewArea = 'recipes' | 'restaurants' | 'activities';

/** The stored choice per area; an area without one shows its default. */
export type ListViews = Partial<Record<ListViewArea, ListView>>;

/** As before the choice existed: recipes as tiles, restaurants and activities as a list. */
const DEFAULT_LIST_VIEWS: Record<ListViewArea, ListView> = {
  recipes: 'tiles',
  restaurants: 'list',
  activities: 'list',
};

const AREAS = Object.keys(DEFAULT_LIST_VIEWS) as ListViewArea[];

const isListView = (value: unknown): value is ListView => value === 'tiles' || value === 'list';

/** The stored views; anything that is not a view is dropped. */
export function parseListViews(value: unknown): ListViews {
  if (typeof value !== 'object' || value === null) return {};
  const record = value as Record<string, unknown>;
  const views: ListViews = {};
  for (const area of AREAS) {
    const view = record[area];
    if (isListView(view)) views[area] = view;
  }
  return views;
}

export function listViewOf(views: ListViews, area: ListViewArea): ListView {
  return views[area] ?? DEFAULT_LIST_VIEWS[area];
}

/** Only the list opens beside itself, and only where there is room; phones open the page. */
export function opensQuickView(view: ListView, isWide: boolean): boolean {
  return view === 'list' && isWide;
}
