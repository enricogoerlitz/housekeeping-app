import {
  createPackingBag,
  removePackingBagItem,
  renamePackingBag,
  snapshot,
  updatePackingBagItem,
  usePackingBagItems,
  usePackingBags,
} from '@housekeeping/api';
import {
  bagItemLabel,
  MAX_PACKING_COUNT,
  validateBagName,
  type Id,
  type PackingBag,
} from '@housekeeping/core';
import { Button, Row, Sheet, Stack, SwitchRow, Text, TextField, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { Stepper } from '@/features/chores/stepper';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './packing-labels';

/**
 * "+ Neue Reisetasche" and ✎ "Umbenennen" (AC-007): the name is checked against the household's
 * bags before anything is sent. "Gibt es schon: Strand" offers "Öffnen" of that bag; an empty
 * name shows "Name fehlt" at the field and creates nothing.
 */
export function BagNameSheet(props: {
  /** The bag to rename; without it a new bag is created. */
  bag?: PackingBag;
  /** After creating (the new id) or renaming (the bag's id). */
  onSaved: (bagId: Id) => void;
  /** "Öffnen" of the bag that already has the name. */
  onOpenExisting: (bagId: Id) => void;
  onClose: () => void;
}) {
  const bags = usePackingBags();
  const online = useOnlineOnly();
  const [name, setName] = useState(props.bag?.name ?? '');
  const [error, setError] = useState<{ message: string; existing?: PackingBag } | undefined>();
  const renaming = props.bag !== undefined;
  const testID = renaming ? 'bag-rename-sheet' : 'bag-new-sheet';

  const submit = () => {
    if (online.disabled) return;
    const problem = validateBagName(name, bags, props.bag?.id);
    if (problem) {
      setError({
        message: problem.message,
        existing: problem.kind === 'taken' ? problem.existing : undefined,
      });
      return;
    }
    try {
      if (props.bag) {
        renamePackingBag(props.bag.id, name);
        props.onSaved(props.bag.id);
      } else {
        props.onSaved(createPackingBag({ name }));
      }
    } catch (caught) {
      setError({ message: messageOf(caught) });
    }
  };

  return (
    <Sheet
      visible
      size="s"
      title={renaming ? 'Reisetasche umbenennen' : 'Neue Reisetasche'}
      onClose={props.onClose}
      testID={testID}
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="Abbrechen"
            variant="secondary"
            onPress={props.onClose}
            testID={`${testID}-cancel`}
          />
          <Button
            label={renaming ? 'Speichern' : 'Anlegen'}
            disabled={online.disabled}
            hint={online.hint}
            onPress={submit}
            testID={`${testID}-save`}
          />
        </Row>
      }
    >
      <Stack gap={8}>
        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(undefined);
          }}
          placeholder="z. B. Strand"
          error={error?.message}
          hint={online.hint}
          editable={!online.disabled}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
          testID={`${testID}-name`}
        />
        {error?.existing ? (
          <Row>
            <Button
              label="Öffnen"
              variant="link"
              icon="arrow-right"
              onPress={() => {
                if (error.existing) props.onOpenExisting(error.existing.id);
              }}
              testID={`${testID}-open-existing`}
            />
          </Row>
        ) : null}
      </Stack>
    </Sheet>
  );
}

const countText = (count: number, perDay: boolean) =>
  count === 0 ? 'ohne Anzahl' : perDay ? `${count} je Tag` : `${count}×`;

/**
 * A Packstück of a Reisetasche (AC-004): name, quantity (none or 1–99) and "je Tag", saved with
 * "Speichern"; "Entfernen" with 5 s "Rückgängig". "Je Tag" needs a quantity, so switching it on
 * without one starts with 1 (spec, open question 3).
 */
export function BagItemSheet(props: { itemId: Id; onClose: () => void }) {
  const items = usePackingBagItems();
  const online = useOnlineOnly();
  const item = items.find((candidate) => candidate.id === props.itemId);
  const [name, setName] = useState(item?.name ?? '');
  const [count, setCount] = useState(item?.quantity ?? 0);
  const [perDay, setPerDay] = useState(item?.perDay ?? false);
  const [error, setError] = useState<string | undefined>();
  if (!item) return null;

  const save = () => {
    try {
      updatePackingBagItem(item.id, { name, quantity: count === 0 ? null : count, perDay });
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    props.onClose();
  };
  const remove = () => {
    const restore = snapshot();
    try {
      removePackingBagItem(item.id);
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    props.onClose();
    toast.show({
      message: `${item.name} entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      duration: 5000,
    });
  };

  return (
    <Sheet
      visible
      size="m"
      title={bagItemLabel(item)}
      onClose={props.onClose}
      testID="bag-item-sheet"
      footer={
        <Row gap={10} style={{ justifyContent: 'space-between' }}>
          <Button
            label="Entfernen"
            variant="ghost"
            icon="trash"
            disabled={online.disabled}
            hint={online.hint}
            onPress={remove}
            testID="bag-item-remove"
          />
          {/* No "Abbrechen": ✕ in the title closes, so both buttons fit on a phone. */}
          <Button
            label="Speichern"
            disabled={online.disabled}
            hint={online.hint}
            onPress={save}
            testID="bag-item-save"
          />
        </Row>
      }
    >
      <Stack gap={16}>
        {online.hint ? (
          <Text variant="small" color="warn" testID="bag-item-hint">
            {online.hint}
          </Text>
        ) : null}
        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(undefined);
          }}
          error={error}
          editable={!online.disabled}
          returnKeyType="done"
          onSubmitEditing={save}
          testID="bag-item-name"
        />
        <Stack gap={6}>
          <Text variant="smallStrong" color="muted">
            Anzahl
          </Text>
          <Stepper
            value={count}
            min={perDay ? 1 : 0}
            max={MAX_PACKING_COUNT}
            onChange={(value) => {
              setCount(value);
              setError(undefined);
            }}
            format={(value) => countText(value, perDay)}
            label="Anzahl"
            testID="bag-item-count"
          />
        </Stack>
        <SwitchRow
          label="je Tag"
          description="Die Anzahl gilt für jeden Tag der Abwesenheit, z. B. 1 T-Shirt je Tag."
          value={perDay}
          disabled={online.disabled}
          onValueChange={(value) => {
            setPerDay(value);
            if (value && count === 0) setCount(1);
            setError(undefined);
          }}
          testID="bag-item-per-day"
        />
      </Stack>
    </Sheet>
  );
}
