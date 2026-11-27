import type { Id } from '@housekeeping/core';
import { useRouter } from 'expo-router';

import { useListView } from '@/features/shell/list-view';
import { rememberBrowseOrder } from '@/lib/browse-order';
import { originFor } from '@/lib/url-state';

/**
 * Opens a restaurant the way the width and the chosen view ask for: on phones and with "Kacheln"
 * its own page, on wide screens with "Liste" the restaurant list of "Essen" with the restaurant
 * selected (spec 0038, AC-002). Both open in the "Essen" stack with
 * its first page underneath (spec 0005); from another section with `von` (spec 0019).
 */
export function useOpenRestaurant(): (restaurantId: Id) => void {
  const router = useRouter();
  const { quick } = useListView('restaurants');
  return (restaurantId: Id) => {
    const von = originFor('essen');
    const origin = von ? { von } : {};
    // Not opened from the restaurant list: its page has nothing to swipe to (spec 0034, AC-019).
    rememberBrowseOrder('restaurants', undefined);
    if (quick)
      router.navigate({
        pathname: '/rezepte',
        params: { ansicht: 'restaurants', restaurant: restaurantId, ...origin },
      });
    else
      router.push(
        { pathname: '/restaurant/[id]', params: { id: restaurantId, ...origin } },
        { withAnchor: true },
      );
  };
}
