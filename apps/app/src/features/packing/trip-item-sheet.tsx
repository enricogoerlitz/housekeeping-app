import {
  removePackingItem,
  snapshot,
  updatePackingItem,
  usePackingBagItems,
  usePackingBags,
  usePackingItems,
  usePackingListBags,
  useTrips,
} from '@housekeeping/api';
import {
  MAX_PACKING_COUNT,
  packingItemLabel,
  sourceBag,
  tripDays,
  type Id,
} from '@housekeeping/core';
import { Button, Row, Sheet, Stack, SwitchRow, Text, TextField, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { Stepper } from '@/features/chores/stepper';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './packing-labels';

const countText = (count: number, perDay: boolean) =>
  count === 0 ? 'ohne Anzahl' : perDay ? `${count} je Tag` : `${count}×`;

/**
 * A Packstück of the packing list (spec 0022, REQ-009, AC-028 to AC-030): "Name", "Anzahl" (none
 * or 1–99), "je Tag" with the trip's duration, "Entfernen", "Speichern"; it stays packed. From an
 * existing Reisetasche the switch "Auch in der Reisetasche „Strand“ ändern" changes the template
 * too, one added by hand "… speichern" adds it there. Online only; packing goes on offline.
 */
export function TripItemSheet(props: { itemId: Id; onClose: () => void }) {
  const online = useOnlineOnly();
  const items = usePackingItems();
  const listBags = usePackingListBags();
  const trips = useTrips();
  const bags = usePackingBags();
  const bagItems = usePackingBagItems();
  const item = items.find((candidate) => candidate.id === props.itemId);
  const listBag = listBags.find((candidate) => candidate.id === item?.listBagId);
  const trip = trips.find((candidate) => candidate.id === listBag?.tripId);
  const [name, setName] = useState(item?.name ?? '');
  const [count, setCount] = useState(item?.perDay ?? item?.quantity ?? 0);
  const [perDay, setPerDay] = useState(item?.perDay !== undefined);
  const [alsoInBag, setAlsoInBag] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!item || !listBag || !trip) return null;

  const template = sourceBag(listBag, bags);
  const linked =
    item.bagItemId !== undefined && bagItems.some((candidate) => candidate.id === item.bagItemId);
  const days = tripDays(trip.from, trip.to);

  const save = () => {
    if (online.disabled) return;
    try {
      updatePackingItem(item.id, {
        name,
        count: count === 0 ? undefined : count,
        perDay,
        alsoInBag: template !== undefined && alsoInBag,
      });
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    props.onClose();
  };
  const remove = () => {
    if (online.disabled) return;
    const restore = snapshot();
    try {
      removePackingItem(item.id);
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
      title={packingItemLabel(item)}
      onClose={props.onClose}
      testID="trip-item-sheet"
      actions={{
        primary: {
          label: 'Speichern',
          onPress: save,
          disabled: online.disabled,
          hint: online.hint,
          testID: 'trip-item-save',
        },
      }}
      footer={
        <Row gap={10}>
          <Button
            label="Entfernen"
            variant="ghost"
            icon="trash"
            disabled={online.disabled}
            hint={online.hint}
            onPress={remove}
            testID="trip-item-remove"
          />
        </Row>
      }
    >
      <Stack gap={16}>
        {online.hint ? (
          <Text variant="small" color="warn" testID="trip-item-hint">
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
          testID="trip-item-name"
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
            testID="trip-item-count"
          />
        </Stack>
        <SwitchRow
          label="je Tag"
          description={`Die Anzahl gilt für jeden der ${days} Tage der Reise.`}
          value={perDay}
          disabled={online.disabled}
          onValueChange={(value) => {
            setPerDay(value);
            if (value && count === 0) setCount(1);
            setError(undefined);
          }}
          testID="trip-item-per-day"
        />
        {template ? (
          <SwitchRow
            label={
              linked
                ? `Auch in der Reisetasche „${template.name}“ ändern`
                : `Auch in der Reisetasche „${template.name}“ speichern`
            }
            value={alsoInBag}
            onValueChange={setAlsoInBag}
            disabled={online.disabled}
            testID="trip-item-also"
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}
