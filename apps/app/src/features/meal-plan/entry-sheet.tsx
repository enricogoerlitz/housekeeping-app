import {
  movePlanEntry,
  removePlanEntry,
  snapshot,
  updatePlanEntry,
  useHousehold,
  useMembers,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import type { Id, ISODate } from '@housekeeping/core';
import { Button, Chip, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { View } from 'react-native';

import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { dayLabel, entryTitle } from './labels';

function Label(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** Actions for one dish in the plan: open the recipe or restaurant, move, change the cook, remove. */
export function EntrySheet(props: { entryId: Id; weekDates: ISODate[]; onClose: () => void }) {
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const members = useMembers();
  const household = useHousehold();
  const online = useOnlineOnly();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const entry = entries.find((candidate) => candidate.id === props.entryId);
  if (!entry) return null;
  const title = entryTitle(entry, recipesById, entries, restaurantsById);

  const move = (date: ISODate | null, slotId?: Id) => {
    movePlanEntry(entry.id, date, slotId);
    toast.show({
      message: date ? `„${title}“ liegt jetzt auf ${dayLabel(date)}` : `„${title}“ ist vorgemerkt`,
    });
    props.onClose();
  };

  const remove = () => {
    const restore = snapshot();
    removePlanEntry(entry.id);
    props.onClose();
    toast.show({
      message: `„${title}“ entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  return (
    <Sheet visible onClose={props.onClose} title={title} testID="entry-sheet">
      <Stack gap={20}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        {entry.recipeId && entry.kind === 'recipe' ? (
          <Button
            label="Rezept öffnen"
            icon="book-open"
            variant="secondary"
            testID="entry-open-recipe"
            onPress={() => {
              const recipeId = entry.recipeId;
              props.onClose();
              if (recipeId) openRecipe(recipeId);
            }}
          />
        ) : null}
        {entry.restaurantId && entry.kind === 'restaurant' ? (
          <Button
            label="Restaurant öffnen"
            icon="utensils"
            variant="secondary"
            testID="entry-open-restaurant"
            onPress={() => {
              const restaurantId = entry.restaurantId;
              props.onClose();
              if (restaurantId) openRestaurant(restaurantId);
            }}
          />
        ) : null}
        <View>
          <Label>Verschieben</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {props.weekDates.map((date) => (
              <Chip
                key={date}
                label={dayLabel(date)}
                selected={entry.date === date}
                disabled={online.disabled}
                testID={`entry-move-${date}`}
                onPress={() => move(date)}
              />
            ))}
            <Chip
              label="Vormerken"
              icon="bookmark"
              selected={entry.date === null}
              disabled={online.disabled}
              testID="entry-move-later"
              onPress={() => move(null)}
            />
          </View>
        </View>
        {household.mealSlots.length > 1 ? (
          <View>
            <Label>Mahlzeit</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {household.mealSlots.map((slot) => (
                <Chip
                  key={slot.id}
                  label={slot.name}
                  selected={entry.slotId === slot.id}
                  disabled={online.disabled}
                  testID={`entry-slot-${slot.id}`}
                  onPress={() => move(entry.date, slot.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {entry.kind === 'restaurant' ? null : (
          <View>
            <Label>Wer kocht?</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {members.map((member) => (
                <Chip
                  key={member.id}
                  label={member.name}
                  icon="chef-hat"
                  selected={entry.cookId === member.id}
                  disabled={online.disabled}
                  testID={`entry-sheet-cook-${member.id}`}
                  onPress={() =>
                    updatePlanEntry(entry.id, {
                      cookId: entry.cookId === member.id ? undefined : member.id,
                    })
                  }
                />
              ))}
            </View>
          </View>
        )}
        <Button
          label="Aus dem Plan nehmen"
          icon="trash"
          variant="ghost"
          disabled={online.disabled}
          hint={online.hint}
          testID="entry-remove"
          onPress={remove}
        />
      </Stack>
    </Sheet>
  );
}
