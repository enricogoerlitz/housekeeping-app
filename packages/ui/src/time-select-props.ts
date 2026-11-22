import type { TimeOption } from './time-field-state';

export interface TimeSelectProps {
  /** "Uhrzeit, Stunde": what a screen reader hears before the value (AC-031). */
  accessibilityLabel: string;
  options: TimeOption[];
  /** The chosen option's value; "" for "–". */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
}
