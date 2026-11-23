import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type HostInstance } from 'react-native';

import { keyboardFocusRing, IconButton } from './controls';
import {
  monthCalendarFocusDay,
  monthCalendarKey,
  monthCalendarWeeks,
  monthOf,
  shiftMonth,
} from './month-calendar-nav';
import { Text } from './primitives';
import { space, useTheme } from './theme-context';

// react-native-web passes `onKeyDown` through to the DOM; native has no such prop and ignores it.
type KeyEvent = { key: string; preventDefault: () => void };
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** A day cell is at least this tall and wide (44 pt touch target). */
const CELL = 44;
const MARK = 40;
const never = () => false;

export interface MonthCalendarProps {
  /** Any day of the shown month (ISO, "2026-11-01"). */
  month: string;
  /** ‹ ›, PageUp/PageDown or an arrow past the edge: the first day of the month to show. */
  onMonthChange: (month: string) => void;
  /** A tap, Enter or Space on a free day. */
  onSelect: (date: string) => void;
  /** The heading, e.g. "November 2026". */
  title: string;
  /** Seven short heads, Monday first. */
  weekdayLabels: readonly string[];
  previousLabel: string;
  nextLabel: string;
  /** The screen-reader name of a day, e.g. "Mi 25.11.2026". */
  dayLabel: (date: string) => string;
  /** The marked day (from = to) or range; both ends are drawn strong, the days between soft. */
  marked?: { from: string; to: string };
  /** The day Tab enters on when it is in the shown month; default `marked.from`. */
  focusDate?: string;
  /** Today gets a ring. */
  today?: string;
  /** Days that cannot be chosen: dimmed, not pressable, skipped by the arrow keys. */
  isDisabled?: (date: string) => boolean;
  /** One quiet line under the heading, e.g. what a tap picks. */
  hint?: string;
  /**
   * Prefix of the test ids: `${testID}-picker` (the frame), `-prev`, `-next`, `-title` and
   * `-day-<date>`.
   */
  testID?: string;
}

/**
 * A month grid Monday to Sunday that pages without a limit (spec 0016, REQ-005, AC-019 to
 * AC-021). It holds no copy and no date rules: the feature passes the words and which days are
 * blocked. On the web the arrows move a day or a week, PageUp and PageDown a month, past blocked
 * days and across months (`monthCalendarKey`); Tab enters on one day only (roving focus).
 */
export function MonthCalendar(props: MonthCalendarProps) {
  const theme = useTheme();
  const isDisabled = props.isDisabled ?? never;
  const shown = monthOf(props.month);
  const days = useRef(new Map<string, HostInstance>());
  // The day the keyboard is on, and a day to focus once its month is rendered.
  const [focused, setFocused] = useState<string | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (!pending.current) return;
    const node = days.current.get(pending.current);
    if (node) {
      node.focus();
      pending.current = null;
    }
  });

  const entry =
    focused !== null && monthOf(focused) === shown && !isDisabled(focused)
      ? focused
      : monthCalendarFocusDay(
          shown,
          props.focusDate ?? props.marked?.from,
          props.today,
          isDisabled,
        );

  const onKeyDown = (event: KeyEvent) => {
    if (entry === null) return;
    const result = monthCalendarKey(event.key, entry, isDisabled);
    // Enter and Space on a day are the Pressable's own press.
    if (!result || !('focus' in result)) return;
    event.preventDefault();
    setFocused(result.focus);
    if (monthOf(result.focus) !== shown) {
      pending.current = result.focus;
      props.onMonthChange(monthOf(result.focus));
    } else {
      days.current.get(result.focus)?.focus();
    }
  };

  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);

  return (
    <View
      testID={id('picker')}
      style={{
        padding: space.s,
        borderRadius: theme.shape.radius.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          icon="chevron-left"
          label={props.previousLabel}
          size={CELL}
          onPress={() => props.onMonthChange(shiftMonth(shown, -1))}
          testID={id('prev')}
        />
        <Text variant="bodyStrong" testID={id('title')}>
          {props.title}
        </Text>
        <IconButton
          icon="chevron-right"
          label={props.nextLabel}
          size={CELL}
          onPress={() => props.onMonthChange(shiftMonth(shown, 1))}
          testID={id('next')}
        />
      </View>
      {props.hint ? (
        <Text variant="caption" color="muted" align="center" style={{ marginBottom: space.xs }}>
          {props.hint}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {props.weekdayLabels.map((head) => (
          <Text key={head} variant="caption" color="muted" align="center" style={{ flex: 1 }}>
            {head}
          </Text>
        ))}
      </View>
      <View {...({ onKeyDown } as object)}>
        {monthCalendarWeeks(shown).map((week, row) => (
          <View key={`${shown}-${row}`} style={{ flexDirection: 'row' }}>
            {week.map((date, column) => {
              if (date === null) {
                return <View key={`empty-${column}`} style={{ flex: 1, minWidth: CELL }} />;
              }
              const disabled = isDisabled(date);
              const marked =
                props.marked !== undefined && props.marked.from <= date && date <= props.marked.to;
              const edge = date === props.marked?.from || date === props.marked?.to;
              return (
                <Pressable
                  key={date}
                  ref={(node) => {
                    if (node) days.current.set(date, node);
                    else days.current.delete(date);
                  }}
                  testID={id(`day-${date}`)}
                  accessibilityRole="button"
                  accessibilityLabel={props.dayLabel(date)}
                  accessibilityState={{ selected: marked, disabled }}
                  // react-native-web ignores accessibilityState; the browser needs the attribute.
                  aria-selected={marked}
                  disabled={disabled}
                  tabIndex={date === entry ? 0 : -1}
                  onFocus={() => setFocused(date)}
                  onPress={() => props.onSelect(date)}
                  style={(state) => {
                    const { focused: hasFocus } = state as PressState;
                    return [
                      {
                        flex: 1,
                        minWidth: CELL,
                        minHeight: CELL,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: MARK / 2,
                      },
                      keyboardFocusRing(theme, hasFocus),
                    ];
                  }}
                >
                  <View
                    style={{
                      width: MARK,
                      height: MARK,
                      borderRadius: MARK / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: edge
                        ? theme.colors.accent
                        : marked
                          ? theme.colors.accentSoft
                          : 'transparent',
                      borderWidth: date === props.today && !edge ? 1 : 0,
                      borderColor: theme.colors.accent,
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    <Text variant="small" color={edge ? 'onAccent' : disabled ? 'muted' : 'text'}>
                      {String(Number(date.slice(8, 10)))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
