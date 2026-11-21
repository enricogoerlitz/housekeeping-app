import {
  addShoppingItemFromText,
  clearCheckedItems,
  dictatedItems,
  setItemChecked,
  snapshot,
  splitItems,
  useAreas,
  useArticlesById,
  useShoppingItems,
  useShoppingStore,
  useToday,
  type DictatedItem,
} from '@housekeeping/api';
import {
  groupItems,
  summarizeItem,
  weekDates,
  type Article,
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
  Notice,
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

import { StartPageActions } from '@/features/shell/profile-button';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
import { useDictation } from '@/lib/use-dictation';

import { StoreSheet } from './list-sheets';
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
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const areas = useAreas();
  const store = useShoppingStore();
  const today = useToday();
  const online = useOnlineOnly();
  const assistant = useAssistant();
  const router = useRouter();
  const { isPhone, isWide } = useBreakpoint();

  const [storeSheet, setStoreSheet] = useState(false);
  const [pantryCheck, setPantryCheck] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const [dictation, setDictation] = useState<Dictation | undefined>();
  const speech = useDictation();
  const [nothingHeard, setNothingHeard] = useState(false);

  const { open, done } = splitItems(items);
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
    toast.show({
      message: count === 1 ? '1 Posten geleert' : `${count} Posten geleert`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
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
      onPress={() => setStoreSheet(true)}
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
        {/* One list per household (ADR-0012): a fixed title, nothing to switch. */}
        <Text
          variant={isPhone ? 'title' : 'display'}
          heading
          numberOfLines={1}
          testID="screen-title"
        >
          Einkaufsliste
        </Text>
        {isPhone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {storeChip}
            {forText}
          </View>
        ) : (
          forText
        )}
      </View>
      {isPhone ? <StartPageActions /> : storeChip}
    </View>
  );

  const actions = (
    <Row gap={10} wrap style={{ marginBottom: 6 }}>
      <Button
        label="Einkaufen"
        icon="shopping-basket"
        disabled={open.length === 0}
        testID="start-shopping"
        onPress={() => router.push('/einkaufen')}
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
        {live}
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
                disabled={online.disabled}
                hint={online.hint}
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
      {storeSheet ? <StoreSheet onClose={() => setStoreSheet(false)} /> : null}
      {pantryCheck ? (
        <PantryCheckSheet weekDates={weekDates(today)} onClose={() => setPantryCheck(false)} />
      ) : null}
    </Screen>
  );
}
