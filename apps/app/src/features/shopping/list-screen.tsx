import {
  addShoppingItemFromText,
  clearCheckedItems,
  setItemChecked,
  simulateDictation,
  snapshot,
  splitItems,
  useAreas,
  useArticlesById,
  useHousehold,
  useShoppingItems,
  useShoppingLists,
  useStores,
  useToday,
  type DictatedItem,
} from '@housekeeping/api';
import {
  groupItems,
  summarizeItem,
  weekDates,
  type Article,
  type Id,
  type ItemGroup,
  type ShoppingItem,
} from '@housekeeping/core';
import {
  Button,
  CheckRow,
  Chip,
  EmptyState,
  GhostRow,
  GroupLabel,
  Icon,
  List,
  Row,
  Screen,
  Stack,
  Text,
  toast,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ProfileButton } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';

import { ListSwitchSheet, StoreSheet } from './list-sheets';
import { PantryCheckSheet } from './pantry-check-sheet';
import { SmartComposer } from './smart-composer';

function ItemTrailing(props: { item: ShoppingItem }) {
  const theme = useTheme();
  const summary = summarizeItem(props.item);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {summary.isRecurring ? (
        <View accessibilityLabel="Dauerposten" accessible>
          <Icon name="repeat" size={16} color="muted" />
        </View>
      ) : null}
      {summary.amount ? (
        <Text variant="body" color="muted" testID={`item-${props.item.id}-amount`}>
          {summary.amount}
        </Text>
      ) : null}
      {props.item.pendingSync ? (
        <View
          testID={`item-${props.item.id}-pending`}
          accessible
          accessibilityLabel="Wird synchronisiert"
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent }}
        />
      ) : null}
    </View>
  );
}

function ItemRow(props: { item: ShoppingItem; article: Article | undefined }) {
  const { item } = props;
  const notes = summarizeItem(item).notes.join(', ');
  const toggle = () => setItemChecked(item.id, !item.checked);
  return (
    <CheckRow
      title={props.article?.name ?? 'Unbekannter Artikel'}
      note={notes || undefined}
      checked={item.checked}
      onToggle={toggle}
      onPress={toggle}
      trailing={<ItemTrailing item={item} />}
      testID={`item-${item.id}`}
    />
  );
}

/** Splits groups into two columns of about the same number of rows. */
function balance(groups: ItemGroup[]): [ItemGroup[], ItemGroup[]] {
  const total = groups.reduce((sum, group) => sum + group.items.length + 1, 0);
  const left: ItemGroup[] = [];
  const right: ItemGroup[] = [];
  let count = 0;
  for (const group of groups) {
    if (count < total / 2) {
      left.push(group);
      count += group.items.length + 1;
    } else right.push(group);
  }
  return [left, right];
}

interface Dictation {
  transcript: string;
  /** Index stays the original position, so the remaining rows keep their ids. */
  items: { index: number; item: DictatedItem }[];
}

