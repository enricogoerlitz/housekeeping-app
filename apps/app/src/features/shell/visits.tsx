import { useToday } from '@housekeeping/api';
import { daysBetween, formatLongDate, type ISODate } from '@housekeeping/core';
import { Icon, List, ListRow, Row, Section, Text, useTheme } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import type { ComponentRef, Ref, RefObject } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { daysAgoLabel } from '@/features/activities/labels';

// "Besuche" of a restaurant and "Verlauf" of an activity (spec 0024, REQ-007): the line "Zuletzt:
// vor 19 Tagen · 1 Besuch ›" jumps to the section, and every day there opens the calendar in its
// week.

export type SectionRef = RefObject<ComponentRef<typeof View> | null>;

/** Scrolls the section into view and moves the focus to its heading (web; the app is a PWA). */
export function useVisitsJump(section: SectionRef): () => void {
  return () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const node = section.current as unknown as HTMLElement | null;
    if (!node) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    node.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    const heading = node.querySelector<HTMLElement>('[role="heading"]');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  };
}

/** "Zuletzt: vor 19 Tagen · 1 Besuch ›": a button while there is a visit, else plain text. */
export function VisitsLine(props: { label: string; onPress?: () => void; testID: string }) {
  const theme = useTheme();
  const content = (
    <Row gap={6}>
      <Icon name="history" size={16} color="muted" />
      <Text variant="small" color="muted" testID={props.testID}>
        {props.label}
      </Text>
      {props.onPress ? <Icon name="chevron-right" size={14} color="muted" /> : null}
    </Row>
  );
  if (!props.onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      testID={`${props.testID}-jump`}
      style={(state) => ({
        alignSelf: 'flex-start',
        minHeight: 44,
        justifyContent: 'center',
        opacity: state.pressed ? 0.7 : 1,
        borderRadius: theme.shape.radius.control,
      })}
    >
      {content}
    </Pressable>
  );
}

/** The days up to today, newest first; a row opens the calendar in the week of that day. */
export function VisitList({
  ref,
  ...props
}: {
  ref?: Ref<ComponentRef<typeof View>>;
  title: string;
  dates: readonly ISODate[];
  empty: string;
  testID: string;
}) {
  const router = useRouter();
  const today = useToday();
  return (
    <View ref={ref}>
      <Section title={props.title} testID={props.testID}>
        {props.dates.length === 0 ? (
          <Text color="muted" testID={`${props.testID}-empty`}>
            {props.empty}
          </Text>
        ) : (
          <List>
            {props.dates.map((date, index) => (
              <ListRow
                key={`${date}-${index}`}
                testID={`${props.testID}-${index}`}
                leading={<Icon name="calendar-days" size={20} color="muted" />}
                title={formatLongDate(date)}
                subtitle={daysAgoLabel(daysBetween(date, today))}
                trailing={<Icon name="chevron-right" size={18} color="muted" />}
                onPress={() => router.navigate({ pathname: '/kalender', params: { tag: date } })}
              />
            ))}
          </List>
        )}
      </Section>
    </View>
  );
}
