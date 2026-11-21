import { routeId } from '@housekeeping/core';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { RecipeDetail } from './recipe-detail';

/** A recipe on its own page, on every width (spec 0008, E12). */
export function RecipeScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  // Only a uuid reaches the lookup; anything else shows "gibt es nicht mehr".
  const id = routeId(params.id);
  // "‹ Essen": back to the list where it was left (AC-015); after a deep link to the list.
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/rezepte');
  };
  return <RecipeDetail recipeId={id ?? ''} onBack={back} />;
}
