import { routeId } from '@housekeeping/core';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActivityDetail } from './activity-detail';

/** An activity on its own page inside the plan tab (phones, deep links). */
export function ActivityScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  // Only a uuid reaches the lookup; anything else shows "nicht gefunden".
  const id = routeId(params.id);
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/plan', params: { view: 'activities' } });
  };
  return (
    <ActivityDetail
      activityId={id ?? ''}
      onBack={back}
      onOpen={(activityId) =>
        router.replace({ pathname: '/plan/aktivitaet/[id]', params: { id: activityId } })
      }
    />
  );
}
