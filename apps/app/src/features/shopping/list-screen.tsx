import {
  addShoppingItemFromText,
  clearCheckedItems,
  clearShoppingList,
  dictatedItems,
  setItemChecked,
  snapshot,
  splitItems,
  useAreas,
  useArticlesById,
  useRecipesById,
  useShoppingItems,
  useToday,
  type DictatedItem,
} from '@housekeeping/api';
import {
  groupItems,
  itemCount,
  listHeadline,
  summarizeItem,
  weekDates,
  type Article,
  type ItemGroup,
  type ShoppingItem,
} from '@housekeeping/core';
import {
  Button,
  CheckRow,
  EmptyState,
  GhostRow,
  GroupLabel,
  Icon,
  List,
  ListRow,
  Menu,
  Notice,
  Row,
  Screen,
  Stack,
  SwipeToRemove,
  Text,
  toast,
  useBreakpoint,
  useTheme,
  type MenuOption,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useOpenManageEntry } from '@/features/manage/navigation';
import { StartPageActions } from '@/features/shell/profile-button';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
import { useDictation } from '@/lib/use-dictation';

import { useActiveShopper } from './active-shopper';
import { CountStepper, removeWithUndo } from './item-controls';
import { ItemSheet } from './item-sheet';
import { ClearListSheet } from './list-sheets';
import { PantryCheckSheet } from './pantry-check-sheet';
import { SmartComposer } from './smart-composer';

function PendingDot(props: { itemId: string }) {
  const theme = useTheme();
  return (
    <View
      testID={`item-${props.itemId}-pending`}
      accessible
      accessibilityLabel="Wird synchronisiert"
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent }}
    />
  );
}

/**
 * An open item on "Liste" (D24): no checkbox; "− 2× +" for pure counts, "500 g ›" for
 * quantities. A tap opens "Posten bearbeiten"; on phones a swipe to the left removes it.
 */
function ItemRow(props: {
  item: ShoppingItem;
  article: Article | undefined;
  swipe: boolean;
  onOpen: (itemId: string, name: string) => void;
}) {
  const { item } = props;
  const name = props.article?.name ?? 'Unbekannter Artikel';
  const summary = summarizeItem(item);
  const count = itemCount(item);
  const note = summary.notes.join(', ');
  // The press area speaks what it shows; a count is read by the stepper next to it.
  const label = [note ? `${name} (${note})` : name, count === undefined ? summary.amount : '']
    .filter(Boolean)
    .join(', ');
  const row = (
    <ListRow
      title={name}
      note={note || undefined}
      accessibilityLabel={label}
      onPress={() => props.onOpen(item.id, name)}
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.pendingSync ? <PendingDot itemId={item.id} /> : null}
          {count === undefined && summary.amount ? (
            <Text variant="body" color="muted" testID={`item-${item.id}-amount`}>
              {summary.amount}
            </Text>
          ) : null}
          {count === undefined ? <Icon name="chevron-right" size={18} color="muted" /> : null}
        </View>
      }
      controls={
        count !== undefined ? (
          <CountStepper itemId={item.id} name={name} count={count} testID={`item-${item.id}`} />
        ) : undefined
      }
      testID={`item-${item.id}`}
    />
  );
  return (
    <SwipeToRemove
      label="Entfernen"
      enabled={props.swipe}
      onRemove={() => removeWithUndo(item.id, name)}
      testID={`item-${item.id}-swipe`}
    >
      {row}
    </SwipeToRemove>
  );
}

