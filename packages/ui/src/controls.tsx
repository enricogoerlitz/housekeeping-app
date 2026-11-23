import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  Platform,
  Pressable,
  Switch as RNSwitch,
  TextInput,
  View,
  type GestureResponderEvent,
  type HostInstance,
  type StyleProp,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { mergeRefs, useHint } from './hint';
import { icons, type IconName } from './icons';
import { useHover } from './pointer';
import { Icon, Text, useColor, type ColorToken } from './primitives';
import {
  IDLE_STAR_POINTER,
  starFill,
  starPointer,
  starsLabel,
  starValueAt,
  stepStars,
  type StarFill,
  type StarPointerEvent,
  type StarStep,
} from './star-value';
import { revealsError } from './reveal-error';
import { switchRowParts } from './time-field-state';
import { ToneContext, useAreaColors, useTheme } from './theme-context';
import type { Theme, Tone } from './themes';
import { fillChipStyle } from './chip-layout';

/** On the web a click also focuses a focusable view; only keyboard focus gets the ring. */
export function keyboardFocus(event: unknown): boolean {
  const target = (event as { target?: { matches?: (selector: string) => boolean } }).target;
  return target?.matches?.(':focus-visible') ?? true;
}

/**
 * The focus ring, the same on every control, and only for keyboard focus (spec 0019, REQ-002):
 * the style is computed right after the focus moved, so the focused element tells whether it is
 * `:focus-visible`; a click or a tap gives none. Native focus comes only from a keyboard or a
 * screen reader. Drawn 2 px outside the control, so a container must leave that room
 * (`FOCUS_RING_ROOM`, e.g. `ScrollRow`).
 */
export function keyboardFocusRing(theme: Theme, focused: boolean | undefined): ViewStyle | null {
  if (!keyboardFocused(focused)) return null;
  return {
    outlineWidth: 2,
    outlineColor: theme.colors.text,
    outlineStyle: 'solid',
    outlineOffset: FOCUS_RING_OFFSET,
  };
}

/** A Pressable's `focused` that came from a keyboard (or, natively, a screen reader). */
export function keyboardFocused(focused: boolean | undefined): boolean {
  if (!focused) return false;
  const doc = (globalThis as { document?: { activeElement?: unknown } }).document;
  return doc === undefined || keyboardFocus({ target: doc.activeElement });
}

const FOCUS_RING_OFFSET = 2;
/** The room the ring needs around a control: width plus offset. */
export const FOCUS_RING_ROOM = 2 + FOCUS_RING_OFFSET;

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };
// react-native-web passes `onKeyDown` through to the DOM; native has no such prop and ignores it.
type KeyEvent = { key: string; preventDefault: () => void };

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** primary = filled accent; secondary = quiet filled; ghost = outlined; link = text only. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'link';
  icon?: IconName;
  disabled?: boolean;
  size?: 'md' | 'sm';
  /** Stretches to the container width. */
  full?: boolean;
  testID?: string;
  /** Explains why the button is disabled or what it does (screen readers, tooltip on web). */
  hint?: string;
  /** Accessible name when it says more than the label (spec 0027, AC-039). */
  accessibilityLabel?: string;
}

