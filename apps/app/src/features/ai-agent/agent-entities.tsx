import { useAgentProposalData, usePhoto, useRecipeImage } from '@housekeeping/api';
import type { Activity, AgentExtra, Recipe, Restaurant } from '@housekeeping/core';
import { MediaCard, ScrollRow, Text, useBreakpoint, useTheme } from '@housekeeping/ui';
import { View } from 'react-native';

import { useOpenActivity } from '@/features/activities/navigation';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';

// Preview feedback 28.11.: the household's own entries the agent shows (show_entities) — cards
// from the app's own data (photo, title, a line of what matters), one card alone, several as a
// row like the place cards. A tap opens the entry in the app. An entry gone meanwhile is left out.

const CARD_WIDTH = 220;
const COURSE: Record<string, string> = {
  breakfast: 'Frühstück',
  main: 'Hauptgericht',
  side: 'Beilage',
  dessert: 'Dessert',
  snack: 'Snack',
  drink: 'Getränk',
};

function RecipeCard(props: { recipe: Recipe; testID: string }) {
  const { recipe } = props;
  const image = useRecipeImage(recipe);
  const open = useOpenRecipe();
  const collection = recipe.kind === 'collection';
  // A collection says so in its badge; its line stays empty.
  const meta = collection
    ? ''
    : [
        recipe.course ? COURSE[recipe.course] : '',
        recipe.totalMinutes ? `${recipe.totalMinutes} Min.` : '',
      ]
        .filter(Boolean)
        .join(' · ');
  return (
    <MediaCard
      title={recipe.title}
      meta={meta || undefined}
      image={image}
      placeholderIcon={collection ? 'folder-open' : 'utensils'}
      layout="photoTop"
      photoAspectRatio={4 / 3}
      badge={{
        label: collection ? 'Sammlung' : 'Rezept',
        icon: collection ? 'folder-open' : 'chef-hat',
      }}
      onPress={() => open(recipe.id)}
      testID={props.testID}
    />
  );
}

const stars = (ratings: Record<string, number>) => {
  const values = Object.values(ratings);
  if (values.length === 0) return '';
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `★ ${average.toLocaleString('de-DE', { maximumFractionDigits: 1 })}`;
};

function PlaceEntityCard(props: {
  place: Restaurant | Activity;
  kind: 'restaurant' | 'activity';
  testID: string;
}) {
  const { place, kind } = props;
  const photo = usePhoto(place.photoPath);
  const openRestaurant = useOpenRestaurant();
  const openActivity = useOpenActivity();
  const meta = [
    stars(place.ratings),
    kind === 'restaurant' ? ((place as Restaurant).cuisine ?? '') : '',
    kind === 'activity' && (place as Activity).remembered ? 'Gemerkt' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <MediaCard
      title={place.name}
      meta={meta || undefined}
      image={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon={kind === 'restaurant' ? 'utensils' : 'mountain'}
      layout="photoTop"
      photoAspectRatio={4 / 3}
      badge={{ label: kind === 'restaurant' ? 'Restaurant' : 'Aktivität' }}
      onPress={() => (kind === 'restaurant' ? openRestaurant(place.id) : openActivity(place.id))}
      testID={props.testID}
    />
  );
}

export function AgentEntities(props: {
  extra: Extract<AgentExtra, { kind: 'entities' }>;
  testID: string;
}) {
  const data = useAgentProposalData();
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  if (!data) return null;
  const cards = props.extra.items.flatMap((item, index) => {
    const testID = `${props.testID}-${index}`;
    if (item.kind === 'recipe' || item.kind === 'collection') {
      const recipe = data.recipes.find((row) => row.id === item.id);
      return recipe ? [<RecipeCard key={item.id} recipe={recipe} testID={testID} />] : [];
    }
    const rows: readonly (Restaurant | Activity)[] =
      item.kind === 'restaurant' ? data.restaurants : data.activities;
    const place = rows.find((row) => row.id === item.id);
    return place
      ? [<PlaceEntityCard key={item.id} place={place} kind={item.kind} testID={testID} />]
      : [];
  });
  if (cards.length === 0) return null;
  return (
    <View style={{ gap: 8 }} testID={props.testID}>
      {props.extra.title ? <Text variant="smallStrong">{props.extra.title}</Text> : null}
      <View style={isPhone ? { marginRight: -theme.shape.gutter } : null}>
        <ScrollRow
          gap={10}
          contentStyle={{ alignItems: 'stretch', paddingRight: isPhone ? theme.shape.gutter : 0 }}
          testID={`${props.testID}-row`}
        >
          {cards.map((card) => (
            <View key={card.key} style={{ width: CARD_WIDTH }}>
              {card}
            </View>
          ))}
        </ScrollRow>
      </View>
    </View>
  );
}
