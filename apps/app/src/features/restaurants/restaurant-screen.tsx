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
  // To the restaurants of "Essen", also after a deep link: the stack's first page would otherwise
  // keep the restaurant id as a recipe id (spec 0005, AC-004).
  const back = () => router.dismissTo({ pathname: '/rezepte', params: { view: 'restaurants' } });
  return (
    <Screen testID="restaurant-screen" maxWidth={820}>
      <RestaurantDetail restaurantId={id ?? ''} onBack={back} />
    </Screen>
  );
}
