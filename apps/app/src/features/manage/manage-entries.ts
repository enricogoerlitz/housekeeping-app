import type { AppView } from '@housekeeping/core';
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
}

export interface ManageGroup {
  key: string;
  title: string;
  entries: ManageEntry[];
}

// "Reisetaschen" (spec 0012) got its entry with its page (spec 0005, open question 1); "Aktivitäten"
// has its own page under "Verwalten" (spec 0024, REQ-009).
export const MANAGE_GROUPS: ManageGroup[] = [
  {
    key: 'plan',
    title: 'Planen',
    entries: [
      {
        key: 'activities',
        label: 'Aktivitäten',
        icon: 'mountain',
        href: '/aktivitaeten',
        route: '(aktivitaeten)',
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
    title: 'Einkauf',
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
      // Spec 0060, REQ-001.
      {
        key: 'recurring',
        label: 'Dauerposten',
        icon: 'repeat',
        href: '/dauerposten',
        route: 'dauerposten',
      },
    ],
  },
  {
    key: 'household',
    title: 'Haushalt & Konto',
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

/**
 * Spec 0067, REQ-001/REQ-002: the first group depends on the person's view. "Normal" opens the
 * agent from here ("Agent", AC-004); "KI zuerst" has the agent in the tab bar and "Haushalt" here
 * instead, as the first entry (AC-001).
 */
export function manageGroups(view: AppView, agent: boolean): ManageGroup[] {
  if (view === 'ai_first')
    return [
      {
        key: 'areas',
        title: 'Bereiche',
        entries: [
          { key: 'household', label: 'Haushalt', icon: 'list-checks', href: '/haushalt', route: 'haushalt' },
        ],
      },
      ...MANAGE_GROUPS,
    ];
  if (!agent) return MANAGE_GROUPS;
  return [
    {
      key: 'agent',
      title: 'KI',
      entries: [{ key: 'agent', label: 'Agent', icon: 'sparkles', href: '/ki-agent', route: 'ki-agent' }],
    },
    ...MANAGE_GROUPS,
  ];
}

/** The developer group, only in development builds (AC-059). */
export const SHOWROOM_ENTRY: ManageEntry = {
  key: 'showroom',
  label: 'Showroom',
  icon: 'palette',
  href: '/showroom',
};

/** The ⊞ glyph of the concept. */
export const MANAGE_ICON: IconName = 'layout-grid';
