import type { MealPlanEntry } from '@housekeeping/core';
import { Icon, Text, expandableA11y, keyboardFocusRing, space, useTheme } from '@housekeeping/ui';
import { Platform, Pressable, View } from 'react-native';

import { EntryLine } from './calendar-parts';
import type { CalendarData } from './calendar-data';
import { ParkedTarget, useLiftedKind } from './calendar-drag';

/**
 * "Vorgemerkt · n" under the grid of month and year (spec 0016, REQ-003): a tap unfolds the
 * entries without a day, which can be dragged onto a day (AC-012). The strip is one target that
 * takes an entry's day away (AC-013); with nothing "vorgemerkt" it shows only while an entry is
 * dragged, as "Vormerken".
 */
export function PlannedLaterStrip(props: {
  data: CalendarData;
  /** The entries without a day, in display order. */
  entries: MealPlanEntry[];
  expanded: boolean;
  onToggle: () => void;
  onOpenEntry: (entry: MealPlanEntry) => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const dragging = useLiftedKind() === 'entry';
  const count = props.entries.length;
  if (count === 0 && !dragging) return null;

  const frame = {
    marginTop: space.m,
    marginBottom: space.xxl,
    borderRadius: theme.shape.radius.card,
    borderWidth: 1,
    borderColor: c.border,
    borderStyle: count === 0 ? ('dashed' as const) : ('solid' as const),
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
  };
  if (count === 0) {
    return (
      <ParkedTarget style={frame} testID="planned-later-strip">
        <View
          testID="planned-later-target"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44 }}
        >
          <Icon name="bookmark" size={16} color="muted" />
          <Text variant="smallStrong" color="muted">
            Vormerken
          </Text>
        </View>
      </ParkedTarget>
    );
  }
  const label = `Vorgemerkt · ${count}`;
  return (
    <ParkedTarget style={frame} testID="planned-later-strip">
      <Pressable
        testID="planned-later-toggle"
        accessibilityRole="button"
        {...expandableA11y(label, props.expanded, Platform.OS, {
          expanded: 'aufgeklappt',
          collapsed: 'eingeklappt',
        })}
        onPress={props.onToggle}
        style={(state) => {
          const { pressed, focused } = state as { pressed: boolean; focused?: boolean };
          return [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s,
              minHeight: 44,
              borderRadius: theme.shape.radius.control,
              opacity: pressed ? 0.7 : 1,
            },
            keyboardFocusRing(theme, focused),
          ];
        }}
      >
        <Icon name="bookmark" size={16} color="muted" />
        <Text variant="smallStrong" style={{ flex: 1 }}>
          {label}
        </Text>
        <Icon name={props.expanded ? 'chevron-down' : 'chevron-right'} size={18} color="muted" />
      </Pressable>
      {props.expanded ? (
        <View style={{ gap: space.xs, paddingBottom: space.s }} testID="planned-later-entries">
          {props.entries.map((entry) => (
            <EntryLine key={entry.id} entry={entry} data={props.data} onPress={props.onOpenEntry} />
          ))}
        </View>
      ) : null}
    </ParkedTarget>
  );
}
