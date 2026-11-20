import { createShoppingList, setListStore, useShoppingLists, useStores } from '@housekeeping/api';
import type { Id, ShoppingList } from '@housekeeping/core';
import {
  Button,
  Icon,
  List,
  ListRow,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

/** Switches between the household's lists and creates a new one. */
export function ListSwitchSheet(props: {
  activeListId: Id;
  onSelect: (listId: Id) => void;
  onClose: () => void;
}) {
  const lists = useShoppingLists();
  const online = useOnlineOnly();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const create = () => {
    if (!name.trim()) {
      setError('Name fehlt');
      return;
    }
    try {
      const id = createShoppingList(name);
      toast.show({ message: `Liste „${name.trim()}“ angelegt` });
      props.onSelect(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  return (
    <Sheet visible onClose={props.onClose} title="Listen" testID="list-switch-sheet">
      <Stack gap={18}>
        <List>
          {lists.map((list) => (
            <ListRow
              key={list.id}
              title={list.name}
              subtitle={list.isDefault ? 'Standardliste' : undefined}
              trailing={
                list.id === props.activeListId ? <Icon name="check" color="accent" /> : undefined
              }
              onPress={() => props.onSelect(list.id)}
              testID={`list-option-${list.id}`}
            />
          ))}
        </List>
        <TextField
          label="Neue Liste"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(undefined);
          }}
          placeholder="z. B. Grillabend"
          error={error}
          hint={online.hint}
          editable={!online.disabled}
          onSubmitEditing={create}
          testID="list-new-name"
        />
        <Button
          label="Liste anlegen"
          icon="plus"
          variant="secondary"
          disabled={online.disabled}
          hint={online.hint}
          testID="list-new-save"
          onPress={create}
        />
      </Stack>
    </Sheet>
  );
}

/** Chooses the store the list is sorted for. */
export function StoreSheet(props: { list: ShoppingList; onClose: () => void }) {
  const stores = useStores();
  const online = useOnlineOnly();
  const router = useRouter();
  const choose = (storeId: Id | undefined) => {
    setListStore(props.list.id, storeId);
    props.onClose();
  };
  return (
    <Sheet visible onClose={props.onClose} title="Markt wählen" testID="store-sheet">
      <Stack gap={14}>
        <Text color="muted">Die Liste folgt dann dem Laufweg dieses Markts.</Text>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <List>
          <ListRow
            title="Kein Markt"
            subtitle="Nach Bereichen sortiert"
            leading={<Icon name="list-checks" color="muted" />}
            trailing={
              props.list.storeId === undefined ? <Icon name="check" color="accent" /> : undefined
            }
            disabled={online.disabled}
            onPress={() => choose(undefined)}
            testID="store-option-none"
          />
          {stores.map((store) => (
            <ListRow
              key={store.id}
              title={store.name}
              leading={<Icon name="store" color="muted" />}
              trailing={
                props.list.storeId === store.id ? <Icon name="check" color="accent" /> : undefined
              }
              disabled={online.disabled}
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
