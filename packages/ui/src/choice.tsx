import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type HostInstance,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';

import {
  ChipView,
  FOCUS_RING_ROOM,
  IconButton,
  keyboardFocused,
  keyboardFocusRing,
} from './controls';
import { expandableA11y } from './expandable';
import { type IconName } from './icons';
import { menuKey } from './menu-keys';
import { useHover } from './pointer';
import { Icon, Text } from './primitives';
import { useAreaColors, useTheme } from './theme-context';
import { chipRowStyle } from './chip-layout';

// One pattern per task (spec 0005, D1): view tabs switch views, choice chips pick one value in a
// form, a menu picks an order. They replace the segment bar.

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };
// react-native-web passes `onKeyDown` through to the DOM; native has no such prop and ignores it.
type KeyEvent = { key: string; preventDefault: () => void };

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Escape on the web closes only this menu or popover, never a window below it. A modal of
 * react-native-web closes on the keyup of Escape once it is the top one: while the menu still
 * fades in (or out) that is the window below. So the menu takes the keyup first (capture on
 * `window`) and stops it there.
 */
function useEscapeCloses(
  isOpen: boolean,
  hide: () => void,
  trigger: { current: HostInstance | null },
): void {
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      hide();
      trigger.current?.focus();
    };
    window.addEventListener('keyup', onKey, true);
    return () => window.removeEventListener('keyup', onKey, true);
  }, [isOpen, hide, trigger]);
}

/**
 * Open state of a menu or popover at its trigger (spec 0019, REQ-004). The position stays while
 * the modal fades out, so it closes where it was instead of jumping to the top left; `keyboard`
 * says whether it was opened with the keyboard, which alone moves the focus into it.
 */
function useAnchoredPanel(trigger: { current: HostInstance | null }) {
  const [panel, setPanel] = useState<{ open: boolean; keyboard: boolean; anchor?: Anchor }>({
    open: false,
    keyboard: false,
  });
  const open = () => {
    const keyboard = Platform.OS === 'web' && keyboardFocused(true);
    trigger.current?.measureInWindow((x, y, width, height) =>
      setPanel({ open: true, keyboard, anchor: { x, y, width, height } }),
    );
  };
  const hide = useCallback(() => setPanel((current) => ({ ...current, open: false })), []);
  return { anchor: panel.anchor, keyboard: panel.keyboard, isOpen: panel.open, open, hide };
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** ChoiceChips only: a second line under the label ("25.11." under "Mi"). */
  detail?: string;
}

export interface ViewTabsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Each tab gets `${testID}-${value}`. */
  testID?: string;
}

/**
 * Switches between the views of one screen: text only, left-aligned, the active tab underlined in
 * the accent (or the area colour in "Frisch"). Scrolls sideways when the tabs do not fit and keeps
 * the active one fully visible. Arrow keys, Home and End move between tabs on the web.
 */
