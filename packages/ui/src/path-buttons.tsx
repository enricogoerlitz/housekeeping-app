import { View } from 'react-native';

import { Button } from './controls';
import type { IconName } from './icons';

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

/**
 * The ways under one field (spec 0062, REQ-001): equal buttons side by side that never move; only
 * the highlight wanders to the way the input suggests. A tap takes the way tapped.
 */
export function PathButtons<T extends string>(props: PathButtonsProps<T>) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {props.options.map((option) => {
        const highlighted =
          !props.disabled && !option.disabled && option.value === props.highlighted;
        return (
          <View key={option.value} style={{ flex: 1, minWidth: 0 }}>
            <Button
              label={option.label}
              icon={option.icon}
              variant={highlighted ? 'primary' : 'secondary'}
              full
              disabled={props.disabled === true || option.disabled === true}
              hint={props.hint ?? (highlighted ? props.highlightHint : undefined)}
              onPress={() => props.onPress(option.value)}
              testID={
                option.testID ?? (props.testID ? `${props.testID}-${option.value}` : undefined)
              }
            />
          </View>
        );
      })}
    </View>
  );
}
