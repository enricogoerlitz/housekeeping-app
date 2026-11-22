import { adjustItemCount, removeShoppingItem, snapshot } from '@housekeeping/api';
import { MAX_ITEM_COUNT, type Id } from '@housekeeping/core';
import { IconButton, Text, toast } from '@housekeeping/ui';
import { View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

/** Removes an item and offers 5 s "Rückgängig" with all its contributions (AC-015, AC-025). */
export function removeWithUndo(itemId: Id, name: string): void {
  const restore = snapshot();
  removeShoppingItem(itemId);
  toast.show({
    message: `${name} entfernt`,
    actionLabel: 'Rückgängig',
    onAction: undoAction(restore),
  });
}

/**
 * One tap on + or − (REQ-003). − on 1× removes the item, with "Rückgängig" like removing it.
 * Returns true when the item is gone.
 */
export function stepItemCount(itemId: Id, name: string, delta: 1 | -1): boolean {
  const restore = snapshot();
  const change = adjustItemCount(itemId, delta);
  if (!change?.removed) return false;
  toast.show({
    message: `${name} entfernt`,
    actionLabel: 'Rückgängig',
    onAction: undoAction(restore),
  });
  return true;
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
    if (stepItemCount(props.itemId, props.name, delta)) props.onRemoved?.();
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
