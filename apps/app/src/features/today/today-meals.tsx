import {
  useActivitiesById,
  useMembersById,
  usePhoto,
  usePlanEntries,
  useRecipeImage,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  formatLongDate,
  withNote,
  type Activity,
  type ISODate,
  type MealPlanEntry,
  type Recipe,
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

import { hasPlace } from '@/features/activities/labels';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet, type RouteTarget } from '@/features/restaurants/route-sheet';

export interface TodayMealsProps {
  /** Today's plan entries in the order of the day (Tageszeit, then kind). */
  entries: MealPlanEntry[];
  /** Plan entries of tomorrow, for the lead-time hints. */
  tomorrowEntries: MealPlanEntry[];
  slotNames: Record<string, string>;
}

const BADGES = {
  recipe: { label: 'Rezept', icon: 'cooking-pot' },
  restaurant: { label: 'Restaurant', icon: 'utensils' },
  activity: { label: 'Aktivität', icon: 'mountain' },
} as const;

/**
 * The card's Kennzeichen (AC-019): leftovers are a recipe too; free text ("Pizza bestellen") has
 * none, it may be anything.
 */
function badgeFor(entry: MealPlanEntry) {
  const kind = entry.kind === 'leftovers' ? 'recipe' : entry.kind;
  return kind === 'text' ? undefined : { ...BADGES[kind], testID: `today-badge-${entry.id}` };
}

/**
 * "Heute geplant": everything planned for today — recipes, restaurants and activities — in the
 * order of the day, each card with its kind (spec 0004, AC-019; spec 0001, AC-017, AC-048).
 */
export function TodayMeals(props: TodayMealsProps) {
  const router = useRouter();
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const [routeFor, setRouteFor] = useState<RouteTarget | undefined>();
  const twoColumns = !isPhone || theme.shape.media === 'photoTop';

  const prep = props.tomorrowEntries.flatMap((entry) => {
    const recipe =
      entry.recipeId && entry.kind === 'recipe' ? recipesById[entry.recipeId] : undefined;
    return recipe?.leadTime ? [{ entry, recipe, text: recipe.leadTime.text }] : [];
  });

  const card = (entry: MealPlanEntry) => {
    const slotName = props.slotNames[entry.slotId] ?? '';
    const restaurant =
      entry.kind === 'restaurant' && entry.restaurantId
        ? restaurantsById[entry.restaurantId]
        : undefined;
    const activity =
      entry.kind === 'activity' && entry.activityId ? activitiesById[entry.activityId] : undefined;
    if (restaurant) {
      return (
        <MediaCard
          testID={`today-meal-${entry.id}`}
          kicker={slotName}
          badge={badgeFor(entry)}
          title={restaurant.name}
          meta={restaurant.cuisine}
          placeholderIcon="utensils"
          onPress={() => openRestaurant(restaurant.id)}
          corner={<RouteButton entryId={entry.id} onPress={() => setRouteFor(restaurant)} />}
        />
      );
    }
    if (entry.kind === 'activity') {
      return (
        <ActivityCard
          entry={entry}
          activity={activity}
          slotName={slotName}
          onPress={
            activity
              ? () =>
                  router.push(
                    { pathname: '/kalender/aktivitaet/[id]', params: { id: activity.id } },
                    // The plan stays underneath, so a tap on "Plan" leads to it (spec 0005).
                    { withAnchor: true },
                  )
              : undefined
          }
          onRoute={
            activity && hasPlace(activity)
              ? () =>
                  setRouteFor({
                    name: activity.name,
                    address: activity.address,
                    location: activity.location,
                    placeName: activity.placeName,
                  })
              : undefined
          }
        />
      );
    }
    const recipe = entry.recipeId ? recipesById[entry.recipeId] : undefined;
    return (
      <MealCard
        entry={entry}
        recipe={recipe}
        slotName={slotName}
        onPress={recipe ? () => openRecipe(recipe.id) : undefined}
      />
    );
  };

  return (
    <Section title="Heute geplant" testID="today-meals">
      {props.entries.length === 0 ? (
        <Stack gap={10}>
          <Text color="muted">Für heute ist noch nichts geplant.</Text>
          <Button
            label="Planen"
            icon="calendar-plus"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/kalender')}
            testID="today-plan"
          />
        </Stack>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {props.entries.map((entry) => (
            <View key={entry.id} style={{ width: twoColumns ? '48%' : '100%', flexGrow: 1 }}>
              {card(entry)}
            </View>
          ))}
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

function RouteButton(props: { entryId: string; onPress: () => void }) {
  return (
    <Button
      label="Route"
      icon="map-pin"
      size="sm"
      variant="secondary"
      onPress={props.onPress}
      testID={`today-route-${props.entryId}`}
    />
  );
}

/** An activity of today: its own photo, "Eislaufen (Hohenschönhausen)", the place (AC-019). */
function ActivityCard(props: {
  entry: MealPlanEntry;
  activity?: Activity;
  slotName: string;
  onPress?: () => void;
  /** Only when the activity has a place (AC-014, AC-015). */
  onRoute?: () => void;
}) {
  const { entry, activity } = props;
  const photo = usePhoto(activity?.photoPath);
  return (
    <MediaCard
      testID={`today-meal-${entry.id}`}
      kicker={props.slotName}
      badge={badgeFor(entry)}
      title={withNote(activity?.name ?? entry.text ?? 'Aktivität', entry.note)}
      meta={activity?.placeName ?? activity?.address}
      image={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon="mountain"
      onPress={props.onPress}
      corner={
        props.onRoute ? <RouteButton entryId={entry.id} onPress={props.onRoute} /> : undefined
      }
    />
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
  const image = useRecipeImage(recipe);
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
      badge={badgeFor(entry)}
      title={recipe?.title ?? entry.text ?? 'Essen'}
      meta={meta}
      image={image}
      placeholderIcon="utensils"
      onPress={props.onPress}
    />
  );
}

function weekdayName(date: ISODate): string {
  return formatLongDate(date).split(',')[0] ?? '';
}
