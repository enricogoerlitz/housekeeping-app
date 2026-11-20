import { Screen } from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { RecipeDetail } from './recipe-detail';

/** A recipe on its own page (phones, deep links). */
export function RecipeScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/rezepte');
  };
  return (
    <Screen testID="recipe-screen" maxWidth={1080}>
      <RecipeDetail recipeId={id ?? ''} onBack={back} />
    </Screen>
  );
}
