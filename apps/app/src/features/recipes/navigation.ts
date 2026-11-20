import type { Id } from '@housekeeping/core';
import { useBreakpoint } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

/**
 * Opens a recipe the way the width asks for: on phones its own page, on wide screens the split
 * view of the recipe list with the recipe selected (spec 0001, AC-008). Both open in the "Essen"
 * stack with the recipe list underneath, so a tap on "Essen" always leads back to it (spec 0005).
 */
export function useOpenRecipe(): (recipeId: Id) => void {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  return (recipeId: Id) => {
    if (isWide) router.navigate({ pathname: '/rezepte', params: { id: recipeId } });
    else router.push({ pathname: '/rezept/[id]', params: { id: recipeId } }, { withAnchor: true });
  };
}
