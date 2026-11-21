import { routeId } from '@housekeeping/core';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActivityDetail } from './activity-detail';

/** An activity on its own page in the calendar's area (spec 0010, AC-026). */
export function ActivityScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  // Only a uuid reaches the lookup; anything else shows "nicht gefunden".
  const id = routeId(params.id);
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/kalender/aktivitaeten');
  };
  return (
    <ActivityDetail
      activityId={id ?? ''}
      onBack={back}
      onOpen={(activityId) =>
        router.replace({ pathname: '/kalender/aktivitaet/[id]', params: { id: activityId } })
      }
    />
  );
}
