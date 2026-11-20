import {
  fullAreaOrder,
  moveStoreArea,
  setStoreAreaHidden,
  useAreas,
  useStores,
} from '@housekeeping/api';
import {
  Button,
  EmptyState,
  IconButton,
  List,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

/** The walking order of one store (AC-034). Reordering is an edit and needs the network. */
export function StoreOrderScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const stores = useStores();
  const areas = useAreas();
  const online = useOnlineOnly();
  const theme = useTheme();
  const router = useRouter();
  // Always to the stores, also when the store was opened directly (spec 0005, AC-004).
  const back = () => router.dismissTo('/maerkte');

  const id = typeof params.id === 'string' ? params.id : undefined;
  const store = stores.find((candidate) => candidate.id === id);
  if (!store) {
    return (
      <Screen testID="store-order-screen" clearFab={false}>
        <ScreenHeader title="Markt" onBack={back} />
        <EmptyState icon="store" title="Markt nicht gefunden" text="Vielleicht wurde er gelöscht.">
          <Button label="Zu den Märkten" variant="secondary" onPress={back} />
        </EmptyState>
      </Screen>
    );
  }

  const order = fullAreaOrder(store);
  const areaName = (areaId: string) => areas.find((area) => area.id === areaId)?.name ?? 'Bereich';

  return (
    <Screen testID="store-order-screen" maxWidth={760} clearFab={false}>
      <ScreenHeader title={store.name} subtitle="Laufweg durch den Markt" onBack={back} />
      <Text color="muted" style={{ marginBottom: 14 }}>
        In dieser Reihenfolge stehen die Bereiche auf der Liste und im Einkaufsmodus. Ausgeblendete
        Bereiche landen unter „Woanders kaufen“.
      </Text>
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 10 }}>
          {online.hint}
        </Text>
      ) : null}
      <List testID="area-order">
        {order.map((areaId, index) => {
          const name = areaName(areaId);
          const hidden = store.hiddenAreaIds.includes(areaId);
          return (
            <ListRow
              key={areaId}
              testID={`area-row-${areaId}`}
              title={
                <Text variant="rowTitle" color={hidden ? 'muted' : 'text'} numberOfLines={2}>
                  {name}
                </Text>
              }
              accessibilityLabel={`${index + 1}. ${name}${hidden ? ', ausgeblendet' : ''}`}
              subtitle={hidden ? 'Ausgeblendet' : undefined}
              leading={
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surfaceSunken,
                  }}
                >
                  <Text variant="smallStrong" testID={`area-pos-${areaId}`}>
                    {String(index + 1)}
                  </Text>
                </View>
              }
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconButton
                    icon="arrow-up"
                    label={`${name} nach ganz oben`}
                    disabled={online.disabled || index === 0}
                    testID={`area-top-${areaId}`}
                    onPress={() => moveStoreArea(store.id, areaId, 0)}
                  />
                  <IconButton
                    icon="chevron-up"
                    label={`${name} nach oben`}
                    disabled={online.disabled || index === 0}
                    testID={`area-up-${areaId}`}
                    onPress={() => moveStoreArea(store.id, areaId, index - 1)}
                  />
                  <IconButton
                    icon="chevron-down"
                    label={`${name} nach unten`}
                    disabled={online.disabled || index === order.length - 1}
                    testID={`area-down-${areaId}`}
                    onPress={() => moveStoreArea(store.id, areaId, index + 1)}
                  />
                  <IconButton
                    icon={hidden ? 'eye-off' : 'eye'}
                    label={hidden ? `${name} einblenden` : `${name} ausblenden`}
                    disabled={online.disabled}
                    testID={`area-hide-${areaId}`}
                    onPress={() => setStoreAreaHidden(store.id, areaId, !hidden)}
                  />
                </View>
              }
            />
          );
        })}
      </List>
    </Screen>
  );
}
