import { Pressable, View } from 'react-native';

import { keyboardFocusRing } from './controls';
import type { IconName } from './icons';
import { Icon } from './primitives';
import { useTheme } from './theme-context';

export interface IconChoiceOption<T extends IconName> {
  name: T;
  /** The word a screen reader says ("Berg"). */
  label: string;
}

export interface IconChoiceProps<T extends IconName> {
  /** Accessible name of the group, e.g. "Symbol". */
  label: string;
  options: readonly IconChoiceOption<T>[];
  /** The chosen symbol; undefined = none chosen. */
  value?: T;
  onChange: (name: T) => void;
  disabled?: boolean;
  /** Each symbol gets `${testID}-<name>`. */
  testID?: string;
}

/** Side of a symbol's tap target (40 icons in rows; at least 44 pt, DESIGN.md). */
const CELL = 44;

/**
 * A grid of symbols to choose one from (spec 0041, REQ-002): a radio group, each symbol named by
 * its word, the chosen one on the accent. Which symbols there are is the caller's.
 */
export function IconChoice<T extends IconName>(props: IconChoiceProps<T>) {
  const theme = useTheme();
  return (
    <View
      testID={props.testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
    >
      {props.options.map((option) => {
        const selected = option.name === props.value;
        return (
          <Pressable
            key={option.name}
            role="radio"
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            aria-label={option.label}
            aria-checked={selected}
            accessibilityState={{ checked: selected, disabled: !!props.disabled }}
            disabled={props.disabled}
            onPress={() => props.onChange(option.name)}
            testID={props.testID ? `${props.testID}-${option.name}` : undefined}
            style={(state) => [
              {
                width: CELL,
                height: CELL,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.shape.radius.control,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                opacity: props.disabled ? 0.5 : (state as { pressed: boolean }).pressed ? 0.7 : 1,
              },
              keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
            ]}
          >
            <Icon name={option.name} size={20} color={selected ? 'accent' : 'text'} />
          </Pressable>
        );
      })}
    </View>
  );
}
