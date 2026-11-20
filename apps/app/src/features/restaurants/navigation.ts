import type { Id } from '@housekeeping/core';
import { useBreakpoint } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

/**
 * Opens a restaurant the way the width asks for: on phones its own page, on wide screens the
 * restaurant list of "Essen" with the restaurant selected.
 */
export function useOpenRestaurant(): (restaurantId: Id) => void {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  return (restaurantId: Id) => {
    if (isWide)
      router.push({ pathname: '/rezepte', params: { view: 'restaurants', rid: restaurantId } });
    else router.push({ pathname: '/restaurant/[id]', params: { id: restaurantId } });
  };
}
