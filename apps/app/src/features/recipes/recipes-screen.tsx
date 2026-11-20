import {
  useArticlesById,
  useCurrentMember,
  useMembers,
  useRecipes,
  useToday,
} from '@housekeeping/api';
import {
  filterRecipes,
  routeId,
  searchRecipes,
  sortRecipes,
  type Id,
  type RecipeFilter,
  type RecipeSort,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  Notice,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  Stack,
  Text,
  TextField,
  TypingIndicator,
  useBreakpoint,
} from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { RestaurantsPanel } from '@/features/restaurants/restaurants-panel';
import { ProfileButton } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { useSettings } from '@/lib/settings';

import { AiSearchPanel } from './ai-search-panel';
import { NewRecipeSheet } from './new-recipe-sheet';
import { RecipeDetail } from './recipe-detail';
import { RecipeGrid } from './recipe-grid';
import { StarterSheet } from './starter-sheet';
import { useAiSearch } from './use-ai-search';

type FilterKey = 'favorites' | 'fast' | 'vegetarian' | 'vegan' | 'fits-all' | 'rare';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'favorites', label: 'Favoriten' },
  { key: 'fast', label: 'Schnell < 30 Min' },
  { key: 'vegetarian', label: 'Vegetarisch' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'fits-all', label: 'Passt für alle' },
  { key: 'rare', label: 'Lange nicht gekocht' },
];

const SORTS: { value: RecipeSort; label: string }[] = [
  { value: 'recent', label: 'Zuletzt' },
  { value: 'new', label: 'Neu' },
  { value: 'title', label: 'A–Z' },
  { value: 'rating', label: 'Bewertung' },
];

/** Days after which a recipe counts as "lange nicht gekocht". */
const RARE_AFTER_DAYS = 21;
const LIST_COLUMN_WIDTH = 380;

type FoodView = 'recipes' | 'restaurants';

const FOOD_VIEWS: { value: FoodView; label: string }[] = [
  { value: 'recipes', label: 'Rezepte' },
  { value: 'restaurants', label: 'Restaurants' },
];

/**
 * "Essen": recipes or restaurants (spec 0002, AC-001). Recipe list with search, filters and sort;
 * on wide screens list and recipe side by side.
 */
