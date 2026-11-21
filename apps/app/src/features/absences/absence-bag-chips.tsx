import {
  createPackingBag,
  useAbsences,
  useMembersById,
  usePackingBags,
  usePackingListBags,
} from '@housekeeping/api';
import { bagChipOrder, validateBagName, type Id } from '@housekeeping/core';
import { Chip, IconButton, Text, TextField } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { messageOf } from '@/features/packing/packing-labels';

/**
 * "Reisetaschen (optional)" in the absence window, only when entering one (spec 0012, AC-012,
 * decision 10): every Reisetasche as a chip, the one used last first, none chosen; "+ Neue"
 * creates a bag without Packstücke and chooses it, or chooses the bag that has the name already
 * (AC-013).
 */
export function AbsenceBagChips(props: {
  selected: Id[];
  onChange: (ids: Id[]) => void;
  disabled: boolean;
}) {
  const bags = usePackingBags();
  const listBags = usePackingListBags();
  const absences = useAbsences();
  const membersById = useMembersById();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const chips = bagChipOrder(bags, listBags, absences);
  const choose = (id: Id) => {
    if (!props.selected.includes(id)) props.onChange([...props.selected, id]);
  };
  const toggle = (id: Id) =>
    props.onChange(
      props.selected.includes(id)
        ? props.selected.filter((candidate) => candidate !== id)
        : [...props.selected, id],
    );

  const create = () => {
    if (props.disabled) return;
    const problem = validateBagName(name, bags);
    if (problem?.kind === 'taken') {
      choose(problem.existing.id);
    } else if (problem) {
      setError(problem.message);
      return;
    } else {
      try {
        choose(createPackingBag({ name }));
      } catch (failure) {
        setError(messageOf(failure));
        return;
      }
    }
    setNaming(false);
    setName('');
  };

  return (
    <View testID="absence-bags" style={{ gap: 8 }}>
      <Text variant="smallStrong">Reisetaschen (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chips.map((bag) => {
          const owner = bag.memberId ? membersById[bag.memberId] : undefined;
          return (
            <Chip
              key={bag.id}
              label={owner ? `${bag.name} (${owner.name})` : bag.name}
              selected={props.selected.includes(bag.id)}
              onPress={() => toggle(bag.id)}
              disabled={props.disabled}
              testID={`absence-bag-${bag.id}`}
            />
          );
        })}
        <Chip
          label="Neue"
          icon="plus"
          selected={naming}
          onPress={() => {
            setNaming(!naming);
            setError(undefined);
          }}
          disabled={props.disabled}
          accessibilityLabel="Neue Reisetasche"
          testID="absence-bag-new"
        />
      </View>
      {naming ? (
        <TextField
          accessibilityLabel="Name der neuen Reisetasche"
          placeholder="Neue Reisetasche, z. B. Camping"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(undefined);
          }}
          error={error}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={create}
          editable={!props.disabled}
          testID="absence-bag-new-name"
          right={
            <IconButton
              icon="check"
              label="Anlegen"
              disabled={props.disabled}
              onPress={create}
              testID="absence-bag-new-save"
            />
          }
        />
      ) : null}
      {chips.length === 0 && !naming ? (
        <Text variant="caption" color="muted">
          Noch keine Reisetaschen. Mit „Neue“ legst du eine an.
        </Text>
      ) : null}
    </View>
  );
}
