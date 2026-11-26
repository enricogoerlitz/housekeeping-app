import { adjustItemCount, removeShoppingItem } from '@housekeeping/api';
import { MAX_ITEM_COUNT, type Id } from '@housekeeping/core';
import { IconButton, Text, toast } from '@housekeeping/ui';
import { View } from 'react-native';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';

/**
 * "Entfernen" of an item asks first: „„Milch“ entfernen?“ (spec 0036, AC-021); only „Entfernen“
 * removes it with all its contributions. `onRemoved` runs after that.
 */
export function removeAfterAsking(itemId: Id, name: string, onRemoved?: () => void): void {
  confirmFirst({
    title: `„${name}“ entfernen?`,
    confirmLabel: 'Entfernen',
    onConfirm: () => {
      removeShoppingItem(itemId);
      toast.show({ message: `${name} entfernt` });
      onRemoved?.();
    },
    testID: 'confirm-remove-item',
  });
}

/**
 * "− 2× +" for an item with pure counts (AC-014, AC-015). Offline "+" goes through the store
 * queue like adding an item; "−" is greyed out with the offline hint (spec 0019, AC-030, AC-031).
 */
export function CountStepper(props: {
  itemId: Id;
  name: string;
  count: number;
  /** Runs after − removed the item. */
  onRemoved?: () => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const step = (delta: 1 | -1) => {
    if (delta === -1 && props.count === 1)
      removeAfterAsking(props.itemId, props.name, props.onRemoved);
    else if (adjustItemCount(props.itemId, delta)?.removed) props.onRemoved?.();
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        icon="minus"
        size={44}
        label={`${props.name} weniger`}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => step(-1)}
        testID={`${props.testID}-minus`}
      />
      <Text
        variant="bodyStrong"
        style={{ minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] }}
        testID={`${props.testID}-count`}
      >
        {`${props.count}×`}
      </Text>
      <IconButton
        icon="plus"
        size={44}
        label={`${props.name} mehr`}
        // "+" works offline like typing the item in (store queue, spec 0019, AC-030).
        disabled={props.count >= MAX_ITEM_COUNT}
        onPress={() => step(1)}
        testID={`${props.testID}-plus`}
      />
    </View>
  );
}
