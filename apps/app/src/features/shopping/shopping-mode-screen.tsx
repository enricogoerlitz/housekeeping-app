import {
  assignArticleArea,
  clearCheckedItems,
  setItemChecked,
  setItemNotAvailable,
  snapshot,
  useAreas,
  useArticlesById,
  useOffline,
  useShoppingItems,
  useShoppingStore,
} from '@housekeeping/api';
import {
  groupItems,
  listProgress,
  summarizeItem,
  type Article,
  type Id,
  type ItemGroup,
  type ShoppingItem,
} from '@housekeeping/core';
import {
  Button,
  Checkbox,
  GroupLabel,
  IconButton,
  ProgressBar,
  Screen,
  Sheet,
  Text,
  toast,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { undoAction } from '@/features/shell/offline';

/** Decision 6 of spec 0003: clearing is a write, so offline "Fertig" only leaves the mode. */
const FINISH_OFFLINE_HINT = 'Abgehakte räumen wir auf, sobald du Netz hast';

// A checked row stays in place this long before it moves to "Erledigt", so a mis-tap is visible.
const LINGER_MS = 2000;

function SmRow(props: {
  item: ShoppingItem;
  article: Article | undefined;
  onToggle: () => void;
  onNotHere?: () => void;
  onBackHere?: () => void;
  onAssignArea?: () => void;
}) {
  const theme = useTheme();
  const { item } = props;
  const name = props.article?.name ?? 'Unbekannter Artikel';
  const summary = summarizeItem(item);
  const note = summary.notes.join(', ');
  return (
    <View
      testID={`sm-item-${item.id}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        paddingVertical: 8,
        paddingLeft: 14,
        paddingRight: 6,
        borderRadius: theme.shape.radius.card - 4,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.shape.cardBorder ? 1 : 0,
        borderColor: theme.colors.border,
      }}
    >
      <Checkbox
        checked={item.checked}
        label={name}
        onChange={props.onToggle}
        testID={`sm-item-${item.id}-check`}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.checked ? `${name} wieder offen` : `${name} abhaken`}
          onPress={props.onToggle}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="cardTitle" color={item.checked ? 'muted' : 'text'} strike={item.checked}>
            {name}
            {note ? (
              <Text variant="body" color="muted">
                {' '}
                ({note})
              </Text>
            ) : null}
          </Text>
        </Pressable>
        {props.onAssignArea ? (
          <Button
            label="Bereich zuordnen"
            icon="map-pin"
            size="sm"
            variant="link"
            testID={`assign-area-${item.id}`}
            onPress={props.onAssignArea}
          />
        ) : null}
      </View>
      {summary.amount ? (
        <Text variant="bodyStrong" color="muted">
          {summary.amount}
        </Text>
      ) : null}
      {props.onNotHere ? (
        <IconButton
          icon="ban"
          label={`${name} nicht da`}
          testID={`sm-not-here-${item.id}`}
          onPress={props.onNotHere}
        />
      ) : null}
      {props.onBackHere ? (
        <IconButton
          icon="undo"
          label={`${name} doch da`}
          testID={`sm-back-here-${item.id}`}
          onPress={props.onBackHere}
        />
      ) : null}
    </View>
  );
}

/**
 * Einkaufsmodus: calm, large, one-handed. Everything here works offline (ADR-0008 addendum):
 * checking, "Nicht da" and assigning an area.
 */
export function ShoppingModeScreen() {
  const router = useRouter();
  const store = useShoppingStore();
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const areas = useAreas();
  const offline = useOffline();
  const theme = useTheme();
  const { isWide } = useBreakpoint();

  const [lingering, setLingering] = useState<Set<Id>>(new Set());
  const [areaFor, setAreaFor] = useState<ShoppingItem | undefined>();
  const timers = useRef(new Map<Id, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) clearTimeout(timer);
    };
  }, []);

  // The household's shopping list (ADR-0012): all of its items.
  const own = items;
  const progress = listProgress(own);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/liste');
  };

  const toggle = (item: ShoppingItem) => {
    const checking = !item.checked;
    setItemChecked(item.id, checking);
    const existing = timers.current.get(item.id);
    if (existing) clearTimeout(existing);
    if (!checking) {
      timers.current.delete(item.id);
      setLingering((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      return;
    }
    setLingering((current) => new Set(current).add(item.id));
    timers.current.set(
      item.id,
      setTimeout(() => {
        timers.current.delete(item.id);
        setLingering((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }, LINGER_MS),
    );
  };

  const finish = () => {
    if (offline) {
      toast.show({ message: FINISH_OFFLINE_HINT });
      close();
      return;
    }
    const restore = snapshot();
    const bought = progress.done;
    const remaining = progress.total - progress.done;
    clearCheckedItems();
    toast.show({
      message: `${bought} gekauft · ${remaining} bleiben`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
    close();
  };

  // Rows checked a moment ago stay in their group; "nicht da" rows go to "Woanders kaufen".
  const inAisles = own.filter(
    (item) => (!item.checked || lingering.has(item.id)) && !item.notAvailable,
  );
  const groups: ItemGroup[] = groupItems(inAisles, articlesById, areas, store);
  const notHere = own.filter((item) => !item.checked && item.notAvailable);
  if (notHere.length > 0) {
    const elsewhere = groups.find((group) => group.key === 'elsewhere');
    if (elsewhere) elsewhere.items = [...elsewhere.items, ...notHere];
    else groups.push({ key: 'elsewhere', title: 'Woanders kaufen', items: notHere });
  }
  const done = own.filter((item) => item.checked && !lingering.has(item.id));

  const header = (
    <View style={{ gap: 10, paddingTop: 8, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="small" color="muted">
            Einkauf · Einkaufsliste
          </Text>
          <Text
            variant={isWide ? 'display' : 'title'}
            heading
            numberOfLines={1}
            testID="screen-title"
          >
            {store?.name ?? 'Ohne Markt'}
          </Text>
        </View>
        {/* Full screen on phones, so "Fertig" is the way out (spec 0005, D5). */}
        <Button
          label="Fertig"
          variant="secondary"
          size="sm"
          hint="Einkaufen verlassen"
          testID="shopping-close"
          onPress={close}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ProgressBar
          value={progress.total === 0 ? 0 : progress.done / progress.total}
          label={`${progress.done} von ${progress.total} erledigt`}
        />
        <Text variant="bodyStrong" testID="shopping-progress">
          {`${progress.done} / ${progress.total}`}
        </Text>
      </View>
    </View>
  );

  const footer = (
    <View
      style={{
        backgroundColor: theme.colors.barBg,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: isWide ? 36 : theme.shape.gutter,
        paddingVertical: 12,
      }}
    >
      <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <Button
          label="Einkauf abschließen"
          icon="check"
          full
          testID="shopping-finish"
          onPress={finish}
        />
      </View>
    </View>
  );

  return (
    <Screen tone="liste" header={header} footer={footer} maxWidth={760} clearFab={false}>
      {own.length === 0 ? (
        <Text color="muted" style={{ marginTop: 24 }} align="center">
          Auf dieser Liste steht nichts.
        </Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.key} testID={`sm-group-${group.key}`}>
          <GroupLabel>{group.title}</GroupLabel>
          <View style={{ gap: 8 }}>
            {group.items.map((item) => (
              <SmRow
                key={item.id}
                item={item}
                article={articlesById[item.articleId]}
                onToggle={() => toggle(item)}
                onNotHere={
                  !item.checked && !item.notAvailable
                    ? () => setItemNotAvailable(item.id, true)
                    : undefined
                }
                onBackHere={
                  item.notAvailable ? () => setItemNotAvailable(item.id, false) : undefined
                }
                onAssignArea={
                  group.key === 'none' && !item.checked ? () => setAreaFor(item) : undefined
                }
              />
            ))}
          </View>
        </View>
      ))}
      {done.length > 0 ? (
        <View testID="sm-done" style={{ marginTop: 12 }}>
          <GroupLabel>{`Erledigt (${done.length})`}</GroupLabel>
          <View style={{ gap: 8 }}>
            {done.map((item) => (
              <SmRow
                key={item.id}
                item={item}
                article={articlesById[item.articleId]}
                onToggle={() => toggle(item)}
              />
            ))}
          </View>
        </View>
      ) : null}
      {areaFor ? (
        <AreaSheet
          item={areaFor}
          article={articlesById[areaFor.articleId]}
          onClose={() => setAreaFor(undefined)}
        />
      ) : null}
    </Screen>
  );
}

function AreaSheet(props: {
  item: ShoppingItem;
  article: Article | undefined;
  onClose: () => void;
}) {
  const areas = useAreas();
  const theme = useTheme();
  const name = props.article?.name ?? 'Artikel';
  const sorted = [...areas].sort((a, b) => a.sort - b.sort);
  return (
    <Sheet visible onClose={props.onClose} title={`Wo liegt ${name}?`} testID="area-sheet" size="s">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {sorted.map((area) => (
          <Pressable
            key={area.id}
            testID={`area-tile-${area.id}`}
            accessibilityRole="button"
            accessibilityLabel={area.name}
            onPress={() => {
              assignArticleArea(props.item.articleId, area.id);
              props.onClose();
              toast.show({ message: `${name} liegt jetzt unter ${area.name}`, duration: 2500 });
            }}
            style={(state) => ({
              flexBasis: '45%',
              flexGrow: 1,
              minHeight: 64,
              justifyContent: 'center',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: theme.shape.radius.control,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: state.pressed ? 0.6 : 1,
            })}
          >
            <Text variant="bodyStrong">{area.name}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
