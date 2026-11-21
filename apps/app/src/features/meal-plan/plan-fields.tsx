import type { Id, Member, Recipe, VariantSplit } from '@housekeeping/core';
import { Chip, IconButton, Notice, Text } from '@housekeeping/ui';
import { View } from 'react-native';

import { misfitText, splitSummary } from './labels';

// The fields both planning windows share (spec 0008, E11): "+ Hinzufügen" in the calendar
// (add-entry-sheet.tsx) and "Einplanen" on the recipe page (plan-recipe-sheet.tsx). Test ids are
// the calendar's, so its walk-throughs keep working.

/** A field label above chips. */
export function FieldLabel(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** "Wer isst mit?": members as chips plus a guest counter. */
export function EaterPicker(props: {
  members: Member[];
  eaterIds: Id[];
  guests: number;
  onEaters: (ids: Id[]) => void;
  onGuests: (guests: number) => void;
}) {
  const { eaterIds, guests } = props;
  return (
    <View>
      <FieldLabel>Wer isst mit?</FieldLabel>
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

/**
 * Portions, the split over the recipe's variants ("mit Tofu 1 · mit Hähnchen 1") and "Passt nicht
 * für Nadja". `testID` prefixes the split (`-split`) and the misfit (`-misfit`).
 */
export function SplitFields(props: {
  recipe: Recipe;
  split: VariantSplit;
  misfits: Member[];
  testID: string;
}) {
  const { split } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" color="muted" testID={`${props.testID}-portions`}>
        {split.portions === 1 ? '1 Portion' : `${split.portions} Portionen`}
      </Text>
      {split.variants.length > 0 ? (
        <Text variant="bodyStrong" testID={`${props.testID}-split`}>
          {splitSummary(props.recipe, split.variants)}
        </Text>
      ) : null}
      {props.misfits.length > 0 ? (
        <Notice testID={`${props.testID}-misfit`} text={misfitText(props.misfits)} />
      ) : null}
    </View>
  );
}

/** "Wer kocht?": one member or nobody (a second tap clears it). */
export function CookPicker(props: {
  members: Member[];
  cookId: Id | undefined;
  onChange: (cookId: Id | undefined) => void;
}) {
  return (
    <View>
      <FieldLabel>Wer kocht?</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {props.members.map((member) => (
          <Chip
            key={member.id}
            label={member.name}
            icon="chef-hat"
            selected={props.cookId === member.id}
            testID={`cook-${member.id}`}
            onPress={() => props.onChange(props.cookId === member.id ? undefined : member.id)}
          />
        ))}
      </View>
    </View>
  );
}
