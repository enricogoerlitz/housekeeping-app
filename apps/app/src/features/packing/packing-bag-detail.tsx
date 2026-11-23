import {
  addPackingBagItem,
  deletePackingBag,
  duplicatePackingBag,
  movePackingBagItem,
  setPackingBagMember,
  snapshot,
  useMembers,
  usePackingBagItems,
  usePackingBags,
} from '@housekeeping/api';
import {
  bagItemLabel,
  bagItemsOf,
  bagSummary,
  copyName,
  packingNameSuggestions,
  parsePackingLine,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  Chip,
  EmptyState,
  IconButton,
  Menu,
  ReorderList,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { BagDeviationHints } from './bag-trips';
import { BagItemSheet, BagNameSheet } from './packing-bag-sheets';
import {
  BAG_ITEM_ORDER_LABELS,
  FOR_EVERYONE,
  FOR_EVERYONE_LABEL,
  messageOf,
} from './packing-labels';

type BagAction = 'duplicate' | 'delete';

/**
 * ✎ "Umbenennen" and ⋯ "Duplizieren" (AC-008) / "Löschen" with 5 s "Rückgängig" (AC-009) of a
 * Reisetasche. In the page header on phones, next to the bag's name on wide screens.
 */
function BagActions(props: {
  bagId: Id;
  /** Shows another bag: the copy, or the one that already has the typed name. */
  onOpen: (bagId: Id) => void;
  onDeleted: () => void;
}) {
  const bags = usePackingBags();
  const online = useOnlineOnly();
  const [renaming, setRenaming] = useState(false);
  const bag = bags.find((candidate) => candidate.id === props.bagId);
  if (!bag) return null;

  const onAction = (action: BagAction) => {
    if (action === 'duplicate') {
      const name = copyName(bag.name, bags);
      let copyId: Id;
      try {
        copyId = duplicatePackingBag(bag.id);
      } catch (caught) {
        toast.show({ message: messageOf(caught) });
        return;
      }
      props.onOpen(copyId);
      toast.show({ message: `„${name}“ angelegt` });
      return;
    }
    const restore = snapshot();
    try {
      deletePackingBag(bag.id);
    } catch (caught) {
      toast.show({ message: messageOf(caught) });
      return;
    }
    props.onDeleted();
    toast.show({
      message: `„${bag.name}“ gelöscht`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      duration: 5000,
    });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        icon="pencil"
        label="Reisetasche umbenennen"
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => setRenaming(true)}
        testID="bag-rename"
      />
      <Menu<BagAction>
        trigger="icon"
        icon="ellipsis"
        label="Mehr"
        accessibilityLabel={`Mehr zu ${bag.name}`}
        onChange={onAction}
        options={[
          {
            value: 'duplicate',
            label: 'Duplizieren',
            disabled: online.disabled,
            hint: online.hint,
          },
          { value: 'delete', label: 'Löschen', disabled: online.disabled, hint: online.hint },
        ]}
        testID="bag-menu"
      />
      {renaming ? (
        <BagNameSheet
          bag={bag}
          onSaved={() => setRenaming(false)}
          onOpenExisting={(bagId) => {
            setRenaming(false);
            props.onOpen(bagId);
          }}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * The line under the Packstücke (AC-003, AC-005): "2 Badehose" + Enter adds "Badehose 2×" and
 * leaves the field empty and focused; an empty line adds nothing. While typing, names from the
 * household's other bags come as chips; a chip adds that name with the typed quantity.
 */
function BagItemInput(props: { bagId: Id }) {
  const items = usePackingBagItems();
  const online = useOnlineOnly();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  // Remounting with autoFocus brings the focus back after a chip took it.
  const [fieldKey, setFieldKey] = useState(0);

  const line = parsePackingLine(text);
  const suggestions = line ? packingNameSuggestions(line.name, props.bagId, items) : [];

  const add = (value: string, refocus: boolean) => {
    if (online.disabled) return;
    try {
      addPackingBagItem(props.bagId, value);
    } catch (caught) {
      setError(messageOf(caught));
      return;
    }
    setText('');
    setError(undefined);
    if (refocus) setFieldKey(fieldKey + 1);
  };

  return (
    <Stack gap={8}>
      <TextField
        key={fieldKey}
        autoFocus={fieldKey > 0}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
        }}
        placeholder="Packstück, z. B. 2 Badehose"
        accessibilityLabel="Packstück hinzufügen"
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={() => add(text, false)}
        editable={!online.disabled}
        error={error}
        testID="bag-item-input"
        right={
          text.trim() ? (
            <IconButton
              icon="plus"
              label="Hinzufügen"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => add(text, true)}
              testID="bag-item-add"
            />
          ) : undefined
        }
      />
      {suggestions.length > 0 && !online.disabled ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            testID="bag-item-suggestions"
            style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}
          >
            {suggestions.map((name) => (
              <Chip
                key={name}
                label={name}
                icon="plus"
                accessibilityLabel={`${name} hinzufügen`}
                onPress={() => add(line?.quantity ? `${line.quantity} ${name}` : name, true)}
                testID={`bag-item-suggestion-${name}`}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Stack>
  );
}

/**
 * One Reisetasche (REQ-001): "für" as chips, its Packstücke to drag or move with the arrows
 * (AC-006), a tap on a Packstück for quantity and "je Tag" (AC-004), the input line below. On
 * phones a page of its own, on wide screens the right column of "Reisetaschen" with the name and
 * the actions. Reading works offline; every change needs the network.
 */
export function PackingBagPanel(props: {
  bagId: Id;
  showTitle: boolean;
  onOpen: (bagId: Id) => void;
  onDeleted: () => void;
}) {
  const bags = usePackingBags();
  const allItems = usePackingBagItems();
  const members = useMembers();
  const online = useOnlineOnly();
  const [error, setError] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<Id | undefined>();
  const bag = bags.find((candidate) => candidate.id === props.bagId);
  if (!bag) return null;

  const items = bagItemsOf(bag.id, allItems);
  const write = (action: () => void) => {
    if (online.disabled) return;
    try {
      action();
      setError(undefined);
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <View testID="bag-detail" style={{ gap: 4 }}>
      {props.showTitle ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
          testID="bag-detail-head"
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title" heading numberOfLines={2} testID="bag-detail-title">
              {bag.name}
            </Text>
          </View>
          <BagActions bagId={bag.id} onOpen={props.onOpen} onDeleted={props.onDeleted} />
        </View>
      ) : null}
      {online.hint || error ? (
        <Text variant="small" color="warn" style={{ marginBottom: 10 }} testID="bag-detail-hint">
          {error ?? online.hint}
        </Text>
      ) : null}
      <BagDeviationHints bagId={bag.id} />

      <Section title="Für">
        <ChoiceChips<string>
          label="Für"
          value={bag.memberId ?? FOR_EVERYONE}
          onChange={(value) =>
            write(() => setPackingBagMember(bag.id, value === FOR_EVERYONE ? undefined : value))
          }
          options={[
            { value: FOR_EVERYONE, label: FOR_EVERYONE_LABEL },
            ...members.map((member) => ({ value: member.id, label: member.name })),
          ]}
          disabled={online.disabled}
          hint={online.hint}
          testID="bag-for"
        />
      </Section>

      <Section title="Packstücke" meta={bagSummary(items.length)}>
        <Stack gap={12}>
          {items.length === 0 ? (
            <Text color="muted" testID="bag-items-empty">
              Noch keine Packstücke. Tipp unten eins ein, z. B. „2 Badehose“, und drück Enter.
            </Text>
          ) : (
            <ReorderList
              items={items.map((item) => ({ key: item.id, name: bagItemLabel(item) }))}
              onMove={(itemId, toIndex) => write(() => movePackingBagItem(itemId, toIndex))}
              labels={BAG_ITEM_ORDER_LABELS}
              disabled={online.disabled}
              disabledHint={online.hint}
              // The whole row opens quantity and "je Tag"; its name says "… bearbeiten" (AC-004).
              onPress={setEditingId}
              testID="bag-item"
            />
          )}
          <BagItemInput key={bag.id} bagId={bag.id} />
        </Stack>
      </Section>

      {editingId ? (
        <BagItemSheet key={editingId} itemId={editingId} onClose={() => setEditingId(undefined)} />
      ) : null}
    </View>
  );
}

/** A Reisetasche as a page of its own (phones; or opened directly by its address). */
export function PackingBagScreen() {
  const { params } = usePageParams('reisetasche');
  const bags = usePackingBags();
  const router = useRouter();
  // To the bags, also when the bag was opened directly (spec 0005, AC-004); with `von` to that
  // section (spec 0019, REQ-006).
  const origin = useOriginBack(params.von, 'verwalten', {
    label: 'Reisetaschen',
    href: '/reisetaschen',
  });
  const back = origin.back;
  const open = (bagId: Id) =>
    router.replace({ pathname: '/reisetasche/[id]', params: { id: bagId } });

  // Only a uuid of an own household reaches the lookup; anything else shows "gibt es nicht mehr".
  const found = useAddressedId('packingBags', params.id);
  const bag = found === 'shown' ? bags.find((candidate) => candidate.id === params.id) : undefined;
  return (
    <Screen
      testID="bag-screen"
      clearFab={false}
      header={
        <ScreenHeader
          title={bag?.name ?? 'Reisetasche'}
          backLabel={origin.label}
          onBack={back}
          right={bag ? <BagActions bagId={bag.id} onOpen={open} onDeleted={back} /> : undefined}
          testID="bag-screen-title"
        />
      }
    >
      {bag ? (
        <PackingBagPanel bagId={bag.id} showTitle={false} onOpen={open} onDeleted={back} />
      ) : (
        <EmptyState
          icon="luggage"
          title="Diese Reisetasche gibt es nicht mehr"
          text="Vielleicht wurde sie gelöscht."
          testID="bag-not-found"
        >
          <Button label="Zu den Reisetaschen" variant="secondary" onPress={back} />
        </EmptyState>
      )}
    </Screen>
  );
}
