import { Screen } from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActivityDetail } from './activity-detail';

/** An activity on its own page inside the plan tab (phones, deep links). */
export function ActivityScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/plan', params: { view: 'activities' } });
  };
  return (
    <Screen testID="activity-screen" maxWidth={820}>
      <ActivityDetail
        activityId={id ?? ''}
        onBack={back}
        onOpen={(activityId) =>
          router.replace({ pathname: '/plan/aktivitaet/[id]', params: { id: activityId } })
        }
      />
    </Screen>
  );
}
