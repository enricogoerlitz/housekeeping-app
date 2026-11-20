import { useHousehold, usePlanEntries, useToday } from '@housekeeping/api';
import { addDays, orderSlotEntries, weekDates, type Id, type ISODate } from '@housekeeping/core';
import {
  Badge,
  Button,
  Chip,
  IconButton,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  ViewTabs,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ActivitiesPanel } from '@/features/activities/activities-panel';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';

import { AddEntrySheet, type AddTarget } from './add-entry-sheet';
import { EntrySheet } from './entry-sheet';
import { dayLabel, weekSubtitle } from './labels';
import { PlanEntryCard, PlanEntryRow } from './plan-entry';

type PlanView = 'week' | 'activities';

const PLAN_VIEWS: { value: PlanView; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'activities', label: 'Aktivitäten' },
];

/** The "+ hinzufügen" button of one meal; needs the network. */
function AddButton(props: { date: ISODate; slotId: Id; onPress: () => void; compact?: boolean }) {
  const online = useOnlineOnly();
  return (
    <Button
      label={props.compact ? 'Hinzufügen' : 'hinzufügen'}
      icon="plus"
      variant="link"
      size="sm"
      disabled={online.disabled}
      hint={online.hint}
      testID={`add-${props.date}-${props.slotId}`}
      onPress={props.onPress}
    />
  );
}

function DayHeading(props: { date: ISODate; today: ISODate }) {
  const isToday = props.date === props.today;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      testID={`day-${props.date}`}
    >
      <Text
        variant="heading"
        heading
        color={isToday ? 'accent' : props.date < props.today ? 'muted' : 'text'}
      >
        {dayLabel(props.date)}
      </Text>
      {isToday ? <Badge label="Heute" tone="accent" /> : null}
    </View>
  );
}

/**
 * "Plan": the week or the activities (spec 0004, AC-004). The chosen side lives in the URL
 * (`?view=activities`), so a reload or a deep link keeps it.
 */
export function PlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const view: PlanView =
    (Array.isArray(params.view) ? params.view[0] : params.view) === 'activities'
      ? 'activities'
      : 'week';
  const header = (right: ReactNode) => <ScreenHeader title="Plan" right={right} />;
  const tabs = (
    <ViewTabs
      label="Woche oder Aktivitäten"
      value={view}
      onChange={(next) =>
        router.setParams({
          view: next === 'activities' ? 'activities' : undefined,
          aid: undefined,
        })
      }
      options={PLAN_VIEWS}
      testID="plan-view"
    />
  );
  if (view === 'activities') return <ActivitiesPanel header={header} tabs={tabs} />;
  return <WeekPlan header={header} tabs={tabs} />;
}

