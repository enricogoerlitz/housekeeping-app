import { useRouter } from 'expo-router';

import { useAddressedId } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { ActivityDetail } from './activity-detail';

/** An activity on its own page in the calendar's area (spec 0010, AC-026). */
export function ActivityScreen() {
  const { params } = usePageParams('aktivitaet');
  const router = useRouter();
  // "‹ Kalender" or the section it came from, e.g. "‹ Verwalten" (spec 0019, AC-017).
  const origin = useOriginBack(params.von, 'kalender');
  // Only an id of an own household reaches the lookup; anything else shows "nicht gefunden".
  const found = useAddressedId('activities', params.id);
  if (found === 'switching') return null;
  return (
    <ActivityDetail
      activityId={found === 'shown' ? (params.id ?? '') : ''}
      onBack={origin.back}
      backLabel={origin.label}
      onOpen={(activityId) =>
        router.replace({
          pathname: '/kalender/aktivitaet/[id]',
          params: params.von ? { id: activityId, von: params.von } : { id: activityId },
        })
      }
    />
  );
}
