import { View } from 'react-native';

import { IconButton } from './controls';
import { Text } from './primitives';
import {
  hourOptions,
  minuteOptions,
  timeFieldParts,
  timeFieldShowsClear,
  timeSelectLabel,
  timeWithHour,
  timeWithMinute,
} from './time-field-state';
import { TimeSelect } from './time-select';

export interface TimeFieldProps {
  /** Visible label: "Uhrzeit", "Uhrzeit (optional)". */
  label: string;
  /** What a screen reader hears before "Stunde" and "Minute"; defaults to the label. */
  accessibilityName?: string;
  /** "Stunde" and "Minute", the names of the two selects. */
  hourLabel: string;
  minuteLabel: string;
  /** "HH:MM" in five-minute steps, or no time. */
  value: string | undefined;
  /** A choice is a finished input: the feature saves it as it saved a finished typed time. */
  onChange: (time: string | undefined) => void;
  /** "–" stays a choice of the hour and ✕ removes the time (AC-030). */
  optional?: boolean;
  /** Accessible name of ✕, e.g. "Uhrzeit entfernen"; needed with `optional`. */
  clearLabel?: string;
  /** Message below the field (orange, never red). */
  error?: string;
  hint?: string;
  /** Greyed out, e.g. offline; the reason goes into `hint`. */
  disabled?: boolean;
  /** The field; the selects are `${testID}-hour` and `${testID}-minute`, ✕ `${testID}-clear`. */
  testID?: string;
}

/**
 * A time of day chosen from "Stunde" (0–23) and "Minute" (00, 05, … 55) (spec 0027, REQ-007,
 * Decision 6). Without an hour the minute is "–" and greyed out.
 */
export function TimeField(props: TimeFieldProps) {
  const editable = !props.disabled;
  const optional = props.optional ?? false;
  const parts = timeFieldParts(props.value);
  const hasHour = parts.hour !== '';
  const name = props.accessibilityName ?? props.label;
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  return (
    <View style={{ gap: 6 }} testID={props.testID}>
      <Text variant="smallStrong">{props.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TimeSelect
          accessibilityLabel={timeSelectLabel(name, props.hourLabel)}
          options={hourOptions(optional || !hasHour)}
          value={parts.hour}
          onChange={(hour) => props.onChange(timeWithHour(props.value, hour))}
          disabled={!editable}
          testID={id('hour')}
        />
        <Text color="muted">:</Text>
        <TimeSelect
          accessibilityLabel={timeSelectLabel(name, props.minuteLabel)}
          options={minuteOptions(!hasHour)}
          value={parts.minute}
          onChange={(minute) => props.onChange(timeWithMinute(props.value, minute))}
          disabled={!editable || !hasHour}
          testID={id('minute')}
        />
        {timeFieldShowsClear({ value: props.value, optional, editable }) ? (
          <IconButton
            icon="x"
            label={props.clearLabel ?? props.label}
            onPress={() => props.onChange(undefined)}
            testID={id('clear')}
          />
        ) : null}
      </View>
      {props.error ? (
        <Text variant="small" color="warn" testID={id('error')}>
          {props.error}
        </Text>
      ) : props.hint ? (
        <Text variant="small" color="muted">
          {props.hint}
        </Text>
      ) : null}
    </View>
  );
}
