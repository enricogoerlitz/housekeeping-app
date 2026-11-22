import type { IconName } from '@housekeeping/ui';
import type { Href } from 'expo-router';

/** One page under "Verwalten" (spec 0005, REQ-010). */
export interface ManageEntry {
  /** Test ids: `manage-entry-<key>` on the phone page, `nav-manage-<key>` in the sidebar. */
  key: string;
  label: string;
  icon: IconName;
  href: Href;
  /**
   * The tab route that shows the page, so the sidebar highlights the entry there and on its
   * sub-pages (a store keeps "Märkte & Bereiche" highlighted, AC-052).
   */
  route?: string;
  /**
   * For pages inside an area's stack: the address they and their sub-pages start with, so the
   * sidebar highlights the entry there (spec 0010, AC-039).
   */
  pathPrefix?: string;
}

export interface ManageGroup {
  key: string;
  title: string;
  entries: ManageEntry[];
}

// "Reisetaschen" (spec 0012) got its entry with its page (spec 0005, open question 1). "Aktivitäten" lives in the calendar's area (spec 0010, REQ-008).
export const MANAGE_GROUPS: ManageGroup[] = [
  {
    key: 'plan',
    title: 'Planen',
    entries: [
      {
        key: 'activities',
        label: 'Aktivitäten',
        icon: 'mountain',
        href: { pathname: '/kalender/aktivitaeten', params: { von: 'verwalten' } },
        pathPrefix: '/kalender/aktivitaet',
      },
      {
        key: 'packing-bags',
        label: 'Reisetaschen',
        icon: 'luggage',
        href: '/reisetaschen',
        route: '(reisetaschen)',
      },
      {
        key: 'trips',
        label: 'Reisen',
        icon: 'calendar-off',
        href: '/reisen',
        route: 'reisen',
      },
    ],
  },
  {
    key: 'shopping',
    title: 'Einkaufen',
    entries: [
      {
        key: 'articles',
        label: 'Artikel',
        icon: 'package',
        href: '/artikel',
        route: '(artikel)',
      },
      {
        key: 'stores',
        label: 'Märkte & Bereiche',
        icon: 'store',
        href: '/maerkte',
        route: '(maerkte)',
      },
    ],
  },
  {
    key: 'household',
    title: 'Haushalt',
    entries: [
      {
        key: 'members',
        label: 'Haushalt & Mitglieder',
        icon: 'users',
        href: '/mitglieder',
        route: 'mitglieder',
      },
      {
        key: 'feedback',
        label: 'Feedback',
        icon: 'message-square-plus',
        href: '/feedback',
        route: 'feedback',
      },
    ],
  },
];

/** The developer group, only in development builds (AC-059). */
export const SHOWROOM_ENTRY: ManageEntry = {
  key: 'showroom',
  label: 'Showroom',
  icon: 'palette',
  href: '/showroom',
};

/** The ⊞ glyph of the concept. */
export const MANAGE_ICON: IconName = 'layout-grid';
