import {
  deleteStore,
  fullAreaOrder,
  moveStoreArea,
  renameStore,
  setDefaultStore,
  setStoreAreaHidden,
  useAreas,
  useHousehold,
  useStores,
} from '@housekeeping/api';
import { moveInOrder, storeOrderIndex, type Id } from '@housekeeping/core';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  List,
  ListRow,
  Menu,
  ReorderList,
  Screen,
  ScreenHeader,
  Section,
  Text,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { messageOf, ORDER_LABELS } from './labels';
import { AddAreaSheet, ConfirmDialog, NameSheet } from './store-dialogs';

type StoreAction = 'default' | 'delete';

/**
 * ✎ "Markt umbenennen" and ⋯ ("Als Standard", "Markt löschen …", AC-044, AC-045) of a store, with
 * their windows. In the page header on phones, next to the store's name on wide screens.
 */
export function StoreActions(props: { storeId: Id; onDeleted: () => void }) {
  const stores = useStores();
  const household = useHousehold();
  const online = useOnlineOnly();
  const [dialog, setDialog] = useState<'rename' | 'delete' | undefined>();
  const store = stores.find((candidate) => candidate.id === props.storeId);
  if (!store) return null;
  const isDefault = household.defaultStoreId === store.id;

  const onAction = (action: StoreAction) => {
    if (action === 'delete') {
      setDialog('delete');
      return;
    }
    try {
      setDefaultStore(store.id);
    } catch (caught) {
      toast.show({ message: messageOf(caught) });
      return;
    }
    toast.show({ message: `„${store.name}“ ist jetzt der Standardmarkt` });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        icon="pencil"
        label="Markt umbenennen"
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => setDialog('rename')}
        testID="store-rename"
      />
      <Menu<StoreAction>
        trigger="icon"
        icon="ellipsis"
        label="Mehr"
        accessibilityLabel={`Mehr zu ${store.name}`}
        onChange={onAction}
        options={[
          ...(isDefault
            ? []
            : [
                {
                  value: 'default' as const,
                  label: 'Als Standard',
                  disabled: online.disabled,
                  hint: online.hint,
                },
              ]),
          {
            value: 'delete',
            label: 'Markt löschen …',
            disabled: online.disabled,
            hint: online.hint,
          },
        ]}
        testID="store-menu"
      />
      {dialog === 'rename' ? (
        <NameSheet
          title="Markt umbenennen"
          label="Name"
          initialName={store.name}
          submitLabel="Speichern"
          onSubmit={(name) => {
            try {
              renameStore(store.id, name);
            } catch (caught) {
              return messageOf(caught);
            }
            setDialog(undefined);
            return undefined;
          }}
          onClose={() => setDialog(undefined)}
          testID="store-rename-sheet"
        />
      ) : null}
      {dialog === 'delete' ? (
        <ConfirmDialog
          title={`${store.name} löschen?`}
          message="Die Laufreihenfolge geht verloren."
          confirmLabel="Löschen"
          onConfirm={() => {
            const name = store.name;
            try {
              deleteStore(store.id);
            } catch (caught) {
              return messageOf(caught);
            }
            setDialog(undefined);
            props.onDeleted();
            toast.show({ message: `„${name}“ gelöscht` });
            return undefined;
          }}
          onCancel={() => setDialog(undefined)}
          testID="store-delete-dialog"
        />
      ) : null}
    </View>
  );
}

/**
 * The walking order of one store (REQ-009): the visible areas to drag or move with the arrows,
 * "Ausgeblendet" below and "+ Bereich hinzufügen". On phones a page of its own, on wide screens
 * the right column of "Märkte" with the store's name and actions (AC-042).
 */
