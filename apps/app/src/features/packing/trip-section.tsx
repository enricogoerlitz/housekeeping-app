import {
  packAll,
  removeBagFromPackingList,
  removePackingItem,
  setPacked,
  useMembersById,
} from '@housekeeping/api';
import { packingItemLabel, type PackingItem, type PackingSection } from '@housekeeping/core';
import {
  Avatar,
  Button,
  CheckRow,
  Disclosure,
  List,
  Menu,
  Row,
  RowTransition,
  Section,
  SwipeToRemove,
  Text,
  haptic,
  toast,
  useBreakpoint,
  useCheckWindow,
} from '@housekeeping/ui';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './packing-labels';
import { TripAddItemSheet } from './trip-add-item-sheet';
import { TripItemSheet } from './trip-item-sheet';

type BagAction = 'pack-all' | 'remove';

const bySortThenId = (a: PackingItem, b: PackingItem) =>
  a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One bag of the packing list (AC-016, AC-020 to AC-021, AC-026, AC-031 to AC-036): name, counter
 * "4/9", avatar when it belongs to someone, ⋯ with "Alles einpacken" and "Aus der Packliste
 * entfernen". A tap packs at once (store queue, also offline); 2 s after the last tap packed rows
 * slide into "Gepackt (n)", and rows unpacked there slide back to the open ones (AC-021). A
 * Packstück goes by swiping left on phones or by its ⋯ "Entfernen" everywhere (AC-035).
 */
export function TripSection(props: { section: PackingSection }) {
  const { section } = props;
  const { listBag } = section;
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const membersById = useMembersById();
  const owner = listBag.memberId ? membersById[listBag.memberId] : undefined;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();

  const items = useMemo(
    () => [...section.open, ...section.packed].sort(bySortThenId),
    [section.open, section.packed],
  );
  const check = useCheckWindow<PackingItem>({
    items,
    getId: (item) => item.id,
    isChecked: (item) => item.packed,
    // Saved at once on every tap (spec 0012, open question 3 A); the window only moves rows.
    onToggle: (item, packed) => {
      if (packed) haptic('check');
      try {
        setPacked(item.id, packed);
      } catch (failure) {
        toast.show({ message: messageOf(failure) });
      }
    },
    // Unpacked in "Gepackt (n)", a row stays there until the window closes (AC-021).
    keepInDone: true,
    announce: (item, packed) => `${item.name} ${packed ? 'gepackt' : 'wieder offen'}`,
  });

  // Asks first (spec 0036, Entscheidung 1).
  const removeItem = (item: PackingItem) => {
    if (online.disabled) return;
    confirmFirst({
      title: `„${item.name}“ entfernen?`,
      confirmLabel: 'Entfernen',
      onConfirm: () => {
        try {
          removePackingItem(item.id);
        } catch (failure) {
          return messageOf(failure);
        }
        toast.show({ message: `„${item.name}“ entfernt` });
      },
      testID: 'confirm-remove-packing-item',
    });
  };

  const onBagAction = (action: BagAction) => {
    if (action === 'pack-all') {
      // All rows of this bag move at once, also those still held by a running window.
      check.settle();
      let undo: () => void;
      try {
        undo = packAll(listBag.id);
      } catch (failure) {
        toast.show({ message: messageOf(failure) });
        return;
      }
      haptic('check');
      // The undo is a store-queue action too, so it works offline (AC-027).
      toast.show({
        message: `„${listBag.name}“ eingepackt`,
        actionLabel: 'Rückgängig',
        onAction: undo,
        duration: 5000,
      });
      return;
    }
    if (online.disabled) return;
    confirmFirst({
      title: `„${listBag.name}“ aus der Packliste entfernen?`,
      confirmLabel: 'Entfernen',
      onConfirm: () => {
        try {
          removeBagFromPackingList(listBag.id);
        } catch (failure) {
          return messageOf(failure);
        }
        toast.show({ message: `„${listBag.name}“ aus der Packliste entfernt` });
      },
      testID: 'confirm-remove-bag',
    });
  };

  const row = (item: PackingItem) => {
    const label = packingItemLabel(item);
    return (
      <RowTransition key={item.id}>
        <SwipeToRemove
          label="Entfernen"
          enabled={isPhone && !online.disabled}
          onRemove={() => removeItem(item)}
          testID={`trip-item-${item.id}-swipe`}
        >
          <CheckRow
            title={label}
            checked={check.isChecked(item)}
            onToggle={() => check.toggle(item)}
            onPress={() => setEditingId(item.id)}
            // Outside the row's press area, which opens the Packstück window: no nested buttons.
            controls={
              // Also on phones next to the swipe, so screen readers can remove a Packstück.
              <Menu<'edit' | 'remove'>
                trigger="icon"
                icon="ellipsis"
                label="Mehr"
                accessibilityLabel={`Mehr zu ${item.name}`}
                options={[
                  // Spec 0022, REQ-009: the window with name, count and "je Tag".
                  { value: 'edit', label: 'Bearbeiten' },
                  {
                    value: 'remove',
                    label: 'Entfernen',
                    disabled: online.disabled,
                    hint: online.hint,
                  },
                ]}
                onChange={(action) =>
                  action === 'edit' ? setEditingId(item.id) : removeItem(item)
                }
                testID={`trip-item-${item.id}-more`}
              />
            }
            testID={`trip-item-${item.id}`}
          />
        </SwipeToRemove>
      </RowTransition>
    );
  };

  const testID = `trip-bag-${listBag.id}`;
  return (
    <Section
      title={listBag.name}
      testID={testID}
      action={
        <Row gap={8} align="center">
          {owner ? (
            <Avatar
              name={owner.name}
              color={owner.color}
              size="s"
              testID={`${testID}-owner-${owner.id}`}
            />
          ) : null}
          <Text variant="smallStrong" color="muted" testID={`${testID}-counter`}>
            {section.counter}
          </Text>
          <Menu<BagAction>
            trigger="icon"
            icon="ellipsis"
            label="Mehr"
            accessibilityLabel={`Mehr zu ${listBag.name}`}
            options={[
              {
                value: 'pack-all',
                label: 'Alles einpacken',
                disabled: section.open.length === 0,
                hint: section.open.length === 0 ? 'Alles ist schon gepackt' : undefined,
              },
              {
                value: 'remove',
                label: 'Aus der Packliste entfernen',
                disabled: online.disabled,
                hint: online.hint,
              },
            ]}
            onChange={onBagAction}
            testID={`${testID}-more`}
          />
        </Row>
      }
    >
      {section.total === 0 ? (
        <Text color="muted" testID={`${testID}-empty`}>
          Noch keine Packstücke
        </Text>
      ) : null}
      <List testID={`${testID}-open`}>{check.rows.map(row)}</List>
      <Disclosure
        title="Gepackt"
        count={check.doneRows.length}
        expandedLabel="aufgeklappt"
        collapsedLabel="eingeklappt"
        testID={`${testID}-packed`}
      >
        <List>{check.doneRows.map(row)}</List>
      </Disclosure>
      <View style={{ alignItems: 'flex-start', marginTop: 4 }}>
        <Button
          label="Packstück"
          icon="plus"
          variant="link"
          size="sm"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setAdding(true)}
          testID={`${testID}-add`}
        />
      </View>
      {adding ? <TripAddItemSheet listBag={listBag} onClose={() => setAdding(false)} /> : null}
      {editingId ? (
        <TripItemSheet itemId={editingId} onClose={() => setEditingId(undefined)} />
      ) : null}
    </Section>
  );
}
