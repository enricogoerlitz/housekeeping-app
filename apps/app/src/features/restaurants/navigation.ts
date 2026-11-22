import type { Id } from '@housekeeping/core';
import { useBreakpoint } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

import { originFor } from '@/lib/url-state';

/**
 * Opens a restaurant the way the width asks for: on phones its own page, on wide screens the
 * restaurant list of "Essen" with the restaurant selected. Both open in the "Essen" stack with
 * its first page underneath (spec 0005); from another section with `von` (spec 0019).
 */
export function useOpenRestaurant(): (restaurantId: Id) => void {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  return (restaurantId: Id) => {
    const von = originFor('essen');
    const origin = von ? { von } : {};
    if (isWide)
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
