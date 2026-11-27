import type { Id } from '@housekeeping/core';
import { useRouter } from 'expo-router';

import { useListView } from '@/features/shell/list-view';
import { originFor } from '@/lib/url-state';

/**
 * Opens an activity the way the width and the chosen view ask for (spec 0024, REQ-008, REQ-009;
 * spec 0038): on phones and with "Kacheln" its own page /aktivitaet/<id>, from 700 px with
 * "Liste" "Aktivitäten" with the activity chosen next to the list;
 * from another section with `von`, so "Zurück" names it and leads there (spec 0019, REQ-006).
 */
export function useOpenActivity(): (activityId: Id) => void {
  const router = useRouter();
  const { quick } = useListView('activities');
  return (activityId: Id) => {
    const von = originFor('verwalten');
    const origin = von ? { von } : {};
    if (quick) {
      router.navigate({ pathname: '/aktivitaeten', params: { aktivitaet: activityId, ...origin } });
      return;
    }
    router.push(
      { pathname: '/aktivitaet/[id]', params: { id: activityId, ...origin } },
      { withAnchor: true },
    );
  };
}
