import { useRecipesById, type AiSearchResult } from '@housekeeping/api';
import type { Id, Recipe } from '@housekeeping/core';
import { Button, Chip, Icon, Row, Stack, Text } from '@housekeeping/ui';
import { ScrollView } from 'react-native';

import { RecipeGrid } from './recipe-grid';

export interface AiSearchPanelProps {
  result: AiSearchResult;
  disabledChips: string[];
  /** Removes a chip; the search runs again without it. */
  onRemoveChip: (chipId: string) => void;
  onAgain: () => void;
  onOpen: (recipeId: Id) => void;
  compact?: boolean;
}

/** The interpretation as chips, the trace, the sample-answer note and the hits with their reason. */
export function AiSearchPanel(props: AiSearchPanelProps) {
  const recipesById = useRecipesById();
  const reasons = new Map(props.result.results.map((hit) => [hit.recipeId, hit.reason]));
  const recipes = props.result.results.flatMap((hit): Recipe[] => {
    const recipe = recipesById[hit.recipeId];
    return recipe ? [recipe] : [];
  });
  const chips = props.result.chips.filter((chip) => !props.disabledChips.includes(chip.id));

  return (
    <Stack gap={12} style={{ marginBottom: 16 }}>
      <Row gap={6}>
        <Icon name="sparkles" size={15} color="accent" />
        <Text variant="caption" color="muted" testID="ai-search-note" style={{ flexShrink: 1 }}>
          {props.result.note}
        </Text>
      </Row>
      {chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {chips.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              icon="x"
              selected
              onPress={() => props.onRemoveChip(chip.id)}
              testID={`ai-chip-${chip.id}`}
            />
          ))}
        </ScrollView>
      ) : null}
      <Text variant="caption" color="muted" testID="ai-search-trace">
        {props.result.trace}
      </Text>
      <Stack gap={12} style={{ marginTop: 4 }}>
        {recipes.length === 0 ? (
          <Text color="muted" testID="ai-search-empty">
            Nichts Passendes gefunden. Nimm eine Bedingung heraus oder suche anders.
          </Text>
        ) : (
          <RecipeGrid
            recipes={recipes}
            onOpen={props.onOpen}
            compact={props.compact}
            cardTestID={(recipe) => `ai-result-${recipe.id}`}
            meta={(recipe) => (
              <Text variant="caption" color="muted" numberOfLines={2}>
                {reasons.get(recipe.id) ?? ''}
              </Text>
            )}
          />
        )}
      </Stack>
      <Button
        label="Nochmal suchen"
        icon="refresh-cw"
        variant="ghost"
        size="sm"
        onPress={props.onAgain}
        testID="ai-search-again"
      />
    </Stack>
  );
}
