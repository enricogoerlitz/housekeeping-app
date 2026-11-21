import type { Id } from '@housekeeping/core';
import { useRouter } from 'expo-router';

/**
 * Opens a recipe as a whole page on every width (spec 0008, AC-019, E12), in the "Essen" stack
 * with the recipe list underneath, so "‹ Essen" and a tap on "Essen" always lead back to it
 * (spec 0005).
 */
export function useOpenRecipe(): (recipeId: Id) => void {
  const router = useRouter();
  return (recipeId: Id) => {
    router.push({ pathname: '/rezept/[id]', params: { id: recipeId } }, { withAnchor: true });
  };
}