export function ViewTabs<T extends string>(props: ViewTabsProps<T>) {
  const theme = useTheme();
  const hover = useHover();
  const area = useAreaColors();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const tabs = useRef(new Map<T, HostInstance>());
  const layouts = useRef(new Map<T, { x: number; width: number }>());
  const viewport = useRef({ width: 0, x: 0 });
  const revealed = useRef<T | undefined>(undefined);

  /** Scrolls the tab into view when it is cut off (AC-024). True once it could be measured. */
  const reveal = (value: T): boolean => {
    const layout = layouts.current.get(value);
    const { width, x } = viewport.current;
    if (!layout || width === 0) return false;
    if (layout.x < x) {
      scrollRef.current?.scrollTo({ x: Math.max(0, layout.x - 16), animated: true });
    } else if (layout.x + layout.width > x + width) {
      scrollRef.current?.scrollTo({ x: layout.x + layout.width - width + 16, animated: true });
    }
    return true;
  };
  useEffect(() => {
    // Only when the choice changed: a re-render must not undo the user's own swiping.
    if (revealed.current !== props.value && reveal(props.value)) revealed.current = props.value;
  });

  const select = (index: number) => {
    const count = props.options.length;
    const option = props.options[((index % count) + count) % count];
    if (!option) return;
    props.onChange(option.value);
    tabs.current.get(option.value)?.focus();
  };
  const current = props.options.findIndex((option) => option.value === props.value);
  const onKeyDown = (event: KeyEvent) => {
    const target =
      event.key === 'ArrowRight'
        ? current + 1
        : event.key === 'ArrowLeft'
          ? current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? props.options.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={32}
      onLayout={(event: LayoutChangeEvent) => {
        viewport.current.width = event.nativeEvent.layout.width;
        if (reveal(props.value)) revealed.current = props.value;
      }}
      onScroll={(event) => {
        viewport.current.x = event.nativeEvent.contentOffset.x;
      }}
      // Room for the focus ring of the first and the last tab (AC-005).
      style={{ flexGrow: 0, margin: -FOCUS_RING_ROOM }}
      contentContainerStyle={{ padding: FOCUS_RING_ROOM }}
    >
      <View
        testID={props.testID}
        accessibilityRole="tablist"
        accessibilityLabel={props.label}
        style={{ flexDirection: 'row', gap: 24 }}
        {...({ onKeyDown } as object)}
      >
        {props.options.map((option) => {
          const selected = option.value === props.value;
          return (
            <Pressable
              key={option.value}
              ref={(node) => {
                if (node) tabs.current.set(option.value, node);
                else tabs.current.delete(option.value);
              }}
              testID={props.testID ? `${props.testID}-${option.value}` : undefined}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              aria-selected={selected}
              // Roving focus: Tab enters the list on the active tab, arrows move inside it.
              tabIndex={selected ? 0 : -1}
              onPress={() => props.onChange(option.value)}
              onLayout={(event: LayoutChangeEvent) => {
                const { x, width } = event.nativeEvent.layout;
                layouts.current.set(option.value, { x, width });
              }}
              style={(state) => [
                {
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingTop: 4,
                  paddingBottom: 8,
                  borderRadius: 6,
                },
                keyboardFocusRing(theme, (state as PressState).focused),
              ]}
            >
              {(state) => (
                <>
                  <Text
                    variant="bodyStrong"
                    color={selected || hover((state as PressState).hovered) ? 'text' : 'muted'}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  {selected ? (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: area?.line ?? theme.colors.accent,
                      }}
                    />
                  ) : null}
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export interface ChoiceChipsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. "Art". */
  label: string;
  /** Greyed out and not changeable, e.g. a write while offline; `hint` says why. */
  disabled?: boolean;
  hint?: string;
  /**
   * The chips share the full width in equal parts and never wrap (spec 0030, REQ-005): for a fixed
   * number of chips whose labels change, e.g. the seven days of a week.
   */
  fill?: boolean;
  /** Each chip gets `${testID}-${value}`. */
  testID?: string;
}

/**
 * One value out of a few in a form ("Auswahl-Chips"): exactly one chip is active. Screen readers
 * hear a radio group. Disabled, the chosen chip still shows the value.
 */
export function ChoiceChips<T extends string>(props: ChoiceChipsProps<T>) {
  return (
    <View
      testID={props.testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      style={chipRowStyle(!!props.fill)}
    >
      {props.options.map((option) => (
        <ChipView
          key={option.value}
          fill={props.fill}
          role="radio"
          label={option.label}
          detail={option.detail}
          selected={option.value === props.value}
          disabled={props.disabled}
          hint={props.disabled ? props.hint : undefined}
          onPress={() => props.onChange(option.value)}
          testID={props.testID ? `${props.testID}-${option.value}` : undefined}
        />
      ))}
    </View>
  );
}

export interface MenuOption<T extends string> extends ChoiceOption<T> {
  /** Greyed out and not selectable, e.g. a write while offline. */
  disabled?: boolean;
  /** Second line under the label; says why an entry is disabled. */
  hint?: string;
}

export interface MenuProps<T extends string> {
  /** Text on the button, usually the current choice, e.g. "Zuletzt". */
  label: string;
  /** Accessible name of the button, e.g. "Sortierung: Zuletzt". */
  accessibilityLabel: string;
  icon?: IconName;
  /**
   * button = text with ▾ (a choice such as the sort order); icon = only the icon, for a list of
   * actions such as ⋯ (spec 0010).
   */
  trigger?: 'button' | 'icon';
  options: MenuOption<T>[];
  /** The current choice; it carries a check mark. Without it the entries are actions. */
  value?: T;
  onChange: (value: T) => void;
  /** The button; the menu is `${testID}-menu`, each entry `${testID}-${value}`. */
  testID?: string;
}

const MENU_ITEM_HEIGHT = 46;
const MENU_MIN_WIDTH = 200;
const itemRole = (choice: boolean): object =>
  Platform.OS === 'web'
    ? { role: choice ? 'menuitemradio' : 'menuitem' }
    : { accessibilityRole: 'menuitem' };

/**
 * A button with a short list that opens next to it, e.g. the sort order "↕ Zuletzt ▾"; with
 * `value` the current choice carries a check mark. Arrow keys, Home, End, Enter (and Space on a
 * choice) work on the web; Escape or a tap outside closes it.
 */
export function Menu<T extends string>(props: MenuProps<T>) {
  const theme = useTheme();
  const c = theme.colors;
  const window = useWindowDimensions();
  const trigger = useRef<HostInstance>(null);
  const items = useRef(new Map<T, HostInstance>());
  const iconOnly = props.trigger === 'icon';
  const isChoice = props.value !== undefined;
  const hover = useHover();
  const panel = useAnchoredPanel(trigger);
  const { anchor, isOpen, open, hide } = panel;
  const close = () => {
    hide();
    trigger.current?.focus();
  };
  const choose = (value: T) => {
    props.onChange(value);
    close();
  };
  // The modal does not report Escape on the web; close the menu here (spec 0010, platforms).
  useEscapeCloses(isOpen, hide, trigger);

  const current = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.value),
  );
  const keyboardOpened = isOpen && panel.keyboard;
  useEffect(() => {
    // Opened with the mouse or a finger, nothing is focused or highlighted (AC-010); with the
    // keyboard the first entry, in a choice the current one, gets the focus (AC-011). The menu
    // mounts in a modal; focus moves into it once it is on screen.
    if (!keyboardOpened) return;
    const first = props.options[current];
    const frame = requestAnimationFrame(() => {
      if (first) items.current.get(first.value)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardOpened, current, props.options]);

  const focusAt = (index: number) => {
    const count = props.options.length;
    const option = props.options[((index % count) + count) % count];
    if (option) items.current.get(option.value)?.focus();
  };
  const [focused, setFocused] = useState(0);
  const onKeyDown = (event: KeyEvent) => {
    const result = menuKey(event.key, focused, props.options.length, isChoice);
    if (!result) return;
    event.preventDefault();
    if ('focus' in result) focusAt(result.focus);
  };
  // Space picks on release: picking on keydown moves the focus to the trigger button, whose
  // native keyup click would open the menu again.
  const onKeyUp = (event: KeyEvent) => {
    const result = menuKey(event.key, focused, props.options.length, isChoice);
    if (!result || !('choose' in result)) return;
    event.preventDefault();
    const option = props.options[result.choose];
    if (option && !option.disabled) choose(option.value);
  };

  const width = Math.max(anchor?.width ?? 0, iconOnly ? 260 : MENU_MIN_WIDTH);
  const height =
    props.options.length * MENU_ITEM_HEIGHT +
    props.options.filter((option) => option.hint).length * 18 +
    12;
  const below = (anchor?.y ?? 0) + (anchor?.height ?? 0) + 6;
  const top =
    below + height > window.height - 8 ? Math.max(8, (anchor?.y ?? 0) - height - 6) : below;
  const left = Math.max(8, Math.min(anchor?.x ?? 0, window.width - width - 8));

  return (
    <>
      <Pressable
        ref={trigger}
        testID={props.testID}
        accessibilityRole="button"
        {...expandableA11y(props.accessibilityLabel, isOpen, Platform.OS)}
        aria-haspopup="menu"
        onPress={open}
        hitSlop={4}
        style={(state) => {
          const { pressed, hovered, focused: hasFocus } = state as PressState;
          if (iconOnly) {
            return [
              {
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hover(hovered) || isOpen ? c.surfaceSunken : 'transparent',
                opacity: pressed ? 0.6 : 1,
              },
              keyboardFocusRing(theme, hasFocus),
            ];
          }
          return [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              minHeight: 36,
              paddingHorizontal: 12,
              borderRadius: theme.shape.radius.chip,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              alignSelf: 'flex-start',
              opacity: pressed ? 0.7 : 1,
            },
            keyboardFocusRing(theme, hasFocus),
          ];
        }}
      >
        {iconOnly ? (
          <Icon name={props.icon ?? 'ellipsis'} size={21} color="muted" />
        ) : (
          <>
            {props.icon ? <Icon name={props.icon} size={16} /> : null}
            <Text variant="smallStrong">{props.label}</Text>
            <Icon name="chevron-down" size={16} color="muted" />
          </>
        )}
      </Pressable>
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.accessibilityLabel}
          onPress={close}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          testID={props.testID ? `${props.testID}-menu` : undefined}
          accessibilityRole="menu"
          accessibilityLabel={props.accessibilityLabel}
          style={{
            position: 'absolute',
            top,
            left,
            width,
            paddingVertical: 6,
            borderRadius: theme.shape.radius.control,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            boxShadow: '0px 8px 24px rgba(0,0,0,0.16)',
          }}
          {...({ onKeyDown, onKeyUp } as object)}
        >
          {props.options.map((option, index) => {
            const selected = option.value === props.value;
            return (
              <Pressable
                key={option.value}
                ref={(node) => {
                  if (node) items.current.set(option.value, node);
                  else items.current.delete(option.value);
                }}
                testID={props.testID ? `${props.testID}-${option.value}` : undefined}
                {...itemRole(isChoice)}
                accessibilityLabel={option.label}
                accessibilityHint={option.hint}
                accessibilityState={
                  isChoice
                    ? { checked: selected, disabled: !!option.disabled }
                    : { disabled: !!option.disabled }
                }
                aria-checked={isChoice ? selected : undefined}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onFocus={() => setFocused(index)}
                onPress={() => choose(option.value)}
                style={(state) => {
                  const { pressed, hovered, focused: hasFocus } = state as PressState;
                  // Grey only under the mouse or with keyboard focus, never ahead of time (AC-010).
                  const marked = hover(hovered) || keyboardFocused(hasFocus);
                  return [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: MENU_ITEM_HEIGHT,
                      paddingHorizontal: 14,
                      backgroundColor: marked && !option.disabled ? c.surfaceSunken : 'transparent',
                      opacity: option.disabled ? 0.5 : pressed ? 0.7 : 1,
                    },
                    keyboardFocusRing(theme, hasFocus),
                  ];
                }}
              >
                {isChoice ? (
                  <View style={{ width: 18 }}>
                    {selected ? <Icon name="check" size={18} color="accent" /> : null}
                  </View>
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant={selected ? 'bodyStrong' : 'body'}>{option.label}</Text>
                  {option.hint ? (
                    <Text variant="caption" color="muted">
                      {option.hint}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

export interface PopoverProps {
  /** Text of the link that opens it, e.g. "+2 weitere". */
  label: string;
  /** Accessible name of the link, e.g. "2 weitere Einträge am Freitag, 1. Januar". */
  accessibilityLabel: string;
  /** Title in the panel's head, e.g. "Freitag, 1. Januar". */
  title: string;
  /** The content; `close` closes the panel, e.g. before navigating away. */
  children: (close: () => void) => ReactNode;
  width?: number;
  /** The link; the panel is `${testID}-panel`, its ✕ `${testID}-close`. */
  testID?: string;
}

const POPOVER_MAX_HEIGHT = 440;

/**
 * A small panel that opens at its link, e.g. behind "+2 weitere" in the month (spec 0010,
 * AC-012). Opens with a click or Enter; Escape, ✕ or a click outside closes it.
 */
export function Popover(props: PopoverProps) {
  const theme = useTheme();
  const c = theme.colors;
  const window = useWindowDimensions();
  const trigger = useRef<HostInstance>(null);
  const hover = useHover();
  const { anchor, isOpen, open, hide } = useAnchoredPanel(trigger);
  const close = () => {
    hide();
    trigger.current?.focus();
  };
  // Focus stays on the link, outside the modal, so the web needs its own Escape (spec 0010).
  useEscapeCloses(isOpen, hide, trigger);

  const width = Math.min(props.width ?? 320, window.width - 16);
  const maxHeight = Math.min(POPOVER_MAX_HEIGHT, window.height - 16);
  const below = (anchor?.y ?? 0) + (anchor?.height ?? 0) + 4;
  const top =
    below + maxHeight > window.height - 8
      ? Math.max(8, Math.min(below, window.height - maxHeight - 8))
      : below;
  const left = Math.max(8, Math.min(anchor?.x ?? 0, window.width - width - 8));

  return (
    <>
      <Pressable
        ref={trigger}
        testID={props.testID}
        accessibilityRole="button"
        {...expandableA11y(props.accessibilityLabel, isOpen, Platform.OS)}
        aria-haspopup="dialog"
        onPress={open}
        hitSlop={6}
        style={(state) => {
          const { pressed, hovered, focused } = state as PressState;
          return [
            {
              alignSelf: 'flex-start',
              paddingHorizontal: 4,
              paddingVertical: 2,
              borderRadius: theme.shape.radius.control,
              backgroundColor: hover(hovered) ? c.surfaceSunken : 'transparent',
              opacity: pressed ? 0.6 : 1,
            },
            keyboardFocusRing(theme, focused),
          ];
        }}
      >
        <Text variant="caption" color="muted" numberOfLines={1}>
          {props.label}
        </Text>
      </Pressable>
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          onPress={close}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          testID={props.testID ? `${props.testID}-panel` : undefined}
          accessibilityRole="none"
          aria-modal
          role="dialog"
          aria-label={props.title}
          style={{
            position: 'absolute',
            top,
            left,
            width,
            maxHeight,
            borderRadius: theme.shape.radius.card,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            boxShadow: '0px 8px 24px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 14,
              paddingRight: 4,
              paddingTop: 4,
            }}
          >
            <Text variant="bodyStrong" heading style={{ flex: 1 }} numberOfLines={1}>
              {props.title}
            </Text>
            <IconButton
              icon="x"
              label="Schließen"
              onPress={close}
              testID={props.testID ? `${props.testID}-close` : undefined}
            />
          </View>
          <ScrollView
            style={{ overscrollBehavior: 'contain' } as object}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}
          >
            {props.children(hide)}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
