import {
  calendarDayParam,
  dragRange,
  dragTargetText,
  formatLongDate,
  monthTitle,
  moveBounds,
  orderSlotEntries,
  parseDragSourceKey,
  parseMoveTargetKey,
  periodContains,
  periodForDay,
  periodStart,
  rangeLabel,
  shiftPeriod,
  switchView,
  weekDates,
  weekRangeLabel,
  type TripStripe,
  type CalendarView,
  type Id,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  DragProvider,
  IconButton,
  Menu,
  Screen,
  ScreenHeader,
  Section,
  Text,
  ViewTabs,
  announce,
  panelPlacement,
  useBreakpoint,
  type MenuOption,
} from '@housekeeping/ui';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';

import { TripSheet } from '@/features/trips/trip-sheet';
import { AddEntrySheet, type AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { EntrySheet } from '@/features/meal-plan/entry-sheet';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useHideAssistantButton } from '@/lib/assistant';
import { useSettings } from '@/lib/settings';
import { useHandedTarget } from '@/lib/target-params';

import { EntryLine } from './calendar-parts';
import { useCalendarData } from './calendar-data';
import { CalendarDragProvider, ParkedTarget, TripRangeBanner } from './calendar-drag';
import { DayPanel } from './day-panel';
import { MonthView } from './month-view';
import { useEntryTitle, useMoveEntry } from './move-entry';
import { PlannedLaterStrip } from './planned-later-strip';
import { WeekView } from './week-view';
import { YearView } from './year-view';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year', label: 'Jahr' },
];

type MoreAction = 'household-row' | 'trips-new' | 'trips';

/** `/kalender?tag=…` from the "Übersicht"; with `eintrag` and `haushalt` from a notification. */
const TARGET_PARAMS = ['tag', 'eintrag', 'haushalt'] as const;

/** The week "Auf die Einkaufsliste" takes in the month without a chosen day: today's, else the first. */
function defaultSelected(monthStart: ISODate, today: ISODate): ISODate {
  return periodContains('month', monthStart, today) ? today : monthStart;
}

/**
 * "Kalender" (spec 0010): week, month and year with ‹ › and "Heute", ▲ Aktivitäten, ⊔ Auf die
 * Einkaufsliste and ⋯. View and period are the screen's state; the page "Aktivitäten" opens on top
 * of it, so "‹ Kalender" comes back to the same view (AC-025, AC-040). "/kalender?tag=JJJJ-MM-TT"
 * from the "Übersicht" shows the week of that day with the day selected; an invalid day is
 * ignored (spec 0011, AC-004, AC-011, AC-013).
 */
