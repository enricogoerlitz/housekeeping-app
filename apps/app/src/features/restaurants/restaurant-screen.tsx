import { routeId } from '@housekeeping/core';
import { Screen } from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { RestaurantDetail } from './restaurant-detail';

/** A restaurant on its own page (phones, deep links). */
export function RestaurantScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  // Only a uuid reaches the lookup; anything else shows "nicht gefunden".
  const id = routeId(params.id);
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/rezepte', params: { view: 'restaurants' } });
  };
  return (
    <Screen testID="restaurant-screen" maxWidth={820}>
      <RestaurantDetail restaurantId={id ?? ''} onBack={back} />
    </Screen>
  );
}