export function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; view?: string | string[] }>();
  const { isWide, isPhone } = useBreakpoint();
  const online = useOnlineOnly();
  const assistant = useAssistant();
  const settings = useSettings();
  const recipes = useRecipes();
  const articlesById = useArticlesById();
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterKey[]>([]);
  const [sort, setSort] = useState<RecipeSort>('recent');
  const [newOpen, setNewOpen] = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);

  const selectedId = isWide ? routeId(params.id) : undefined;
  // The chosen side lives in the URL, so a reload or a deep link keeps it.
  const view: FoodView =
    (Array.isArray(params.view) ? params.view[0] : params.view) === 'restaurants'
      ? 'restaurants'
      : 'recipes';
  const switcher = (
    <Segmented
      label="Rezepte oder Restaurants"
      value={view}
      onChange={(next) =>
        router.setParams({
          view: next === 'restaurants' ? 'restaurants' : undefined,
          id: undefined,
          rid: undefined,
        })
      }
      options={FOOD_VIEWS}
      testID="food-switch"
    />
  );

  const open = (recipeId: Id) => {
    if (isWide) router.setParams({ id: recipeId });
    else router.push({ pathname: '/rezept/[id]', params: { id: recipeId } });
  };

  const toggleFilter = (key: FilterKey) => {
    if (filters.includes(key)) {
      setFilters(filters.filter((candidate) => candidate !== key));
      return;
    }
    // A recipe can only be filtered for one diet at a time.
    const exclusive: FilterKey | undefined =
      key === 'vegan' ? 'vegetarian' : key === 'vegetarian' ? 'vegan' : undefined;
    setFilters([...filters.filter((candidate) => candidate !== exclusive), key]);
  };

  const filter: RecipeFilter = {
    favoriteOf: filters.includes('favorites') ? me.id : undefined,
    maxMinutes: filters.includes('fast') ? 30 : undefined,
    diet: filters.includes('vegan')
      ? 'vegan'
      : filters.includes('vegetarian')
        ? 'vegetarian'
        : undefined,
    fitsAll: filters.includes('fits-all') ? members : undefined,
    notCookedSinceDays: filters.includes('rare') ? RARE_AFTER_DAYS : undefined,
  };
  const searched = searchRecipes(query, recipes, articlesById);
  const filtered = filterRecipes(searched, filter, articlesById, today);
  // With a query the search ranking wins; without one the chosen sort applies.
  const results = query.trim() ? filtered : sortRecipes(filtered, sort);

  // With the switch on, a typed query is searched after a short pause; off, nothing is sent.
  const { state: ai, runNow: runAi } = useAiSearch(settings.aiSearch && !online.disabled, query);
  const aiVisible = settings.aiSearch && ai.status !== 'idle' && query.trim() !== '';

  const toggleAi = () => settings.update({ aiSearch: !settings.aiSearch });

  const header = (
    <ScreenHeader
      title="Essen"
      right={
        <>
          {isPhone ? (
            <IconButton
              icon="plus"
              label="Neues Rezept"
              variant="soft"
              disabled={online.disabled}
              onPress={() => setNewOpen(true)}
              testID="recipe-new"
            />
          ) : (
            <Button
              label="Neues Rezept"
              icon="plus"
              size="sm"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setNewOpen(true)}
              testID="recipe-new"
            />
          )}
          {isPhone ? <ProfileButton /> : null}
        </>
      }
    />
  );
  const offlineHint = online.hint ? (
    <Text
      variant="small"
      color="warn"
      testID="recipe-offline-hint"
      style={{ marginTop: -8, marginBottom: 12 }}
    >
      {online.hint}
    </Text>
  ) : null;

  const sheets = (
    <>
      <NewRecipeSheet visible={newOpen} onClose={() => setNewOpen(false)} onCreated={open} />
      <StarterSheet visible={starterOpen} onClose={() => setStarterOpen(false)} />
    </>
  );

  if (view === 'restaurants') return <RestaurantsPanel switcher={switcher} />;

  if (recipes.length === 0) {
    return (
      <Screen testID="recipes-screen">
        {header}
        <View style={{ marginBottom: 16 }}>{switcher}</View>
        {offlineHint}
        <EmptyState
          icon="book-open"
          title="Noch keine Rezepte"
          text="Fangt mit einem Titel an, übernehmt Klassiker oder beschreibt, worauf ihr Lust habt."
          testID="recipes-empty"
        >
          <Button
            label="Titel eingeben"
            icon="pencil"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setNewOpen(true)}
            testID="empty-recipe-title"
          />
          <Button
            label="Starter-Rezepte ansehen"
            icon="book-open"
            variant="secondary"
            onPress={() => setStarterOpen(true)}
            testID="empty-starter"
          />
          <Button
            label="Beschreiben ✨"
            variant="ghost"
            onPress={() => assistant.open()}
            testID="empty-describe"
          />
        </EmptyState>
        {sheets}
      </Screen>
    );
  }

  const compact = selectedId !== undefined;
  const listBody = (
    <>
      <Row gap={8} style={{ marginBottom: 12 }} wrap>
        <TextField
          round
          value={query}
          onChangeText={setQuery}
          placeholder={settings.aiSearch ? 'Was möchtet ihr essen?' : 'Rezepte suchen …'}
          accessibilityLabel="Rezepte suchen"
          returnKeyType="search"
          onSubmitEditing={() => {
            if (settings.aiSearch) runAi([]);
          }}
          left={<Icon name="search" size={19} color="muted" />}
          right={
            settings.aiSearch ? (
              <IconButton
                icon="sparkles"
                label="Mit KI suchen"
                variant="filled"
                size={40}
                disabled={online.disabled || !query.trim()}
                onPress={() => runAi([])}
                testID="ai-search-run"
              />
            ) : query ? (
              <IconButton
                icon="x"
                label="Suche leeren"
                onPress={() => setQuery('')}
                testID="recipe-search-clear"
              />
            ) : undefined
          }
          style={{ flexGrow: 1, flexBasis: 220 }}
          testID="recipe-search"
        />
        <AiToggle on={settings.aiSearch} onToggle={toggleAi} />
      </Row>

      {aiVisible ? null : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
            style={{ marginBottom: 12, flexGrow: 0 }}
          >
            {FILTERS.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                selected={filters.includes(entry.key)}
                onPress={() => toggleFilter(entry.key)}
                testID={`filter-${entry.key}`}
              />
            ))}
          </ScrollView>
          <View style={{ marginBottom: 12 }}>
            <Segmented
              label="Sortierung"
              value={sort}
              onChange={setSort}
              options={SORTS}
              testID="recipe-sort"
            />
          </View>
        </>
      )}

      <Row justify="space-between" style={{ marginBottom: 12 }}>
        <Text variant="small" color="muted" testID="recipe-count">
          {aiVisible ? 'KI-Suche' : results.length === 1 ? '1 Rezept' : `${results.length} Rezepte`}
        </Text>
        <Button
          label="Starter-Rezepte"
          icon="book-open"
          variant="link"
          size="sm"
          onPress={() => setStarterOpen(true)}
          testID="recipe-starter-link"
        />
      </Row>

      {aiVisible && ai.status === 'done' ? (
        <View testID="ai-search-results">
          <AiSearchPanel
            result={ai.result}
            disabledChips={ai.disabledChips}
            onRemoveChip={(chipId) => runAi([...ai.disabledChips, chipId])}
            onAgain={() => runAi(ai.disabledChips)}
            onOpen={open}
            compact={compact}
          />
        </View>
      ) : aiVisible && ai.status === 'error' ? (
        <Stack gap={8} style={{ marginBottom: 16 }}>
          <Notice icon="circle-alert" text={ai.message} testID="ai-search-error" />
          <Button
            label="Nochmal suchen"
            icon="refresh-cw"
            variant="ghost"
            size="sm"
            onPress={() => runAi(ai.disabledChips)}
            testID="ai-search-retry"
          />
        </Stack>
      ) : aiVisible ? (
        <View style={{ marginBottom: 16 }}>
          <TypingIndicator label="Die KI sucht …" testID="ai-search-loading" />
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nichts gefunden"
          text="Probiere ein anderes Wort oder nimm einen Filter heraus."
          testID="recipes-no-results"
        />
      ) : (
        <RecipeGrid recipes={results} onOpen={open} compact={compact} />
      )}
    </>
  );

  if (compact && selectedId !== undefined) {
    return (
      <Screen testID="recipes-screen" scroll={false} style={{ flex: 1, paddingBottom: 0 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 32 }}>
          <View style={{ width: LIST_COLUMN_WIDTH }}>
            <ScrollColumn>
              {header}
              <View style={{ marginBottom: 16 }}>{switcher}</View>
              {offlineHint}
              {listBody}
            </ScrollColumn>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScrollColumn>
              <View style={{ paddingTop: 16 }}>
                <RecipeDetail
                  recipeId={selectedId}
                  onClose={() => router.setParams({ id: undefined })}
                />
              </View>
            </ScrollColumn>
          </View>
        </View>
        {sheets}
      </Screen>
    );
  }

  return (
    <Screen testID="recipes-screen">
      {header}
      <View style={{ marginBottom: 16 }}>{switcher}</View>
      {offlineHint}
      {listBody}
      {sheets}
    </Screen>
  );
}

function ScrollColumn(props: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 96 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  );
}

/** The explicit switch for the AI search; stored on the device and stays on (F11, AC-042). */
function AiToggle(props: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      testID="ai-search-toggle"
      role="switch"
      aria-label="KI-Suche"
      aria-checked={props.on}
      onPress={props.onToggle}
      hitSlop={4}
      style={{ minHeight: 50, justifyContent: 'center' }}
    >
      <Chip label={props.on ? 'KI-Suche an' : 'KI-Suche'} icon="sparkles" selected={props.on} />
    </Pressable>
  );
}
