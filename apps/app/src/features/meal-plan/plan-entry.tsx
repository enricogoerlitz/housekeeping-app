import {
  photoSource,
  useArticlesById,
  useMembersById,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import { variantSummary, type MealPlanEntry } from '@housekeeping/core';
import {
  Avatar,
  AvatarStack,
  Icon,
  Notice,
  Photo,
  Surface,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { entryTitle, misfitMembers, misfitText } from './labels';

/** Everything a plan entry shows, resolved once for both layouts. */
function useEntryView(entry: MealPlanEntry) {
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const membersById = useMembersById();
  const articlesById = useArticlesById();
  const entries = usePlanEntries();
  const recipe = entry.recipeId ? recipesById[entry.recipeId] : undefined;
  const title = entryTitle(entry, recipesById, entries, restaurantsById);
  const variants = entry.kind === 'recipe' && recipe ? variantSummary(entry, recipe) : '';
  const misfits = misfitMembers(entry, recipe, membersById, articlesById);
  const eaters = entry.eaterIds.flatMap((id) => membersById[id] ?? []);
  const cook = entry.cookId ? membersById[entry.cookId] : undefined;
  return { recipe, title, variants, misfits, eaters, cook };
}

function People(props: { entry: MealPlanEntry }) {
  const { eaters, cook } = useEntryView(props.entry);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {cook ? (
        <View
          testID={`entry-cook-${props.entry.id}`}
          accessibilityLabel={`${cook.name} kocht`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
        >
          <Icon name="chef-hat" size={14} color="muted" />
          <Avatar name={cook.name} color={cook.color} size="xs" />
        </View>
      ) : null}
      {eaters.length > 0 ? <AvatarStack members={eaters} size="xs" /> : null}
      {props.entry.guests > 0 ? (
        <Text variant="caption" color="muted">
          +{props.entry.guests} {props.entry.guests === 1 ? 'Gast' : 'Gäste'}
        </Text>
      ) : null}
    </View>
  );
}

/** "Restaurant" with its symbol, so a visit never reads like a free-text dish (spec 0002, AC-011). */
function RestaurantMark(props: { entry: MealPlanEntry }) {
  if (props.entry.kind !== 'restaurant') return null;
  return (
    <View
      testID={`entry-restaurant-${props.entry.id}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <Icon name="utensils" size={13} color="muted" />
      <Text variant="caption" color="muted">
        Restaurant
      </Text>
    </View>
  );
}

function placeholderIcon(entry: MealPlanEntry) {
  if (entry.kind === 'recipe') return 'cooking-pot';
  if (entry.kind === 'leftovers') return 'refresh-cw';
  return 'utensils';
}

/** A dish in the plan as a row (phone, tablet and "Vorgemerkt"). */
export function PlanEntryRow(props: { entry: MealPlanEntry; onPress: () => void }) {
  const theme = useTheme();
  const { recipe, title, variants, misfits } = useEntryView(props.entry);
  const id = props.entry.id;
  return (
    <Pressable
      testID={`entry-${id}`}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={props.onPress}
      style={(state) => ({
        opacity: state.pressed ? 0.7 : 1,
        borderRadius: theme.shape.radius.card,
      })}
    >
      <Surface padding={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Photo
          source={photoSource(recipe?.photo)}
          placeholderIcon={placeholderIcon(props.entry)}
          width={52}
          height={52}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="rowTitle" numberOfLines={2}>
            {title}
          </Text>
          <RestaurantMark entry={props.entry} />
          {variants ? (
            <Text variant="small" color="muted" testID={`entry-variants-${id}`}>
              {variants}
            </Text>
          ) : null}
          {misfits.length > 0 ? (
            <Notice testID={`entry-misfit-${id}`} text={misfitText(misfits)} />
          ) : null}
          <People entry={props.entry} />
        </View>
      </Surface>
    </Pressable>
  );
}

/** A dish as a compact card in the desktop week grid. */
export function PlanEntryCard(props: { entry: MealPlanEntry; onPress: () => void }) {
  const theme = useTheme();
  const { recipe, title, variants, misfits } = useEntryView(props.entry);
  const id = props.entry.id;
  return (
    <Pressable
      testID={`entry-${id}`}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={props.onPress}
      style={(state) => ({
        opacity: state.pressed ? 0.7 : 1,
        borderRadius: theme.shape.radius.card,
      })}
    >
      <Surface padding={0} style={{ overflow: 'hidden' }}>
        {recipe?.photo ? <Photo source={photoSource(recipe.photo)} height={64} radius={0} /> : null}
        <View style={{ padding: 8, gap: 4 }}>
          <Text variant="smallStrong" numberOfLines={3}>
            {title}
          </Text>
          <RestaurantMark entry={props.entry} />
          {variants ? (
            <Text variant="caption" color="muted" testID={`entry-variants-${id}`}>
              {variants}
            </Text>
          ) : null}
          {misfits.length > 0 ? (
            <Notice testID={`entry-misfit-${id}`} text={misfitText(misfits)} />
          ) : null}
          <People entry={props.entry} />
        </View>
      </Surface>
    </Pressable>
  );
}
