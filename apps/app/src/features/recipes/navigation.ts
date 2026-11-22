import type { Id } from '@housekeeping/core';
import { useRouter } from 'expo-router';

import { originFor } from '@/lib/url-state';

/**
 * Opens a recipe as a whole page on every width (spec 0008, AC-019, E12), in the "Essen" stack
 * with the recipe list underneath. Opened from another section it carries that section as `von`,
 * so "‹ Übersicht" leads back there (spec 0019, REQ-006).
 */
export function useOpenRecipe(): (recipeId: Id) => void {
  const router = useRouter();
  return (recipeId: Id) => {
    const von = originFor('essen');
    router.push(
      { pathname: '/rezept/[id]', params: von ? { id: recipeId, von } : { id: recipeId } },
      { withAnchor: true },
    );
  };
}
