import { useAddressedId } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { RecipeDetail } from './recipe-detail';

/** A recipe on its own page, on every width (spec 0008, E12). */
export function RecipeScreen() {
  const { params } = usePageParams('rezept');
  // "‹ Essen" or the section it came from (`von`, spec 0019, REQ-006).
  const origin = useOriginBack(params.von, 'essen');
  // Only a uuid of an own household reaches the lookup; anything else shows "gibt es nicht mehr"
  // (REQ-017, AC-050); one of another own household switches there first (AC-051).
  const found = useAddressedId('recipes', params.id);
  if (found === 'switching') return null;
  return (
    <RecipeDetail
      recipeId={found === 'shown' ? (params.id ?? '') : ''}
      onBack={origin.back}
      backLabel={origin.label}
    />
  );
}
