import { useAgentProposalData } from '@housekeeping/api';
import type { AgentExtra } from '@housekeeping/core';
import { Button, Icon, Surface, Text } from '@housekeeping/ui';
import { View } from 'react-native';

import { requestAiChange } from '@/features/recipes/ai-change-request';
import { useOnlineOnly } from '@/features/shell/offline';

import { useAgentOpen } from './agent-open';

// Spec 0067, step C (B's open point): "vegetarische Variante zur bestehenden Lasagne" from the
// chat. The card names the household's recipe and the wish; "Änderung ansehen" opens the recipe
// beside the chat with "Mit KI ändern" already asked — the Änderungsansicht of spec 0062 shows
// what would change, "Übernehmen" saves it with "Rückgängig". Nothing changes before that.

export function AgentRecipeChangeCard(props: {
  extra: Extract<AgentExtra, { kind: 'recipe_change' }>;
  testID: string;
}) {
  const { extra, testID } = props;
  const data = useAgentProposalData();
  const online = useOnlineOnly();
  const open = useAgentOpen();
  const recipe = data?.recipes.find((row) => row.id === extra.recipeId);
  return (
    <Surface testID={testID} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles" size={18} color="accent" />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {recipe?.title ?? extra.title}
        </Text>
      </View>
      <Text variant="small" color="muted" testID={`${testID}-wish`}>
        {`Mit KI ändern: „${extra.wish}“`}
      </Text>
      {recipe ? (
        <>
          <Text variant="small" color="muted">
            Du siehst zuerst, was sich ändert, und übernimmst es dort – mit Rückgängig.
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <Button
              label="Änderung ansehen"
              icon="sparkles"
              size="sm"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => {
                requestAiChange(recipe.id, extra.wish);
                open({ kind: 'recipe', id: recipe.id });
              }}
              testID={`${testID}-open`}
            />
          </View>
        </>
      ) : (
        <Text variant="small" color="warn" testID={`${testID}-gone`}>
          Das Rezept gibt es nicht mehr.
        </Text>
      )}
    </Surface>
  );
}
