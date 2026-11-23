import {
  addBagToPackingList,
  attachNewBag,
  useMembersById,
  usePackingBagItems,
  usePackingBags,
  usePackingListBags,
} from '@housekeeping/api';
import { addableBags, bagItemsOf, bagSummary, type Id } from '@housekeeping/core';
import {
  Avatar,
  Button,
  Icon,
  List,
  ListRow,
  Row,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './packing-labels';

/**
 * "+ Reisetasche hinzufügen" (AC-033): every Reisetasche not yet on this packing list; a tap copies
 * it with open Packstücke at the end, "je Tag" counted with the trip's days. On top "+ Neue
 * Reisetasche" (spec 0022, REQ-011): "Anlegen" creates the empty one and attaches it; a name that
 * exists attaches that one, one already attached says "Hängt schon an dieser Packliste" (AC-035).
 */
export function TripAddBagSheet(props: { tripId: Id; onClose: () => void }) {
  const online = useOnlineOnly();
  const bags = usePackingBags();
  const bagItems = usePackingBagItems();
  const listBags = usePackingListBags();
  const membersById = useMembersById();
  const choices = addableBags(bags, listBags, props.tripId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const create = () => {
    if (online.disabled) return;
    try {
      attachNewBag(props.tripId, name);
    } catch (failure) {
      setError(messageOf(failure));
      return;
    }
    toast.show({ message: `„${name.trim()}“ hinzugefügt` });
    props.onClose();
  };

  const add = (bagId: Id, name: string) => {
    if (online.disabled) return;
    try {
      addBagToPackingList(props.tripId, bagId);
    } catch (failure) {
      toast.show({ message: messageOf(failure) });
      return;
    }
    toast.show({ message: `„${name}“ hinzugefügt` });
    props.onClose();
  };

  return (
    <Sheet
      visible
      size="s"
      title="Reisetasche hinzufügen"
      onClose={props.onClose}
      testID="trip-add-bag-sheet"
    >
      {online.hint ? (
        <Text variant="small" color="warn" style={{ marginBottom: 12 }}>
          {online.hint}
        </Text>
      ) : null}
      {creating ? (
        <Stack gap={8} style={{ marginBottom: 16 }}>
          <TextField
            label="Neue Reisetasche"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(undefined);
            }}
            placeholder="z. B. Camping"
            error={error}
            editable={!online.disabled}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={create}
            testID="trip-add-bag-new-name"
          />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button
              label="Anlegen"
              disabled={online.disabled}
              hint={online.hint}
              onPress={create}
              testID="trip-add-bag-new-save"
            />
          </Row>
        </Stack>
      ) : (
        <View style={{ alignItems: 'flex-start', marginBottom: 12 }}>
          <Button
            label="Neue Reisetasche"
            icon="plus"
            variant="ghost"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setCreating(true)}
            testID="trip-add-bag-new"
          />
        </View>
      )}
      {choices.length === 0 && !creating ? (
        <Text color="muted" testID="trip-add-bag-none">
          {bags.length === 0
            ? 'Noch keine Reisetaschen. Lege oben eine neue an.'
            : 'Alle Reisetaschen hängen schon an dieser Packliste.'}
        </Text>
      ) : choices.length === 0 ? null : (
        <List testID="trip-add-bag-list">
          {choices.map((bag) => {
            const owner = bag.memberId ? membersById[bag.memberId] : undefined;
            return (
              <ListRow
                key={bag.id}
                title={bag.name}
                subtitle={bagSummary(bagItemsOf(bag.id, bagItems).length)}
                leading={<Icon name="luggage" color="muted" />}
                trailing={
                  owner ? <Avatar name={owner.name} color={owner.color} size="s" /> : undefined
                }
                disabled={online.disabled}
                onPress={() => add(bag.id, bag.name)}
                testID={`trip-add-bag-option-${bag.id}`}
              />
            );
          })}
        </List>
      )}
    </Sheet>
  );
}
