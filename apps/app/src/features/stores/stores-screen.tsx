import { createStore, fullAreaOrder, useHousehold, useStores } from '@housekeeping/api';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useBackToManage } from '@/features/manage/navigation';
import { useOnlineOnly } from '@/features/shell/offline';

/** "Verwalten" → "Märkte & Bereiche": the stores, each with its own walking order. */
export function StoresScreen() {
  const stores = useStores();
  const household = useHousehold();
  const online = useOnlineOnly();
  const router = useRouter();
  const back = useBackToManage();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const create = () => {
    if (!name.trim()) {
      setError('Name fehlt');
      return;
    }
    try {
      createStore(name);
      toast.show({ message: `„${name.trim()}“ angelegt` });
      setName('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  return (
    <Screen
      testID="stores-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title="Märkte"
          subtitle="Jeder Markt hat seinen eigenen Laufweg."
          onBack={back}
        />
      }
    >
      <Section title="Deine Märkte">
        {stores.length === 0 ? (
          <EmptyState
            icon="store"
            title="Noch keine Märkte"
            text="Leg unten deinen ersten Markt an. Ohne Markt ist die Liste nach Bereichen sortiert."
          />
        ) : (
          <List>
            {stores.map((store) => {
              const order = fullAreaOrder(store);
              const visible = order.filter((id) => !store.hiddenAreaIds.includes(id)).length;
              const hidden = order.length - visible;
              return (
                <ListRow
                  key={store.id}
                  title={store.name}
                  subtitle={`${visible} Bereiche${hidden > 0 ? ` · ${hidden} ausgeblendet` : ''}`}
                  leading={<Icon name="store" color="muted" />}
                  trailing={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {household.defaultStoreId === store.id ? (
                        <Badge label="Standard" tone="accent" />
                      ) : null}
                      <Icon name="chevron-right" color="muted" />
                    </View>
                  }
                  onPress={() => router.push({ pathname: '/markt/[id]', params: { id: store.id } })}
                  testID={`store-${store.id}`}
                />
              );
            })}
          </List>
        )}
      </Section>
      <Section title="Neuer Markt">
        <Stack gap={10}>
          <TextField
            accessibilityLabel="Name des Markts"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(undefined);
            }}
            placeholder="z. B. Aldi Nord"
            error={error}
            hint={online.hint}
            editable={!online.disabled}
            onSubmitEditing={create}
            testID="store-new-name"
          />
          <Button
            label="Markt anlegen"
            icon="plus"
            disabled={online.disabled}
            hint={online.hint}
            testID="store-new-save"
            onPress={create}
          />
        </Stack>
      </Section>
    </Screen>
  );
}
