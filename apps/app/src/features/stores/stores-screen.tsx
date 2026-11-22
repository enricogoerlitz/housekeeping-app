import { createStore, fullAreaOrder, useHousehold, useStores } from '@housekeeping/api';
import { storeAreaSummary, type Id } from '@housekeeping/core';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  List,
  ListDetail,
  Menu,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  tabSwipe,
  toast,
  useBreakpoint,
  ViewTabs,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useBackToManage } from '@/features/manage/navigation';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { useOnlineOnly } from '@/features/shell/offline';
import { usePageParams } from '@/lib/url-state';

import { AreasView } from './areas-view';
import { messageOf, viewFromParam, VIEW_OPTIONS, type StoresView } from './labels';
import { NameSheet } from './store-dialogs';
import { StoreOrderPanel } from './store-order-screen';

/**
 * The stores (REQ-008): each with "n Bereiche · m ausgeblendet" and "Standard", then "+ Neuer
 * Markt". A store opens its walking order: on phones as a page, on wide screens in the right
 * column (AC-042).
 */
function StoresList(props: { selectedId?: Id; onSelect: (storeId: Id) => void }) {
  const stores = useStores();
  const household = useHousehold();
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const [creating, setCreating] = useState(false);
  // "Reihenfolge übernehmen von …" (spec 0025, AC-050); '' = "Wie die Bereiche" (AC-051).
  const [copyFrom, setCopyFrom] = useState('');
  const copyOptions = [
    { value: '', label: 'Wie die Bereiche' },
    ...stores.map((store) => ({ value: store.id, label: store.name })),
  ];
  const copyLabel = copyOptions.find((option) => option.value === copyFrom)?.label ?? '';

  return (
    <View testID="stores-list">
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 10 }} testID="stores-hint">
          {online.hint}
        </Text>
      ) : null}
      {stores.length === 0 ? (
        <EmptyState
          icon="store"
          title="Noch keine Märkte"
          text="Ohne Markt ist die Liste nach Bereichen sortiert. Mit einem Markt stehen die Bereiche in seinem Laufweg."
          testID="stores-empty"
        />
      ) : (
        <List>
          {stores.map((store) => (
            <ListRow
              key={store.id}
              title={store.name}
              subtitle={storeAreaSummary(fullAreaOrder(store), store.hiddenAreaIds)}
              leading={<Icon name="store" color="muted" />}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {household.defaultStoreId === store.id ? (
                    <Badge label="Standard" tone="accent" />
                  ) : null}
                  {isPhone ? <Icon name="chevron-right" color="muted" /> : null}
                </View>
              }
              selected={!isPhone && store.id === props.selectedId}
              onPress={() => props.onSelect(store.id)}
              testID={`store-${store.id}`}
            />
          ))}
        </List>
      )}
      <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <Button
          label="Neuer Markt"
          icon="plus"
          variant={stores.length === 0 ? 'primary' : 'secondary'}
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setCreating(true)}
          testID="store-new"
        />
      </View>
      {creating ? (
        <NameSheet
          title="Neuer Markt"
          label="Name"
          placeholder="z. B. Aldi Nord"
          submitLabel="Anlegen"
          onSubmit={(name) => {
            let storeId: Id;
            try {
              storeId = createStore(name, copyFrom || undefined);
            } catch (caught) {
              return messageOf(caught);
            }
            setCreating(false);
            setCopyFrom('');
            toast.show({ message: `„${name.trim()}“ angelegt` });
            props.onSelect(storeId);
            return undefined;
          }}
          onClose={() => {
            setCreating(false);
            setCopyFrom('');
          }}
          testID="store-new-sheet"
        >
          {stores.length > 0 ? (
            <View style={{ marginTop: 12, gap: 6, alignItems: 'flex-start' }}>
              <Text variant="smallStrong">Reihenfolge übernehmen von …</Text>
              <Menu
                label={copyLabel}
                accessibilityLabel={`Reihenfolge übernehmen von: ${copyLabel}`}
                icon="copy"
                value={copyFrom}
                onChange={setCopyFrom}
                options={copyOptions}
                testID="store-new-copy"
              />
            </View>
          ) : null}
        </NameSheet>
      ) : null}
    </View>
  );
}

/**
 * "Verwalten" → "Märkte & Bereiche" (REQ-008 to REQ-010) with the view tabs "Märkte · Bereiche"
 * (`?ansicht=bereiche`, E12). Reading works offline; every change needs the network.
 */
export function StoresScreen() {
  const stores = useStores();
  const household = useHousehold();
  const router = useRouter();
  const back = useBackToManage();
  const { isPhone } = useBreakpoint();
  // View and the chosen store stand in the address (spec 0019, REQ-011, REQ-014); on phones the
  // same `markt` opens the store's page.
  const address = usePageParams('maerkte');
  const { params } = address;
  const view = viewFromParam(params.ansicht);
  const chosenId = params.markt;
  const replace = address.replace;
  useEffect(() => {
    if (!isPhone || !chosenId) return;
    replace({ markt: undefined });
    router.push({ pathname: '/markt/[id]', params: { id: chosenId } });
  }, [isPhone, chosenId, replace, router]);

  // On wide screens a store is always shown: the chosen one, else the default, else the first.
  const selected =
    stores.find((store) => store.id === chosenId) ??
    stores.find((store) => store.id === household.defaultStoreId) ??
    stores[0];

  const select = (storeId: Id) => {
    if (isPhone) router.push({ pathname: '/markt/[id]', params: { id: storeId } });
    else address.replace({ markt: storeId });
  };
  const setView = (next: StoresView) =>
    address.replace({ ansicht: next === 'bereiche' ? 'bereiche' : undefined, markt: undefined });

  const split = view === 'maerkte' && !isPhone;
  return (
    <Screen
      testID="stores-screen"
      clearFab={false}
      header={<ScreenHeader title="Märkte & Bereiche" onBack={back} testID="stores-title" />}
      tabs={
        <ViewTabs<StoresView>
          label="Ansicht"
          value={view}
          onChange={setView}
          options={VIEW_OPTIONS}
          testID="stores-view"
        />
      }
      // On phones a sideways swipe changes the view (spec 0029, REQ-003).
      tabSwipe={tabSwipe(VIEW_OPTIONS, view, setView)}
      scroll={!split}
      style={split ? { flex: 1, paddingBottom: 0 } : undefined}
    >
      {view === 'bereiche' ? (
        <AreasView />
      ) : split ? (
        <ListDetail
          list={
            <ScrollColumn>
              <StoresList selectedId={selected?.id} onSelect={select} />
            </ScrollColumn>
          }
          detail={
            selected ? (
              <StoreOrderPanel
                key={selected.id}
                storeId={selected.id}
                onDeleted={() => address.replace({ markt: undefined })}
                showTitle
              />
            ) : undefined
          }
          placeholder={{
            icon: 'store',
            title: 'Noch kein Markt',
            text: 'Leg links einen Markt an. Dann ordnest du hier seinen Laufweg.',
          }}
          testID="stores-split"
        />
      ) : (
        <StoresList onSelect={select} />
      )}
    </Screen>
  );
}
