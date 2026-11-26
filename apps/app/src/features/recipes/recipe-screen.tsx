import { useRouter } from 'expo-router';

import { useAddressedId } from '@/lib/addressed';
import { BrowseSwipeProvider, browseSwipe } from '@/lib/browse-order';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { unsavedRecipe } from './ai-draft';
import { RecipeDetail } from './recipe-detail';

/** A recipe on its own page, on every width (spec 0008, E12). */
export function RecipeScreen() {
  const { params } = usePageParams('rezept');
  // "‹ Essen" or the section it came from (`von`, spec 0019, REQ-006).
  const origin = useOriginBack(params.von, 'essen');
  // Only a uuid of an own household reaches the lookup; anything else shows "gibt es nicht mehr"
  // (REQ-017, AC-050); one of another own household switches there first (AC-051).
  const found = useAddressedId('recipes', params.id);
  const router = useRouter();
  if (found === 'switching') return null;
  // Spec 0040, AC-001: a recipe that exists only as the AI's draft until "Speichern".
  const draftOnly = params.id !== undefined && unsavedRecipe(params.id) !== undefined;
  const recipeId = found === 'shown' || draftOnly ? (params.id ?? '') : '';
  // Phones: a swipe opens the neighbour in the list it came from (spec 0034, REQ-008); it takes
  // this page's place, so "‹ Essen" still leads to the list.
  const swipe = browseSwipe('recipes', recipeId, (next) =>
    router.replace({ pathname: '/rezept/[id]', params: { id: next } }),
  );
  return (
    <BrowseSwipeProvider value={swipe}>
      <RecipeDetail recipeId={recipeId} onBack={origin.back} backLabel={origin.label} />
    </BrowseSwipeProvider>
  );
}
