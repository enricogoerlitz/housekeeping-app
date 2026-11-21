import {
  movePlanEntry,
  NOTE_MAX_LENGTH,
  removePlanEntry,
  snapshot,
  updatePlanEntry,
  useActivitiesById,
  useHousehold,
  useMembers,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import type { Id, ISODate } from '@housekeeping/core';
import { Button, Chip, Row, Sheet, Stack, Text, TextField, toast } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { hasPlace } from '@/features/activities/labels';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet } from '@/features/restaurants/route-sheet';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { dayLabel, entryTitle } from './labels';

function Label(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/**
 * Actions for one entry in the plan: open the recipe, restaurant or activity, the Zusatz and
 * "Route" of an activity, move, change the cook, remove.
 */
export function EntrySheet(props: { entryId: Id; weekDates: ISODate[]; onClose: () => void }) {
  const router = useRouter();
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const members = useMembers();
  const household = useHousehold();
  const online = useOnlineOnly();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const [routeOpen, setRouteOpen] = useState(false);
  const entry = entries.find((candidate) => candidate.id === props.entryId);
  if (!entry) return null;
  const title = entryTitle(entry, recipesById, entries, restaurantsById, activitiesById);
  const activity =
    entry.kind === 'activity' && entry.activityId ? activitiesById[entry.activityId] : undefined;

  if (routeOpen && activity) {
    return (
      <RouteSheet
        restaurant={{
          name: activity.name,
          address: activity.address,
          location: activity.location,
          placeName: activity.placeName,
        }}
        visible
        onClose={() => setRouteOpen(false)}
      />
    );
  }

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
    <Sheet visible onClose={props.onClose} title={title} testID="entry-sheet" size="m">
      <Stack gap={20}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        {entry.recipeId && entry.kind === 'recipe' ? (
          <Button
            label={
              recipesById[entry.recipeId]?.kind === 'collection'
                ? 'Sammlung öffnen'
                : 'Rezept öffnen'
            }
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
        {activity ? (
          <Row gap={10} wrap>
            <Button
              label="Aktivität öffnen"
              icon="mountain"
              variant="secondary"
              testID="entry-open-activity"
              onPress={() => {
                props.onClose();
                router.push({ pathname: '/kalender/aktivitaet/[id]', params: { id: activity.id } });
              }}
            />
            {hasPlace(activity) ? (
              <Button
                label="Route"
                icon="map-pin"
                variant="secondary"
                testID="entry-route"
                onPress={() => setRouteOpen(true)}
              />
            ) : null}
          </Row>
        ) : null}
        {entry.kind === 'activity' ? (
          <NoteField
            key={entry.id}
            entryId={entry.id}
            note={entry.note}
            disabled={online.disabled}
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
            <Label>Tageszeit</Label>
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
        {entry.kind === 'restaurant' || entry.kind === 'activity' ? null : (
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

/** The Zusatz of an activity in the plan, "Eislaufen (Hohenschönhausen)" (AC-013). */
function NoteField(props: { entryId: Id; note?: string; disabled: boolean }) {
  const [note, setNote] = useState(props.note ?? '');
  const [error, setError] = useState<string>();
  const changed = note.trim() !== (props.note ?? '');

  const save = () => {
    if (props.disabled || !changed) return;
    try {
      updatePlanEntry(props.entryId, { note });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
      return;
    }
    toast.show({ message: note.trim() ? 'Zusatz gespeichert' : 'Zusatz entfernt' });
  };

  return (
    <View style={{ gap: 8 }}>
      <TextField
        label="Zusatz"
        value={note}
        onChangeText={(value) => {
          setNote(value);
          if (error) setError(undefined);
        }}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="z. B. Hohenschönhausen"
        editable={!props.disabled}
        error={error}
        hint="Steht im Plan in Klammern hinter dem Namen."
        returnKeyType="done"
        onSubmitEditing={save}
        testID="entry-note-input"
      />
      {changed ? (
        <Button
          label="Zusatz speichern"
          icon="check"
          size="sm"
          variant="secondary"
          disabled={props.disabled}
          onPress={save}
          testID="entry-note-save"
        />
      ) : null}
    </View>
  );
}
