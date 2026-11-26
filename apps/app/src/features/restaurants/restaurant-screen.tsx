import { useRouter } from 'expo-router';

import { useAddressedId } from '@/lib/addressed';
import { BrowseSwipeProvider, browseSwipe } from '@/lib/browse-order';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { RestaurantDetail } from './restaurant-detail';

/** A restaurant on its own page (phones, deep links). */
export function RestaurantScreen() {
  const address = usePageParams('restaurant');
  const { params } = address;
  const router = useRouter();
  // "‹ Essen" (the restaurant list) or the section it came from (spec 0019, REQ-006).
  const origin = useOriginBack(params.von, 'essen');
  // Only an id of an own household reaches the lookup; anything else shows "nicht gefunden".
  const found = useAddressedId('restaurants', params.id);
  if (found === 'switching') return null;
  const restaurantId = found === 'shown' ? (params.id ?? '') : '';
  const openOther = (otherId: string) =>
    router.replace({
      pathname: '/restaurant/[id]',
      params: params.von ? { id: otherId, von: params.von } : { id: otherId },
    });
  return (
    // Phones: a swipe opens the neighbour in the list it came from (spec 0034, REQ-008).
    <BrowseSwipeProvider value={browseSwipe('restaurants', restaurantId, openOther)}>
      <RestaurantDetail
        restaurantId={restaurantId}
        onBack={origin.back}
        backLabel={origin.label}
        window={params.fenster === 'route' ? undefined : params.fenster}
        onWindow={(window) =>
          window ? address.open({ fenster: window }) : address.close({ fenster: undefined })
        }
        // Spec 0024, REQ-010: after "Löschen" back to the list it came from.
        onDeleted={origin.back}
        onOpen={openOther}
      />
    </BrowseSwipeProvider>
  );
}
