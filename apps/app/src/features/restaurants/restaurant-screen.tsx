import { useAddressedId } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { RestaurantDetail } from './restaurant-detail';

/** A restaurant on its own page (phones, deep links). */
export function RestaurantScreen() {
  const { params } = usePageParams('restaurant');
  // "‹ Essen" (the restaurant list) or the section it came from (spec 0019, REQ-006).
  const origin = useOriginBack(params.von, 'essen');
  // Only an id of an own household reaches the lookup; anything else shows "nicht gefunden".
  const found = useAddressedId('restaurants', params.id);
  if (found === 'switching') return null;
  return (
    <RestaurantDetail
      restaurantId={found === 'shown' ? (params.id ?? '') : ''}
      onBack={origin.back}
      backLabel={origin.label}
    />
  );
}
