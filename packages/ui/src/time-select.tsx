// One of the two selects of TimeField on iOS and Android: a button with the value that opens the
// list. The web, the path the PWA takes, has time-select.web.tsx with the browser's own select
// (spec 0027, Decision 6).

import { View } from 'react-native';

import { Menu } from './choice';
import { Text } from './primitives';
import type { TimeSelectProps } from './time-select-props';

export function TimeSelect(props: TimeSelectProps) {
  const label = props.options.find((option) => option.value === props.value)?.label ?? '–';
  const name = `${props.accessibilityLabel}, ${label}`;
  if (props.disabled) {
    return (
      <View accessible accessibilityLabel={name} testID={props.testID}>
        <Text color="muted">{label}</Text>
      </View>
    );
  }
  return (
    <Menu<string>
      label={label}
      accessibilityLabel={name}
      options={props.options}
      value={props.value}
      onChange={props.onChange}
      testID={props.testID}
    />
  );
}
