import {
  addBagToPackingList,
  useMembersById,
  usePackingBagItems,
  usePackingBags,
  usePackingListBags,
} from '@housekeeping/api';
import { addableBags, bagItemsOf, bagSummary, type Id } from '@housekeeping/core';
import { Avatar, Icon, List, ListRow, Sheet, Text, toast } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './packing-labels';

/**
 * "+ Reisetasche hinzufügen" (AC-033): every Reisetasche not yet on this packing list; a tap copies
 * it with open Packstücke at the end, "je Tag" counted with the absence's days.
 */
export function TripAddBagSheet(props: { absenceId: Id; onClose: () => void }) {
  const online = useOnlineOnly();
  const bags = usePackingBags();
  const bagItems = usePackingBagItems();
  const listBags = usePackingListBags();
  const membersById = useMembersById();
  const choices = addableBags(bags, listBags, props.absenceId);

  const add = (bagId: Id, name: string) => {
    if (online.disabled) return;
    try {
      addBagToPackingList(props.absenceId, bagId);
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
      {choices.length === 0 ? (
        <Text color="muted" testID="trip-add-bag-none">
          {bags.length === 0
            ? 'Noch keine Reisetaschen. Lege sie unter „Verwalten → Reisetaschen“ an.'
            : 'Alle Reisetaschen hängen schon an dieser Packliste.'}
        </Text>
      ) : (
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
