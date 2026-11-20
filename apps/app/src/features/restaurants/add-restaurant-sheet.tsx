import { createRestaurant } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { Button, Sheet, Stack, Text, toast } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

import { RestaurantFormFields, useRestaurantForm } from './restaurant-form';

export interface AddRestaurantSheetProps {
  onClose: () => void;
  /** Called with the new restaurant's id after saving. */
  onCreated: (restaurantId: Id) => void;
  /** Opens an existing restaurant instead of saving a duplicate (AC-009). */
  onOpenExisting: (restaurantId: Id) => void;
  /** Text shared or pasted before the sheet opened (share target, AC-008). */
  initialText?: string;
  /** Name to use when the shared text holds no usable map link. */
  initialName?: string;
  /** Which field gets the keyboard first. */
  focus?: 'link' | 'name';
}

/**
 * "Restaurant hinzufügen": a map link at the top fills the form; only the name is required.
 * Mount it fresh for every opening so the initial text is read again.
 */
export function AddRestaurantSheet(props: AddRestaurantSheetProps) {
  const online = useOnlineOnly();
  const form = useRestaurantForm(props.initialText, props.initialName);

  const save = async () => {
    if (online.disabled) return;
    const draft = await form.submit();
    if (!draft) return;
    try {
      const id = createRestaurant(draft);
      props.onClose();
      props.onCreated(id);
      toast.show({ message: 'Restaurant gespeichert' });
    } catch (caught) {
      form.fail(caught);
    }
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Restaurant hinzufügen"
      testID="restaurant-sheet"
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          disabled={online.disabled || !!form.duplicate || form.saving}
          hint={
            online.hint ?? (form.duplicate ? `Gibt es schon: ${form.duplicate.name}` : undefined)
          }
          onPress={() => void save()}
          testID="restaurant-save"
        />
      }
    >
      <Stack gap={16}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <RestaurantFormFields
          form={form}
          focus={props.focus}
          onOpenExisting={(existing) => {
            props.onClose();
            props.onOpenExisting(existing.id);
          }}
        />
      </Stack>
    </Sheet>
  );
}
