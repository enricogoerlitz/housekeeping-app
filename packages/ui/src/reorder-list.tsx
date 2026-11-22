import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  View,
  type AccessibilityActionEvent,
  type HostInstance,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { announce } from './announce';
import { IconButton, keyboardFocusRing, keyboardFocus } from './controls';
import { haptic } from './haptics';
import { List, ListRow } from './lists';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

export interface ReorderListItem {
  key: string;
  name: string;
  subtitle?: string;
  /** Shown muted, e.g. a hidden area. */
  muted?: boolean;
}

/** The words of the list; they live with the feature, not here. */
export interface ReorderListLabels {
  /** The drag handle ≡, e.g. "Getränke verschieben". */
  handle: (name: string) => string;
  up: (name: string) => string;
  down: (name: string) => string;
  /** Said after every move: "Getränke, Position 1 von 14" (index 0-based). */
  position: (name: string, index: number, total: number) => string;
  /** With `onPress`: the accessible name of a row, e.g. "Badehose 2× bearbeiten". */
  open?: (name: string) => string;
}

export interface ReorderListProps<T extends ReorderListItem> {
  items: readonly T[];
  /** Moves the entry to `toIndex` (0-based, counted without the entry itself). */
  onMove: (key: string, toIndex: number) => void;
  labels: ReorderListLabels;
  /** Offline: no dragging, the arrows are greyed out with `disabledHint`. */
  disabled?: boolean;
  disabledHint?: string;
  /** More buttons at the end of a row, e.g. "Ausblenden" or ⋯. */
  trailing?: (item: T, index: number) => ReactNode;
  /**
   * A tap on the row (name and subtitle; handle, arrows and `trailing` stay buttons of their
   * own), e.g. to open the details. Disabled together with the list, with `disabledHint`.
   */
  onPress?: (key: string) => void;
  /**
   * Prefix of the test ids: rows `${testID}-row-${key}`, handle `-handle-`, arrows `-up-` and
   * `-down-`, position `-pos-`, the press area `-open-`; the list itself is `${testID}-list`.
   */
  testID?: string;
}

// A drag starts on the handle only; the rows around make room in 150 ms (on-screen movement).
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const MAKE_ROOM_MS = 150;
const SETTLE_MS = 150;
const RESET_FALLBACK_MS = 120;
// react-native-web passes these through to the DOM; native has no such props and ignores them.
type KeyEvent = { key: string; preventDefault: () => void };
const WEB_HANDLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle)
    : null;

interface Layout {
  y: number;
  height: number;
}

interface DragState {
  /** Index of the dragged row, -1 while nothing is dragged. */
  from: SharedValue<number>;
  /** Where it would land (index without the dragged row). */
  to: SharedValue<number>;
  dy: SharedValue<number>;
  height: SharedValue<number>;
}

/** Final index of a row whose centre is at `center`, from the rows' measured layouts. */
function dropIndex(
  layouts: readonly { y: number; height: number }[],
  from: number,
  center: number,
): number {
  let index = 0;
  layouts.forEach((layout, other) => {
    if (other !== from && layout.y + layout.height / 2 < center) index++;
  });
  return index;
}

/** How far the dragged row travels to its new place: the heights of the rows it passes. */
function travel(layouts: readonly { height: number }[], from: number, to: number): number {
  let distance = 0;
  if (to > from) for (let i = from + 1; i <= to; i++) distance += layouts[i]?.height ?? 0;
  else for (let i = to; i < from; i++) distance -= layouts[i]?.height ?? 0;
  return distance;
}

/**
 * "Liste zum Ordnen" (spec 0007, REQ-009, REQ-010): a list whose order the user sets. Three ways,
 * all equal: drag the handle ≡ (the row follows the finger or mouse, the others make room, a
 * light haptic on the drop), the arrows "nach oben" / "nach unten" on every row, and on the web
 * the arrow keys on the focused handle. Every move is announced for screen readers
 * ("Getränke, Position 1 von 14"); screen readers also get the moves as row actions.
 */
