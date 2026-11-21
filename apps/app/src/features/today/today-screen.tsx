import { useCurrentMember, useHousehold, usePlanEntries, useToday } from '@housekeeping/api';
import {
  addDays,
  entriesForDay,
  overviewSections,
  overviewTitle,
  shiftShownDay,
  weekNav,
  type ISODate,
} from '@housekeeping/core';
import { Screen, ScreenHeader, useBreakpoint } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { StartPageActions } from '@/features/shell/profile-button';

import { TodayAbsence } from './today-absence';
import { TodayChores } from './today-chores';
import { CalendarButton, WeekNav } from './today-header';
import { TodayMeals } from './today-meals';
import { TodayRecap } from './today-recap';
import { TodayShopping } from './today-shopping';
import { WeekStrip } from './week-strip';

function greeting(hour: number): string {
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Guten Tag';
  return 'Guten Abend';
}

/**
 * "Übersicht" (spec 0011, REQ-001): one shown day, as if it were today. Head, week strip,
 * planned, "Für morgen", "Wie war's?" and "Zu tun" all follow it. The shown day lives only while
 * the app runs: coming back from a detail page keeps it, a new start shows today (AC-008).
 * Phone: head, week strip, planned, Wie war's?, Zu tun, Einkauf. Desktop (1,6 : 1): left week
 * strip and planned, right Wie war's?, Zu tun and Einkauf.
 */
export function TodayScreen() {
  const { isPhone, bp } = useBreakpoint();
  // The time of day only picks the greeting; the date itself comes from useToday().
  const [hour] = useState(() => new Date().getHours());
  const today = useToday();
  const me = useCurrentMember();
  const household = useHousehold();
  const planEntries = usePlanEntries();
  // undefined = today, so the page follows the date when the day changes while the app runs.
  const [picked, setPicked] = useState<ISODate | undefined>(undefined);
  const shown = picked ?? today;
  const show = (date: ISODate) => setPicked(date === today ? undefined : date);

  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);
  const slotOrder = slots.map((slot) => slot.id);
  const slotNames = Object.fromEntries(slots.map((slot) => [slot.id, slot.name]));
  const sections = overviewSections(shown, today);
  const isToday = shown === today;

  const nav = (
    <WeekNav
      shown={shown}
      today={today}
      wide={!isPhone}
      onPage={(weeks) => show(shiftShownDay(shown, weeks))}
      onToday={() => setPicked(undefined)}
    />
  );
  const header = (
    <ScreenHeader
      testID="today-header"
      title={overviewTitle(shown, today)}
      subtitle={isToday ? `${greeting(hour)}, ${me.name}` : undefined}
      right={
        isPhone ? (
          <>
            <CalendarButton shown={shown} />
            <StartPageActions />
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {nav}
            <CalendarButton shown={shown} />
          </View>
        )
      }
    />
  );

  const strip = (
    <WeekStrip
      shown={shown}
      today={today}
      slotOrder={slotOrder}
      tiles={bp === 'desktop'}
      onSelect={show}
      label={weekNav(shown, today).label}
    />
  );
  const meals = (
    <TodayMeals
      shown={shown}
      title={sections.planned}
      entries={entriesForDay(planEntries, shown, slotOrder)}
      nextDayEntries={entriesForDay(planEntries, addDays(shown, 1), slotOrder)}
      slotNames={slotNames}
      grid={!isPhone}
    />
  );
  // "Wie war's?" only while today is shown (AC-022).
  const recap = isToday ? <TodayRecap today={today} slotOrder={slotOrder} /> : null;
  const chores = <TodayChores shown={shown} today={today} title={sections.chores} />;

  if (isPhone) {
    return (
      <Screen testID="today-screen" header={header}>
        {nav}
        {strip}
        <TodayAbsence shown={shown} />
        {meals}
        {recap}
        {chores}
        <TodayShopping preview={false} />
      </Screen>
    );
  }

  return (
    <Screen testID="today-screen" header={header}>
      <View
        style={{ flexDirection: 'row', gap: bp === 'desktop' ? 48 : 28, alignItems: 'flex-start' }}
      >
        <View style={{ flex: 1.6, minWidth: 0 }}>
          {strip}
          <TodayAbsence shown={shown} />
          {meals}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {recap}
          {chores}
          <TodayShopping preview />
        </View>
      </View>
    </Screen>
  );
}
