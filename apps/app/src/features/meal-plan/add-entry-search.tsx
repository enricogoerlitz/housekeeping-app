import {
  useActivities,
  useActivitiesById,
  useArticlesById,
  usePlanEntries,
  useRecipeBook,
  useRecipes,
  useRecipesById,
  useRestaurants,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  activityMatches,
  collectionRecipeCountLabel,
  contentsInBook,
  entryName,
  hasExactName,
  leftoverCandidates,
  leftoversDayLabel,
  olderLeftoverCandidates,
  planCandidates,
  priceLabel,
  restaurantMatches,
  fuzzyIncludes,
  type AddEntryChoice,
  type AddEntryCreating,
  type AddEntryState,
  type AddEntryTab,
  type ISODate,
  type KindRole,
  type MealPlanEntry,
  type MealSlot,
  type Recipe,
  type RecipeBook,
  type RecipeKind,
  type Restaurant,
} from '@housekeeping/core';
import {
  Button,
  GroupLabel,
  Icon,
  KIND_ICONS,
  List,
  ListRow,
  Stack,
  Text,
  TextField,
  ViewTabs,
} from '@housekeeping/ui';
import { View } from 'react-native';

import { activityPlaceLine } from '@/features/activities/labels';

// Step one of "+ Hinzufügen" (spec 0010, REQ-007): the search "Was steht an?", the tabs, the
// hits of every kind, "Neu" and "Reste" (spec 0021, REQ-011, REQ-012).

// Spec 0030, REQ-006: in this order.
const TABS: { value: AddEntryTab; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'recipes', label: 'Rezepte' },
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'activities', label: 'Aktivitäten' },
  { value: 'collections', label: 'Sammlungen' },
  // Spec 0021, REQ-011: only with a day to plan the leftovers on.
  { value: 'leftovers', label: 'Reste' },
];

/** Hits per kind; the middle scrolls, the window keeps its size (AC-022). */
const MAX_RESULTS = 60;
/** Spec 0021, REQ-011: the youngest leftovers above the hits in "Alle". */
const LEFTOVERS_IN_ALL = 3;

/** The recipes a tab offers (Offene Frage 6 A of spec 0009): "Alle" both kinds. */
const TAB_KINDS: Partial<Record<AddEntryTab, RecipeKind | 'all'>> = {
  all: 'all',
  recipes: 'recipe',
  collections: 'collection',
};

export function KindIcon(props: { kind: KindRole }) {
  return <Icon name={KIND_ICONS[props.kind]} size={18} color="muted" />;
}

/** The kind of what a recipe row plans: a collection has the role "Sammlung" (spec 0009, E8). */
export const recipeRole = (recipe: Recipe): KindRole =>
  recipe.kind === 'collection' ? 'collection' : 'recipe';

/** A recipe row's second line: its variants; a collection the number of its recipes. */
function recipeSubtitle(recipe: Recipe, book: RecipeBook): string | undefined {
  if (recipe.kind === 'collection') {
    return collectionRecipeCountLabel(contentsInBook(recipe, book).length) || undefined;
  }
  return recipe.variants.map((variant) => variant.name).join(' · ') || undefined;
}