export function ReorderList<T extends ReorderListItem>(props: ReorderListProps<T>) {
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);
  const height = useSharedValue(0);
  const drag: DragState = { from, to, dy, height };
  // Measured rows by key and the shown order; the drag reads both when it starts.
  const layouts = useSharedValue<Record<string, Layout>>({});
  const keys = useSharedValue<string[]>([]);
  const handles = useRef(new Map<string, HostInstance>());
  const [focusKey, setFocusKey] = useState<string | undefined>();
  const order = props.items.map((item) => item.key).join('\n');

  // The new order is on screen: the rows drop their offsets in the same frame.
  useLayoutEffect(() => {
    keys.set(order.split('\n'));
    from.set(-1);
    to.set(-1);
    dy.set(0);
  }, [order, keys, from, to, dy]);

  // A keyboard move re-renders the rows; the handle keeps the focus.
  useEffect(() => {
    if (focusKey === undefined) return;
    handles.current.get(focusKey)?.focus();
  }, [order, focusKey]);

  const shownOrder = useRef(order);
  useLayoutEffect(() => {
    shownOrder.current = order;
  }, [order]);

  const total = props.items.length;
  const move = (key: string, toIndex: number, via: 'drag' | 'button') => {
    const item = props.items.find((candidate) => candidate.key === key);
    const index = Math.max(0, Math.min(total - 1, toIndex));
    if (!item) return;
    const before = order;
    try {
      props.onMove(key, index);
    } finally {
      // Refused (e.g. offline or an error shown by the caller): the dragged row goes back.
      setTimeout(() => {
        if (shownOrder.current !== before) return;
        from.set(-1);
        to.set(-1);
        dy.set(0);
      }, RESET_FALLBACK_MS);
    }
    if (via === 'drag') haptic('drop');
    announce(props.labels.position(item.name, index, total));
  };

  return (
    <List testID={props.testID ? `${props.testID}-list` : undefined}>
      {props.items.map((item, index) => (
        <ReorderRow
          key={item.key}
          item={item}
          index={index}
          total={total}
          drag={drag}
          layouts={layouts}
          keys={keys}
          registerHandle={(node) => {
            if (node) handles.current.set(item.key, node);
            else handles.current.delete(item.key);
          }}
          onMove={(toIndex, via) => {
            if (via === 'key') setFocusKey(item.key);
            move(item.key, toIndex, via === 'drag' ? 'drag' : 'button');
          }}
          labels={props.labels}
          disabled={props.disabled}
          disabledHint={props.disabledHint}
          trailing={props.trailing?.(item, index)}
          onPress={props.onPress ? () => props.onPress?.(item.key) : undefined}
          testID={props.testID}
        />
      ))}
    </List>
  );
}

interface ReorderRowProps {
  item: ReorderListItem;
  index: number;
  total: number;
  drag: DragState;
  layouts: SharedValue<Record<string, Layout>>;
  keys: SharedValue<string[]>;
  registerHandle: (node: HostInstance | null) => void;
  onMove: (toIndex: number, via: 'drag' | 'button' | 'key') => void;
  labels: ReorderListLabels;
  disabled?: boolean;
  disabledHint?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}

