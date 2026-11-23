// One of the two selects of TimeField in the browser, the path the PWA takes (spec 0027,
// Decision 6): the browser's own select, so the iPhone opens its wheel, Tab, typing ("19", "3")
// and the arrow keys work, and a screen reader hears "Uhrzeit, Stunde, 19" without extra work.

import type { CSSProperties } from 'react';

import { useTheme } from './theme-context';
import type { TimeSelectProps } from './time-select-props';

/** @public Metro resolves the import of the native twin to this file on the web. */
export function TimeSelect(props: TimeSelectProps) {
  const theme = useTheme();
  const c = theme.colors;
  const style: CSSProperties = {
    fontFamily: theme.type.body.fontFamily,
    // 16 px keeps iOS Safari from zooming into the page on focus.
    fontSize: theme.type.body.fontSize,
    color: c.text,
    backgroundColor: theme.shape.cardBorder ? c.surface : c.surfaceSunken,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: theme.shape.cardBorder ? c.border : 'transparent',
    borderRadius: theme.shape.radius.control,
    minHeight: 50,
    minWidth: 76,
    paddingLeft: 12,
    paddingRight: 8,
    cursor: props.disabled ? 'default' : 'pointer',
    opacity: props.disabled ? 0.45 : 1,
  };
  return (
    <select
      aria-label={props.accessibilityLabel}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
      data-testid={props.testID}
      style={style}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
