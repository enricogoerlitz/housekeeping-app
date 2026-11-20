import {
  addPlanEntry,
  defaultEaterIds,
  photoSource,
  splitForEaters,
  useArticlesById,
  useMembers,
  useMembersById,
  usePlanEntries,
  useRecipes,
  useRecipesById,
  useRestaurants,
} from '@housekeeping/api';
import {
  fuzzyIncludes,
  priceLabel,
  searchRecipes,
  sortRecipes,
  type Id,
  type ISODate,
  type Member,
  type Recipe,
  type Restaurant,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  Icon,
  IconButton,
  List,
  ListRow,
  Notice,
  Photo,
  Segmented,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { dayLabel, entryTitle, misfitText, splitSummary } from './labels';

export interface AddTarget {
  /** null = "Vormerken" without a day. */
  date: ISODate | null;
  slotId: Id;
}

type Mode = 'recipe' | 'restaurant' | 'text' | 'leftovers';

const MAX_RESULTS = 30;

function Label(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** "Wer isst mit?": members as chips plus a guest counter. */
function EaterPicker(props: {
  members: Member[];
  eaterIds: Id[];
  guests: number;
  onEaters: (ids: Id[]) => void;
  onGuests: (guests: number) => void;
}) {
  const { eaterIds, guests } = props;
  return (
    <View>
      <Label>Wer isst mit?</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {props.members.map((member) => {
          const selected = eaterIds.includes(member.id);
          return (
            <Chip
              key={member.id}
              label={member.name}
              selected={selected}
              testID={`eater-${member.id}`}
              onPress={() =>
                props.onEaters(
                  selected ? eaterIds.filter((id) => id !== member.id) : [...eaterIds, member.id],
                )
              }
            />
          );
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <IconButton
            icon="minus"
            label="Ein Gast weniger"
            disabled={guests === 0}
            testID="guests-minus"
            onPress={() => props.onGuests(Math.max(0, guests - 1))}
          />
          <Text variant="smallStrong" testID="guests-count">
            {guests === 1 ? '1 Gast' : `${guests} Gäste`}
          </Text>
          <IconButton
            icon="plus"
            label="Ein Gast mehr"
            testID="guests-plus"
            onPress={() => props.onGuests(guests + 1)}
          />
        </View>
      </View>
    </View>
  );
}

function restaurantSubtitle(restaurant: Restaurant): string | undefined {
  return (
    [restaurant.cuisine, priceLabel(restaurant.priceLevel)].filter(Boolean).join(' · ') || undefined
  );
}

/** Adds a dish to one meal: a recipe with eaters and cook, a restaurant, a free text, or leftovers. */
export function AddEntrySheet(props: {
  target: AddTarget;
  weekDates: ISODate[];
  onClose: () => void;
}) {
  const online = useOnlineOnly();
  const recipes = useRecipes();
  const recipesById = useRecipesById();
  const restaurants = useRestaurants();
  const articlesById = useArticlesById();
  const entries = usePlanEntries();
  const members = useMembers();
  const membersById = useMembersById();

  const [mode, setMode] = useState<Mode>('recipe');
  const [later, setLater] = useState(props.target.date === null);
  const [query, setQuery] = useState('');
  const [recipeId, setRecipeId] = useState<Id | undefined>();
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [restaurantId, setRestaurantId] = useState<Id | undefined>();
  const [eaterIds, setEaterIds] = useState<Id[]>([]);
  const [guests, setGuests] = useState(0);
  const [cookId, setCookId] = useState<Id | undefined>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  // A meal without a day can only be "vorgemerkt"; the toggle then stays on.
  const date = later ? null : props.target.date;
  const recipe = recipeId ? recipesById[recipeId] : undefined;
  const restaurant = restaurantId
    ? restaurants.find((candidate) => candidate.id === restaurantId)
    : undefined;
  const split = recipe ? splitForEaters(recipe.id, eaterIds, guests) : undefined;
  const misfits = split ? split.misfitMemberIds.flatMap((id) => membersById[id] ?? []) : [];

  const chooseRecipe = (chosen: Recipe) => {
    setRecipeId(chosen.id);
    setEaterIds(defaultEaterIds(date));
    setGuests(0);
    setCookId(undefined);
  };

  const chooseRestaurant = (chosen: Restaurant) => {
    setRestaurantId(chosen.id);
    setEaterIds(defaultEaterIds(date));
    setGuests(0);
  };

  const toggleLater = () => {
    const next = !later;
    setLater(next);
    setEaterIds(defaultEaterIds(next ? null : props.target.date));
  };

  const done = (title: string, planned: ISODate | null) => {
    props.onClose();
    toast.show({
      message: planned ? `„${title}“ steht am ${dayLabel(planned)}` : `„${title}“ ist vorgemerkt`,
    });
  };

  const saveRecipe = () => {
    if (!recipe || !split) return;
    addPlanEntry({
      date,
      slotId: props.target.slotId,
      kind: 'recipe',
      recipeId: recipe.id,
      eaterIds,
      guests,
      cookId,
      portions: split.portions,
      variants: split.variants,
    });
    done(recipe.title, date);
  };

  const saveRestaurant = () => {
    if (!restaurant) return;
    addPlanEntry({
      date,
      slotId: props.target.slotId,
      kind: 'restaurant',
      restaurantId: restaurant.id,
      eaterIds,
      guests,
    });
    done(restaurant.name, date);
  };

  const saveText = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Schreib kurz, was es gibt.');
      return;
    }
    try {
      addPlanEntry({
        date,
        slotId: props.target.slotId,
        kind: 'text',
        text: trimmed,
        eaterIds: defaultEaterIds(date),
      });
      done(trimmed, date);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  const saveLeftovers = (sourceId: Id) => {
    const source = entries.find((entry) => entry.id === sourceId);
    if (!source || !props.target.date) return;
    const eaters = defaultEaterIds(props.target.date);
    addPlanEntry({
      date: props.target.date,
      slotId: props.target.slotId,
      kind: 'leftovers',
      recipeId: source.recipeId,
      leftoversOfEntryId: source.id,
      eaterIds: eaters,
      portions: Math.max(1, eaters.length),
      variants: [],
    });
    done(`Reste von ${entryTitle(source, recipesById, entries)}`, props.target.date);
  };

  const targetDate = props.target.date;
  const leftoverSources = targetDate
    ? entries
        .filter(
          (entry) =>
            entry.date !== null &&
            entry.date < targetDate &&
            props.weekDates.includes(entry.date) &&
            (entry.kind === 'recipe' || entry.kind === 'text'),
        )
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    : [];

  const results = query.trim()
    ? searchRecipes(query, recipes, articlesById)
    : sortRecipes(recipes, 'title');
  const restaurantResults = [...restaurants]
    .filter(
      (candidate) =>
        !restaurantQuery.trim() ||
        fuzzyIncludes(restaurantQuery, candidate.name) ||
        fuzzyIncludes(restaurantQuery, candidate.cuisine ?? ''),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const modes: { value: Mode; label: string }[] = [
    { value: 'recipe', label: 'Rezept' },
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'text', label: 'Freitext' },
    ...(targetDate ? [{ value: 'leftovers' as const, label: 'Reste' }] : []),
  ];

  const footer =
    mode === 'recipe' && recipe ? (
      <Button
        label={later ? 'Vormerken' : 'Hinzufügen'}
        icon="plus"
        full
        disabled={online.disabled || eaterIds.length + guests === 0}
        hint={
          online.hint ?? (eaterIds.length + guests === 0 ? 'Wähl aus, wer mitisst.' : undefined)
        }
        testID="add-entry-save"
        onPress={saveRecipe}
      />
    ) : mode === 'restaurant' && restaurant ? (
      <Button
        label={later ? 'Vormerken' : 'Hinzufügen'}
        icon="plus"
        full
        disabled={online.disabled || eaterIds.length + guests === 0}
        hint={
          online.hint ?? (eaterIds.length + guests === 0 ? 'Wähl aus, wer mitisst.' : undefined)
        }
        testID="add-entry-restaurant-save"
        onPress={saveRestaurant}
      />
    ) : mode === 'text' ? (
      <Button
        label={later ? 'Vormerken' : 'Hinzufügen'}
        icon="plus"
        full
        disabled={online.disabled}
        hint={online.hint}
        testID="add-entry-text-save"
        onPress={saveText}
      />
    ) : undefined;

  const where = date ? dayLabel(date) : 'ohne Tag';
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={`Essen hinzufügen · ${where}`}
      testID="add-entry-sheet"
      footer={footer}
    >
      <Stack gap={16}>
        <Segmented
          label="Art des Eintrags"
          options={modes}
          value={mode}
          onChange={setMode}
          testID="add-entry-mode"
        />
        {mode !== 'leftovers' && targetDate ? (
          <Chip
            label="Ohne Tag vormerken"
            icon="bookmark"
            selected={later}
            onPress={toggleLater}
            testID="add-entry-later"
          />
        ) : null}

        {mode === 'recipe' && !recipe ? (
          <Stack gap={10}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Rezept suchen"
              accessibilityLabel="Rezept suchen"
              round
              left={<Icon name="search" size={19} color="muted" />}
              testID="add-entry-search"
            />
            {results.length === 0 ? (
              <Text color="muted">Kein Rezept gefunden.</Text>
            ) : (
              <List>
                {results.slice(0, MAX_RESULTS).map((candidate) => (
                  <ListRow
                    key={candidate.id}
                    title={candidate.title}
                    subtitle={
                      candidate.variants.map((variant) => variant.name).join(' · ') || undefined
                    }
                    leading={<Photo source={photoSource(candidate.photo)} width={44} height={44} />}
                    onPress={() => chooseRecipe(candidate)}
                    testID={`add-entry-recipe-${candidate.id}`}
                  />
                ))}
              </List>
            )}
          </Stack>
        ) : null}

        {mode === 'recipe' && recipe && split ? (
          <Stack gap={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Photo source={photoSource(recipe.photo)} width={52} height={52} />
              <Text variant="cardTitle" style={{ flex: 1 }}>
                {recipe.title}
              </Text>
              <Button
                label="Ändern"
                variant="link"
                size="sm"
                testID="add-entry-back"
                onPress={() => setRecipeId(undefined)}
              />
            </View>
            <EaterPicker
              members={members}
              eaterIds={eaterIds}
              guests={guests}
              onEaters={setEaterIds}
              onGuests={setGuests}
            />
            <View style={{ gap: 6 }}>
              <Text variant="small" color="muted">
                {split.portions === 1 ? '1 Portion' : `${split.portions} Portionen`}
              </Text>
              {split.variants.length > 0 ? (
                <Text variant="bodyStrong" testID="add-entry-split">
                  {splitSummary(recipe, split.variants)}
                </Text>
              ) : null}
              {misfits.length > 0 ? (
                <Notice testID="add-entry-misfit" text={misfitText(misfits)} />
              ) : null}
            </View>
            <View>
              <Label>Wer kocht?</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {members.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name}
                    icon="chef-hat"
                    selected={cookId === member.id}
                    testID={`cook-${member.id}`}
                    onPress={() => setCookId(cookId === member.id ? undefined : member.id)}
                  />
                ))}
              </View>
            </View>
          </Stack>
        ) : null}

        {mode === 'restaurant' && !restaurant ? (
          <Stack gap={10}>
            <TextField
              value={restaurantQuery}
              onChangeText={setRestaurantQuery}
              placeholder="Restaurant suchen"
              accessibilityLabel="Restaurant suchen"
              round
              left={<Icon name="search" size={19} color="muted" />}
              testID="add-entry-restaurant-search"
            />
            {restaurants.length === 0 ? (
              <Text color="muted">
                Noch keine Restaurants. Leg sie unter Essen → Restaurants an.
              </Text>
            ) : restaurantResults.length === 0 ? (
              <Text color="muted">Kein Restaurant gefunden.</Text>
            ) : (
              <List>
                {restaurantResults.slice(0, MAX_RESULTS).map((candidate) => (
                  <ListRow
                    key={candidate.id}
                    title={candidate.name}
                    subtitle={restaurantSubtitle(candidate)}
                    leading={<Photo placeholderIcon="utensils" width={44} height={44} />}
                    onPress={() => chooseRestaurant(candidate)}
                    testID={`add-entry-restaurant-${candidate.id}`}
                  />
                ))}
              </List>
            )}
          </Stack>
        ) : null}

        {mode === 'restaurant' && restaurant ? (
          <Stack gap={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Photo placeholderIcon="utensils" width={52} height={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="cardTitle">{restaurant.name}</Text>
                {restaurantSubtitle(restaurant) ? (
                  <Text variant="small" color="muted">
                    {restaurantSubtitle(restaurant)}
                  </Text>
                ) : null}
              </View>
              <Button
                label="Ändern"
                variant="link"
                size="sm"
                testID="add-entry-restaurant-back"
                onPress={() => setRestaurantId(undefined)}
              />
            </View>
            <EaterPicker
              members={members}
              eaterIds={eaterIds}
              guests={guests}
              onEaters={setEaterIds}
              onGuests={setGuests}
            />
          </Stack>
        ) : null}

        {mode === 'text' ? (
          <TextField
            label="Was gibt es?"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(undefined);
            }}
            placeholder="z. B. Essen bei Oma"
            error={error}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveText}
            testID="add-entry-text"
          />
        ) : null}

        {mode === 'leftovers' ? (
          leftoverSources.length === 0 ? (
            <Text color="muted">
              Diese Woche gab es davor noch nichts, von dem Reste übrig sein könnten.
            </Text>
          ) : (
            <Stack gap={8}>
              <Label>Reste wovon?</Label>
              <List>
                {leftoverSources.map((source) => (
                  <ListRow
                    key={source.id}
                    title={entryTitle(source, recipesById, entries)}
                    subtitle={source.date ? dayLabel(source.date) : undefined}
                    disabled={online.disabled}
                    onPress={() => saveLeftovers(source.id)}
                    testID={`add-entry-leftover-${source.id}`}
                  />
                ))}
              </List>
            </Stack>
          )
        ) : null}
      </Stack>
    </Sheet>
  );
}
