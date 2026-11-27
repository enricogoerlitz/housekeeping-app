import { createRestaurant, updateRestaurant } from '@housekeeping/api';
import type { Id, Restaurant } from '@housekeeping/core';
import { Sheet, Stack, Text, toast } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';
import { usePlaceWebFill } from '@/features/web-search/place-web-fill';

import {
  RestaurantFormFields,
  saveRestaurantPhoto,
  useRestaurantForm,
  type RestaurantForm,
  type RestaurantFormFocus,
} from './restaurant-form';

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
      saveRestaurantPhoto(id, form.photo);
      toast.show({ message: 'Restaurant gespeichert' });
    } catch (caught) {
      form.fail(caught);
    }
  };

  return (
    <RestaurantFormSheet
      title="Restaurant hinzufügen"
      form={form}
      focus={props.focus}
      onSave={() => void save()}
      onClose={props.onClose}
      onOpenExisting={props.onOpenExisting}
    />
  );
}

/**
 * "Restaurant bearbeiten" (spec 0024, REQ-001): the form of "Restaurant hinzufügen", prefilled.
 * "Speichern" sends every field (a cleared one is cleared, an emptied map link takes the
 * coordinates with it) → "Restaurant gespeichert"; ✕ discards. "Notiz hinzufügen" opens it with
 * the keyboard in "Notiz" (REQ-002).
 */
export function EditRestaurantSheet(props: {
  restaurant: Restaurant;
  focus?: RestaurantFormFocus;
  onClose: () => void;
  onOpenExisting: (restaurantId: Id) => void;
}) {
  const online = useOnlineOnly();
  const form = useRestaurantForm(undefined, undefined, props.restaurant);
  const { restaurant } = props;

  const save = async () => {
    if (online.disabled) return;
    const draft = await form.submit();
    if (!draft) return;
    try {
      updateRestaurant(restaurant.id, {
        name: draft.name,
        address: draft.address,
        location: draft.location,
        mapsUrl: draft.mapsUrl,
        cuisine: draft.cuisine,
        priceLevel: draft.priceLevel,
        tags: draft.tags,
        websiteUrl: draft.websiteUrl,
        notes: draft.notes,
      });
    } catch (caught) {
      form.fail(caught);
      return;
    }
    props.onClose();
    saveRestaurantPhoto(restaurant.id, form.photo);
    toast.show({ message: 'Restaurant gespeichert' });
  };

  return (
    <RestaurantFormSheet
      title="Restaurant bearbeiten"
      form={form}
      focus={props.focus}
      onSave={() => void save()}
      onClose={props.onClose}
      onOpenExisting={props.onOpenExisting}
      testID="restaurant-edit-sheet"
    />
  );
}

function RestaurantFormSheet(props: {
  title: string;
  form: RestaurantForm;
  focus?: RestaurantFormFocus;
  onSave: () => void;
  onClose: () => void;
  onOpenExisting: (restaurantId: Id) => void;
  testID?: string;
}) {
  const online = useOnlineOnly();
  const { form } = props;
  // Spec 0049: a new one is filled at once, an existing one shows its changes first.
  const web = usePlaceWebFill({
    kind: 'restaurant',
    name: form.name,
    ...(form.restaurant ? { current: form.webValues() } : {}),
    hasPhoto: form.restaurant?.photoPath !== undefined,
    onApply: form.applyWeb,
    onLink: form.changeLink,
    testID: 'restaurant-web',
  });
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title={props.title}
      testID={props.testID ?? 'restaurant-sheet'}
      size="m"
      actions={{
        primary: {
          label: 'Speichern',
          icon: 'check',
          disabled: online.disabled || !!form.duplicate || form.saving,
          hint:
            online.hint ?? (form.duplicate ? `Gibt es schon: ${form.duplicate.name}` : undefined),
          onPress: props.onSave,
          testID: 'restaurant-save',
        },
      }}
    >
      <Stack gap={16}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        {/* Spec 0055, REQ-010: a new one searches from the name; an existing one keeps the link. */}
        {form.restaurant ? web.link : null}
        <RestaurantFormFields
          form={form}
          {...(form.restaurant ? {} : { nameAction: web.nameButton })}
          focus={props.focus}
          onOpenExisting={(existing) => {
            props.onClose();
            props.onOpenExisting(existing.id);
          }}
        />
        {web.windows}
      </Stack>
    </Sheet>
  );
}
