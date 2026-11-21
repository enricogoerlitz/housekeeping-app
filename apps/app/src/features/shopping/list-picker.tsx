import { useArticlesById, useRecipes } from '@housekeeping/api';
import {
  listPickerDayLabel,
  searchRecipes,
  sortRecipes,
  weekRangeLabel,
  type Id,
  type ISODate,
  type ListPickerEntry,
  type ListPickerWeek,
  type Recipe,
} from '@housekeeping/core';
import {
  Checkbox,
  EmptyState,
  GroupLabel,
  IconButton,
  List,
  ListRow,
  Text,
  TextField,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

/** A recipe chosen with "Rezept wählen …": no day, the recipe's own portions (Offene Frage 4h). */
export interface ChosenRecipe {
  recipe: Recipe;
  selected: boolean;
}

function SelectRow(props: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onToggle: () => void;
  testID: string;
}) {
  return (
    <ListRow
      title={props.title}
      subtitle={props.subtitle}
      accessibilityLabel={props.subtitle ? `${props.title}, ${props.subtitle}` : props.title}
      leading={
        <Checkbox
          checked={props.selected}
          label={props.title}
          onChange={props.onToggle}
          testID={`${props.testID}-check`}
        />
      }
      onPress={props.onToggle}
      testID={props.testID}
    />
  );
}

/** "‹ KW 47 · 16.–22. Nov ›": the fixed head of step 1 (AC-050). */
export function WeekPager(props: { week: ISODate; onShift: (weeks: 1 | -1) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <IconButton
        icon="chevron-left"
        label="Vorige Woche"
        onPress={() => props.onShift(-1)}
        testID="pick-week-prev"
      />
      <Text variant="bodyStrong" align="center" style={{ flex: 1 }} testID="pick-week-title">
        {weekRangeLabel(props.week)}
      </Text>
      <IconButton
        icon="chevron-right"
        label="Nächste Woche"
        onPress={() => props.onShift(1)}
        testID="pick-week-next"
      />
    </View>
  );
}

function DayHead(props: {
  label: string;
  onPress: () => void;
  allSelected: boolean;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label}: ${props.allSelected ? 'alle abwählen' : 'alle wählen'}`}
      onPress={props.onPress}
      testID={props.testID}
      style={(state) => ({
        minHeight: 44,
        justifyContent: 'flex-end',
        borderRadius: theme.shape.radius.control,
        opacity: state.pressed ? 0.6 : 1,
      })}
    >
      <GroupLabel>{props.label}</GroupLabel>
    </Pressable>
  );
}

/**
 * Step 1 "Was soll auf die Liste?" (REQ-008): the recipe entries of one week by day, then recipes
 * chosen without a day and "Vorgemerkt". A tap on a day selects all its entries (AC-052).
 */
export function ListPickerStep(props: {
  week: ListPickerWeek;
  selected: ReadonlySet<Id>;
  onToggleEntry: (entryId: Id) => void;
  onToggleDay: (entryIds: Id[]) => void;
  chosen: ChosenRecipe[];
  onToggleChosen: (recipeId: Id) => void;
}) {
  const entryRow = (row: ListPickerEntry) => (
    <SelectRow
      key={row.entry.id}
      title={row.recipe.title}
      subtitle={row.onList ? 'steht schon auf der Liste' : undefined}
      selected={props.selected.has(row.entry.id)}
      onToggle={() => props.onToggleEntry(row.entry.id)}
      testID={`pick-entry-${row.entry.id}`}
    />
  );
  const nothing =
    props.week.days.length === 0 && props.week.parked.length === 0 && props.chosen.length === 0;
  return (
    <View>
      {nothing ? (
        <EmptyState
          icon="calendar-days"
          title="Nichts zum Einkaufen geplant"
          text="Blättere zu einer anderen Woche oder wähle ein Rezept."
          testID="pick-empty"
        />
      ) : null}
      {props.week.days.length === 0 && !nothing ? (
        <Text color="muted" testID="pick-week-empty" style={{ marginTop: 8 }}>
          In dieser Woche ist kein Rezept geplant.
        </Text>
      ) : null}
      {props.week.days.map((day) => {
        const ids = day.entries.map((row) => row.entry.id);
        return (
          <View key={day.date} testID={`pick-day-${day.date}`}>
            <DayHead
              label={listPickerDayLabel(day)}
              allSelected={ids.every((id) => props.selected.has(id))}
              onPress={() => props.onToggleDay(ids)}
              testID={`pick-day-${day.date}-head`}
            />
            <List>{day.entries.map(entryRow)}</List>
          </View>
        );
      })}
      {props.chosen.length > 0 ? (
        <View testID="pick-without-day">
          <GroupLabel>Ohne Tag</GroupLabel>
          <List>
            {props.chosen.map((choice) => (
              <SelectRow
                key={choice.recipe.id}
                title={choice.recipe.title}
                subtitle={`${choice.recipe.servings} Portionen`}
                selected={choice.selected}
                onToggle={() => props.onToggleChosen(choice.recipe.id)}
                testID={`pick-recipe-${choice.recipe.id}`}
              />
            ))}
          </List>
        </View>
      ) : null}
      {props.week.parked.length > 0 ? (
        <View testID="pick-parked">
          <GroupLabel>Vorgemerkt</GroupLabel>
          <List>{props.week.parked.map(entryRow)}</List>
        </View>
      ) : null}
    </View>
  );
}

/** A recipe can bring something onto the list when one of its ingredients is bought. */
function hasIngredientsToBuy(recipe: Recipe): boolean {
  return recipe.ingredients.some((ingredient) => ingredient.shoppingRule !== 'skip');
}

/** "Rezept wählen …" (AC-053): search a recipe that is not in the plan. */
export function RecipeSearch(props: { onChoose: (recipe: Recipe) => void }) {
  const recipes = useRecipes();
  const articlesById = useArticlesById();
  const [query, setQuery] = useState('');
  const hits = query.trim()
    ? searchRecipes(query, recipes, articlesById)
    : sortRecipes(recipes, 'title');
  return (
    <View style={{ gap: 12 }}>
      <TextField
        accessibilityLabel="Rezept suchen"
        placeholder="Rezept suchen"
        value={query}
        onChangeText={setQuery}
        autoFocus
        round
        testID="pick-recipe-search"
      />
      {hits.length === 0 ? (
        <Text color="muted" testID="pick-recipe-none">
          Kein Rezept gefunden.
        </Text>
      ) : (
        <List>
          {hits.map((recipe) => {
            const usable = hasIngredientsToBuy(recipe);
            return (
              <ListRow
                key={recipe.id}
                title={recipe.title}
                subtitle={usable ? `${recipe.servings} Portionen` : 'Noch keine Zutaten'}
                disabled={!usable}
                onPress={() => props.onChoose(recipe)}
                testID={`pick-recipe-hit-${recipe.id}`}
              />
            );
          })}
        </List>
      )}
    </View>
  );
}
