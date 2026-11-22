import {
  OfflineError,
  rateActivity,
  rateRecipe,
  rateRestaurant,
  updatePlanEntry,
  useActivitiesById,
  useCurrentMember,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  notDoneMessage,
  recapDayLabel,
  recapEarlierLabel,
  recapItems,
  type ISODate,
  type RecapItem,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  List,
  ListRow,
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

import { EntryPicture } from '@/features/meal-plan/entry-picture';
import { kindBadge } from '@/features/meal-plan/kind-badges';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

/** Big enough that each half of a star is a comfortable target (AC-017). */
const STAR_SIZE = 30;
const FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';

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
 * (AC-017, AC-019). Leaving the page saves at once. The stars start empty; an earlier own rating
 * stands faded beside them, and "Passt so" taps it (spec 0020, REQ-009). "Nicht gemacht" marks
 * the plan entry, with "Rückgängig" in the hint (spec 0020, REQ-008). Nothing open: no section.
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
      updatePlanEntry(item.entry.id, { notDone: true });
    } catch (error) {
      toast.show({
        message: error instanceof OfflineError ? (online.hint ?? FAILED) : FAILED,
      });
      return;
    }
    toast.show({
      message: notDoneMessage(item.title),
      actionLabel: 'Rückgängig',
      onAction: undoAction(() => updatePlanEntry(item.entry.id, { notDone: false })),
    });
  };

  return (
    <Section title="Wie war’s?" testID="today-recap">
      <List>
        {check.rows.map((item) => (
          <RowTransition key={rowId(item)}>
            <RecapRow
              item={item}
              today={props.today}
              stars={values[rowId(item)] ?? 0}
              disabled={online.disabled}
              hint={online.hint}
              onStars={(stars) => onStars(item, stars)}
              onKeep={item.stars === undefined ? undefined : () => onStars(item, item.stars ?? 0)}
              onNotDone={() => notDone(item)}
            />
          </RowTransition>
        ))}
      </List>
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
  disabled: boolean;
  hint?: string;
  onStars: (stars: number) => void;
  /** "Passt so": the earlier rating again; only with one (AC-040, AC-042). */
  onKeep?: () => void;
  onNotDone: () => void;
}) {
  const { item } = props;
  const id = rowId(item);
  const badge = kindBadge(item.kind);
  const earlier = recapEarlierLabel(item.stars);
  return (
    <ListRow
      testID={`recap-${id}`}
      leading={<EntryPicture entry={item.entry} width={56} height={56} />}
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
            {earlier && props.onKeep ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" color="muted" testID={`recap-${id}-earlier`}>
                  {earlier}
                </Text>
                <Button
                  label="Passt so"
                  variant="link"
                  size="sm"
                  disabled={props.disabled}
                  hint={props.hint}
                  onPress={props.onKeep}
                  testID={`recap-${id}-keep`}
                />
              </View>
            ) : null}
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