function ReorderRow(props: ReorderRowProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const { from, to, dy, height } = props.drag;
  const { layouts, keys, registerHandle } = props;
  const ownIndex = useSharedValue(props.index);
  const enabled = useSharedValue(!props.disabled);
  const [focused, setFocused] = useState(false);
  const [pressFocused, setPressFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Set on release: where the row lands; the effect below commits the move once it glided there.
  const [landing, setLanding] = useState<number | undefined>();
  useEffect(() => {
    ownIndex.set(props.index);
    enabled.set(!props.disabled);
  }, [props.index, props.disabled, ownIndex, enabled]);

  const commit = useEffectEvent((toIndex: number) => props.onMove(toIndex, 'drag'));
  useEffect(() => {
    if (landing === undefined) return;
    const timer = setTimeout(
      () => {
        setLanding(undefined);
        commit(landing);
      },
      reduced ? 0 : SETTLE_MS,
    );
    return () => clearTimeout(timer);
  }, [landing, reduced]);

  const [responder] = useState(() => {
    let rows: Layout[] = [];
    const finish = () => {
      const index = ownIndex.get();
      const target = to.get();
      setDragging(false);
      if (target === index || target < 0) {
        dy.set(withTiming(0, { duration: SETTLE_MS, easing: EASE_OUT }, () => from.set(-1)));
        to.set(index);
        return;
      }
      // Glide into the gap, then commit; the list resets the offsets with the new order.
      dy.set(withTiming(travel(rows, index, target), { duration: SETTLE_MS, easing: EASE_OUT }));
      setLanding(target);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => enabled.get(),
      onStartShouldSetPanResponderCapture: () => enabled.get(),
      onMoveShouldSetPanResponderCapture: () => enabled.get(),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const index = ownIndex.get();
        const measured = layouts.get();
        rows = keys.get().map((key) => measured[key] ?? { y: 0, height: 0 });
        height.set(rows[index]?.height ?? 0);
        dy.set(0);
        to.set(index);
        from.set(index);
        setDragging(true);
      },
      onPanResponderMove: (_event, gesture) => {
        const index = ownIndex.get();
        const own = rows[index];
        dy.set(gesture.dy);
        if (own) to.set(dropIndex(rows, index, own.y + own.height / 2 + gesture.dy));
      },
      onPanResponderRelease: () => finish(),
      // Taken over (e.g. by a scroll view): the row lands where it was last shown.
      onPanResponderTerminate: () => finish(),
    });
  });

  const rowStyle = useAnimatedStyle(() => {
    const dragged = from.get();
    const index = ownIndex.get();
    if (dragged < 0) return { transform: [{ translateY: 0 }], zIndex: 0 };
    if (index === dragged) return { transform: [{ translateY: dy.get() }], zIndex: 2 };
    const target = to.get();
    let shift = 0;
    if (dragged < target && index > dragged && index <= target) shift = -height.get();
    else if (target < dragged && index >= target && index < dragged) shift = height.get();
    return {
      transform: [
        {
          translateY: withTiming(shift, {
            duration: MAKE_ROOM_MS,
            easing: EASE_IN_OUT,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
      zIndex: 0,
    };
  });

  const { item, index, total, labels } = props;
  const id = (part: string) => (props.testID ? `${props.testID}-${part}-${item.key}` : undefined);
  const first = index === 0;
  const last = index === total - 1;
  const onKeyDown = (event: KeyEvent) => {
    if (props.disabled) return;
    if (event.key === 'ArrowUp' && !first) {
      event.preventDefault();
      props.onMove(index - 1, 'key');
    } else if (event.key === 'ArrowDown' && !last) {
      event.preventDefault();
      props.onMove(index + 1, 'key');
    }
  };
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (props.disabled) return;
    if (event.nativeEvent.actionName === 'moveUp' && !first) props.onMove(index - 1, 'button');
    if (event.nativeEvent.actionName === 'moveDown' && !last) props.onMove(index + 1, 'button');
  };

  return (
    <Animated.View
      testID={id('row')}
      onLayout={(event: LayoutChangeEvent) => {
        const { y, height: rowHeight } = event.nativeEvent.layout;
        const key = props.item.key;
        layouts.set((measured) => ({ ...measured, [key]: { y, height: rowHeight } }));
      }}
      style={[
        rowStyle,
        dragging
          ? {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.shape.radius.control,
              outlineWidth: 1,
              outlineColor: theme.colors.border,
              outlineStyle: 'solid',
            }
          : null,
      ]}
      accessibilityActions={[
        { name: 'moveUp', label: labels.up(item.name) },
        { name: 'moveDown', label: labels.down(item.name) },
      ]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <ListRow
        title={
          props.onPress ? (
            // Only name and subtitle press: buttons inside a button would not work on the web.
            <Pressable
              testID={id('open')}
              accessibilityRole="button"
              accessibilityLabel={labels.open?.(item.name) ?? item.name}
              accessibilityHint={props.disabled ? props.disabledHint : undefined}
              accessibilityState={{ disabled: !!props.disabled }}
              disabled={props.disabled}
              onPress={props.onPress}
              onFocus={(event) => setPressFocused(keyboardFocus(event))}
              onBlur={() => setPressFocused(false)}
              style={(state) => [
                {
                  minHeight: 44,
                  justifyContent: 'center',
                  borderRadius: theme.shape.radius.control,
                  opacity: state.pressed ? 0.6 : 1,
                },
                keyboardFocusRing(theme, pressFocused),
              ]}
            >
              <Text variant="rowTitle" color={item.muted ? 'muted' : 'text'} numberOfLines={2}>
                {item.name}
              </Text>
              {item.subtitle ? (
                <Text variant="small" color="muted" style={{ marginTop: 1 }}>
                  {item.subtitle}
                </Text>
              ) : null}
            </Pressable>
          ) : (
            <Text variant="rowTitle" color={item.muted ? 'muted' : 'text'} numberOfLines={2}>
              {item.name}
            </Text>
          )
        }
        subtitle={props.onPress ? undefined : item.subtitle}
        leading={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View
              ref={registerHandle}
              {...responder.panHandlers}
              testID={id('handle')}
              accessibilityRole="button"
              accessibilityLabel={labels.handle(item.name)}
              accessibilityHint={props.disabled ? props.disabledHint : undefined}
              accessibilityState={{ disabled: !!props.disabled }}
              focusable={!props.disabled}
              onFocus={(event) => setFocused(keyboardFocus(event))}
              onBlur={() => setFocused(false)}
              {...({ onKeyDown } as object)}
              style={[
                {
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.shape.radius.control,
                  opacity: props.disabled ? 0.4 : 1,
                },
                props.disabled ? null : WEB_HANDLE,
                keyboardFocusRing(theme, focused),
              ]}
            >
              <Icon name="grip-vertical" size={20} color="muted" />
            </View>
            <Text
              variant="smallStrong"
              color="muted"
              testID={id('pos')}
              style={{ minWidth: 20, textAlign: 'right' }}
            >
              {String(index + 1)}
            </Text>
          </View>
        }
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton
              icon="chevron-up"
              label={labels.up(item.name)}
              hint={props.disabled ? props.disabledHint : undefined}
              disabled={props.disabled || first}
              onPress={() => props.onMove(index - 1, 'button')}
              testID={id('up')}
            />
            <IconButton
              icon="chevron-down"
              label={labels.down(item.name)}
              hint={props.disabled ? props.disabledHint : undefined}
              disabled={props.disabled || last}
              onPress={() => props.onMove(index + 1, 'button')}
              testID={id('down')}
            />
            {props.trailing}
          </View>
        }
      />
    </Animated.View>
  );
}
