import {
  useActiveHouseholdId,
  useArticlesById,
  useHousehold,
  useHouseholdClock,
  useMembers,
  usePlanEntries,
  useRecipeBook,
  useRecipes,
  useToday,
} from '@housekeeping/api';
import {
  cookingHistory,
  slotSuggestions,
  suggestionsHeading,
  withCookingHistory,
  type Evening,
  type Id,
  type PlanSuggestion,
  type SuggestionInput,
} from '@housekeeping/core';
import { Button, GroupLabel, IconButton, List, ListRow, Text } from '@housekeeping/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { RecipeCover } from '@/features/recipes/recipe-cover';

// Planvorschläge (spec 0063): what the add window (A) and "Was kochen wir?" (C) read. Computed on
// the device from the cache; nothing about them is stored.

/** Spec 0063, REQ-006: why "+" is greyed out without network. */
export const PLAN_ONLINE_HINT = 'Einplanen geht nur online';

/**
 * The cache as the suggestions need it, with the calendar as cooking history (Entscheidung 7).
 * The household's time is read once, when the window opens, so the suggestions do not change
 * while it is open.
 */
export function useSuggestionInput(): SuggestionInput {
  const recipes = useRecipes();
  const entries = usePlanEntries();
  const members = useMembers();
  const articlesById = useArticlesById();
  const book = useRecipeBook();
  const household = useHousehold();
  const today = useToday();
  const clock = useHouseholdClock();
  const householdId = useActiveHouseholdId();
  const [now] = useState(() => clock().time.slice(0, 5));
  return useMemo(
    () => ({
      recipes: withCookingHistory(recipes, cookingHistory(entries, book.collectionRecipes, today)),
      entries,
      members,
      articlesById,
      book,
      slots: household.mealSlots,
      today,
      now,
      householdId,
    }),
    [recipes, entries, members, articlesById, book, household.mealSlots, today, now, householdId],
  );
}

/** The two lines under a suggestion's name: its reason, then the facts. */
function SuggestionLines(props: { suggestion: PlanSuggestion }) {
  const { reason, facts } = props.suggestion;
  return (
    <View>
      {reason ? (
        <Text variant="small" color="text">
          {reason}
        </Text>
      ) : null}
      {facts ? (
        <Text variant="small" color="muted">
          {facts}
        </Text>
      ) : null}
    </View>
  );
}

/** "Noch wenig gekocht und bewertet …" (REQ-004, AC-013): no button, just the sentence. */
export function FreshHint() {
  return (
    <Text variant="small" color="muted" testID="plan-suggestions-fresh" style={{ marginTop: 6 }}>
      Noch wenig gekocht und bewertet. Mit jedem „Wie war’s?“ werden die Vorschläge persönlicher.
    </Text>
  );
}

/** One suggestion: photo, name, reason, facts; `control` stands at the right end. */
export function SuggestionRow(props: {
  suggestion: PlanSuggestion;
  /** A button of its own at the right end ("+"). */
  control?: ReactNode;
  /** Shown at the right end inside the row (the checkbox of the Wochenkarte). */
  trailing?: ReactNode;
  onPress: () => void;
  checked?: boolean;
  testID: string;
}) {
  const { suggestion } = props;
  const label = [suggestion.recipe.title, suggestion.reason, suggestion.facts]
    .filter(Boolean)
    .join(', ');
  return (
    <ListRow
      title={suggestion.recipe.title}
      subtitle={<SuggestionLines suggestion={suggestion} />}
      leading={<RecipeCover recipe={suggestion.recipe} width={52} height={52} />}
      accessibilityLabel={label}
      checked={props.checked}
      selected={props.checked}
      onPress={props.onPress}
      controls={props.control}
      trailing={props.trailing}
      testID={props.testID}
    />
  );
}

/**
 * "Vorschläge für Donnerstagabend" in the add window (REQ-005 to REQ-007): three rows, "+" plans
 * at once, a tap on the row opens the second step, "Andere" shows the next three. Nothing when
 * fewer than three dishes fit.
 */
export function SlotSuggestionsBlock(props: {
  target: Evening;
  /** Greyed out "+" with its hint (offline, old version). */
  planDisabled: boolean;
  planHint?: string;
  onOpen: (suggestion: PlanSuggestion) => void;
  onPlan: (suggestion: PlanSuggestion) => void;
}) {
  const input = useSuggestionInput();
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState<Id[]>([]);
  const result = useMemo(
    () => slotSuggestions(input, props.target, { round, shown }),
    [input, props.target, round, shown],
  );
  if (result.suggestions.length === 0) return null;
  const others = () => {
    setShown([...shown, ...result.suggestions.map((suggestion) => suggestion.recipe.id)]);
    setRound(round + 1);
  };
  return (
    <View testID="plan-suggestions">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <GroupLabel testID="plan-suggestions-heading">
          {suggestionsHeading(props.target.date, props.target.slotId, input.slots)}
        </GroupLabel>
        {result.more ? (
          <Button
            label="Andere"
            icon="refresh-cw"
            variant="link"
            size="sm"
            onPress={others}
            testID="plan-suggestions-others"
          />
        ) : null}
      </View>
      <List testID="plan-suggestions-list">
        {result.suggestions.map((suggestion) => (
          <SuggestionRow
            key={suggestion.recipe.id}
            suggestion={suggestion}
            onPress={() => props.onOpen(suggestion)}
            testID={`plan-suggestion-${suggestion.recipe.id}`}
            control={
              <IconButton
                icon="plus"
                label={`${suggestion.recipe.title} einplanen`}
                variant="soft"
                color="accent"
                disabled={props.planDisabled}
                hint={props.planHint}
                onPress={() => props.onPlan(suggestion)}
                testID={`plan-suggestion-add-${suggestion.recipe.id}`}
              />
            }
          />
        ))}
      </List>
      {result.fresh ? <FreshHint /> : null}
    </View>
  );
}
