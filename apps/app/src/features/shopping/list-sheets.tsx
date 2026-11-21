import { chooseShoppingStore, useShoppingStore, useStores } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { Button, Icon, List, ListRow, Sheet, Stack, Text } from '@housekeeping/ui';
import { useRouter } from 'expo-router';

/**
 * Chooses the store the list is sorted for: kept on this device, per household (spec 0006,
 * REQ-007). Works offline.
 */
export function StoreSheet(props: { onClose: () => void }) {
  const stores = useStores();
  const current = useShoppingStore();
  const router = useRouter();
  const choose = (storeId: Id | null) => {
    chooseShoppingStore(storeId);
    props.onClose();
  };
  return (
    <Sheet visible onClose={props.onClose} title="Markt wählen" testID="store-sheet" size="s">
      <Stack gap={14}>
        <Text color="muted">Die Liste folgt dann dem Laufweg dieses Markts.</Text>
        <List>
          <ListRow
            title="Kein Markt"
            subtitle="Nach Bereichen sortiert"
            leading={<Icon name="list-checks" color="muted" />}
            trailing={current === undefined ? <Icon name="check" color="accent" /> : undefined}
            onPress={() => choose(null)}
            testID="store-option-none"
          />
          {stores.map((store) => (
            <ListRow
              key={store.id}
              title={store.name}
              leading={<Icon name="store" color="muted" />}
              trailing={current?.id === store.id ? <Icon name="check" color="accent" /> : undefined}
              onPress={() => choose(store.id)}
              testID={`store-option-${store.id}`}
            />
          ))}
        </List>
        <Button
          label="Märkte verwalten"
          icon="settings"
          variant="link"
          testID="manage-stores"
          onPress={() => {
            props.onClose();
            router.push('/maerkte');
          }}
        />
      </Stack>
    </Sheet>
  );
}
