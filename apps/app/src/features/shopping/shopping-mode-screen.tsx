import {
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
  finishSummary,
  runProgress,
  shoppingModeGroups,
  summarizeItem,
  type Article,
  type ShoppingItem,
} from '@housekeeping/core';
import {
  Button,
  Checkbox,
  Chip,
  GroupLabel,
  haptic,
  Icon,
  IconButton,
  Menu,
  ProgressBar,
  RowTransition,
  Screen,
  Sheet,
  Text,
  toast,
  useBreakpoint,
  useCheckWindow,
  useTheme,
  useToastClearance,
  WIDE_GUTTER,
  expandableA11y,
  useBottomInset,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useOpenManageEntry } from '@/features/manage/navigation';
import { undoAction } from '@/features/shell/offline';
import { AreaPicker } from '@/features/stores/area-picker';

import { useActiveShopper } from './active-shopper';
import { useShoppingRun } from './shopping-run';
import { SmartComposer } from './smart-composer';
import { StoreChoiceSheet, WITHOUT_STORE_LABEL } from './store-choice-sheet';

/** Decision 6 of spec 0003: clearing is a write, so offline "Fertig" only leaves the mode. */
const FINISH_OFFLINE_HINT = 'Abgehakte räumen wir auf, sobald du Netz hast';
// "Einkaufen" is one column at reading width on every screen (spec 0005, D5).
const SHOPPING_MAX_WIDTH = 760;

function SmRow(props: {
  item: ShoppingItem;
  /** The check the row shows: a tap in the running window wins over the data. */
  checked: boolean;
  article: Article | undefined;
  onToggle: () => void;
  onNotHere?: () => void;
  onBackHere?: () => void;
  onAssignArea?: () => void;
  /** "Liegt woanders …" in ⋯ of every open row (spec 0025, REQ-011). */
  onElsewhere?: () => void;
}) {
  const theme = useTheme();
  const { item, checked } = props;
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
        checked={checked}
        label={name}
        onChange={props.onToggle}
        testID={`sm-item-${item.id}-check`}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={checked ? `${name} wieder offen` : `${name} abhaken`}
          onPress={props.onToggle}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="rowTitle" color={checked ? 'muted' : 'text'} strike={checked}>
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
      {props.onElsewhere ? (
        <Menu<'elsewhere'>
          trigger="icon"
          icon="ellipsis"
          label="Mehr"
          accessibilityLabel={`Mehr zu ${name}`}
          options={[{ value: 'elsewhere', label: 'Liegt woanders …' }]}
          onChange={() => props.onElsewhere?.()}
          testID={`sm-more-${item.id}`}
        />
      ) : null}
    </View>
  );
}

/**
 * "Einkaufen" (spec 0006, REQ-007): full screen, large, one-handed. The store chip on top picks
 * the walking order on this device (D26). A tap checks at once (server or store queue) and the
 * row stays struck through; 2 s after the last tap the checked rows slide to "Im Wagen" (AC-044).
 * Everything here works offline (ADR-0008 addendum): checking, "nicht da", adding, assigning an
 * area; only clearing on "Fertig" waits for the network.
 */
