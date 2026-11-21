import { Platform } from 'react-native';

import { IconButton, TextField, type TextFieldProps } from './controls';
import { timeFieldA11yValue, timeFieldShowsClear } from './time-field-state';

export interface TimeFieldProps extends Pick<
  TextFieldProps,
  'onBlur' | 'onFocus' | 'onSubmitEditing' | 'autoFocus' | 'placeholder' | 'error' | 'hint'
> {
  /** Visible label, also the accessible name: "Uhrzeit", "Reserviert um". */
  label: string;
  /** The typed text as it stands ("19", "19:30", "7.30"); the feature reads it with core. */
  value: string;
  onChangeText: (text: string) => void;
  /** ✕: removes the time (AC-025). */
  onClear: () => void;
  /** Accessible name of ✕, e.g. "Uhrzeit entfernen". */
  clearLabel: string;
  /** What a screen reader hears for an empty field, e.g. "keine Uhrzeit". */
  emptyLabel: string;
  /** Greyed out, e.g. offline; the reason goes into `hint`. */
  disabled?: boolean;
  testID?: string;
}

// iOS has a keypad with ":" and "."; elsewhere the number pad, where "1930" works as well.
const KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';

/**
 * A time of day, typed (Decision 27): a text field with ✕, the same on every platform, usable by
 * keyboard and screen reader without a wheel. Reading and checking (five-minute steps) come from
 * `parseTimeInput` in core; the feature passes the error.
 */
export function TimeField(props: TimeFieldProps) {
  const editable = !props.disabled;
  return (
    <TextField
      label={props.label}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      error={props.error}
      hint={props.hint}
      onBlur={props.onBlur}
      onFocus={props.onFocus}
      onSubmitEditing={props.onSubmitEditing}
      autoFocus={props.autoFocus}
      editable={editable}
      keyboardType={KEYBOARD}
      returnKeyType="done"
      maxLength={5}
      accessibilityValue={{ text: timeFieldA11yValue(props.value, props.emptyLabel) }}
      style={props.disabled ? { opacity: 0.45 } : undefined}
      testID={props.testID}
      right={
        timeFieldShowsClear(props.value, editable) ? (
          <IconButton
            icon="x"
            label={props.clearLabel}
            onPress={props.onClear}
            testID={props.testID ? `${props.testID}-clear` : undefined}
          />
        ) : undefined
      }
    />
  );
}