export function ListScreen() {
  const household = useHousehold();
  const lists = useShoppingLists();
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const areas = useAreas();
  const stores = useStores();
  const today = useToday();
  const online = useOnlineOnly();
  const assistant = useAssistant();
  const router = useRouter();
  const { isPhone, isWide } = useBreakpoint();

  const [chosenListId, setChosenListId] = useState<Id>(household.defaultListId);
  const [sheet, setSheet] = useState<'lists' | 'store' | undefined>();
  const [pantryCheck, setPantryCheck] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const [dictation, setDictation] = useState<Dictation | undefined>();

  const list =
    lists.find((candidate) => candidate.id === chosenListId) ??
    lists.find((candidate) => candidate.id === household.defaultListId) ??
    lists[0];
  if (!list) {
    return (
      <Screen>
        <EmptyState icon="shopping-basket" title="Noch keine Liste" />
      </Screen>
    );
  }
  const store = list.storeId
    ? stores.find((candidate) => candidate.id === list.storeId)
    : undefined;
  const { open, done } = splitItems(items, list.id);
  const groups = groupItems(open, articlesById, areas, store);
  const recipeLabels = [
    ...new Set(
      open.flatMap((item) =>
        item.contributions.flatMap((contribution) =>
          contribution.source.kind === 'recipe' ? [contribution.source.label] : [],
        ),
      ),
    ),
  ];

  const dictate = () => {
    const result = simulateDictation();
    setDictation({
      transcript: result.transcript,
      items: result.items.map((item, index) => ({ index, item })),
    });
  };
  const dropGhost = (index: number) => {
    if (!dictation) return;
    const rest = dictation.items.filter((entry) => entry.index !== index);
    setDictation(rest.length > 0 ? { ...dictation, items: rest } : undefined);
  };
  const acceptGhost = (index: number) => {
    const ghost = dictation?.items.find((entry) => entry.index === index);
    if (ghost) addShoppingItemFromText(list.id, ghost.item.text);
    dropGhost(index);
  };
  const acceptAll = () => {
    for (const entry of dictation?.items ?? []) addShoppingItemFromText(list.id, entry.item.text);
    setDictation(undefined);
  };

  const clearDone = () => {
    const restore = snapshot();
    const count = clearCheckedItems(list.id);
    toast.show({
      message: count === 1 ? '1 Posten geleert' : `${count} Posten geleert`,
      actionLabel: 'Rückgängig',
      onAction: restore,
    });
  };

  const renderGroup = (group: ItemGroup) => (
    <View key={group.key}>
      <GroupLabel testID={`group-${group.key}`}>{group.title}</GroupLabel>
      <List>
        {group.items.map((item) => (
          <ItemRow key={item.id} item={item} article={articlesById[item.articleId]} />
        ))}
      </List>
    </View>
  );

  const storeChip = (
    <Chip
      icon="store"
      label={store?.name ?? 'Kein Markt'}
      testID="store-chip"
      onPress={() => setSheet('store')}
    />
  );
  const forText =
    recipeLabels.length > 0 ? (
      <Text variant="small" color="muted" style={{ flexShrink: 1 }} testID="list-for">
        Für {recipeLabels.join(' · ')}
      </Text>
    ) : null;

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingTop: 8,
        paddingBottom: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Pressable
          testID="list-switch"
          accessibilityRole="button"
          accessibilityLabel={`${list.name}, Liste wechseln`}
          onPress={() => setSheet('lists')}
          style={(state) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            maxWidth: '100%',
            opacity: state.pressed ? 0.6 : 1,
          })}
        >
          <Text
            variant={isPhone ? 'title' : 'display'}
            heading
            numberOfLines={1}
            testID="screen-title"
            style={{ flexShrink: 1 }}
          >
            {list.name}
          </Text>
          <Icon name="chevron-down" size={22} color="muted" />
        </Pressable>
        {isPhone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {storeChip}
            {forText}
          </View>
        ) : (
          forText
        )}
      </View>
      {isPhone ? <ProfileButton /> : storeChip}
    </View>
  );

  const actions = (
    <Row gap={10} wrap style={{ marginBottom: 6 }}>
      <Button
        label="Einkaufen"
        icon="shopping-basket"
        disabled={open.length === 0}
        testID="start-shopping"
        onPress={() => router.push({ pathname: '/einkaufen', params: { list: list.id } })}
      />
      <Button
        label="Aus dem Plan"
        icon="calendar-days"
        variant="secondary"
        disabled={online.disabled}
        hint={online.hint}
        testID="list-from-plan"
        onPress={() => setPantryCheck(true)}
      />
    </Row>
  );

  const ghosts = dictation ? (
    <View style={{ marginTop: 12, gap: 4 }} testID="dictation">
      <Text variant="small" color="muted" testID="dictation-transcript">
        „{dictation.transcript}“ · Beispiel – Spracheingabe ist noch nicht angeschlossen
      </Text>
      {dictation.items.map(({ index, item }) => (
        <GhostRow
          key={item.id}
          title={item.name}
          meta={item.meta}
          onAccept={() => acceptGhost(index)}
          onDiscard={() => dropGhost(index)}
          testID={`ghost-${index}`}
        />
      ))}
      <Row gap={10}>
        <Button
          label="Alle übernehmen"
          icon="check"
          size="sm"
          testID="ghost-accept-all"
          onPress={acceptAll}
        />
        <Button
          label="Verwerfen"
          variant="link"
          size="sm"
          testID="ghost-discard-all"
          onPress={() => setDictation(undefined)}
        />
      </Row>
    </View>
  ) : null;

  let body: ReactNode;
  if (open.length === 0 && done.length === 0 && !dictation) {
    body = (
      <EmptyState
        icon="shopping-basket"
        title="Die Liste ist leer"
        text="Tipp unten ein, was fehlt – oder hol dir die Zutaten über „Auf die Einkaufsliste“ aus dem Wochenplan."
        testID="list-empty"
      >
        <Button
          label="Aus dem Plan übernehmen"
          icon="calendar-days"
          variant="secondary"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setPantryCheck(true)}
        />
      </EmptyState>
    );
  } else {
    const [left, right] = balance(groups);
    body = (
      <>
        {ghosts}
        {open.length === 0 ? (
          <Text color="muted" style={{ marginTop: 16 }}>
            Alles erledigt.
          </Text>
        ) : isWide ? (
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <View style={{ flex: 1, minWidth: 0 }}>{left.map(renderGroup)}</View>
            <View style={{ flex: 1, minWidth: 0 }}>{right.map(renderGroup)}</View>
          </View>
        ) : (
          groups.map(renderGroup)
        )}
        {done.length > 0 ? (
          <View testID="done-section" style={{ marginTop: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Pressable
                testID="done-toggle"
                accessibilityRole="button"
                accessibilityState={{ expanded: showDone }}
                accessibilityLabel={`Erledigt (${done.length})`}
                onPress={() => setShowDone(!showDone)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
              >
                <Icon name={showDone ? 'chevron-down' : 'chevron-right'} size={18} color="muted" />
                <Text variant="groupLabel" heading>{`Erledigt (${done.length})`}</Text>
              </Pressable>
              <Button
                label="Erledigt leeren"
                variant="link"
                size="sm"
                testID="clear-done"
                onPress={clearDone}
              />
            </View>
            {showDone ? (
              <List>
                {done.map((item) => (
                  <ItemRow key={item.id} item={item} article={articlesById[item.articleId]} />
                ))}
              </List>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Screen
      clearFab={false}
      footer={
        <SmartComposer listId={list.id} onDictate={dictate} onAssistant={() => assistant.open()} />
      }
    >
      {header}
      {actions}
      <Stack gap={0}>{body}</Stack>
      {sheet === 'lists' ? (
        <ListSwitchSheet
          activeListId={list.id}
          onSelect={(id) => {
            setChosenListId(id);
            setSheet(undefined);
          }}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
      {sheet === 'store' ? <StoreSheet list={list} onClose={() => setSheet(undefined)} /> : null}
      {pantryCheck ? (
        <PantryCheckSheet
          weekDates={weekDates(today)}
          listId={list.id}
          onClose={() => setPantryCheck(false)}
        />
      ) : null}
    </Screen>
  );
}
