import { Pressable, View } from 'react-native';

import { keyboardFocusRing } from './controls';
import type { IconName } from './icons';
import { useHover } from './pointer';
import { Icon } from './primitives';
import { useTheme } from './theme-context';

export interface ViewSwitchOption<T extends string> {
  value: T;
  /** The word a screen reader says ("Kacheln"); the switch itself shows only the symbol. */
  label: string;
  icon: IconName;
}

export interface ViewSwitchProps<T extends string> {
  options: readonly ViewSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. "Ansicht". */
  label: string;
  /** Each symbol gets `${testID}-${value}`. */
  testID?: string;
}

/** As tall as the sort menu and the chips beside it; the tap target grows to 44 pt. */
const HEIGHT = 36;
const SEGMENT_WIDTH = 44;

/**
 * Joined symbol buttons that choose how a list looks, e.g. "Kacheln" or "Liste"
 * (spec 0038, decision 1): a radio group, the chosen symbol on the soft accent.
 */
export function ViewSwitch<T extends string>(props: ViewSwitchProps<T>) {
  const theme = useTheme();
  const hover = useHover();
  const c = theme.colors;
  return (
    <View
      testID={props.testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={{
        flexDirection: 'row',
        height: HEIGHT,
        padding: 2,
        gap: 2,
        borderRadius: theme.shape.radius.chip,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
      }}
    >
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            aria-label={option.label}
            aria-checked={selected}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!selected) props.onChange(option.value);
            }}
            hitSlop={{ top: 4, bottom: 4 }}
            testID={props.testID ? `${props.testID}-${option.value}` : undefined}
            style={(state) => {
              const { pressed, hovered, focused } = state as {
                pressed: boolean;
                hovered?: boolean;
                focused?: boolean;
              };
              return [
                {
                  width: SEGMENT_WIDTH,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.shape.radius.chip,
                  backgroundColor: selected
                    ? c.accentSoft
                    : hover(hovered)
                      ? c.surfaceSunken
                      : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
                keyboardFocusRing(theme, focused),
              ];
            }}
          >
            <Icon name={option.icon} size={18} color={selected ? 'accent' : 'muted'} />
          </Pressable>
        );
      })}
    </View>
  );
}
