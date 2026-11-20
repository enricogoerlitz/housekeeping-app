import { useState, type ReactNode } from 'react';
import {
  Pressable,
  Switch as RNSwitch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { icons, type IconName } from './icons';
import { Icon, Text, useColor, type ColorToken } from './primitives';
import { ToneContext, useAreaColors, useTheme } from './theme-context';
import type { Theme, Tone } from './themes';

/** Visible keyboard focus ring, the same on every control. */
export function focusRing(theme: Theme, focused: boolean | undefined): ViewStyle | null {
  return focused
    ? { outlineWidth: 2, outlineColor: theme.colors.text, outlineStyle: 'solid', outlineOffset: 2 }
    : null;
}

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

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
}

export function Button(props: ButtonProps) {
  const theme = useTheme();
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
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
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
            opacity: props.disabled ? 0.45 : pressed ? 0.75 : hovered ? 0.9 : 1,
          },
          variant === 'primary' ? { backgroundColor: area?.fill ?? c.accent } : null,
          variant === 'secondary' ? { backgroundColor: c.surfaceSunken } : null,
          variant === 'ghost' ? { borderWidth: 1.5, borderColor: c.border } : null,
          focusRing(theme, focused),
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
}

export function IconButton(props: IconButtonProps) {
  const theme = useTheme();
  const area = useAreaColors();
  const variant = props.variant ?? 'plain';
  const size = props.size ?? 40;
  const inArea = variant === 'filled' && area !== undefined;
  const iconColor: ColorToken =
    props.color ??
    (inArea ? 'text' : variant === 'filled' ? 'onAccent' : variant === 'soft' ? 'text' : 'muted');
  return (
    <Pressable
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
          variant === 'soft' || (variant === 'plain' && hovered)
            ? { backgroundColor: theme.colors.surfaceSunken }
            : null,
          focusRing(theme, focused),
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
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  /** Paints the chip in an area colour instead of the neutral style. */
  tone?: Tone;
  disabled?: boolean;
  /** An active filter: shows ✕ after the label, and a tap removes it. */
  removable?: boolean;
  /** Accessible name when it says more than the label, e.g. "Vegan entfernen". */
  accessibilityLabel?: string;
  testID?: string;
}

/** Filter chip, quick-add tile or small tag. Without onPress it is a static label. */
export function Chip(props: ChipProps) {
  return <ChipView {...props} role="button" />;
}

/** A chip as a button (filters, toggles) or as one option of a ChoiceChips group. */
export function ChipView(props: ChipProps & { role: 'button' | 'radio' }) {
  const theme = useTheme();
  const c = theme.colors;
  const tone = props.tone ? c.tones[props.tone] : undefined;
  const background = props.selected ? c.accent : tone ? tone.bg : c.surface;
  const content = (
    <>
      {props.icon ? (
        <ChipIcon name={props.icon} selected={!!props.selected} toneFg={tone?.fg} />
      ) : null}
      <Text
        variant="smallStrong"
        color={props.selected ? 'onAccent' : 'text'}
        style={!props.selected && tone ? { color: tone.fg } : undefined}
      >
        {props.label}
      </Text>
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
    borderColor: c.border,
    alignSelf: 'flex-start',
  };
  if (!props.onPress)
    return (
      <View testID={props.testID} style={base}>
        {content}
      </View>
    );
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole={props.role}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
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
        const { pressed, focused } = state as PressState;
        return [
          base,
          { opacity: props.disabled ? 0.45 : pressed ? 0.7 : 1 },
          focusRing(theme, focused),
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

export function Checkbox(props: CheckboxProps) {
  const theme = useTheme();
  const c = theme.colors;
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
          {
            width: 26,
            height: 26,
            borderRadius: theme.shape.radius.check,
            borderWidth: theme.shape.checkBorderWidth,
            borderColor: props.checked ? c.success : c.checkLine,
            backgroundColor: props.checked ? c.success : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: props.disabled ? 0.45 : pressed ? 0.6 : 1,
          },
          focusRing(theme, focused),
        ];
      }}
    >
      {props.checked ? <Icon name="check" size={16} color="onSuccess" /> : null}
    </Pressable>
  );
}

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** A labelled on/off setting. */
export function SwitchRow(props: SwitchRowProps) {
  const theme = useTheme();
  const c = theme.colors;
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
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{props.label}</Text>
        {props.description ? (
          <Text variant="small" color="muted">
            {props.description}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        testID={props.testID}
        accessibilityLabel={props.label}
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
        trackColor={{ false: c.surfaceSunken, true: c.success }}
        thumbColor={c.surface}
        // react-native-web reads these two for the "on" state.
        {...({ activeTrackColor: c.success, activeThumbColor: c.surface } as object)}
      />
    </View>
  );
}

export interface StarsProps {
  /** 0–5. */
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  testID?: string;
}

export function Stars(props: StarsProps) {
  const size = props.size ?? 21;
  return (
    <View
      testID={props.testID}
      accessibilityRole={props.onChange ? 'adjustable' : 'image'}
      accessibilityLabel={`${props.value} von 5 Sternen`}
      style={{ flexDirection: 'row', gap: 1 }}
    >
      {[1, 2, 3, 4, 5].map((star) =>
        props.onChange ? (
          <Pressable
            key={star}
            testID={props.testID ? `${props.testID}-${star}` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${star} Sterne`}
            onPress={() => props.onChange?.(star)}
            hitSlop={6}
          >
            <Icon name="star" size={size} color="star" filled={star <= props.value} />
          </Pressable>
        ) : (
          <Icon key={star} name="star" size={size} color="star" filled={star <= props.value} />
        ),
      )}
    </View>
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
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TextField(props: TextFieldProps) {
  const theme = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  const placeholderColor = useColor('muted');
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
        <Text variant="small" color="warn" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