function restaurantSubtitle(restaurant: Restaurant): string | undefined {
  return (
    [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ') || undefined
  );
}

/** A "Neu" row: "+ „paella“ als Rezept anlegen". */
function NewRow(props: { label: string; disabled: boolean; onPress: () => void; testID: string }) {
  return (
    <ListRow
      title={props.label}
      leading={<Icon name="plus" size={18} color="accent" />}
      disabled={props.disabled}
      onPress={props.onPress}
      testID={props.testID}
    />
  );
}

/** Search field and tabs; they stay at the top, switching tabs keeps the window's size. */
export function AddEntrySearchHeader(props: {
  query: string;
  tab: AddEntryTab;
  withLeftovers: boolean;
  onQuery: (query: string) => void;
  onTab: (tab: AddEntryTab) => void;
}) {
  return (
    <View style={{ gap: 6, paddingTop: 4 }}>
      <TextField
        value={props.query}
        onChangeText={props.onQuery}
        placeholder="Was steht an?"
        accessibilityLabel="Was steht an?"
        round
        autoFocus
        left={<Icon name="search" size={19} color="muted" />}
        testID="add-entry-search"
      />
      <ViewTabs
        label="Art"
        value={props.tab}
        onChange={props.onTab}
        options={props.withLeftovers ? TABS : TABS.filter((option) => option.value !== 'leftovers')}
        testID="add-entry-tab"
      />
    </View>
  );
}

type LeftoverRow = { source: MealPlanEntry; title: string };

function LeftoverList(props: {
  rows: LeftoverRow[];
  onChoose: (choice: AddEntryChoice) => void;
  testID: string;
}) {
  return (
    <List testID={props.testID}>
      {props.rows.map((leftover) => (
        <ListRow
          key={leftover.source.id}
          title={leftover.title}
          leading={<Icon name="refresh-cw" size={18} color="muted" />}
          onPress={() =>
            props.onChoose({ kind: 'leftovers', source: leftover.source, title: leftover.title })
          }
          testID={`add-entry-leftover-${leftover.source.id}`}
        />
      ))}
    </List>
  );
}

/**
 * The hits and "Neu" of the chosen tab; in "Reste" the leftovers of the seven days before and,
 * with "Ältere Reste …", the older ones.
 */
export function AddEntrySearch(props: {
  state: AddEntryState;
  slots: MealSlot[];
  offline: boolean;
  onChoose: (choice: AddEntryChoice) => void;
  onCreate: (kind: AddEntryCreating) => void;
  onTab: (tab: AddEntryTab) => void;
  onToggleOlder: () => void;
}) {
  const { state, slots, offline, onChoose, onCreate, onTab } = props;
  const { tab, query } = state;
  const recipes = useRecipes();
  const recipesById = useRecipesById();
  const book = useRecipeBook();
  const restaurants = useRestaurants();
  const restaurantsById = useRestaurantsById();
  const activities = useActivities();
  const activitiesById = useActivitiesById();
  const articlesById = useArticlesById();
  const entries = usePlanEntries();
  const trimmed = query.trim();
  const slotOrder = slots.map((slot) => slot.id);

  const recipeKind = TAB_KINDS[tab];
  const recipeHits = recipeKind
    ? planCandidates(
        recipes,
        recipeKind === 'all' ? undefined : recipeKind,
        query,
        articlesById,
      ).slice(0, MAX_RESULTS)
    : [];
  // Spec 0031, REQ-021: the same search as on the pages of restaurants and activities.
  const restaurantHits =
    tab === 'all' || tab === 'restaurants'
      ? restaurants
          .filter((candidate) => restaurantMatches(query, candidate))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .slice(0, MAX_RESULTS)
      : [];
  const activityHits =
    tab === 'all' || tab === 'activities'
      ? activities
          .filter((candidate) => activityMatches(query, candidate))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .slice(0, MAX_RESULTS)
      : [];
  const hitCount =
    tab === 'leftovers' ? 0 : recipeHits.length + restaurantHits.length + activityHits.length;

  // Spec 0021, REQ-011, REQ-012: leftovers of the seven days before and of the same day in an
  // earlier Tageszeit; "Ältere Reste …" without a limit. The search filters them by name.
  const targetDay = state.target.date;
  const leftoverSlot = state.target.slotChosen === false ? undefined : state.target.slotId;
  const leftoverTitle = (source: MealPlanEntry, target: ISODate) =>
    `Reste von ${entryName(source, recipesById, entries, restaurantsById, activitiesById)} (${leftoversDayLabel(
      source.date ?? target,
      target,
      slots.find((slot) => slot.id === source.slotId)?.name,
    )})`;
  const leftoverRows = (sources: MealPlanEntry[], target: ISODate): LeftoverRow[] =>
    sources
      .map((source) => ({ source, title: leftoverTitle(source, target) }))
      .filter((row) => !trimmed || fuzzyIncludes(query, row.title));
  const recentSources = targetDay
    ? leftoverCandidates(entries, targetDay, slotOrder, recipesById, leftoverSlot)
    : [];
  const leftovers = targetDay ? leftoverRows(recentSources, targetDay) : [];

  if (tab === 'leftovers') {
    if (!targetDay) return null;
    const older = leftoverRows(
      olderLeftoverCandidates(entries, targetDay, slotOrder, recipesById, leftoverSlot),
      targetDay,
    );
    return (
      <Stack gap={4}>
        {leftovers.length > 0 ? (
          <LeftoverList rows={leftovers} onChoose={onChoose} testID="add-entry-leftovers" />
        ) : recentSources.length > 0 && trimmed ? (
          // Spec 0031, AC-069: there are leftovers, but none fits the search.
          <View style={{ alignItems: 'flex-start', gap: 4 }}>
            <Text color="muted" testID="add-entry-leftovers-none">
              {`Keine Reste zu „${trimmed}“`}
            </Text>
            <Button
              label="In allen suchen"
              variant="link"
              size="sm"
              onPress={() => onTab('all')}
              testID="add-entry-leftovers-search-all"
            />
          </View>
        ) : (
          <Text color="muted" testID="add-entry-leftovers-empty">
            In den 7 Tagen davor wurde nichts gekocht.
          </Text>
        )}
        <Button
          label="Ältere Reste …"
          variant="link"
          size="sm"
          onPress={props.onToggleOlder}
          testID="add-entry-leftovers-older"
        />
        {state.olderLeftovers ? (
          <LeftoverList rows={older} onChoose={onChoose} testID="add-entry-leftovers-older-list" />
        ) : null}
      </Stack>
    );
  }

  const quoted = trimmed ? `„${trimmed}“ ` : '';
  // K-13: no "+ „Lasagne“ als Rezept anlegen" next to the recipe "Lasagne" (spec 0018, AC-018).
  const named = (kind: RecipeKind) =>
    hasExactName(
      trimmed,
      recipes.filter((recipe) => recipe.kind === kind).map((recipe) => recipe.title),
    );
  const offerNew = {
    recipe: !named('recipe'),
    collection: !named('collection'),
    restaurant: !hasExactName(
      trimmed,
      restaurants.map((restaurant) => restaurant.name),
    ),
    activity: !hasExactName(
      trimmed,
      activities.map((activity) => activity.name),
    ),
  };

  return (
    <Stack gap={4}>
      {tab === 'all' && leftovers.length > 0 ? (
        <>
          <GroupLabel testID="add-entry-leftovers-group">Reste</GroupLabel>
          <LeftoverList
            rows={leftovers.slice(0, LEFTOVERS_IN_ALL)}
            onChoose={onChoose}
            testID="add-entry-leftovers-top"
          />
          <Button
            label="Alle Reste ›"
            variant="link"
            size="sm"
            onPress={() => onTab('leftovers')}
            testID="add-entry-leftovers-all"
          />
        </>
      ) : null}
      {hitCount > 0 ? (
        <List testID="add-entry-hits">
          {recipeHits.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.title}
              subtitle={recipeSubtitle(candidate, book)}
              leading={<KindIcon kind={recipeRole(candidate)} />}
              accessibilityLabel={
                candidate.kind === 'collection' ? `${candidate.title}, Sammlung` : undefined
              }
              onPress={() => onChoose({ kind: 'recipe', recipe: candidate })}
              testID={`add-entry-recipe-${candidate.id}`}
            />
          ))}
          {restaurantHits.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.name}
              subtitle={restaurantSubtitle(candidate)}
              leading={<KindIcon kind="restaurant" />}
              onPress={() => onChoose({ kind: 'restaurant', restaurant: candidate })}
              testID={`add-entry-restaurant-${candidate.id}`}
            />
          ))}
          {activityHits.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.name}
              subtitle={activityPlaceLine(candidate)}
              leading={<KindIcon kind="activity" />}
              onPress={() => onChoose({ kind: 'activity', activity: candidate })}
              testID={`add-entry-activity-${candidate.id}`}
            />
          ))}
        </List>
      ) : trimmed ? null : (
        <Text color="muted" testID="add-entry-none">
          {tab === 'restaurants'
            ? 'Noch keine Restaurants.'
            : tab === 'collections'
              ? 'Noch keine Sammlungen.'
              : tab === 'activities'
                ? 'Noch keine Aktivitäten.'
                : 'Noch nichts angelegt.'}
        </Text>
      )}

      <GroupLabel>Neu</GroupLabel>
      <List testID="add-entry-new">
        {(tab === 'all' || tab === 'recipes') && offerNew.recipe ? (
          <NewRow
            label={`+ ${quoted}als Rezept anlegen`}
            disabled={offline}
            onPress={() => onCreate('recipe')}
            testID="add-entry-new-recipe"
          />
        ) : null}
        {tab === 'collections' && offerNew.collection ? (
          <NewRow
            label={`+ ${quoted}als Sammlung anlegen`}
            disabled={offline}
            onPress={() => onCreate('collection')}
            testID="add-entry-new-collection"
          />
        ) : null}
        {tab === 'restaurants' && offerNew.restaurant ? (
          <NewRow
            label={`+ ${quoted}als Restaurant anlegen`}
            disabled={offline}
            onPress={() => onCreate('restaurant')}
            testID="add-entry-new-restaurant"
          />
        ) : null}
        {tab === 'activities' && offerNew.activity ? (
          <NewRow
            label={`+ ${quoted}als Aktivität anlegen`}
            disabled={offline}
            onPress={() => onCreate('activity')}
            testID="add-entry-new-activity"
          />
        ) : null}
        {tab === 'all' ? (
          <ListRow
            title={
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text>+ als </Text>
                <Button
                  label="Sammlung"
                  variant="link"
                  size="sm"
                  disabled={offline}
                  onPress={() => onCreate('collection')}
                  testID="add-entry-new-collection"
                />
                <Text> · </Text>
                <Button
                  label="Restaurant"
                  variant="link"
                  size="sm"
                  disabled={offline}
                  onPress={() => onCreate('restaurant')}
                  testID="add-entry-new-restaurant"
                />
                <Text> · </Text>
                <Button
                  label="Aktivität"
                  variant="link"
                  size="sm"
                  disabled={offline}
                  onPress={() => onCreate('activity')}
                  testID="add-entry-new-activity"
                />
              </View>
            }
            accessibilityLabel="Als Sammlung, Restaurant oder Aktivität anlegen"
            leading={<Icon name="plus" size={18} color="accent" />}
            testID="add-entry-new-kind"
          />
        ) : null}
        {tab === 'all' ? (
          <NewRow
            label={trimmed ? `+ ${quoted}als Freitext eintragen` : '+ Freitext eintragen'}
            disabled={offline}
            onPress={() => onChoose({ kind: 'text' })}
            testID="add-entry-new-text"
          />
        ) : null}
      </List>
    </Stack>
  );
}
