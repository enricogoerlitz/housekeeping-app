import {
  addShoppingItemFromText,
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
  finishSummary,
  listProgress,
  parseSmartInput,
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
  ProgressBar,
  RowTransition,
  Screen,
  Sheet,
  Text,
  TextField,
  toast,
  useBreakpoint,
  useCheckWindow,
  useTheme,
  WIDE_GUTTER,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOpenManageEntry } from '@/features/manage/navigation';
import { undoAction } from '@/features/shell/offline';

import { useActiveShopper } from './active-shopper';
import { StoreChoiceSheet, WITHOUT_STORE_LABEL } from './store-choice-sheet';

/** Decision 6 of spec 0003: clearing is a write, so offline "Fertig" only leaves the mode. */
const FINISH_OFFLINE_HINT = 'Abgehakte räumen wir auf, sobald du Netz hast';
// "Einkaufen" is one column at reading width on every screen (spec 0005, D5).
const SHOPPING_MAX_WIDTH = 760;
const ADD_FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';

function SmRow(props: {
  item: ShoppingItem;
  /** The check the row shows: a tap in the running window wins over the data. */
  checked: boolean;
  article: Article | undefined;
  onToggle: () => void;
  onNotHere?: () => void;
  onBackHere?: () => void;
  onAssignArea?: () => void;
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
          <Text variant="cardTitle" color={checked ? 'muted' : 'text'} strike={checked}>
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

  const progress = listProgress(items);
  const shownIds = new Set(check.rows.map((item) => item.id));
  const groups = shoppingModeGroups(check.rows, articlesById, areas, store);
  const inCart = items.filter((item) => !shownIds.has(item.id));

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/liste');
  };

  // "Fertig" (AC-047): online the checked items leave the list with "Rückgängig"; offline it only
  // leaves "Einkaufen" and the tidying waits for the network.
  const finish = () => {
    const summary = finishSummary(items);
    if (summary.bought > 0 && offline) {
      toast.show({ message: FINISH_OFFLINE_HINT });
    } else if (summary.bought > 0) {
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
      style={{
        backgroundColor: theme.colors.barBg,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: isWide ? WIDE_GUTTER : theme.shape.gutter,
        paddingVertical: 10,
      }}
    >
      <View style={{ width: '100%', maxWidth: SHOPPING_MAX_WIDTH, alignSelf: 'center' }}>
        <AddItemField />
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
            accessibilityState={{ expanded: cartOpen }}
            accessibilityLabel={`Im Wagen (${inCart.length})`}
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
        <AreaSheet
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
            openManage('/maerkte');
          }}
        />
      ) : null}
    </Screen>
  );
}

/**
 * "Posten hinzufügen" in the store (AC-046): works offline through the store queue; the new row
 * lands in its area or under "Ohne Bereich".
 */
function AddItemField() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const submit = () => {
    if (!parseSmartInput(text)) {
      setError('Was fehlt denn?');
      return;
    }
    try {
      const added = addShoppingItemFromText(text);
      if (!added) return;
      setText('');
      setError(undefined);
      toast.show({ message: `${added.articleName} steht auf der Liste`, duration: 2500 });
    } catch {
      setError(ADD_FAILED);
    }
  };
  return (
    <TextField
      accessibilityLabel="Posten hinzufügen"
      placeholder="+ Posten hinzufügen"
      value={text}
      round
      onChangeText={(value) => {
        setText(value);
        setError(undefined);
      }}
      onSubmitEditing={submit}
      returnKeyType="done"
      blurOnSubmit={false}
      error={error}
      right={
        <IconButton
          icon="plus"
          label="Hinzufügen"
          disabled={text.trim() === ''}
          onPress={submit}
          testID="shopping-add-submit"
        />
      }
      testID="shopping-add-input"
    />
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
