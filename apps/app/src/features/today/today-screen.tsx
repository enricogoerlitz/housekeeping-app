import {
  useCurrentMember,
  useHousehold,
  useHouseholdsMap,
  usePlanEntries,
  useToday,
} from '@housekeeping/api';
import {
  addPresetSlot,
  entriesForDay,
  overviewSections,
  overviewSubline,
  overviewTitle,
  shiftOverview,
  type ISODate,
} from '@housekeeping/core';
import { Screen, ScreenHeader, Text, useBreakpoint } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { HouseholdLine } from '@/features/household/household-line';
import { AddEntrySheet, type AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useHandedHousehold } from '@/lib/addressed';
import { usePageParams } from '@/lib/url-state';
import { TripWindowHost } from '@/features/trips/trip-window';

import { DayStrip } from './day-strip';
import { TodayChores } from './today-chores';
import { OverviewNav } from './today-header';
import { TodayMeals } from './today-meals';
import { TodayPacking } from './today-packing';
import { TodayPrep } from './today-prep';
import { TodayRecap } from './today-recap';
import { TodayShopping } from './today-shopping';
import { TodayTrips } from './today-trips';

function greeting(hour: number): string {
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Guten Tag';
  return 'Guten Abend';
}

/**
 * "Übersicht" (spec 0011, REQ-001; spec 0020): one shown day, as if it were today. Head,
 * Tagesleiste (seven days from yesterday), Vorbereitung, planned, "Wie war's?" and "Zu tun" all
 * follow it. The shown day stands in the address (`/?tag=…`, spec 0019): coming back from a detail
 * page and a reload keep it. Phone: head, Tagesleiste, planned, Wie war's?, Zu tun, Einkauf,
 * Reisetasche; tablets the same in one column, with the cards of the planned side by side (spec
 * 0031, REQ-032). Desktop (1,6 : 1): left Tagesleiste and planned, right Wie war's?, Zu tun,
 * Einkauf and Reisetasche (spec 0012).
 */
export function TodayScreen() {
  const address = usePageParams('uebersicht');
  // A tap on the Tagesüberblick opens `/?haushalt=…` (spec 0013, Decision 12, AC-037): an own
  // household other than the active one becomes active; the parameter then leaves.
  useHandedHousehold(address.params.haushalt, address.replace);
  const { isPhone, bp } = useBreakpoint();
  // Two columns and the nav beside the title only from 1100 px (spec 0031, REQ-032).
  const twoColumns = bp === 'desktop';
  // The time of day only picks the greeting; the date itself comes from useToday().
  const [hour] = useState(() => new Date().getHours());
  const today = useToday();
  const me = useCurrentMember();
  const household = useHousehold();
  const households = useHouseholdsMap();
  const planEntries = usePlanEntries();
  const online = useOnlineOnly();
  // "+" and "Hinzufügen" of an empty day (spec 0020, REQ-005); one shown day, so not in the address.
  const [adding, setAdding] = useState<AddTarget | undefined>();
  // Once for the whole page, not per section (spec 0019, REQ-010, AC-029); the disabled buttons
  // keep it as their hint.
  const offlineHint = online.hint ? (
    <Text variant="small" color="warn" testID="today-offline-hint">
      {online.hint}
    </Text>
  ) : null;
  // No day = today, so the page follows the date when the day changes while the app runs.
  const shown = address.params.tag ?? today;
  const show = (date: ISODate) => address.replace({ tag: date === today ? undefined : date });

  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);
  const slotOrder = slots.map((slot) => slot.id);
  const slotNames = Object.fromEntries(slots.map((slot) => [slot.id, slot.name]));
  const sections = overviewSections(shown, today);
  const isToday = shown === today;
  // The day as a whole: no Tageszeit in the title, "Abend" (else the last) in step 2 (AC-020).
  const presetSlot = addPresetSlot(slots);
  const addTo = (date: ISODate) => {
    show(date);
    if (presetSlot) setAdding({ date, slotId: presetSlot, slotChosen: false });
  };

  const nav = (
    <OverviewNav
      shown={shown}
      today={today}
      row={!twoColumns}
      onPage={(steps) => show(shiftOverview(shown, steps))}
      onToday={() => address.replace({ tag: undefined })}
    />
  );
  const header = (
    <ScreenHeader
      testID="today-header"
      title={overviewTitle(shown, today)}
      // On phones the active household above the title, with more than one (REQ-007, AC-019).
      above={
        isPhone && Object.keys(households).length > 1 ? (
          <HouseholdLine name={household.name} />
        ) : null
      }
      // Always exactly one line, so nothing below moves (REQ-002, AC-007, AC-008).
      subtitle={overviewSubline(shown, today, `${greeting(hour)}, ${me.name}`)}
      right={isPhone ? <StartPageActions /> : twoColumns ? nav : undefined}
    />
  );

  const strip = (
    <>
      <DayStrip
        shown={shown}
        today={today}
        slotOrder={slotOrder}
        tiles={twoColumns}
        onSelect={show}
        onAdd={addTo}
      />
      <TodayPrep shown={shown} today={today} />
    </>
  );
  const meals = (
    <TodayMeals
      shown={shown}
      title={sections.planned}
      entries={entriesForDay(planEntries, shown, slotOrder)}
      slotNames={slotNames}
      grid={!isPhone}
      onAdd={() => addTo(shown)}
    />
  );
  const addSheet = adding ? (
    <AddEntrySheet target={adding} onClose={() => setAdding(undefined)} />
  ) : null;
  // "Wie war's?" only while today is shown (AC-022).
  const recap = isToday ? <TodayRecap today={today} slotOrder={slotOrder} /> : null;
  const chores = <TodayChores shown={shown} today={today} title={sections.chores} />;

  if (!twoColumns) {
    return (
      <Screen testID="today-screen" header={header}>
        {offlineHint}
        {nav}
        {strip}
        <TodayTrips shown={shown} />
        {meals}
        {recap}
        {chores}
        <TodayShopping preview={!isPhone} />
        <TodayPacking shown={shown} />
        <TripWindowHost page="uebersicht" />
        {addSheet}
      </Screen>
    );
  }

  return (
    <Screen testID="today-screen" header={header}>
      {offlineHint}
      <View style={{ flexDirection: 'row', gap: 48, alignItems: 'flex-start' }}>
        <View style={{ flex: 1.6, minWidth: 0 }}>
          {strip}
          <TodayTrips shown={shown} />
          {meals}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {recap}
          {chores}
          <TodayShopping preview />
          <TodayPacking shown={shown} />
        </View>
      </View>
      <TripWindowHost page="uebersicht" />
      {addSheet}
    </Screen>
  );
}
