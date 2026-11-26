import { useArticlesById, useMembers } from '@housekeeping/api';
import {
  canStepPortions,
  changeEaters,
  MAX_GUESTS,
  portionsFor,
  stepPortions,
  type Id,
  type Member,
  type PortionState,
  type Recipe,
} from '@housekeeping/core';
import { Chip, IconButton, Notice, Row, Text } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { misfitText } from './labels';

// The fields the planning windows share (spec 0008, E11; spec 0021, REQ-006): "+ Hinzufügen" in
// the calendar (add-entry-sheet.tsx), "Einplanen" on the recipe page (plan-recipe-sheet.tsx) and
// the window of an entry (entry-sheet.tsx). Test ids are the calendar's, so its walk-throughs keep
// working.

/** A field label above chips. */
export function FieldLabel(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** "Wer isst mit?": members as chips plus a guest counter (at most 100 guests). */
export function EaterPicker(props: {
  members: Member[];
  eaterIds: Id[];
  guests: number;
  onEaters: (ids: Id[]) => void;
  onGuests: (guests: number) => void;
  /** Offline: chips and counter greyed out (spec 0021, REQ-006). */
  disabled?: boolean;
  /** "Wer ist dabei?" for activities (spec 0041, REQ-005). */
  label?: string;
}) {
  const { eaterIds, guests } = props;
  return (
    <View>
      <FieldLabel>{props.label ?? 'Wer isst mit?'}</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {props.members.map((member) => {
          const selected = eaterIds.includes(member.id);
          return (
            <Chip
              key={member.id}
              label={member.name}
              selected={selected}
              disabled={props.disabled}
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
            disabled={props.disabled || guests === 0}
            testID="guests-minus"
            onPress={() => props.onGuests(Math.max(0, guests - 1))}
          />
          <Text variant="smallStrong" testID="guests-count">
            {guests === 1 ? '1 Gast' : `${guests} Gäste`}
          </Text>
          <IconButton
            icon="plus"
            label="Ein Gast mehr"
            disabled={props.disabled || guests >= MAX_GUESTS}
            testID="guests-plus"
            onPress={() => props.onGuests(Math.min(MAX_GUESTS, guests + 1))}
          />
        </View>
      </View>
    </View>
  );
}

const portionsText = (portions: number) => (portions === 1 ? '1 Portion' : `${portions} Portionen`);

/** One counter: "−", the value, "+". */
function Counter(props: {
  label: string;
  value: string;
  canMinus: boolean;
  canPlus: boolean;
  onStep: (delta: 1 | -1) => void;
  testID: string;
}) {
  return (
    <Row gap={4}>
      <Text style={{ flex: 1 }}>{props.label}</Text>
      <IconButton
        icon="minus"
        variant="soft"
        label={`${props.label}: eine weniger`}
        disabled={!props.canMinus}
        onPress={() => props.onStep(-1)}
        testID={`${props.testID}-minus`}
      />
      <Text
        variant="bodyStrong"
        style={{ minWidth: 40, textAlign: 'center' }}
        testID={`${props.testID}-value`}
      >
        {props.value}
      </Text>
      <IconButton
        icon="plus"
        variant="soft"
        label={`${props.label}: eine mehr`}
        disabled={!props.canPlus}
        onPress={() => props.onStep(1)}
        testID={`${props.testID}-plus`}
      />
    </Row>
  );
}

/**
 * "Portionen" as a counter, for a recipe with variants one counter per variant and the sum below
 * ("mit Tofu 2 · mit Hähnchen 0", "2 Portionen"), and "Passt nicht für Nadja" (spec 0021,
 * REQ-006). `testID` prefixes `-portions`, `-variant-<id>` and `-misfit`.
 */
export function PortionFields(props: {
  recipe: Recipe;
  state: PortionState;
  onChange: (state: PortionState) => void;
  misfits: Member[];
  disabled?: boolean;
  testID: string;
}) {
  const { recipe, state } = props;
  const step = (delta: 1 | -1, variantId?: Id) =>
    props.onChange(stepPortions(state, delta, variantId));
  const allowed = (delta: 1 | -1, variantId?: Id) =>
    !props.disabled && canStepPortions(state, delta, variantId);
  return (
    <View style={{ gap: 8 }}>
      {/* Without variants the counter itself says "Portionen" (spec 0031, AC-072). */}
      {state.variants.length === 0 ? null : <FieldLabel>Portionen</FieldLabel>}
      {state.variants.length === 0 ? (
        <Counter
          label="Portionen"
          value={String(state.portions)}
          canMinus={allowed(-1)}
          canPlus={allowed(1)}
          onStep={(delta) => step(delta)}
          testID={`${props.testID}-portions`}
        />
      ) : (
        <>
          {state.variants.map((row) => (
            <Counter
              key={row.variantId}
              label={recipe.variants.find((variant) => variant.id === row.variantId)?.name ?? ''}
              value={String(row.portions)}
              canMinus={allowed(-1, row.variantId)}
              canPlus={allowed(1, row.variantId)}
              onStep={(delta) => step(delta, row.variantId)}
              testID={`${props.testID}-variant-${row.variantId}`}
            />
          ))}
          <Text variant="small" color="muted" testID={`${props.testID}-portions-value`}>
            {portionsText(state.portions)}
          </Text>
        </>
      )}
      {props.misfits.length > 0 ? (
        <Notice testID={`${props.testID}-misfit`} text={misfitText(props.misfits)} />
      ) : null}
    </View>
  );
}

/**
 * Who eats and how much in a planning window (REQ-006, Decision 7): a person or guest more or less
 * changes the portions by one in her variant, counted by hand stays. `reset` starts over from the
 * eaters (another recipe or another day).
 */
export function usePortions(recipe: Recipe | undefined, initial: () => PortionState) {
  const members = useMembers();
  const articlesById = useArticlesById();
  const context = { recipe, members, articlesById };
  const [state, setState] = useState<PortionState>(initial);
  return {
    state,
    setState,
    setEaters: (eaterIds: Id[]) =>
      setState((current) => changeEaters(current, { eaterIds, guests: current.guests }, context)),
    setGuests: (guests: number) =>
      setState((current) => changeEaters(current, { eaterIds: current.eaterIds, guests }, context)),
    reset: (eaterIds: Id[], guests: number, nextRecipe: Recipe | undefined = recipe) =>
      setState(portionsFor(eaterIds, guests, { recipe: nextRecipe, members, articlesById })),
  };
}

/** "Wer kocht?": one member or nobody (a second tap clears it). */
export function CookPicker(props: {
  members: Member[];
  cookId: Id | undefined;
  onChange: (cookId: Id | undefined) => void;
  disabled?: boolean;
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
            disabled={props.disabled}
            testID={`cook-${member.id}`}
            onPress={() => props.onChange(props.cookId === member.id ? undefined : member.id)}
          />
        ))}
      </View>
    </View>
  );
}
