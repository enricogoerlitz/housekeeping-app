import { reminderAccessibilityLabel, reminderLabel, type MealPlanEntry } from '@housekeeping/core';
import { Icon, Text } from '@housekeeping/ui';
import { View } from 'react-native';

// Spec 0017, REQ-002 and REQ-006: an entry with a reminder carries a bell with day and time
// ("Erinnerung Fr 18:00", once passed "Erinnerung vorbei") in the week, the day panel and the
// entry window; never in the dots of month and year.

export interface EntryReminderLabels {
  /** "Erinnerung Fr 18:00", "Erinnerung Fr 20.11. 18:00", "Erinnerung vorbei". */
  label: string;
  /** "Lasagne, Erinnerung Freitag 18 Uhr", "Lasagne, Erinnerung vorbei". */
  accessibilityLabel: string;
}

/** The bell's texts for `entry` named `title`, judged in the household's zone; none without one. */
export function entryReminderLabels(
  entry: Pick<MealPlanEntry, 'date' | 'reminder'>,
  title: string,
  timeZone: string,
  now: Date = new Date(),
): EntryReminderLabels | undefined {
  if (entry.date === null || entry.reminder === undefined) return undefined;
  return {
    label: reminderLabel(entry.date, entry.reminder, now, timeZone),
    accessibilityLabel: reminderAccessibilityLabel(
      title,
      entry.date,
      entry.reminder,
      now,
      timeZone,
    ),
  };
}

/**
 * The bell and its text, muted. In a calendar line the line's own label speaks for it, so it is
 * only read out on its own where `accessibilityLabel` is given (the entry window).
 */
export function ReminderBell(props: {
  label: string;
  accessibilityLabel?: string;
  size?: 'compact' | 'row';
  testID?: string;
}) {
  const own = props.accessibilityLabel !== undefined;
  return (
    <View
      testID={props.testID}
      accessible={own || undefined}
      accessibilityLabel={props.accessibilityLabel}
      importantForAccessibility={own ? undefined : 'no-hide-descendants'}
      aria-hidden={own ? undefined : true}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <Icon name="bell" size={props.size === 'row' ? 15 : 12} color="muted" />
      <Text variant={props.size === 'row' ? 'small' : 'caption'} color="muted" numberOfLines={1}>
        {props.label}
      </Text>
    </View>
  );
}
