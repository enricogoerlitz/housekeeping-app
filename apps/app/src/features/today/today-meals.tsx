import {
  photoSource,
  useMembersById,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  formatLongDate,
  type ISODate,
  type MealPlanEntry,
  type Recipe,
  type Restaurant,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Icon,
  MediaCard,
  Row,
  Section,
  Stack,
  Text,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet } from '@/features/restaurants/route-sheet';

export interface TodayMealsProps {
  entries: MealPlanEntry[];
  /** Plan entries of tomorrow, for the lead-time hints. */
  tomorrowEntries: MealPlanEntry[];
  slotNames: Record<string, string>;
}

/** "Essen heute": every dish planned for today, several per meal (AC-017, AC-048). */
export function TodayMeals(props: TodayMealsProps) {
  const router = useRouter();
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const [routeFor, setRouteFor] = useState<Restaurant | undefined>();
  const twoColumns = !isPhone || theme.shape.media === 'photoTop';

  const prep = props.tomorrowEntries.flatMap((entry) => {
    const recipe =
      entry.recipeId && entry.kind === 'recipe' ? recipesById[entry.recipeId] : undefined;
    return recipe?.leadTime ? [{ entry, recipe, text: recipe.leadTime.text }] : [];
  });

  return (
    <Section title="Essen heute" tone="essen" testID="today-meals">
      {props.entries.length === 0 ? (
        <Stack gap={10}>
          <Text color="muted">Für heute ist noch nichts geplant.</Text>
          <Button
            label="Planen"
            icon="calendar-plus"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/plan')}
            testID="today-plan"
          />
        </Stack>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {props.entries.map((entry) => {
            const recipe = entry.recipeId ? recipesById[entry.recipeId] : undefined;
            const restaurant =
              entry.kind === 'restaurant' && entry.restaurantId
                ? restaurantsById[entry.restaurantId]
                : undefined;
            return (
              <View key={entry.id} style={{ width: twoColumns ? '48%' : '100%', flexGrow: 1 }}>
                {restaurant ? (
                  <MediaCard
                    testID={`today-meal-${entry.id}`}
                    kicker={`${props.slotNames[entry.slotId] ?? ''} · Restaurant`}
                    title={restaurant.name}
                    meta={restaurant.cuisine}
                    placeholderIcon="utensils"
                    onPress={() => openRestaurant(restaurant.id)}
                    corner={
                      <Button
                        label="Route"
                        icon="map-pin"
                        size="sm"
                        variant="secondary"
                        onPress={() => setRouteFor(restaurant)}
                        testID={`today-route-${entry.id}`}
                      />
                    }
                  />
                ) : (
                  <MealCard
                    entry={entry}
                    recipe={recipe}
                    slotName={props.slotNames[entry.slotId] ?? ''}
                    onPress={recipe ? () => openRecipe(recipe.id) : undefined}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
      {prep.length > 0 ? (
        <View testID="today-prep" style={{ marginTop: 14, gap: 6 }}>
          {prep.map((item) => (
            <Row key={item.entry.id} gap={8} align="flex-start">
              <Icon name="alarm-clock" size={18} color="accent" />
              <Text style={{ flex: 1 }} testID={`today-prep-${item.entry.id}`}>
                <Text variant="bodyStrong">Für morgen: </Text>
                {item.text}
                <Text color="muted"> · {item.recipe.title}</Text>
              </Text>
            </Row>
          ))}
        </View>
      ) : null}
      {routeFor ? (
        <RouteSheet restaurant={routeFor} visible onClose={() => setRouteFor(undefined)} />
      ) : null}
    </Section>
  );
}

function MealCard(props: {
  entry: MealPlanEntry;
  recipe?: Recipe;
  slotName: string;
  onPress?: () => void;
}) {
  const { entry, recipe } = props;
  const membersById = useMembersById();
  const planEntries = usePlanEntries();
  const cook = entry.cookId ? membersById[entry.cookId] : undefined;
  const leftovers = entry.kind === 'leftovers';
  const source = leftovers
    ? planEntries.find((candidate) => candidate.id === entry.leftoversOfEntryId)
    : undefined;

  const kicker = leftovers
    ? `${props.slotName} · Reste`
    : recipe?.totalMinutes !== undefined
      ? `${props.slotName} · ${recipe.totalMinutes} Min`
      : props.slotName;

  const meta = cook ? (
    <Row gap={6}>
      <Avatar name={cook.name} color={cook.color} size="xs" />
      <Text variant="caption" color="muted">
        {cook.name} kocht
      </Text>
    </Row>
  ) : source?.date ? (
    `von ${weekdayName(source.date)}`
  ) : undefined;

  return (
    <MediaCard
      testID={`today-meal-${entry.id}`}
      kicker={kicker}
      title={recipe?.title ?? entry.text ?? 'Essen'}
      meta={meta}
      image={photoSource(recipe?.photo)}
      placeholderIcon="utensils"
      onPress={props.onPress}
    />
  );
}

function weekdayName(date: ISODate): string {
  return formatLongDate(date).split(',')[0] ?? '';
}