export function Button(props: ButtonProps) {
  const theme = useTheme();
  const hover = useHover();
  const area = useAreaColors();
  const variant = props.variant ?? 'primary';
  const small = props.size === 'sm';
  const inArea = variant === 'primary' && area !== undefined;
  const textColor: ColorToken = inArea
    ? 'text'
    : variant === 'primary'
      ? 'onAccent'
      : variant === 'link'
        ? 'accent'
        : 'text';
  const c = theme.colors;
  const hintRef = useHint(props.hint);
  return (
    <Pressable
      ref={hintRef}
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => {
        const { pressed, hovered, focused } = state as PressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: variant === 'link' ? 36 : small ? 36 : 46,
            paddingHorizontal: variant === 'link' ? 0 : small ? 14 : 18,
            borderRadius: theme.shape.radius.button,
            alignSelf: props.full ? 'stretch' : 'flex-start',
            opacity: props.disabled ? 0.45 : pressed ? 0.75 : hover(hovered) ? 0.9 : 1,
          },
          variant === 'primary' ? { backgroundColor: area?.fill ?? c.accent } : null,
          variant === 'secondary' ? { backgroundColor: c.surfaceSunken } : null,
          variant === 'ghost' ? { borderWidth: 1.5, borderColor: c.border } : null,
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <ToneContext.Provider value={inArea ? { fg: area.onFill } : undefined}>
        {props.icon ? <Icon name={props.icon} size={small ? 17 : 19} color={textColor} /> : null}
        <Text variant={small ? 'smallStrong' : 'button'} color={textColor}>
          {props.label}
        </Text>
      </ToneContext.Provider>
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: IconName;
  /** Required: the accessible name of the button. */
  label: string;
  onPress?: () => void;
  /** plain = icon only; soft = quiet round background; filled = accent background. */
  variant?: 'plain' | 'soft' | 'filled';
  size?: number;
  disabled?: boolean;
  color?: ColorToken;
  /** Explains why the button is disabled or what it does (screen readers). */
  hint?: string;
  testID?: string;
  /** E.g. to give the focus back to the button. */
  ref?: Ref<HostInstance>;
}

export function IconButton({ ref, ...props }: IconButtonProps) {
  const theme = useTheme();
  const hover = useHover();
  const area = useAreaColors();
  const variant = props.variant ?? 'plain';
  const size = props.size ?? 40;
  const inArea = variant === 'filled' && area !== undefined;
  const iconColor: ColorToken =
    props.color ??
    (inArea ? 'text' : variant === 'filled' ? 'onAccent' : variant === 'soft' ? 'text' : 'muted');
  const hintRef = useHint(props.hint);
  return (
    <Pressable
      ref={mergeRefs(ref, hintRef)}
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={(state) => {
        const { pressed, hovered, focused } = state as PressState;
        return [
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: props.disabled ? 0.4 : pressed ? 0.6 : 1,
          },
          variant === 'filled' ? { backgroundColor: area?.fill ?? theme.colors.accent } : null,
          variant === 'soft' || (variant === 'plain' && hover(hovered) && !props.disabled)
            ? { backgroundColor: theme.colors.surfaceSunken }
            : null,
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <ToneContext.Provider value={inArea ? { fg: area.onFill } : undefined}>
        <Icon name={props.icon} size={Math.round(size * 0.52)} color={iconColor} />
      </ToneContext.Provider>
    </Pressable>
  );
}

export interface ChipProps {
  label: string;
  /** A second line under the label, e.g. the date under the weekday ("Mi" over "25.11."). */
  detail?: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  /** Paints the chip in an area colour instead of the neutral style. */
  tone?: Tone;
  disabled?: boolean;
  /** Says why the chip is disabled, e.g. offline; read by screen readers. */
  hint?: string;
  /** An active filter: shows ✕ after the label, and a tap removes it. */
  removable?: boolean;
  /** Accessible name when it says more than the label, e.g. "Vegan entfernen". */
  accessibilityLabel?: string;
  /** Takes an equal share of a filled ChoiceChips row (spec 0030, REQ-005). */
  fill?: boolean;
  testID?: string;
}

/** Filter chip, quick-add tile or small tag. Without onPress it is a static label. */
export function Chip(props: ChipProps) {
  return <ChipView {...props} role="button" />;
}

/** A chip as a button (filters, toggles) or as one option of a ChoiceChips group. */
export function ChipView(props: ChipProps & { role: 'button' | 'radio' }) {
  const theme = useTheme();
  const hover = useHover();
  const hintRef = useHint(props.hint);
  const c = theme.colors;
  const tone = props.tone ? c.tones[props.tone] : undefined;
  const background = props.selected ? c.accent : tone ? tone.bg : c.surface;
  const content = (
    <>
      {props.icon ? (
        <ChipIcon name={props.icon} selected={!!props.selected} toneFg={tone?.fg} />
      ) : null}
      {props.detail === undefined ? (
        <Text
          variant="smallStrong"
          color={props.selected ? 'onAccent' : 'text'}
          style={!props.selected && tone ? { color: tone.fg } : undefined}
        >
          {props.label}
        </Text>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text variant="smallStrong" color={props.selected ? 'onAccent' : 'text'}>
            {props.label}
          </Text>
          <Text variant="caption" color={props.selected ? 'onAccent' : 'muted'}>
            {props.detail}
          </Text>
        </View>
      )}
      {props.removable ? <ChipIcon name="x" selected={!!props.selected} toneFg={tone?.fg} /> : null}
    </>
  );
  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: theme.shape.radius.chip,
    backgroundColor: background,
    borderWidth: props.selected || tone ? 0 : 1,
    // A filled chip keeps its border when chosen, in its own colour (see fillChipStyle).
    borderColor: props.selected || tone ? background : c.border,
    alignSelf: 'flex-start',
    ...(props.fill ? fillChipStyle() : null),
  };
  if (!props.onPress)
    return (
      <View testID={props.testID} style={base}>
        {content}
      </View>
    );
  return (
    <Pressable
      ref={hintRef}
      testID={props.testID}
      accessibilityRole={props.role}
      accessibilityLabel={
        props.accessibilityLabel ??
        (props.detail === undefined ? props.label : `${props.label} ${props.detail}`)
      }
      accessibilityHint={props.hint}
      accessibilityState={
        props.role === 'radio'
          ? { checked: !!props.selected, disabled: !!props.disabled }
          : { selected: !!props.selected, disabled: !!props.disabled }
      }
      aria-checked={props.role === 'radio' ? !!props.selected : undefined}
      aria-selected={props.role === 'button' ? !!props.selected : undefined}
      aria-pressed={props.role === 'button' && !props.removable ? !!props.selected : undefined}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={4}
      style={(state) => {
        const { pressed, hovered, focused } = state as PressState;
        return [
          base,
          { opacity: props.disabled ? 0.45 : pressed ? 0.7 : 1 },
          hover(hovered) && !props.selected && !tone && !props.disabled
            ? { backgroundColor: c.surfaceSunken }
            : null,
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      {content}
    </Pressable>
  );
}

function ChipIcon(props: { name: IconName; selected: boolean; toneFg?: string }) {
  const theme = useTheme();
  // Chips colour their icon from the tone foreground, which is outside the colour tokens.
  const Glyph = icons[props.name];
  const color = props.selected ? theme.colors.onAccent : (props.toneFg ?? theme.colors.text);
  return <Glyph size={16} color={color} strokeWidth={theme.shape.stroke} />;
}

export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Accessible name, e.g. the item's title. */
  label: string;
  disabled?: boolean;
  testID?: string;
}

function checkboxFace(theme: Theme, checked: boolean): ViewStyle {
  const c = theme.colors;
  return {
    width: 26,
    height: 26,
    borderRadius: theme.shape.radius.check,
    borderWidth: theme.shape.checkBorderWidth,
    borderColor: checked ? c.success : c.checkLine,
    backgroundColor: checked ? c.success : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

export function Checkbox(props: CheckboxProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="checkbox"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.checked, disabled: !!props.disabled }}
      aria-checked={props.checked}
      disabled={props.disabled || !props.onChange}
      onPress={() => props.onChange?.(!props.checked)}
      hitSlop={10}
      style={(state) => {
        const { pressed, focused } = state as PressState;
        return [
          checkboxFace(theme, props.checked),
          { opacity: props.disabled ? 0.45 : pressed ? 0.6 : 1 },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      {props.checked ? <Icon name="check" size={16} color="onSuccess" /> : null}
    </Pressable>
  );
}

/**
 * The look of a checkbox without its own press area, for a row that is one checkbox as a whole
 * (SelectRow): a second focusable checkbox inside it would be read twice.
 */
export function CheckboxMark(props: { checked: boolean }) {
  const theme = useTheme();
  return (
    <View style={checkboxFace(theme, props.checked)}>
      {props.checked ? <Icon name="check" size={16} color="onSuccess" /> : null}
    </View>
  );
}

export type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
} & (
  | { onDetail?: undefined; detailLabel?: undefined; detailDisabled?: undefined }
  | {
      /** Opens the details ("›"): the text becomes a button of its own beside the switch. */
      onDetail: () => void;
      /** Accessible name of that button, from the feature, e.g. "Tagesüberblick einstellen". */
      detailLabel: string;
      detailDisabled?: boolean;
    }
);

/** A labelled on/off setting; with `onDetail` its text opens the details (spec 0013). */
export function SwitchRow(props: SwitchRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  const names = switchRowParts({
    label: props.label,
    description: props.description,
    detailLabel: props.detailLabel,
    hasDetail: props.onDetail !== undefined,
  });
  const text = (
    <View style={{ flex: 1 }}>
      <Text variant="rowTitle">{props.label}</Text>
      {props.description ? (
        <Text variant="small" color="muted">
          {props.description}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        paddingVertical: 6,
      }}
    >
      {props.onDetail ? (
        <Pressable
          testID={props.testID ? `${props.testID}-detail` : undefined}
          accessibilityRole="button"
          accessibilityLabel={names.detailLabel}
          accessibilityState={{ disabled: !!props.detailDisabled }}
          disabled={props.detailDisabled}
          onPress={props.onDetail}
          style={(state) => {
            const { pressed, focused } = state as PressState;
            return [
              {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                borderRadius: theme.shape.radius.control,
                opacity: props.detailDisabled ? 0.45 : pressed ? 0.6 : 1,
              },
              keyboardFocusRing(theme, focused),
            ];
          }}
        >
          {text}
          <Icon name="chevron-right" size={18} color="muted" />
        </Pressable>
      ) : (
        text
      )}
      <RNSwitch
        testID={props.testID}
        accessibilityLabel={names.switchLabel}
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
        trackColor={{ false: c.switchOff, true: c.success }}
        thumbColor={c.surface}
        // react-native-web reads these two for the "on" state.
        {...({ activeTrackColor: c.success, activeThumbColor: c.surface } as object)}
      />
    </View>
  );
}

export interface StarsProps {
  /** 0 = not rated, else 0.5 … 5 in half steps; other values show rounded down to a half. */
  value: number;
  /** Gets 0.5 … 5 in half steps. Without it the stars only show the value. */
  onChange?: (value: number) => void;
  /** Greyed out and not changeable, e.g. offline; `hint` says why. */
  disabled?: boolean;
  /** Explains why the stars are disabled (screen readers, tooltip on web). */
  hint?: string;
  /**
   * Accessible name of changeable stars, e.g. "Deine Bewertung"; the value is read after it
   * ("4,5 von 5 Sternen"). Without it the value is the name.
   */
  label?: string;
  size?: number;
  /** Star n gets `${testID}-${n}` (sets the full star) and `${testID}-${n}-half` (half a star). */
  testID?: string;
}

const STAR_GAP = 1;
// Touch targets grow upwards and downwards only, so the halves of neighbouring stars never overlap.
const STAR_HIT_SLOP = { top: 10, bottom: 10 };

/**
 * Rating stars in half steps (spec 0011, REQ-004). Mouse: hovering fills the stars in advance,
 * the left half of a star means half a star, a click sets it, leaving without a click shows the
 * saved value again. Touch: a tap on either half, or dragging along the stars, letting go sets.
 * Keyboard and screen readers: one adjustable control in steps of 0.5 ("4,5 von 5 Sternen").
 */
export function Stars(props: StarsProps) {
  const theme = useTheme();
  const size = props.size ?? 21;
  const layout = { size, gap: STAR_GAP };
  const pointerRef = useRef(IDLE_STAR_POINTER);
  const [pointer, setPointer] = useState(IDLE_STAR_POINTER);
  const dragStart = useRef({ x: 0, pageX: 0 });
  const [focused, setFocused] = useState(false);
  const interactive = !!props.onChange && !props.disabled;
  const shown = (interactive ? pointer.preview : undefined) ?? props.value;
  const valueText = starsLabel(props.value);
  const hintRef = useHint(props.hint);

  const dispatch = (event: StarPointerEvent) => {
    const next = starPointer(pointerRef.current, event);
    pointerRef.current = next.state;
    setPointer(next.state);
    if (next.commit !== undefined) props.onChange?.(next.commit);
  };
  const step = (kind: StarStep) => {
    const next = stepStars(props.value, kind);
    if (next !== props.value && next > 0) props.onChange?.(next);
  };
  const onKeyDown = (event: KeyEvent) => {
    const kind: StarStep | undefined =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 'increment'
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? 'decrement'
          : event.key === 'Home'
            ? 'first'
            : event.key === 'End'
              ? 'last'
              : undefined;
    if (!kind) return;
    event.preventDefault();
    step(kind);
  };

  /** Touch and mouse handlers of one half star; `left` is its offset from the first star. */
  const half = (value: number, left: number): ViewProps => ({
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => true,
    onResponderGrant: (event: GestureResponderEvent) => {
      // locationX is relative to this half on every platform; moves count from here by pageX.
      dragStart.current = {
        x: left + event.nativeEvent.locationX,
        pageX: event.nativeEvent.pageX,
      };
      dispatch({ type: 'down', value });
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const x = dragStart.current.x + event.nativeEvent.pageX - dragStart.current.pageX;
      dispatch({ type: 'move', value: starValueAt(x, layout) });
    },
    onResponderRelease: () => dispatch({ type: 'up' }),
    onResponderTerminate: () => dispatch({ type: 'cancel' }),
    onPointerEnter: () => dispatch({ type: 'hover', value }),
    hitSlop: STAR_HIT_SLOP,
  });
  const id = (suffix: string) => (props.testID ? `${props.testID}-${suffix}` : undefined);

  return (
    <View
      ref={hintRef}
      testID={props.testID}
      accessible
      accessibilityRole={props.onChange ? 'adjustable' : 'image'}
      accessibilityLabel={props.onChange && props.label ? props.label : valueText}
      // aria-* props work on native and on the web (react-native-web drops accessibilityValue).
      aria-valuemin={props.onChange ? 0 : undefined}
      aria-valuemax={props.onChange ? 5 : undefined}
      aria-valuenow={props.onChange ? props.value : undefined}
      aria-valuetext={props.onChange ? valueText : undefined}
      aria-disabled={props.onChange ? !interactive : undefined}
      accessibilityHint={props.hint}
      accessibilityActions={
        interactive ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') step('increment');
        if (event.nativeEvent.actionName === 'decrement') step('decrement');
      }}
      focusable={interactive}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerLeave={interactive ? () => dispatch({ type: 'leave' }) : undefined}
      style={[
        { flexDirection: 'row', gap: STAR_GAP },
        props.disabled ? { opacity: 0.45 } : null,
        interactive ? keyboardFocusRing(theme, focused) : null,
      ]}
      {...(interactive ? ({ onKeyDown } as object) : null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const left = (star - 1) * (size + STAR_GAP);
        return (
          <View key={star} style={{ width: size, height: size }}>
            <StarGlyph size={size} fill={starFill(star, shown)} />
            {interactive ? (
              <>
                <View
                  testID={id(`${star}-half`)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: size / 2,
                    cursor: 'pointer',
                  }}
                  {...half(star - 0.5, left)}
                />
                <View
                  testID={id(String(star))}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: size / 2,
                    width: size / 2 + (star < 5 ? STAR_GAP : 0),
                    cursor: 'pointer',
                  }}
                  {...half(star, left + size / 2)}
                />
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** One star: full, empty, or the left half filled over an empty outline. */
function StarGlyph(props: { size: number; fill: StarFill }) {
  if (props.fill !== 'half') {
    return <Icon name="star" size={props.size} color="star" filled={props.fill === 'full'} />;
  }
  return (
    <>
      <Icon name="star" size={props.size} color="star" />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: props.size / 2,
          height: props.size,
          overflow: 'hidden',
        }}
      >
        <Icon name="star" size={props.size} color="star" filled />
      </View>
    </>
  );
}

export interface TextFieldProps extends Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'multiline'
  | 'autoFocus'
  | 'onSubmitEditing'
  | 'keyboardType'
  | 'returnKeyType'
  | 'blurOnSubmit'
  | 'editable'
  | 'onFocus'
  | 'onBlur'
  | 'numberOfLines'
  | 'maxLength'
  | 'accessibilityValue'
> {
  /** Visible label above the field; also the accessible name. */
  label?: string;
  /** Accessible name when there is no visible label. */
  accessibilityLabel?: string;
  /** Message below the field (orange, never red). */
  error?: string;
  hint?: string;
  /** Content inside the field on the right, e.g. icon buttons. */
  right?: ReactNode;
  left?: ReactNode;
  /** Pill-shaped field for search and composer bars. */
  round?: boolean;
  /** The input itself, e.g. to move the focus into it after a choice. */
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TextField(props: TextFieldProps) {
  const theme = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  const placeholderColor = useColor('muted');
  const errorRef = useRef<HostInstance>(null);
  const mounted = useRef(false);
  // A new error scrolls itself into view, so it never hides behind a window's footer (spec 0013,
  // the time field at 390 px). The web only: there the view is the DOM node.
  useEffect(() => {
    const reveal = revealsError({ mounted: mounted.current, error: props.error });
    mounted.current = true;
    if (!reveal || Platform.OS !== 'web') return;
    const node = errorRef.current as unknown as {
      scrollIntoView?: (options: { block: 'nearest' }) => void;
    } | null;
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [props.error]);
  const {
    label,
    error,
    hint,
    right,
    left,
    round,
    style,
    testID,
    accessibilityLabel,
    onFocus,
    onBlur,
    inputRef,
    ...input
  } = props;
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text variant="smallStrong">{label}</Text> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: props.multiline ? 'flex-start' : 'center',
          gap: 6,
          minHeight: 50,
          paddingLeft: left ? 12 : 14,
          paddingRight: right ? 5 : 14,
          borderRadius: round ? theme.shape.radius.input : theme.shape.radius.control,
          backgroundColor: theme.shape.cardBorder || focused ? c.surface : c.surfaceSunken,
          borderWidth: 1.5,
          borderColor: error
            ? c.warnText
            : focused
              ? c.accent
              : theme.shape.cardBorder
                ? c.border
                : 'transparent',
        }}
      >
        {left}
        <TextInput
          {...input}
          ref={inputRef}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label ?? props.placeholder}
          placeholderTextColor={placeholderColor}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.type.body,
            {
              flex: 1,
              color: c.text,
              paddingVertical: props.multiline ? 12 : 0,
              minHeight: props.multiline ? 96 : 46,
              // The browser's own focus outline would double the border.
              outlineStyle: 'none',
            } as object,
          ]}
        />
        {right}
      </View>
      {error ? (
        <View ref={errorRef}>
          <Text variant="small" color="warn" testID={testID ? `${testID}-error` : undefined}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="small" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
