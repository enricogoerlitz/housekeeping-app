import { useArticlesById, useRecipeBook, useRecipes } from '@housekeeping/api';
import {
  canPutCollectionOnList,
  collectionListHint,
  contentsInBook,
  listPickerDayLabel,
  listPickerEntryLabel,
  searchRecipes,
  sortRecipes,
  type Id,
  type ListPickerEntry,
  type ListPickerPage,
  type Recipe,
  type RecipeBook,
  type RecurringPickerRow,
} from '@housekeeping/core';
import {
  Checkbox,
  EmptyState,
  GroupLabel,
  Icon,
  IconButton,
  KIND_ICONS,
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

/** The Kennzeichen of a collection in front of its title: "■ Grillabend (2 Rezepte)". */
function CollectionMark(props: { recipe: Recipe }) {
  return props.recipe.kind === 'collection' ? (
    <Icon name={KIND_ICONS.collection} size={18} color="muted" />
  ) : null;
}

function SelectRow(props: {
  title: string;
  subtitle?: string;
  /** A collection gets its Kennzeichen after the box (spec 0009, AC-027). */
  recipe: Recipe;
  selected: boolean;
  onToggle: () => void;
  testID: string;
}) {
  const collection = props.recipe.kind === 'collection';
  const spoken = collection ? `${props.title}, Sammlung` : props.title;
  return (
    <ListRow
      title={props.title}
      subtitle={props.subtitle}
      accessibilityLabel={props.subtitle ? `${spoken}, ${props.subtitle}` : spoken}
      leading={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Checkbox
            checked={props.selected}
            label={props.title}
            onChange={props.onToggle}
            testID={`${props.testID}-check`}
          />
          <CollectionMark recipe={props.recipe} />
        </View>
      }
      onPress={props.onToggle}
      testID={props.testID}
    />
  );
}

/**
 * A Dauerposten due in the seven days (spec 0060, REQ-005): "Cola 2×", "Sa 28.11."; one already
 * open on the list is shown but cannot be chosen (AC-026).
 */
function RecurringSelectRow(props: {
  row: RecurringPickerRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const { row } = props;
  const title = row.amount ? `${row.title} ${row.amount}` : row.title;
  const subtitle = row.onList ? `${row.dayLabel} · steht schon auf der Liste` : row.dayLabel;
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      accessibilityLabel={`${title}, ${subtitle}`}
      disabled={row.onList}
      leading={
        <Checkbox
          checked={props.selected && !row.onList}
          label={title}
          disabled={row.onList}
          onChange={props.onToggle}
          testID={`pick-recurring-${row.item.id}-check`}
        />
      }
      onPress={row.onList ? undefined : props.onToggle}
      testID={`pick-recurring-${row.item.id}`}
    />
  );
}

/** "‹ 22.–28. Nov ›": the fixed head of step 1; ‹ ends at today (spec 0025, AC-001, AC-002). */
export function PagePager(props: { page: ListPickerPage; onShift: (direction: 1 | -1) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <IconButton
        icon="chevron-left"
        label="Vorige sieben Tage"
        disabled={!props.page.canGoBack}
        onPress={() => props.onShift(-1)}
        testID="pick-week-prev"
      />
      <Text variant="bodyStrong" align="center" style={{ flex: 1 }} testID="pick-week-title">
        {props.page.title}
      </Text>
      <IconButton
        icon="chevron-right"
        label="Nächste sieben Tage"
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
 * Step 1 "Was soll auf die Liste?" (spec 0025, REQ-001): the recipe entries of seven days by
 * calendar week and day, then recipes chosen without a day and "Vorgemerkt". A tap on a day
 * selects all its entries (AC-052).
 */
export function ListPickerStep(props: {
  page: ListPickerPage;
  selected: ReadonlySet<Id>;
  onToggleEntry: (entryId: Id) => void;
  onToggleDay: (entryIds: Id[]) => void;
  chosen: ChosenRecipe[];
  onToggleChosen: (recipeId: Id) => void;
  /** Spec 0060: Dauerposten due in the seven days, and the chosen ones. */
  recurring: RecurringPickerRow[];
  selectedRecurring: ReadonlySet<Id>;
  onToggleRecurring: (row: RecurringPickerRow) => void;
}) {
  const book = useRecipeBook();
  const entryRow = (row: ListPickerEntry) => (
    <SelectRow
      key={row.entry.id}
      title={row.label}
      recipe={row.recipe}
      subtitle={row.onList ? 'steht schon auf der Liste' : undefined}
      selected={props.selected.has(row.entry.id)}
      onToggle={() => props.onToggleEntry(row.entry.id)}
      testID={`pick-entry-${row.entry.id}`}
    />
  );
  const { page } = props;
  const nothing =
    page.groups.length === 0 &&
    page.parked.length === 0 &&
    props.chosen.length === 0 &&
    props.recurring.length === 0;
  return (
    <View>
      {nothing ? (
        <EmptyState
          icon="calendar-days"
          title="Nichts zum Einkaufen geplant"
          text="Blättere zu anderen Tagen oder wähle ein Rezept."
          testID="pick-empty"
        />
      ) : null}
      {page.groups.length === 0 && !nothing ? (
        <Text color="muted" testID="pick-week-empty" style={{ marginTop: 8 }}>
          In diesen sieben Tagen ist kein Rezept geplant.
        </Text>
      ) : null}
      {page.groups.map((group) => (
        <View key={group.weekNumber} testID={`pick-kw-${group.weekNumber}`}>
          <Text variant="smallStrong" color="muted" style={{ marginTop: 12 }}>
            {group.label}
          </Text>
          {group.days.map((day) => {
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
        </View>
      ))}
      {props.recurring.length > 0 ? (
        <View testID="pick-recurring">
          <GroupLabel>Regelmäßig</GroupLabel>
          <List>
            {props.recurring.map((row) => (
              <RecurringSelectRow
                key={row.item.id}
                row={row}
                selected={props.selectedRecurring.has(row.item.id)}
                onToggle={() => props.onToggleRecurring(row)}
              />
            ))}
          </List>
        </View>
      ) : null}
      {props.chosen.length > 0 ? (
        <View testID="pick-without-day">
          <GroupLabel>Ohne Tag</GroupLabel>
          <List>
            {props.chosen.map((choice) => (
              <SelectRow
                key={choice.recipe.id}
                title={listPickerEntryLabel(choice.recipe, book)}
                recipe={choice.recipe}
                subtitle={`${choice.recipe.servings} Portionen`}
                selected={choice.selected}
                onToggle={() => props.onToggleChosen(choice.recipe.id)}
                testID={`pick-recipe-${choice.recipe.id}`}
              />
            ))}
          </List>
        </View>
      ) : null}
      {page.parked.length > 0 ? (
        <View testID="pick-parked">
          <GroupLabel>Vorgemerkt</GroupLabel>
          <List>{page.parked.map(entryRow)}</List>
        </View>
      ) : null}
    </View>
  );
}

const NO_INGREDIENTS = 'Noch keine Zutaten';

/**
 * Why a recipe cannot bring anything onto the list, or undefined when it can: a recipe needs an
 * ingredient that is bought; a collection something to buy in it or its recipes; an empty one reads
 * "Noch nichts enthalten", one with nothing to buy like a recipe (spec 0009, E7, Offene Frage 6 A).
 */
function nothingToBuy(recipe: Recipe, book: RecipeBook): string | undefined {
  if (recipe.kind === 'collection') {
    const contents = contentsInBook(recipe, book);
    if (canPutCollectionOnList(recipe, contents)) return undefined;
    return collectionListHint(recipe, contents) ?? NO_INGREDIENTS;
  }
  return recipe.ingredients.some((ingredient) => ingredient.shoppingRule !== 'skip')
    ? undefined
    : NO_INGREDIENTS;
}

/** "Rezept wählen …" (AC-053): search a recipe or a collection that is not in the plan. */
export function RecipeSearch(props: { onChoose: (recipe: Recipe) => void }) {
  const recipes = useRecipes();
  const book = useRecipeBook();
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
            const hint = nothingToBuy(recipe, book);
            const title = listPickerEntryLabel(recipe, book);
            const collection = recipe.kind === 'collection';
            return (
              <ListRow
                key={recipe.id}
                title={title}
                subtitle={hint ?? `${recipe.servings} Portionen`}
                leading={collection ? <CollectionMark recipe={recipe} /> : undefined}
                accessibilityLabel={collection ? `${title}, Sammlung` : undefined}
                disabled={hint !== undefined}
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
