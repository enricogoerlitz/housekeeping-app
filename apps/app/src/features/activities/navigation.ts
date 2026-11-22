import type { Id } from '@housekeeping/core';
import { useRouter } from 'expo-router';

import { originFor } from '@/lib/url-state';

/**
 * Opens an activity on its own page in the calendar's stack, with the calendar underneath; from
 * another section with `von`, so "Zurück" names it and leads there (spec 0019, REQ-006).
 */
export function useOpenActivity(): (activityId: Id) => void {
  const router = useRouter();
  return (activityId: Id) => {
    const von = originFor('kalender');
    router.push(
      {
        pathname: '/kalender/aktivitaet/[id]',
        params: von ? { id: activityId, von } : { id: activityId },
      },
      { withAnchor: true },
    );
  };
}