/** A checked item under "Erledigt": taking the check out reopens it at once (AC-010). */
function DoneRow(props: { item: ShoppingItem; article: Article | undefined }) {
  const { item } = props;
  const reopen = () => setItemChecked(item.id, false);
  return (
    <CheckRow
      title={props.article?.name ?? 'Unbekannter Artikel'}
      note={summarizeItem(item).notes.join(', ') || undefined}
      checked
      onToggle={reopen}
      onPress={reopen}
      trailing={item.pendingSync ? <PendingDot itemId={item.id} /> : undefined}
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

type MoreAction = 'clear-done' | 'clear-list' | 'stores' | 'articles';

export function ListScreen() {
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const recipesById = useRecipesById();
  const areas = useAreas();
  const today = useToday();
  const online = useOnlineOnly();
  const shopper = useActiveShopper();
  const assistant = useAssistant();
  const router = useRouter();
  const openManageEntry = useOpenManageEntry();
  const { isPhone, isWide } = useBreakpoint();

  const [pantryCheck, setPantryCheck] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState<{ itemId: string; name: string } | undefined>();
  const [dictation, setDictation] = useState<Dictation | undefined>();
  const speech = useDictation();
  const [nothingHeard, setNothingHeard] = useState(false);

  const { open, done } = splitItems(items);
  // Areas in their own order: the store only counts in "Einkaufen" (AC-009).
  const groups = groupItems(open, articlesById, areas);
  const headline = listHeadline(items, recipesById);

  const openItem = (itemId: string, name: string) => setEditing({ itemId, name });
  // Someone else removed the item while its window was open (AC-027).
  const itemGone = () => {
    if (editing) toast.show({ message: `${editing.name} steht nicht mehr auf der Liste` });
    setEditing(undefined);
  };

  const showDictated = (transcript: string, dictated: DictatedItem[]) => {
    setNothingHeard(dictated.length === 0);
    setDictation(
      dictated.length > 0
        ? { transcript, items: dictated.map((item, index) => ({ index, item })) }
        : undefined,
    );
  };
  // The first press listens, the second stops and turns the transcript into proposal rows
  // (AC-028).
  const dictate = () => {
    if (speech.status === 'listening') {
      void speech.stop().then((transcript) => showDictated(transcript, dictatedItems(transcript)));
      return;
    }
    if (speech.status !== 'idle') return;
    setNothingHeard(false);
    setDictation(undefined);
    speech.start();
  };
  const dropGhost = (index: number) => {
    if (!dictation) return;
    const rest = dictation.items.filter((entry) => entry.index !== index);
    setDictation(rest.length > 0 ? { ...dictation, items: rest } : undefined);
  };
  const acceptGhost = (index: number) => {
    const ghost = dictation?.items.find((entry) => entry.index === index);
    if (ghost) addShoppingItemFromText(ghost.item.text);
    dropGhost(index);
  };
  const acceptAll = () => {
    for (const entry of dictation?.items ?? []) addShoppingItemFromText(entry.item.text);
    setDictation(undefined);
  };

  const clearDone = () => {
    const restore = snapshot();
    const count = clearCheckedItems();
    if (count === 0) return;
    toast.show({
      message: count === 1 ? '1 erledigter Posten entfernt' : `${count} erledigte Posten entfernt`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };
  // "Liste leeren …" (AC-035): everything, with "Rückgängig" for all of it.
  const clearList = () => {
    setConfirmClear(false);
    const restore = snapshot();
    const count = clearShoppingList();
    if (count === 0) return;
    toast.show({
      message:
        count === 1
          ? 'Einkaufsliste geleert · 1 Posten'
          : `Einkaufsliste geleert · ${count} Posten`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const moreOptions: MenuOption<MoreAction>[] = [
    {
      value: 'clear-done',
      label: 'Erledigt leeren',
      disabled: online.disabled || done.length === 0,
      hint: online.hint,
    },
    {
      value: 'clear-list',
      label: 'Liste leeren …',
      disabled: online.disabled || items.length === 0,
      hint: online.hint,
    },
    { value: 'stores', label: 'Märkte & Bereiche' },
    { value: 'articles', label: 'Artikel' },
  ];
  const onMore = (action: MoreAction) => {
    if (action === 'stores') openManageEntry('/maerkte');
    // "Zurück" on "Artikel" leads to the list again (spec 0007, AC-021).
    else if (action === 'articles')
      openManageEntry({ pathname: '/artikel', params: { von: 'liste' } });
    else if (online.disabled) return;
    else if (action === 'clear-done') clearDone();
    else if (items.length > 0) setConfirmClear(true);
  };

  const renderGroup = (group: ItemGroup) => (
    <View key={group.key}>
      <GroupLabel testID={`group-${group.key}`}>{group.title}</GroupLabel>
      <List>
        {group.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            article={articlesById[item.articleId]}
            swipe={isPhone && !online.disabled}
            onOpen={openItem}
          />
        ))}
      </List>
    </View>
  );

  const more = (
    <Menu<MoreAction>
      trigger="icon"
      icon="ellipsis"
      label="Mehr"
      accessibilityLabel="Mehr zur Einkaufsliste"
      options={moreOptions}
      onChange={onMore}
      testID="list-more"
    />
  );

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
        {/* One list per household (ADR-0012): a fixed title, nothing to switch. */}
        <Text
          variant={isPhone ? 'title' : 'display'}
          heading
          numberOfLines={1}
          testID="screen-title"
        >
          Einkaufsliste
        </Text>
        <Text variant="small" color="muted" numberOfLines={2} testID="list-headline">
          {headline.label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {more}
        <StartPageActions />
      </View>
    </View>
  );

  const actions = (
    <Stack gap={10} style={{ marginBottom: 6 }}>
      {shopper ? (
        <Notice icon="shopping-basket" text={shopper.label} testID="list-active-shopper" />
      ) : null}
      <Row gap={10} wrap>
        <Button
          label="Einkaufen"
          icon="shopping-basket"
          disabled={open.length === 0}
          testID="start-shopping"
          onPress={() => router.push('/einkaufen')}
        />
        <Button
          label="+ Aus Kalender …"
          variant="secondary"
          disabled={online.disabled}
          hint={online.hint}
          testID="list-from-plan"
          onPress={() => setPantryCheck(true)}
        />
      </Row>
    </Stack>
  );

  const live =
    speech.status !== 'idle' ? (
      <View style={{ marginTop: 12, gap: 8 }} testID="dictation-live">
        <Row gap={8}>
          <Icon name="mic" size={17} color="accent" />
          <Text variant="small" color="muted" style={{ flexShrink: 1 }}>
            {speech.status === 'starting'
              ? 'Mikrofon wird vorbereitet …'
              : speech.transcript
                ? `„${speech.transcript}“`
                : 'Ich höre zu …'}
          </Text>
        </Row>
        {speech.status === 'listening' ? (
          <Button
            label="Fertig"
            icon="check"
            size="sm"
            variant="secondary"
            onPress={dictate}
            testID="dictation-stop"
          />
        ) : null}
      </View>
    ) : speech.error || nothingHeard ? (
      <View style={{ marginTop: 12 }}>
        <Notice
          icon="mic"
          text={speech.error ?? 'Nichts verstanden – versuch es gern noch einmal.'}
          testID="dictation-error"
        />
      </View>
    ) : null;

  const ghosts = dictation ? (
    <View style={{ marginTop: 12, gap: 4 }} testID="dictation">
      <Text variant="small" color="muted" testID="dictation-transcript">
        {`„${dictation.transcript}“`}
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
  if (open.length === 0 && done.length === 0 && !dictation && !live) {
    // "Einkaufen" and "+ Aus Kalender …" stay above it; the field "Was fehlt?" is below (AC-013).
    body = (
      <EmptyState
        icon="shopping-basket"
        title="Die Liste ist leer"
        text="Tipp unten ein, was fehlt – oder hol dir die Zutaten mit „+ Aus Kalender …“."
        testID="list-empty"
      />
    );
  } else {
    const [left, right] = balance(groups);
    body = (
      <>
        {live}
        {ghosts}
        {open.length === 0 ? (
          <Text color="muted" style={{ marginTop: 16 }} testID="list-all-done">
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
            <Pressable
              testID="done-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: showDone }}
              accessibilityLabel={`Erledigt (${done.length})`}
              onPress={() => setShowDone(!showDone)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                alignSelf: 'flex-start',
              }}
            >
              <Icon name={showDone ? 'chevron-down' : 'chevron-right'} size={18} color="muted" />
              <Text variant="groupLabel" heading>{`Erledigt (${done.length})`}</Text>
            </Pressable>
            {showDone ? (
              <List>
                {done.map((item) => (
                  <DoneRow key={item.id} item={item} article={articlesById[item.articleId]} />
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
      tone="liste"
      clearFab={false}
      header={header}
      footer={
        <SmartComposer
          onDictate={features.ai ? dictate : undefined}
          dictating={speech.status === 'listening'}
          dictateDisabled={
            online.disabled || speech.status === 'starting' || speech.status === 'stopping'
          }
          onAssistant={features.ai ? () => assistant.open() : undefined}
        />
      }
    >
      {actions}
      <Stack gap={0}>{body}</Stack>
      {editing ? (
        <ItemSheet
          key={editing.itemId}
          itemId={editing.itemId}
          name={editing.name}
          onClose={() => setEditing(undefined)}
          onGone={itemGone}
        />
      ) : null}
      {confirmClear ? (
        <ClearListSheet
          count={items.length}
          onConfirm={clearList}
          onClose={() => setConfirmClear(false)}
        />
      ) : null}
      {pantryCheck ? (
        <PantryCheckSheet weekDates={weekDates(today)} onClose={() => setPantryCheck(false)} />
      ) : null}
    </Screen>
  );
}