/** The week with its three Tageszeiten, "Auf die Einkaufsliste" and "Vorgemerkt". */
function WeekPlan(props: { header: (right: ReactNode) => ReactNode; tabs: ReactNode }) {
  const today = useToday();
  const household = useHousehold();
  const entries = usePlanEntries();
  const online = useOnlineOnly();
  const theme = useTheme();
  const { isPhone, bp } = useBreakpoint();

  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState<AddTarget | undefined>();
  const [openEntryId, setOpenEntryId] = useState<Id | undefined>();
  const [pantryCheck, setPantryCheck] = useState(false);

  const dates = weekDates(addDays(today, offset * 7));
  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);
  const later = orderSlotEntries(entries.filter((entry) => entry.date === null));
  const lastSlotId = slots[slots.length - 1]?.id;

  // AC-002: activities, then recipes, then restaurants; within each in the order they were added.
  const entriesOf = (date: ISODate, slotId: Id) =>
    orderSlotEntries(entries.filter((entry) => entry.date === date && entry.slotId === slotId));
  const add = (date: ISODate | null, slotId: Id) => setAdding({ date, slotId });

  const weekNav = (
    <>
      <IconButton
        icon="chevron-left"
        label="Vorige Woche"
        testID="week-prev"
        onPress={() => setOffset(offset - 1)}
      />
      <Chip
        label="Heute"
        selected={offset === 0}
        testID="week-today"
        onPress={() => setOffset(0)}
      />
      <IconButton
        icon="chevron-right"
        label="Nächste Woche"
        testID="week-next"
        onPress={() => setOffset(offset + 1)}
      />
    </>
  );

  // The week stays out of the header, so title and view tabs stand at the same place in both views.
  const header = props.header(isPhone ? <StartPageActions /> : weekNav);

  const toList = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 18,
      }}
    >
      <Button
        label={isPhone ? 'Auf die Liste …' : 'Auf die Einkaufsliste …'}
        icon="shopping-basket"
        variant="secondary"
        size={isPhone ? 'sm' : 'md'}
        disabled={online.disabled}
        hint={online.hint}
        testID="plan-to-list"
        onPress={() => setPantryCheck(true)}
      />
      {isPhone ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{weekNav}</View>
      ) : null}
    </View>
  );

  const laterSection = (
    <Section
      title="Vorgemerkt"
      testID="planned-later"
      action={
        lastSlotId ? (
          <Button
            label="vormerken"
            icon="plus"
            variant="link"
            size="sm"
            disabled={online.disabled}
            hint={online.hint}
            testID="add-later"
            onPress={() => add(null, lastSlotId)}
          />
        ) : undefined
      }
    >
      {later.length === 0 ? (
        <Text color="muted">
          Nichts vorgemerkt. Hier landet, was bald dran sein soll, aber noch keinen Tag hat.
        </Text>
      ) : (
        <View style={{ flexDirection: isPhone ? 'column' : 'row', flexWrap: 'wrap', gap: 8 }}>
          {later.map((entry) => (
            <View key={entry.id} style={isPhone ? undefined : { width: 320 }}>
              <PlanEntryRow entry={entry} onPress={() => setOpenEntryId(entry.id)} />
            </View>
          ))}
        </View>
      )}
    </Section>
  );

  let week: ReactNode;
  if (bp === 'desktop') {
    // Seven columns, one row per meal: the whole week at a glance.
    week = (
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          {dates.map((date) => (
            <View key={date} style={{ flex: 1, minWidth: 0 }}>
              <DayHeading date={date} today={today} />
            </View>
          ))}
        </View>
        {slots.map((slot) => (
          <View key={slot.id} style={{ marginTop: 14 }}>
            <Text variant="smallStrong" color="muted" style={{ marginBottom: 6 }}>
              {slot.name}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {dates.map((date) => (
                <View
                  key={date}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    gap: 6,
                    padding: 6,
                    borderRadius: theme.shape.radius.card,
                    backgroundColor:
                      date === today ? theme.colors.accentSoft : theme.colors.surfaceSunken,
                    minHeight: 96,
                  }}
                >
                  {entriesOf(date, slot.id).map((entry) => (
                    <PlanEntryCard
                      key={entry.id}
                      entry={entry}
                      onPress={() => setOpenEntryId(entry.id)}
                    />
                  ))}
                  <AddButton
                    date={date}
                    slotId={slot.id}
                    compact
                    onPress={() => add(date, slot.id)}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  } else {
    // Phone: one day under the other. Tablet: two days side by side.
    week = (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        {dates.map((date) => (
          <View
            key={date}
            style={[
              {
                gap: 8,
                padding: 14,
                borderRadius: theme.shape.radius.card,
                backgroundColor:
                  date === today ? theme.colors.accentSoft : theme.colors.surfaceSunken,
              },
              isPhone ? { width: '100%' } : { flexBasis: '45%', flexGrow: 1 },
            ]}
          >
            <DayHeading date={date} today={today} />
            {slots.map((slot) => {
              const slotEntries = entriesOf(date, slot.id);
              return (
                <Stack key={slot.id} gap={6}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <Text variant="smallStrong" color="muted">
                      {slot.name}
                    </Text>
                    <AddButton date={date} slotId={slot.id} onPress={() => add(date, slot.id)} />
                  </View>
                  {slotEntries.map((entry) => (
                    <PlanEntryRow
                      key={entry.id}
                      entry={entry}
                      onPress={() => setOpenEntryId(entry.id)}
                    />
                  ))}
                </Stack>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  return (
    <Screen tone="plan" header={header} tabs={props.tabs}>
      <Text variant="small" color="muted" testID="week-subtitle" style={{ marginBottom: 10 }}>
        {weekSubtitle(dates)}
      </Text>
      {toList}
      {week}
      {laterSection}
      {adding ? (
        <AddEntrySheet target={adding} weekDates={dates} onClose={() => setAdding(undefined)} />
      ) : null}
      {openEntryId ? (
        <EntrySheet
          entryId={openEntryId}
          weekDates={dates}
          onClose={() => setOpenEntryId(undefined)}
        />
      ) : null}
      {pantryCheck ? (
        <PantryCheckSheet
          weekDates={dates}
          listId={household.defaultListId}
          onClose={() => setPantryCheck(false)}
        />
      ) : null}
    </Screen>
  );
}
