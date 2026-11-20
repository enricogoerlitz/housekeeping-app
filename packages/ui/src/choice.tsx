import { useEffect, useRef, useState } from 'react';
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

import { ChipView, focusRing } from './controls';
import { type IconName } from './icons';
import { Icon, Text } from './primitives';
import { useAreaColors, useTheme } from './theme-context';

// One pattern per task (spec 0005, D1): view tabs switch views, choice chips pick one value in a
// form, a menu picks an order. They replace the segment bar.

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };
// react-native-web passes `onKeyDown` through to the DOM; native has no such prop and ignores it.
type KeyEvent = { key: string; preventDefault: () => void };

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
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
      style={{ flexGrow: 0 }}
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
                focusRing(theme, (state as PressState).focused),
              ]}
            >
              <Text variant="bodyStrong" color={selected ? 'text' : 'muted'} numberOfLines={1}>
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
  /** Each chip gets `${testID}-${value}`. */
  testID?: string;
}

/**
 * One value out of a few in a form ("Auswahl-Chips"): exactly one chip is active. Screen readers
 * hear a radio group.
 */
export function ChoiceChips<T extends string>(props: ChoiceChipsProps<T>) {
  return (
    <View
      testID={props.testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {props.options.map((option) => (
        <ChipView
          key={option.value}
          role="radio"
          label={option.label}
          selected={option.value === props.value}
          onPress={() => props.onChange(option.value)}
          testID={props.testID ? `${props.testID}-${option.value}` : undefined}
        />
      ))}
    </View>
  );
}

export interface MenuProps<T extends string> {
  /** Text on the button, usually the current choice, e.g. "Zuletzt". */
  label: string;
  /** Accessible name of the button, e.g. "Sortierung: Zuletzt". */
  accessibilityLabel: string;
  icon?: IconName;
  options: ChoiceOption<T>[];
  /** The current choice; it carries a check mark. */
  value?: T;
  onChange: (value: T) => void;
  /** The button; the menu is `${testID}-menu`, each entry `${testID}-${value}`. */
  testID?: string;
}

const MENU_ITEM_HEIGHT = 46;
const MENU_MIN_WIDTH = 200;
const itemRole =
  Platform.OS === 'web' ? ({ role: 'menuitemradio' } as object) : { accessibilityRole: 'menuitem' };

/**
 * A button with a short list that opens next to it, e.g. the sort order "↕ Zuletzt ▾". Arrow keys,
 * Home, End and Enter work on the web; Escape or a tap outside closes it.
 */
export function Menu<T extends string>(props: MenuProps<T>) {
  const theme = useTheme();
  const c = theme.colors;
  const window = useWindowDimensions();
  const trigger = useRef<HostInstance>(null);
  const items = useRef(new Map<T, HostInstance>());
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number }>();

  const open = () =>
    trigger.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => {
    setAnchor(undefined);
    trigger.current?.focus();
  };
  const choose = (value: T) => {
    props.onChange(value);
    close();
  };

  const current = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.value),
  );
  useEffect(() => {
    if (!anchor) return;
    const first = props.options[current];
    // The menu mounts in a modal; focus moves into it once it is on screen.
    const frame = requestAnimationFrame(() => {
      if (first) items.current.get(first.value)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor, current, props.options]);

  const focusAt = (index: number) => {
    const count = props.options.length;
    const option = props.options[((index % count) + count) % count];
    if (option) items.current.get(option.value)?.focus();
  };
  const [focused, setFocused] = useState(0);
  const onKeyDown = (event: KeyEvent) => {
    const target =
      event.key === 'ArrowDown'
        ? focused + 1
        : event.key === 'ArrowUp'
          ? focused - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? props.options.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    focusAt(target);
  };

  const width = Math.max(anchor?.width ?? 0, MENU_MIN_WIDTH);
  const height = props.options.length * MENU_ITEM_HEIGHT + 12;
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
        accessibilityLabel={props.accessibilityLabel}
        accessibilityState={{ expanded: anchor !== undefined }}
        aria-haspopup="menu"
        onPress={open}
        hitSlop={4}
        style={(state) => {
          const { pressed, focused: hasFocus } = state as PressState;
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
            focusRing(theme, hasFocus),
          ];
        }}
      >
        {props.icon ? <Icon name={props.icon} size={16} /> : null}
        <Text variant="smallStrong">{props.label}</Text>
        <Icon name="chevron-down" size={16} color="muted" />
      </Pressable>
      <Modal visible={anchor !== undefined} transparent animationType="fade" onRequestClose={close}>
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
          {...({ onKeyDown } as object)}
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
                {...itemRole}
                accessibilityLabel={option.label}
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                onFocus={() => setFocused(index)}
                onPress={() => choose(option.value)}
                style={(state) => {
                  const { pressed, hovered, focused: hasFocus } = state as PressState;
                  return [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: MENU_ITEM_HEIGHT,
                      paddingHorizontal: 14,
                      backgroundColor: hovered || hasFocus ? c.surfaceSunken : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ];
                }}
              >
                <View style={{ width: 18 }}>
                  {selected ? <Icon name="check" size={18} color="accent" /> : null}
                </View>
                <Text variant={selected ? 'bodyStrong' : 'body'}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}
