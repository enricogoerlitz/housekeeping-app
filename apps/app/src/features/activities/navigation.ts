import type { Id } from '@housekeeping/core';
import { useBreakpoint } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

import { originFor } from '@/lib/url-state';

/**
 * Opens an activity the way the width asks for (spec 0024, REQ-008, REQ-009): on phones its own
 * page /aktivitaet/<id>, from 700 px "Aktivitäten" with the activity chosen next to the list;
 * from another section with `von`, so "Zurück" names it and leads there (spec 0019, REQ-006).
 */
export function useOpenActivity(): (activityId: Id) => void {
  const router = useRouter();
  const { isPhone } = useBreakpoint();
  return (activityId: Id) => {
    const von = originFor('verwalten');
    const origin = von ? { von } : {};
    if (!isPhone) {
      router.navigate({ pathname: '/aktivitaeten', params: { aktivitaet: activityId, ...origin } });
      return;
    }
    router.push(
      { pathname: '/aktivitaet/[id]', params: { id: activityId, ...origin } },
      { withAnchor: true },
    );
  };
}
