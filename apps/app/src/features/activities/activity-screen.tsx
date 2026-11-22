import { useRouter } from 'expo-router';

import { useAddressedId } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { ActivityDetail } from './activity-detail';

/**
 * An activity on its own page under "Verwalten" (phones, deep links; spec 0024, REQ-009):
 * "‹ Aktivitäten", or the section it came from with `von` (spec 0019, REQ-006).
 */
export function ActivityScreen() {
  const address = usePageParams('aktivitaet');
  const { params } = address;
  const router = useRouter();
  const origin = useOriginBack(params.von, 'verwalten', {
    label: 'Aktivitäten',
    href: '/aktivitaeten',
  });
  // Only an id of an own household reaches the lookup; anything else shows "nicht gefunden".
  const found = useAddressedId('activities', params.id);
  if (found === 'switching') return null;
  return (
    <ActivityDetail
      activityId={found === 'shown' ? (params.id ?? '') : ''}
      onBack={origin.back}
      backLabel={origin.label}
      window={params.fenster}
      onWindow={(window) =>
        window ? address.open({ fenster: window }) : address.close({ fenster: undefined })
      }
      onDeleted={origin.back}
      onOpen={(activityId) =>
        router.replace({
          pathname: '/aktivitaet/[id]',
          params: params.von ? { id: activityId, von: params.von } : { id: activityId },
        })
      }
    />
  );
}
