import type { Id } from '@housekeeping/core';
import { useRouter } from 'expo-router';

import { rememberBrowseOrder } from '@/lib/browse-order';
import { originFor } from '@/lib/url-state';

/**
 * Opens a recipe as a whole page on every width (spec 0008, AC-019, E12), in the "Essen" stack
 * with the recipe list underneath. Opened from another section it carries that section as `von`,
 * so "‹ Übersicht" leads back there (spec 0019, REQ-006). A list passes the order it shows, so the
 * recipe's page swipes through it (spec 0034, REQ-008); without one there is nothing to swipe to.
 */
export function useOpenRecipe(): (recipeId: Id, order?: readonly Id[]) => void {
  const router = useRouter();
  return (recipeId: Id, order?: readonly Id[]) => {
    const von = originFor('essen');
    rememberBrowseOrder('recipes', von ? undefined : order);
    router.push(
      { pathname: '/rezept/[id]', params: von ? { id: recipeId, von } : { id: recipeId } },
      { withAnchor: true },
    );
  };
}