export function ShoppingModeScreen() {
  const router = useRouter();
  const openManage = useOpenManageEntry();
  const store = useShoppingStore();
  const items = useShoppingItems();
  const articlesById = useArticlesById();
  const areas = useAreas();
  const offline = useOffline();
  const shopper = useActiveShopper();
  const theme = useTheme();
  const { isWide } = useBreakpoint();
  // Above the home bar with its gap (spec 0029, REQ-002).
  const bottomEdge = useBottomInset();
  // Without the tab bar the toast stands above the input bar (spec 0019, AC-024).
  const [footerHeight, setFooterHeight] = useState<number | undefined>();
  useToastClearance(footerHeight === undefined ? undefined : footerHeight - bottomEdge);

  const [areaFor, setAreaFor] = useState<ShoppingItem | undefined>();
  const [choosingStore, setChoosingStore] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const check = useCheckWindow<ShoppingItem>({
    items,
    getId: (item) => item.id,
    isChecked: (item) => item.checked,
    // The check is written at once, not when the window closes (AC-044).
    onToggle: (item, checked) => {
      if (checked) haptic('check');
      setItemChecked(item.id, checked);
    },
    announce: (item, checked) =>
      `${articlesById[item.articleId]?.name ?? 'Posten'} ${checked ? 'abgehakt' : 'wieder offen'}`,
  });

  // Progress and "Im Wagen" count this Einkaufsgang only (spec 0025, REQ-013).
  const run = useShoppingRun(items);
  const progress = runProgress(run, items);
  const shownIds = new Set(check.rows.map((item) => item.id));
  const groups = shoppingModeGroups(check.rows, articlesById, areas, store);
  const inCart = progress.inCart.filter((item) => !shownIds.has(item.id));

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/liste');
  };

  // "Fertig" (AC-043): online every checked item leaves the list, also older ones, with
  // "Rückgängig"; the hint counts this Einkaufsgang. Offline it only leaves "Einkaufen" and the
  // tidying waits for the network.
  const finish = () => {
    const summary = finishSummary(run, items);
    const anyChecked = items.some((item) => item.checked);
    if (anyChecked && offline) {
      toast.show({ message: FINISH_OFFLINE_HINT });
    } else if (anyChecked) {
      const restore = snapshot();
      clearCheckedItems();
      toast.show({
        message: summary.label,
        actionLabel: 'Rückgängig',
        onAction: undoAction(restore),
      });
    }
    close();
  };

  const header = (
    <View style={{ gap: 10, paddingTop: 8, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          variant={isWide ? 'display' : 'title'}
          heading
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0 }}
          testID="screen-title"
        >
          Einkaufen
        </Text>
        {/* Full screen on phones, so "Fertig" is the way out (spec 0005, D5). */}
        <Button
          label="Fertig"
          variant="secondary"
          size="sm"
          hint={offline ? FINISH_OFFLINE_HINT : 'Abgehakte entfernen und Einkaufen verlassen'}
          testID="shopping-close"
          onPress={finish}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip
          label={`${store?.name ?? WITHOUT_STORE_LABEL} ▾`}
          icon="store"
          accessibilityLabel={`Markt: ${store?.name ?? WITHOUT_STORE_LABEL}. Ändern`}
          onPress={() => setChoosingStore(true)}
          testID="shopping-store"
        />
        <ProgressBar
          value={progress.total === 0 ? 0 : progress.done / progress.total}
          label={`${progress.done} von ${progress.total} erledigt`}
        />
        <Text variant="bodyStrong" testID="shopping-progress">
          {`${progress.done}/${progress.total}`}
        </Text>
      </View>
      {shopper ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shopping-basket" size={15} color="muted" />
          <Text variant="small" color="muted" testID="shopping-active-shopper">
            {shopper.label}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // The bar keeps the page's narrow width on wide screens, so the input lines up with the rows.
  const footer = (
    <View
      testID="shopping-add-bar"
      onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
      style={{
        backgroundColor: theme.colors.barBg,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: isWide ? WIDE_GUTTER : theme.shape.gutter,
        paddingTop: 10,
        // Above the home bar (AC-022).
        paddingBottom: 10 + bottomEdge,
      }}
    >
      {/* As wide as the rows: the page's width less its gutters (spec 0031, AC-084). */}
      <View
        style={{
          width: '100%',
          maxWidth: SHOPPING_MAX_WIDTH - 2 * WIDE_GUTTER,
          alignSelf: 'center',
        }}
      >
        {/* The same input as "Was fehlt?", without microphone and assistant (REQ-012). */}
        <SmartComposer
          framed={false}
          placeholder="+ Posten hinzufügen"
          label="Posten hinzufügen"
          inputTestID="shopping-add-input"
          submitTestID="shopping-add-submit"
          onAdded={(added) =>
            toast.show({ message: `${added.articleName} steht auf der Liste`, duration: 2500 })
          }
        />
      </View>
    </View>
  );

  const renderRow = (item: ShoppingItem, groupKey?: string) => {
    const checked = check.isChecked(item);
    return (
      <RowTransition key={item.id}>
        <SmRow
          item={item}
          checked={checked}
          article={articlesById[item.articleId]}
          onToggle={() => check.toggle(item)}
          onNotHere={
            !checked && !item.notAvailable && groupKey !== undefined
              ? () => setItemNotAvailable(item.id, true)
              : undefined
          }
          onBackHere={
            item.notAvailable && !checked ? () => setItemNotAvailable(item.id, false) : undefined
          }
          onAssignArea={groupKey === 'none' && !checked ? () => setAreaFor(item) : undefined}
          onElsewhere={groupKey !== undefined && !checked ? () => setAreaFor(item) : undefined}
        />
      </RowTransition>
    );
  };

  return (
    <Screen
      tone="liste"
      header={header}
      footer={footer}
      maxWidth={SHOPPING_MAX_WIDTH}
      clearFab={false}
    >
      {items.length === 0 ? (
        <Text color="muted" style={{ marginTop: 24 }} align="center" testID="shopping-empty">
          Auf der Einkaufsliste steht nichts.
        </Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.key} testID={`sm-group-${group.key}`}>
          <GroupLabel>
            {group.key === 'elsewhere' ? `${group.title} (${group.items.length})` : group.title}
          </GroupLabel>
          <View style={{ gap: 8 }}>{group.items.map((item) => renderRow(item, group.key))}</View>
        </View>
      ))}
      {inCart.length > 0 ? (
        <View testID="sm-done" style={{ marginTop: 12 }}>
          <Pressable
            testID="sm-done-toggle"
            accessibilityRole="button"
            {...expandableA11y(`Im Wagen (${inCart.length})`, cartOpen, Platform.OS, {
              expanded: 'aufgeklappt',
              collapsed: 'eingeklappt',
            })}
            onPress={() => setCartOpen(!cartOpen)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
          >
            <Icon name={cartOpen ? 'chevron-down' : 'chevron-right'} size={18} color="muted" />
            <Text variant="groupLabel" heading>
              {`Im Wagen (${inCart.length})`}
            </Text>
          </Pressable>
          {cartOpen ? (
            <View style={{ gap: 8 }}>{inCart.map((item) => renderRow(item))}</View>
          ) : null}
        </View>
      ) : null}
      {areaFor ? (
        <ElsewhereSheet
          item={areaFor}
          article={articlesById[areaFor.articleId]}
          onClose={() => setAreaFor(undefined)}
        />
      ) : null}
      {choosingStore ? (
        <StoreChoiceSheet
          current={store}
          onClose={() => setChoosingStore(false)}
          onManage={() => {
            setChoosingStore(false);
            openManage({ pathname: '/maerkte', params: { von: 'liste' } });
          }}
        />
      ) : null}
    </Screen>
  );
}

/**
 * "Wo liegt Ingwer?" (spec 0025, REQ-011): the one area picker; the area applies to the article
 * from now on, on every list and for every member. A store action, offline too.
 */
function ElsewhereSheet(props: {
  item: ShoppingItem;
  article: Article | undefined;
  onClose: () => void;
}) {
  const name = props.article?.name ?? 'Artikel';
  return (
    <Sheet visible onClose={props.onClose} title={`Wo liegt ${name}?`} testID="area-sheet" size="m">
      <AreaPicker
        articleId={props.item.articleId}
        currentAreaId={props.article?.areaId}
        onPicked={(areaName) => {
          props.onClose();
          toast.show({
            message: areaName
              ? `${name} liegt jetzt unter ${areaName}`
              : `${name} steht jetzt unter „Ohne Bereich“`,
            duration: 2500,
          });
        }}
        testID="area-picker"
      />
    </Sheet>
  );
}
