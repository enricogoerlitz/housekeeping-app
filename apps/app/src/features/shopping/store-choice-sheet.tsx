import { chooseShoppingStore, useHousehold, useStores } from '@housekeeping/api';
import type { Id, Store } from '@housekeeping/core';
import { Badge, Button, Checkbox, List, ListRow, Sheet } from '@housekeeping/ui';
import { View } from 'react-native';

export const WITHOUT_STORE_LABEL = 'Ohne Markt – nach Bereichen';

function ChoiceRow(props: {
  label: string;
  chosen: boolean;
  isDefault?: boolean;
  onChoose: () => void;
  testID: string;
}) {
  return (
    <ListRow
      title={props.label}
      accessibilityLabel={props.chosen ? `${props.label}, gewählt` : props.label}
      leading={
        <Checkbox
          checked={props.chosen}
          label={props.label}
          onChange={props.onChoose}
          testID={`${props.testID}-check`}
        />
      }
      trailing={props.isDefault ? <Badge label="Standard" tone="accent" /> : undefined}
      onPress={props.onChoose}
      testID={props.testID}
    />
  );
}

/**
 * "Wo kaufst du ein?" (AC-041): the store "Einkaufen" sorts by. The choice stays on this device
 * and works offline (AC-042); "Märkte verwalten ›" leads to "Märkte & Bereiche" (AC-048).
 */
export function StoreChoiceSheet(props: {
  current: Store | undefined;
  onClose: () => void;
  onManage: () => void;
}) {
  const stores = useStores();
  const household = useHousehold();
  const choose = (storeId: Id | null) => {
    chooseShoppingStore(storeId);
    props.onClose();
  };
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Wo kaufst du ein?"
      size="s"
      testID="store-choice-sheet"
    >
      <List>
        {stores.map((store) => (
          <ChoiceRow
            key={store.id}
            label={store.name}
            chosen={props.current?.id === store.id}
            isDefault={household.defaultStoreId === store.id}
            onChoose={() => choose(store.id)}
            testID={`store-choice-${store.id}`}
          />
        ))}
        <ChoiceRow
          label={WITHOUT_STORE_LABEL}
          chosen={props.current === undefined}
          onChoose={() => choose(null)}
          testID="store-choice-none"
        />
      </List>
      <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <Button
          label="Märkte verwalten ›"
          variant="link"
          onPress={props.onManage}
          testID="store-choice-manage"
        />
      </View>
    </Sheet>
  );
}