export function StoreOrderPanel(props: { storeId: Id; onDeleted: () => void; showTitle: boolean }) {
  const stores = useStores();
  const areas = useAreas();
  const household = useHousehold();
  const online = useOnlineOnly();
  const [addingArea, setAddingArea] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const store = stores.find((candidate) => candidate.id === props.storeId);
  if (!store) return null;

  const isDefault = household.defaultStoreId === store.id;
  const order = fullAreaOrder(store);
  const areaName = (areaId: Id) => areas.find((area) => area.id === areaId)?.name ?? 'Bereich';
  const visible = order.filter((areaId) => !store.hiddenAreaIds.includes(areaId));
  const hidden = order.filter((areaId) => store.hiddenAreaIds.includes(areaId));

  const write = (action: () => void) => {
    try {
      action();
      setError(undefined);
    } catch (caught) {
      setError(messageOf(caught));
    }
  };
  const move = (areaId: Id, toVisibleIndex: number) => {
    const index = storeOrderIndex(order, store.hiddenAreaIds, areaId, toVisibleIndex);
    if (moveInOrder(order, areaId, index).join() === order.join()) return;
    write(() => moveStoreArea(store.id, areaId, index));
  };

  return (
    <View testID="store-order" style={{ gap: 4 }}>
      {props.showTitle ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
          testID="store-order-head"
        >
          <View
            style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Text variant="title" heading numberOfLines={2} testID="store-order-title">
              {store.name}
            </Text>
            {isDefault ? <Badge label="Standard" tone="accent" /> : null}
          </View>
          <StoreActions storeId={store.id} onDeleted={props.onDeleted} />
        </View>
      ) : isDefault ? (
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <Badge label="Standard" tone="accent" />
        </View>
      ) : null}
      <Text color="muted" style={{ marginBottom: 12 }}>
        In dieser Reihenfolge stehen die Bereiche auf der Liste und beim Einkaufen. Zieh einen
        Bereich am Griff oder nimm die Pfeile.
      </Text>
      {online.hint || error ? (
        <Text variant="small" color="warn" style={{ marginBottom: 10 }} testID="store-order-hint">
          {error ?? online.hint}
        </Text>
      ) : null}

      <Section title="Laufreihenfolge">
        {visible.length === 0 ? (
          <EmptyState
            icon="store"
            title="Kein Bereich sichtbar"
            text="Blende unten einen Bereich ein oder füg einen hinzu."
          />
        ) : (
          <ReorderList
            items={visible.map((areaId) => ({ key: areaId, name: areaName(areaId) }))}
            onMove={move}
            labels={ORDER_LABELS}
            disabled={online.disabled}
            disabledHint={online.hint}
            trailing={(item) => (
              <IconButton
                icon="eye-off"
                label={`${item.name} ausblenden`}
                disabled={online.disabled}
                hint={online.hint}
                onPress={() => write(() => setStoreAreaHidden(store.id, item.key, true))}
                testID={`area-hide-${item.key}`}
              />
            )}
            testID="area"
          />
        )}
        <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
          <Button
            label="Bereich hinzufügen"
            icon="plus"
            variant="secondary"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setAddingArea(true)}
            testID="store-add-area"
          />
        </View>
      </Section>

      {hidden.length > 0 ? (
        <Section title="Ausgeblendet" meta="Landet unter „Woanders kaufen“">
          <List testID="area-hidden">
            {hidden.map((areaId) => (
              <ListRow
                key={areaId}
                testID={`area-row-${areaId}`}
                title={
                  <Text variant="rowTitle" color="muted" numberOfLines={2}>
                    {areaName(areaId)}
                  </Text>
                }
                accessibilityLabel={`${areaName(areaId)}, ausgeblendet`}
                trailing={
                  <IconButton
                    icon="eye"
                    label={`${areaName(areaId)} einblenden`}
                    disabled={online.disabled}
                    hint={online.hint}
                    onPress={() => write(() => setStoreAreaHidden(store.id, areaId, false))}
                    testID={`area-hide-${areaId}`}
                  />
                }
              />
            ))}
          </List>
        </Section>
      ) : null}

      {addingArea ? <AddAreaSheet storeId={store.id} onClose={() => setAddingArea(false)} /> : null}
    </View>
  );
}

/** A store's walking order as a page of its own (phones; or opened directly by its address). */
export function StoreOrderScreen() {
  const { params } = usePageParams('markt');
  const stores = useStores();
  // To the stores, also when the store was opened directly (spec 0005, AC-004); with `von` to
  // that section (spec 0019, REQ-006).
  const origin = useOriginBack(params.von, 'verwalten', { label: 'Märkte', href: '/maerkte' });
  const back = origin.back;

  // Only a uuid of an own household reaches the lookup: `/markt/abc` is "nicht gefunden" (AC-053).
  const found = useAddressedId('stores', params.id);
  const store =
    found === 'shown' ? stores.find((candidate) => candidate.id === params.id) : undefined;
  return (
    <Screen
      testID="store-order-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title={store?.name ?? 'Markt'}
          subtitle={store ? 'Laufweg durch den Markt' : undefined}
          backLabel={origin.label}
          onBack={back}
          right={store ? <StoreActions storeId={store.id} onDeleted={back} /> : undefined}
        />
      }
    >
      {store ? (
        <StoreOrderPanel storeId={store.id} onDeleted={back} showTitle={false} />
      ) : (
        <EmptyState icon="store" title="Markt nicht gefunden" text="Vielleicht wurde er gelöscht.">
          <Button label="Zu den Märkten" variant="secondary" onPress={back} />
        </EmptyState>
      )}
    </Screen>
  );
}