export function CalendarScreen() {
  const data = useCalendarData();
  const settings = useSettings();
  const router = useRouter();
  const online = useOnlineOnly();
  const { isPhone, isWide, bp, width } = useBreakpoint();
  const focused = useIsFocused();
  const { today } = data;

  const [view, setView] = useState<CalendarView>('week');
  const [start, setStart] = useState<ISODate>(() => periodStart('week', today));
  // The day window of month and year (spec 0016, REQ-006). `panelDay` stays while it slides away.
  const [panelDay, setPanelDay] = useState<ISODate>(today);
  const [dayOpen, setDayOpen] = useState(false);
  const selected = dayOpen && view !== 'week' ? panelDay : undefined;
  const [newTrip, setNewTrip] = useState<ISODate | undefined>();
  // Every day cell of month and year, so the day gets the focus back when the window closes and
  // a later drag (spec 0016, REQ-001) can find its targets.
  const dayCells = useRef(new Map<ISODate, HostInstance>());
  const registerDay = useCallback((date: ISODate, node: HostInstance | null) => {
    if (node) dayCells.current.set(date, node);
    else dayCells.current.delete(date);
  }, []);
  const returnFocus = useRef<{ focus: () => void }>(null);
  useEffect(() => {
    returnFocus.current = { focus: () => dayCells.current.get(panelDay)?.focus() };
  }, [panelDay]);
  // The floating assistant button would cover the lower part of the day window.
  useHideAssistantButton(selected !== undefined && focused && panelPlacement(width) === 'bottom');
  const [adding, setAdding] = useState<AddTarget | undefined>();
  const [openEntryId, setOpenEntryId] = useState<Id | undefined>();
  // The screen reader's way to move: the entry window with "Verschieben" first.
  const [moveFirst, setMoveFirst] = useState(false);
  // Removed on another device while open: the window just closes.
  const openEntry = data.entries.find((entry) => entry.id === openEntryId);
  const setOpenEntry = (entry: MealPlanEntry | undefined) => {
    setMoveFirst(false);
    setOpenEntryId(entry?.id);
  };
  const openMove = (entry: MealPlanEntry) => {
    setMoveFirst(true);
    setOpenEntryId(entry.id);
  };
  // "Vorgemerkt · n" under the grid of month and year is unfolded (only on this device).
  const [laterOpen, setLaterOpen] = useState(false);
  const [pantryCheck, setPantryCheck] = useState(false);
  const [enteringTrip, setEnteringTrip] = useState(false);

  // Dragging (spec 0016, REQ-001 to REQ-004, REQ-007): the entry on the finger, or the trip
  // drawn from `anchor` to `current`; `sheet` keeps the days marked while "Reise eintragen" is open.
  const moveEntry = useMoveEntry();
  const titleOf = useEntryTitle();
  const [draggedEntryId, setDraggedEntryId] = useState<Id | null>(null);
  const [trip, setTrip] = useState<{
    anchor: ISODate;
    current: ISODate;
    phase: 'drawing' | 'sheet';
  } | null>(null);

  const show = (nextView: CalendarView, nextStart: ISODate) => {
    setView(nextView);
    setStart(nextStart);
    // The week has no day window; month and year keep the chosen day (AC-027).
    if (nextView === 'week') setDayOpen(false);
  };
  const openDay = (date: ISODate) => {
    announce(
      selected === undefined ? `Tages-Fenster, ${formatLongDate(date)}` : formatLongDate(date),
    );
    setPanelDay(date);
    setDayOpen(true);
  };
  // From the week strip or a swipe: the grid follows when the day is out of view (AC-023).
  const chooseDay = (date: ISODate) => {
    openDay(date);
    setStart(periodForDay(view, start, date));
  };
  // The day handed over by the "Übersicht" or a notification: taken once, then the parameters are
  // cleared, so the same link works again and paging is not pulled back to it. A notification's
  // entry opens its window; an unknown entry opens nothing (spec 0013, AC-037, AC-038).
  const params = useLocalSearchParams<{ tag?: string | string[] }>();
  const target = useHandedTarget('/kalender', TARGET_PARAMS);
  const handedDay = calendarDayParam(params.tag);
  const handedEntryId = target.screen === 'calendar' ? target.entryId : undefined;
  const [taken, setTaken] = useState<{ day?: ISODate; entryId?: Id }>({});
  if (handedDay !== taken.day || handedEntryId !== taken.entryId) {
    setTaken({ day: handedDay, entryId: handedEntryId });
    if (handedDay) {
      setView('week');
      setStart(periodStart('week', handedDay));
      setDayOpen(false);
    }
    if (handedEntryId) setOpenEntryId(handedEntryId);
  }

  const changeView = (next: CalendarView) => {
    if (next !== view) show(next, switchView(view, next, start, today, selected));
  };
  const page = (steps: number) => show(view, shiftPeriod(view, start, steps));
  const toToday = () => show(view, periodStart(view, today));

  // In the year a trip ends at the edge of the year (REQ-007).
  const tripYear = view === 'year' ? Number(start.slice(0, 4)) : undefined;
  const tripRange = (anchor: ISODate, current: ISODate) => dragRange(anchor, current, tripYear);
  const range = trip ? tripRange(trip.anchor, trip.current) : null;
  const draggedEntry = data.entries.find((entry) => entry.id === draggedEntryId);
  const bounds = draggedEntry ? moveBounds(draggedEntry, data.entries) : null;
  const entryOf = (sourceKey: string) => {
    const source = parseDragSourceKey(sourceKey);
    return source?.kind === 'entry'
      ? data.entries.find((entry) => entry.id === source.entryId)
      : undefined;
  };
  const targetText = (targetKey: string, sourceKey: string) => {
    const entry = entryOf(sourceKey);
    const target = parseMoveTargetKey(targetKey);
    if (!entry || !target) return null;
    return dragTargetText({
      entry,
      target,
      entries: data.entries,
      slots: data.slots,
      title: titleOf(entry),
    });
  };
  const onLift = (sourceKey: string) => {
    const source = parseDragSourceKey(sourceKey);
    if (source?.kind === 'trip') {
      setTrip({ anchor: source.date, current: source.date, phase: 'drawing' });
      announce(rangeLabel(source.date, source.date));
      return;
    }
    const entry = entryOf(sourceKey);
    if (!entry) return;
    setDraggedEntryId(entry.id);
    announce(`${titleOf(entry)} angefasst`);
  };
  const onHover = (targetKey: string | null, sourceKey: string) => {
    if (targetKey === null) return;
    const source = parseDragSourceKey(sourceKey);
    const target = parseMoveTargetKey(targetKey);
    if (source?.kind === 'trip') {
      if (target?.kind !== 'day') return;
      setTrip({ anchor: source.date, current: target.date, phase: 'drawing' });
      const { from, to } = tripRange(source.date, target.date);
      announce(rangeLabel(from, to));
      return;
    }
    const text = targetText(targetKey, sourceKey);
    if (text) announce(text.label);
  };
  const onDrop = (targetKey: string, sourceKey: string) => {
    const source = parseDragSourceKey(sourceKey);
    const target = parseMoveTargetKey(targetKey);
    if (source?.kind === 'trip') {
      // Only a trip comes of it (AC-031): "Reise eintragen" with the days, me chosen.
      setTrip(
        target?.kind === 'day'
          ? { anchor: source.date, current: target.date, phase: 'sheet' }
          : null,
      );
      return;
    }
    setDraggedEntryId(null);
    const entry = entryOf(sourceKey);
    if (entry && target) moveEntry(entry, target);
  };
  const onCancel = (sourceKey: string, refusedKey: string | null) => {
    if (parseDragSourceKey(sourceKey)?.kind === 'trip') {
      setTrip(null);
      return;
    }
    setDraggedEntryId(null);
    const entry = entryOf(sourceKey);
    const refused = refusedKey === null ? null : parseMoveTargetKey(refusedKey);
    // A refused target says why (AC-015); nothing is saved.
    if (entry && refused) moveEntry(entry, refused);
    else if (entry) announce(`${titleOf(entry)} zurückgelegt`);
  };
  const isAllowed = (targetKey: string, sourceKey: string) =>
    parseDragSourceKey(sourceKey)?.kind === 'trip'
      ? parseMoveTargetKey(targetKey)?.kind === 'day'
      : (targetText(targetKey, sourceKey)?.allowed ?? true);
  const targetLabel = (targetKey: string, sourceKey: string) =>
    targetText(targetKey, sourceKey)?.label ?? null;
  // Paging at the edges (AC-009); a trip in the year stays in its year.
  const onPage =
    trip?.phase === 'drawing' && view === 'year'
      ? undefined
      : (direction: -1 | 1) => page(direction);

  const householdOn =
    view === 'week'
      ? settings.householdRow.week
      : view === 'month'
        ? settings.householdRow.month
        : false;
  const shownWeek = weekDates(
    view === 'month' ? (selected ?? defaultSelected(start, today)) : start,
  );

  const moreOptions: MenuOption<MoreAction>[] = [
    // The year never shows chores, so it has no switch for them (AC-019).
    ...(view === 'year'
      ? []
      : [
          {
            value: 'household-row' as const,
            label: householdOn ? 'Haushalt-Zeile ausblenden' : 'Haushalt-Zeile einblenden',
          },
        ]),
    {
      value: 'trips-new',
      label: 'Reise eintragen',
      disabled: online.disabled,
      hint: online.hint,
    },
    { value: 'trips', label: 'Reisen' },
  ];
  const onMore = (action: MoreAction) => {
    if (action === 'household-row') {
      if (view === 'year') return;
      settings.update({
        householdRow: { ...settings.householdRow, [view]: !householdOn },
      });
    } else if (action === 'trips-new') {
      if (!online.disabled) setEnteringTrip(true);
    } else {
      router.navigate('/reisen');
    }
  };

  // Five buttons share the phone's header with the title, so the calendar's own three sit closer.
  const actions = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton
          icon="mountain"
          label="Aktivitäten"
          size={36}
          onPress={() => router.push('/kalender/aktivitaeten')}
          testID="calendar-activities"
        />
        <IconButton
          icon="shopping-basket"
          label="Auf die Einkaufsliste"
          size={36}
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setPantryCheck(true)}
          testID="plan-to-list"
        />
        <Menu<MoreAction>
          trigger="icon"
          icon="ellipsis"
          label="Mehr"
          accessibilityLabel="Mehr zum Kalender"
          options={moreOptions}
          onChange={onMore}
          testID="calendar-more"
        />
      </View>
      <StartPageActions />
    </>
  );

  const title =
    view === 'week'
      ? weekRangeLabel(start)
      : view === 'month'
        ? monthTitle(start)
        : start.slice(0, 4);
  const unit = view === 'week' ? 'Woche' : view === 'month' ? 'Monat' : 'Jahr';
  const nav = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <IconButton
        icon="chevron-left"
        label={view === 'week' ? 'Vorige Woche' : `Voriger ${unit}`}
        testID="week-prev"
        onPress={() => page(-1)}
      />
      <Text
        variant="smallStrong"
        testID="calendar-title"
        style={{ minWidth: isPhone ? 0 : 190, textAlign: 'center', flexShrink: 1 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <IconButton
        icon="chevron-right"
        label={view === 'week' ? 'Nächste Woche' : `Nächster ${unit}`}
        testID="week-next"
        onPress={() => page(1)}
      />
      <Chip
        label="Heute"
        selected={periodContains(view, start, today)}
        testID="week-today"
        onPress={toToday}
      />
    </View>
  );
  const tabs = (
    <View
      style={
        isPhone
          ? { gap: 4 }
          : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }
      }
    >
      <ViewTabs
        label="Woche, Monat oder Jahr"
        value={view}
        onChange={changeView}
        options={VIEWS}
        testID="calendar-view"
      />
      {nav}
    </View>
  );

  const onAdd = (target: AddTarget) => setAdding(target);
  // A stripe leads to its trip (spec 0012, AC-016, AC-046); editing happens there (✎).
  const openStripe = (stripe: TripStripe) => {
    const id = stripe.tripId;
    if (id) router.push({ pathname: '/kalender/reise/[id]', params: { id } });
  };
  const later = orderSlotEntries(data.entries.filter((entry) => entry.date === null));
  const lastSlotId = data.slots[data.slots.length - 1]?.id;

  const laterStrip = (
    <PlannedLaterStrip
      data={data}
      entries={later}
      expanded={laterOpen}
      onToggle={() => setLaterOpen(!laterOpen)}
      onOpenEntry={setOpenEntry}
    />
  );

  return (
    <DragProvider
      style={{ flex: 1 }}
      testID="calendar-drag-area"
      onLift={onLift}
      onHover={onHover}
      onDrop={onDrop}
      onCancel={onCancel}
      isAllowed={isAllowed}
      targetLabel={targetLabel}
      onPage={onPage}
    >
      <CalendarDragProvider value={{ bounds, range, openMove }}>
        <Screen
          tone="plan"
          testID="calendar-screen"
          header={<ScreenHeader title="Kalender" right={actions} />}
          tabs={tabs}
          aside={
            <DayPanel
              data={data}
              open={selected !== undefined}
              date={panelDay}
              onClose={() => setDayOpen(false)}
              onChooseDay={chooseDay}
              // Chores follow the household row of the month, in the year too (REQ-006).
              showHousehold={settings.householdRow.month}
              onAdd={onAdd}
              onOpenEntry={setOpenEntry}
              onOpenStripe={openStripe}
              onNewTrip={(date) => {
                if (!online.disabled) setNewTrip(date);
              }}
              onShowWeek={(date) => show('week', periodStart('week', date))}
              returnFocusRef={returnFocus}
            />
          }
        >
          {view === 'week' ? (
            <WeekView
              data={data}
              weekStart={start}
              showHousehold={householdOn}
              wide={isWide}
              onAdd={onAdd}
              onOpenEntry={setOpenEntry}
              onOpenStripe={openStripe}
            />
          ) : null}
          {view === 'month' ? (
            <MonthView
              data={data}
              monthStart={start}
              selected={selected}
              onOpenDay={openDay}
              registerDay={registerDay}
              showHousehold={householdOn}
              wide={isWide}
              onOpenEntry={setOpenEntry}
              onOpenStripe={openStripe}
            />
          ) : null}
          {view === 'month' ? laterStrip : null}
          {view === 'year' ? (
            <YearView
              data={data}
              year={Number(start.slice(0, 4))}
              columns={isPhone ? 3 : bp === 'desktop' ? 4 : 3}
              selected={selected}
              onOpenDay={openDay}
              registerDay={registerDay}
              onOpenMonth={(monthStart) => show('month', monthStart)}
              onOpenStripe={openStripe}
              belowGrid={laterStrip}
            />
          ) : null}
          {view === 'week' ? (
            <ParkedTarget>
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
                      onPress={() => onAdd({ date: null, slotId: lastSlotId })}
                    />
                  ) : undefined
                }
              >
                {later.length === 0 ? (
                  <Text color="muted">
                    Nichts vorgemerkt. Hier landet, was bald dran sein soll, aber noch keinen Tag
                    hat.
                  </Text>
                ) : (
                  <View
                    style={{ flexDirection: isPhone ? 'column' : 'row', flexWrap: 'wrap', gap: 6 }}
                  >
                    {later.map((entry) => (
                      <View key={entry.id} style={isPhone ? undefined : { width: 280 }}>
                        <EntryLine entry={entry} data={data} onPress={setOpenEntry} />
                      </View>
                    ))}
                  </View>
                )}
              </Section>
            </ParkedTarget>
          ) : null}
          {adding ? <AddEntrySheet target={adding} onClose={() => setAdding(undefined)} /> : null}
          {openEntry ? (
            <EntrySheet
              key={openEntry.id}
              entryId={openEntry.id}
              moveFirst={moveFirst}
              weekDates={weekDates(openEntry.date ?? start)}
              onClose={() => setOpenEntry(undefined)}
            />
          ) : null}
          {pantryCheck ? (
            <PantryCheckSheet weekDates={shownWeek} onClose={() => setPantryCheck(false)} />
          ) : null}
          {enteringTrip ? <TripSheet onClose={() => setEnteringTrip(false)} /> : null}
          {newTrip ? (
            <TripSheet
              initialRange={{ from: newTrip, to: newTrip }}
              onClose={() => setNewTrip(undefined)}
            />
          ) : null}
          {trip?.phase === 'sheet' && range ? (
            <TripSheet initialRange={range} focusNote onClose={() => setTrip(null)} />
          ) : null}
        </Screen>
      </CalendarDragProvider>
      <TripRangeBanner
        label={trip?.phase === 'drawing' && range ? rangeLabel(range.from, range.to) : null}
      />
    </DragProvider>
  );
}
