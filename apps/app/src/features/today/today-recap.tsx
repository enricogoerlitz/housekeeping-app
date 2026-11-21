import {
  OfflineError,
  rateActivity,
  rateRecipe,
  rateRestaurant,
  updatePlanEntry,
  useActivitiesById,
  useCurrentMember,
  usePhoto,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  recapDayLabel,
  recapItems,
  type Activity,
  type ISODate,
  type Recipe,
  type RecapItem,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  List,
  ListRow,
  PhotoCollage,
  RowTransition,
  Section,
  Stars,
  Text,
  toast,
  useCheckWindow,
} from '@housekeeping/ui';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { View } from 'react-native';

import { useCoverSources } from '@/features/recipes/recipe-cover';
import { useOnlineOnly } from '@/features/shell/offline';

/** Big enough that each half of a star is a comfortable target (AC-017). */
const STAR_SIZE = 30;
const FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';

const KIND_BADGES = {
  recipe: { label: 'Rezept', icon: 'cooking-pot' },
  collection: { label: 'Sammlung', icon: 'layers' },
  restaurant: { label: 'Restaurant', icon: 'utensils' },
  activity: { label: 'Aktivität', icon: 'mountain' },
} as const;

const rowId = (item: RecapItem) => item.entry.id;

function rate(item: RecapItem, stars: number): void {
  // A collection is rated like a recipe (spec 0009, AC-030).
  if (item.kind === 'recipe' || item.kind === 'collection') rateRecipe(item.targetId, stars);
  else if (item.kind === 'restaurant') rateRestaurant(item.targetId, stars);
  else rateActivity(item.targetId, stars);
}

/**
 * "Wie war's?" (spec 0011, REQ-003), only while today is shown: what the signed-in member has not
 * rated from the last three days, in half stars. Each tap on the stars holds the row in the check
 * window (`set`); 2 s after the last tap every row is saved once with its final value and leaves
 * (AC-017, AC-019). Leaving the page saves at once. "Nicht gemacht" marks the plan entry (AC-021).
 * Nothing open: no section (AC-023).
 */
export function TodayRecap(props: { today: ISODate; slotOrder: string[] }) {
  const me = useCurrentMember();
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const online = useOnlineOnly();
  const focused = useIsFocused();
  // The value a row shows while its window runs, and after saving until the row has left, so it
  // never flickers back to the old stars.
  const [values, setValues] = useState<Record<string, number>>({});

  const items = recapItems({
    entries,
    recipesById,
    restaurantsById,
    activitiesById,
    memberId: me.id,
    today: props.today,
    slotOrder: props.slotOrder,
  });

  const check = useCheckWindow<RecapItem>({
    items,
    getId: rowId,
    isChecked: () => false,
    onSettle: (ids) => {
      for (const id of ids) {
        const item = items.find((candidate) => rowId(candidate) === id);
        const stars = values[id];
        if (!item || stars === undefined) continue;
        try {
          rate(item, stars);
        } catch (error) {
          toast.show({
            message: error instanceof OfflineError ? (online.hint ?? FAILED) : FAILED,
          });
          setValues((current) => withoutKey(current, id));
        }
      }
    },
  });

  // Switching tabs keeps the page mounted: losing focus closes the window at once (AC-030).
  const settleNow = useEffectEvent(() => check.settle());
  useEffect(() => {
    if (!focused) settleNow();
  }, [focused]);

  // Forget held values of rows that have left (saved, or gone elsewhere), so a row that comes
  // back after a refused rating shows its saved stars again.
  const shownIds = items.map(rowId).join('|');
  const [seenIds, setSeenIds] = useState(shownIds);
  if (seenIds !== shownIds) {
    setSeenIds(shownIds);
    const present = new Set(shownIds.split('|'));
    setValues((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => present.has(id))),
    );
  }

  if (check.rows.length === 0) return null;

  const onStars = (item: RecapItem, stars: number) => {
    setValues((current) => ({ ...current, [rowId(item)]: stars }));
    check.set(item, true);
  };
  const notDone = (item: RecapItem) => {
    setValues((current) => withoutKey(current, rowId(item)));
    try {
      updatePlanEntry(item.entry.id, { notCooked: true });
    } catch {
      toast.show({ message: FAILED });
    }
  };

  return (
    <Section title="Wie war’s?" testID="today-recap">
      <List>
        {check.rows.map((item) => (
          <RowTransition key={rowId(item)}>
            <RecapRow
              item={item}
              today={props.today}
              stars={values[rowId(item)] ?? item.stars ?? 0}
              recipe={
                item.kind === 'recipe' || item.kind === 'collection'
                  ? recipesById[item.targetId]
                  : undefined
              }
              activity={item.kind === 'activity' ? activitiesById[item.targetId] : undefined}
              disabled={online.disabled}
              hint={online.hint}
              onStars={(stars) => onStars(item, stars)}
              onNotDone={() => notDone(item)}
            />
          </RowTransition>
        ))}
      </List>
      {online.hint ? (
        <Text variant="small" color="muted" style={{ marginTop: 6 }} testID="today-recap-offline">
          {online.hint}
        </Text>
      ) : null}
    </Section>
  );
}

function withoutKey(values: Record<string, number>, key: string): Record<string, number> {
  return Object.fromEntries(Object.entries(values).filter(([id]) => id !== key));
}

/** One row: picture, name, kind and day, the stars, "Nicht gemacht". */
function RecapRow(props: {
  item: RecapItem;
  today: ISODate;
  stars: number;
  recipe?: Recipe;
  activity?: Activity;
  disabled: boolean;
  hint?: string;
  onStars: (stars: number) => void;
  onNotDone: () => void;
}) {
  const { item } = props;
  const id = rowId(item);
  const badge = KIND_BADGES[item.kind];
  return (
    <ListRow
      testID={`recap-${id}`}
      leading={<RecapPhoto item={item} recipe={props.recipe} activity={props.activity} />}
      title={item.title}
      subtitle={
        <View style={{ gap: 6, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Badge label={badge.label} icon={badge.icon} testID={`recap-${id}-kind`} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {recapDayLabel(item.entry.date ?? props.today, props.today)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              columnGap: 8,
            }}
          >
            <Stars
              value={props.stars}
              onChange={props.onStars}
              disabled={props.disabled}
              hint={props.hint}
              label={`Deine Bewertung für ${item.title}`}
              size={STAR_SIZE}
              testID={`recap-${id}-stars`}
            />
            <Button
              label="Nicht gemacht"
              variant="link"
              size="sm"
              disabled={props.disabled}
              hint={props.hint}
              onPress={props.onNotDone}
              testID={`recap-${id}-not-done`}
            />
          </View>
        </View>
      }
    />
  );
}

function RecapPhoto(props: { item: RecapItem; recipe?: Recipe; activity?: Activity }) {
  const recipeImages = useCoverSources(props.recipe);
  const activityPhoto = usePhoto(props.activity?.photoPath);
  const { kind } = props.item;
  const sources =
    kind === 'recipe' || kind === 'collection'
      ? recipeImages
      : kind === 'activity' && activityPhoto.uri
        ? [{ uri: activityPhoto.uri }]
        : [];
  return (
    <PhotoCollage
      sources={sources}
      width={56}
      height={56}
      placeholderIcon={
        kind === 'activity' ? 'mountain' : kind === 'collection' ? 'layers' : 'utensils'
      }
    />
  );
}
