import { Pressable, View, type PressableStateCallbackType } from 'react-native';

import { keyboardFocusRing } from './controls';
import { useHint } from './hint';
import type { IconName } from './icons';
import { useHover } from './pointer';
import { Icon, Text, type ColorToken } from './primitives';
import { useTheme } from './theme-context';

export interface PathButtonOption<T extends string> {
  value: T;
  label: string;
  icon: IconName;
  /** Greyed out on its own, e.g. a way that needs text. */
  disabled?: boolean;
  /** Instead of `<testID>-<value>`. */
  testID?: string;
}

export interface PathButtonsProps<T extends string> {
  options: readonly PathButtonOption<T>[];
  /** The way the input suggests: filled with the accent (spec 0062, REQ-002). */
  highlighted?: T;
  /** Read by screen readers on the highlighted way (text from the app). */
  highlightHint?: string;
  onPress: (value: T) => void;
  disabled?: boolean;
  /** Why they are greyed out (e.g. offline). */
  hint?: string;
  /** Each button gets `<testID>-<value>`. */
  testID?: string;
}

type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

function PathButton(props: {
  label: string;
  icon: IconName;
  highlighted: boolean;
  disabled: boolean;
  hint: string | undefined;
  onPress: () => void;
  testID: string | undefined;
}) {
  const theme = useTheme();
  const hover = useHover();
  const hintRef = useHint(props.hint);
  const c = theme.colors;
  const color: ColorToken = props.highlighted ? 'onAccent' : 'text';
  return (
    <Pressable
      ref={hintRef}
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => {
        const { pressed, hovered, focused } = state as PressState;
        return [
          {
            flex: 1,
            minWidth: 0,
            minHeight: 60,
            paddingVertical: 8,
            paddingHorizontal: 6,
            gap: 4,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.shape.radius.button,
            backgroundColor: props.highlighted ? c.accent : c.surfaceSunken,
            opacity: props.disabled ? 0.45 : pressed ? 0.75 : hover(hovered) ? 0.9 : 1,
          },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <Icon name={props.icon} size={20} color={color} />
      <Text variant="smallStrong" color={color} numberOfLines={1}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/**
 * The ways under one field (spec 0062, REQ-001): equal tiles side by side, icon over label, that
 * never move; only the accent wanders to the way the input suggests. A tap takes the way tapped.
 */
export function PathButtons<T extends string>(props: PathButtonsProps<T>) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {props.options.map((option) => {
        const disabled = props.disabled === true || option.disabled === true;
        const highlighted = !disabled && option.value === props.highlighted;
        return (
          <PathButton
            key={option.value}
            label={option.label}
            icon={option.icon}
            highlighted={highlighted}
            disabled={disabled}
            hint={props.hint ?? (highlighted ? props.highlightHint : undefined)}
            onPress={() => props.onPress(option.value)}
            testID={option.testID ?? (props.testID ? `${props.testID}-${option.value}` : undefined)}
          />
        );
      })}
    </View>
  );
}
