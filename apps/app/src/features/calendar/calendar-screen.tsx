import {
  calendarFromParams,
  calendarViewSlug,
  dragRange,
  dragTargetText,
  formatLongDate,
  monthTitle,
  moveBounds,
  orderSlotEntries,
  parseDragSourceKey,
  parseMoveTargetKey,
  periodContains,
  periodNavLabel,
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
  DragProvider,
  IconButton,
  Screen,
  ScreenHeader,
  Section,
  Text,
  ViewTabs,
  announce,
  columnsFor,
  keyboardFocusRing,
  panelPlacement,
  tabSwipe,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View, type HostInstance } from 'react-native';

import { ChoreSheet } from '@/features/chores/chore-sheet';
import { TripSheet } from '@/features/trips/trip-sheet';
import { TripWindowHost, useTripWindow } from '@/features/trips/trip-window';
import { AddEntrySheet, type AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { SeriesOccurrenceSheet } from '@/features/activities/series-occurrence-sheet';
import { EntrySheet } from '@/features/meal-plan/entry-sheet';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId, useHandedHousehold, useMissingObject } from '@/lib/addressed';
import { useHideAssistantButton } from '@/lib/assistant';
import { PagePreview, usePageParams } from '@/lib/url-state';

import { EntryLine } from './calendar-parts';
import { useCalendarData } from './calendar-data';
import {
  CalendarDragProvider,
  CalendarSwipe,
  ParkedTarget,
  TripRangeBanner,
} from './calendar-drag';
import { useFillHeight } from './calendar-fill';
import { DayPanel } from './day-panel';
import { MonthView } from './month-view';
import { useEntryTitle, useMoveEntry } from './move-entry';
import { PlannedLaterStrip } from './planned-later-strip';
import { WeekMenuLine, WeekMenuSheet } from './week-menu';
import { WeekView } from './week-view';
import { YearView } from './year-view';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year', label: 'Jahr' },
];

/** "Vorgemerkt" in the desktop week: columns of equal width, each at least this wide (REQ-001). */
const PARKED_COLUMN = 220;
const PARKED_GAP = 6;

/** The week "Auf die Einkaufsliste" takes in the month without a chosen day: today's, else the first. */
function defaultSelected(monthStart: ISODate, today: ISODate): ISODate {
  return periodContains('month', monthStart, today) ? today : monthStart;
}

/**
 * "Kalender" (spec 0010): week, month and year with ‹ › and "Heute", ▲ Aktivitäten and ⊔ Auf die
 * Einkaufsliste; the household row always shows (spec 0054, REQ-004). View, chosen day (which gives the period), the day window, the entry window
 * and the windows "Reise eintragen" and "Auf die Einkaufsliste" stand in the address (spec 0019,
 * REQ-012): paging and choosing a day replace the entry, opening a window adds one. Every jump
 * into the calendar uses the same address (`/kalender?tag=…` from the "Übersicht", AC-038); an
 * invalid day or view gives the week of today (AC-039).
 */
export function CalendarScreen() {
  const data = useCalendarData();
  const router = useRouter();
  const tripWindow = useTripWindow('kalender');
  const online = useOnlineOnly();
  const theme = useTheme();
  const { isPhone, isWide, bp, width } = useBreakpoint();
  const focused = useIsFocused();
  const { today } = data;
  // From 1100 px the calendar fills the window's height (spec 0021, REQ-001).
  const {
    markerRef: markFill,
    onMarkerLayout: onFillLayout,
    available,
  } = useFillHeight(bp === 'desktop');
  const [belowHeight, setBelowHeight] = useState(0);
  const gridHeight = available === null ? undefined : available - belowHeight;
  const [parkedWidth, setParkedWidth] = useState(0);
  // Opening, a change of view, paging and "Heute" put today (or the chosen day) under the tabs
  // on phones and scrolling tablets (spec 0021, REQ-004); choosing a day does not.
  const [scrollRequest, setScrollRequest] = useState(0);
  const requestScroll = () => setScrollRequest((count) => count + 1);

  const address = usePageParams('kalender');
  const { params } = address;
  const { view, day } = calendarFromParams(params, today);
  const start = periodStart(view, day);
  // The day window of month and year (spec 0016, REQ-006). The day stays while it slides away.
  const panelDay = day;
  const dayOpen = params.fenster === 'tag' && view !== 'week';
  const selected = dayOpen ? panelDay : undefined;
  // A notification's household becomes active once; the parameter then leaves (spec 0013).
  useHandedHousehold(params.haushalt, address.replace);
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
  // The add window keeps its target here until spec 0021 gives it times instead of slots.
  const [adding, setAdding] = useState<AddTarget | undefined>();
  // "Was kochen wir?" (spec 0063): the Wochenkarte, and what it just planned in which week.
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const [menuPlanned, setMenuPlanned] = useState<{ weekStart: ISODate; ids: Id[] }>();
  // The screen reader's way to move: the entry window with "Verschieben" first.
  const [moveFirst, setMoveFirst] = useState(false);
  // Removed on another device while open: the window just closes; an unknown id in the address
  // closes it with a toast (AC-052).
  const openEntry = data.entries.find((entry) => entry.id === params.eintrag);
  // An entry of another own household switches there first (REQ-017).
  const entryFound = useAddressedId('planEntries', params.eintrag);
  useMissingObject(
    params.eintrag,
    entryFound !== 'missing' && params.haushalt === undefined,
    'Diesen Eintrag gibt es nicht mehr',
    () => address.replace({ eintrag: undefined }),
  );
  // The chore window from the household row, month and day window (spec 0021, REQ-016, AC-043).
  const openChore = data.chores.find((chore) => chore.id === params.aufgabe);
  const choreFound = useAddressedId('chores', params.aufgabe);
  useMissingObject(
    params.aufgabe,
    choreFound !== 'missing' && params.haushalt === undefined,
    'Diese Aufgabe gibt es nicht mehr',
    () => address.replace({ aufgabe: undefined }),
  );
  const setOpenChore = (choreId: Id | undefined) => {
    if (choreId) address.open({ aufgabe: choreId });
    else address.close({ aufgabe: undefined });
  };
  const setOpenEntry = (entry: MealPlanEntry | undefined) => {
    setMoveFirst(false);
    // Spec 0041: a Termin of a series opens its own window (series and its day in the address).
    if (entry?.series) address.open({ serie: entry.series.seriesId, termin: entry.series.on });
    else if (entry) address.open({ eintrag: entry.id });
    else address.close({ eintrag: undefined });
  };
  const openMove = (entry: MealPlanEntry) => {
    if (entry.series) {
      setOpenEntry(entry);
      return;
    }
    setMoveFirst(true);
    address.open({ eintrag: entry.id });
  };
  const closeOccurrence = () => address.close({ serie: undefined, termin: undefined });
  // "Vorgemerkt · n" under the grid of month and year is unfolded (only on this device).
  const [laterOpen, setLaterOpen] = useState(false);
  const pantryCheck = params.fenster === 'aus-kalender';
  const newTripWindow = params.fenster === 'neu-reise';
  const openWindow = (fenster: 'aus-kalender' | 'neu-reise', date?: ISODate) =>
    address.open(date ? { fenster, tag: date } : { fenster });
  const closeWindow = () => address.close({ fenster: undefined });

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

  /** The day in the address: today is the default and stays out of it. */
  const dayParam = (date: ISODate) => (date === today ? undefined : date);
  // The chosen day stays while it is in the new period; paging chooses the period's start.
  const periodParams = (nextView: CalendarView, nextStart: ISODate, chosen: ISODate) => ({
    ansicht: calendarViewSlug(nextView),
    tag: dayParam(periodContains(nextView, nextStart, chosen) ? chosen : nextStart),
  });
  const show = (nextView: CalendarView, nextStart: ISODate, chosen: ISODate = day) => {
    address.replace({
      ...periodParams(nextView, nextStart, chosen),
      // The week has no day window; month and year keep the chosen day (AC-027).
      fenster: nextView === 'week' && params.fenster === 'tag' ? undefined : params.fenster,
    });
  };
  // Choosing another day in an open day window replaces; opening it adds an entry (REQ-012).
  // From the week strip or a swipe the grid follows, the period comes from the day (AC-023).
  const openDay = (date: ISODate) => {
    announce(
      selected === undefined ? `Tages-Fenster, ${formatLongDate(date)}` : formatLongDate(date),
    );
    if (dayOpen) address.replace({ tag: dayParam(date) });
    else address.open({ fenster: 'tag', tag: dayParam(date) });
  };
  const chooseDay = openDay;

  const changeView = (next: CalendarView) => {
    if (next === view) return;
    show(next, switchView(view, next, start, today, selected));
    requestScroll();
  };
  const page = (steps: number) => {
    show(view, shiftPeriod(view, start, steps));
    requestScroll();
  };
  // "Heute" chooses today itself, so the week and the year open at it (REQ-004).
  const toToday = () => {
    show(view, periodStart(view, today), today);
    requestScroll();
  };

  // In the year a trip ends at the edge of the year (REQ-007).
  const tripYear = view === 'year' ? Number(start.slice(0, 4)) : undefined;
  const tripRange = (anchor: ISODate, current: ISODate) => dragRange(anchor, current, tripYear);
  const range = trip ? tripRange(trip.anchor, trip.current) : null;
  const draggedEntry = data.entries.find((entry) => entry.id === draggedEntryId);
  // The household's order of Tageszeiten decides what "later" means (spec 0021, REQ-012).
  const bounds = draggedEntry ? moveBounds(draggedEntry, data.entries, data.slotOrder) : null;
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

  const shownWeek = weekDates(
    view === 'month' ? (selected ?? defaultSelected(start, today)) : start,
  );

  // No ⋯ (spec 0054, REQ-004): trips are drawn over the days or entered on "Reisen".
  const actions = (
    <>
      <IconButton
        icon="shopping-basket"
        label="Auf die Einkaufsliste"
        size={36}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => openWindow('aus-kalender')}
        testID="plan-to-list"
      />
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
  const prev = (
    <IconButton
      icon="chevron-left"
      label={view === 'week' ? 'Vorige Woche' : `Voriger ${unit}`}
      testID="week-prev"
      onPress={() => page(-1)}
    />
  );
  const next = (
    <IconButton
      icon="chevron-right"
      label={view === 'week' ? 'Nächste Woche' : `Nächster ${unit}`}
      testID="week-next"
      onPress={() => page(1)}
    />
  );
  // Phones (spec 0021, REQ-018, AC-046): the arrows at the edges, the label in a fixed slot
  // between them; outside today's period the label leads back to it with "Heute ›".
  const phoneLabel = periodNavLabel(view, start, today);
  const phoneNav = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} testID="calendar-phone-nav">
      {prev}
      <View style={{ flex: 1, minWidth: 0, height: 44, justifyContent: 'center' }}>
        {phoneLabel.today ? (
          <Text
            variant="smallStrong"
            testID="calendar-title"
            numberOfLines={1}
            style={{ textAlign: 'center' }}
          >
            {phoneLabel.label}
          </Text>
        ) : (
          <Pressable
            testID="week-today"
            accessibilityRole="button"
            accessibilityLabel="Zurück zu heute"
            onPress={toToday}
            style={(state) => {
              const { pressed, focused: keyFocus } = state as {
                pressed: boolean;
                focused?: boolean;
              };
              return [
                {
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.shape.radius.control,
                  opacity: pressed ? 0.7 : 1,
                },
                keyboardFocusRing(theme, keyFocus),
              ];
            }}
          >
            <Text variant="smallStrong" testID="calendar-title" numberOfLines={1}>
              {phoneLabel.label}
            </Text>
            <Text variant="caption" color="accent" testID="calendar-today-hint">
              Heute ›
            </Text>
          </Pressable>
        )}
      </View>
      {next}
    </View>
  );
  // "Heute" left of ‹ as in the "Übersicht", greyed out while today is shown (spec 0031, REQ-036).
  const showsToday = periodContains(view, start, today);
  const nav = isPhone ? (
    phoneNav
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Button
        label="Heute"
        variant="secondary"
        size="sm"
        disabled={showsToday}
        hint={showsToday ? undefined : 'Zurück zu heute'}
        testID="week-today"
        onPress={toToday}
      />
      {prev}
      <Text
        variant="smallStrong"
        testID="calendar-title"
        style={{ minWidth: 190, textAlign: 'center', flexShrink: 1 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {next}
    </View>
  );
  // Tabs and nav share a row only from 1100 px (spec 0031, REQ-032).
  const tabs = (
    <View
      style={
        bp !== 'desktop'
          ? { gap: 4, alignItems: isPhone ? undefined : 'flex-start' }
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
  // A stripe opens its trip window over the calendar (spec 0022, REQ-002).
  const openStripe = (stripe: TripStripe) => tripWindow.open(stripe.tripId);
  const later = orderSlotEntries(data.entries.filter((entry) => entry.date === null));
  const lastSlotId = data.slots[data.slots.length - 1]?.id;
  // What stands under the grid takes its height from the room the desktop grid fills.
  const measureBelow = (height: number) =>
    setBelowHeight((current) => (current === height ? current : height));
  const parkedColumns = columnsFor(parkedWidth, { minColumnWidth: PARKED_COLUMN, gap: PARKED_GAP });
  const parkedCellWidth =
    parkedWidth > 0 ? (parkedWidth - (parkedColumns - 1) * PARKED_GAP) / parkedColumns : undefined;

  const laterStrip = (
    <View onLayout={(event) => measureBelow(event.nativeEvent.layout.height)}>
      <PlannedLaterStrip
        data={data}
        entries={later}
        expanded={laterOpen}
        onToggle={() => setLaterOpen(!laterOpen)}
        onOpenEntry={setOpenEntry}
      />
    </View>
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
          // A desktop calendar that fills the window ends at the page's edge (REQ-001).
          clearFab={bp !== 'desktop'}
          header={<ScreenHeader title="Kalender" right={actions} />}
          // Spec 0063, REQ-008: "Was kochen wir?" stays in sight under the week's navigation.
          tabs={
            view === 'week' ? (
              <View>
                {tabs}
                <WeekMenuLine
                  weekStart={start}
                  planned={menuPlanned?.weekStart === start ? menuPlanned.ids : []}
                  onOpen={() => setWeekMenuOpen(true)}
                  onToList={() => openWindow('aus-kalender')}
                />
              </View>
            ) : (
              tabs
            )
          }
          // Phones: a swipe outside the grid changes the view Woche ↔ Monat ↔ Jahr like the tabs;
          // in the grid it pages (CalendarSwipe takes it first; spec 0034, REQ-006).
          // The neighbour view stands beside the content while the finger moves it (spec 0034,
          // REQ-007): the calendar as that view would show it, without windows.
          tabSwipe={tabSwipe(VIEWS, view, changeView, (next) => (
            <PagePreview
              page="kalender"
              params={periodParams(next, switchView(view, next, start, today, selected), day)}
            >
              <CalendarScreen />
            </PagePreview>
          ))}
          aside={
            <DayPanel
              data={data}
              open={selected !== undefined}
              date={panelDay}
              onClose={() => address.close({ fenster: undefined })}
              onChooseDay={chooseDay}
              onOpenChore={setOpenChore}
              onAdd={onAdd}
              onOpenEntry={setOpenEntry}
              onOpenStripe={openStripe}
              onNewTrip={(date) => {
                if (!online.disabled) openWindow('neu-reise', date);
              }}
              onShowWeek={(date) => show('week', periodStart('week', date))}
              returnFocusRef={returnFocus}
            />
          }
        >
          <View ref={(node) => markFill(node)} onLayout={onFillLayout} />
          {/* In the year only the months page; "Vorgemerkt" and "Reisen" below them change the
              view like the room under month and week (spec 0034, REQ-006). */}
          <CalendarSwipe enabled={isPhone && view !== 'year'} onSwipe={page}>
            {view === 'week' ? (
              <WeekView
                data={data}
                weekStart={start}
                // The grid of seven columns only from 1100 px, else the list (REQ-032).
                wide={bp === 'desktop'}
                height={gridHeight}
                scrollDay={day}
                scrollRequest={scrollRequest}
                onAdd={onAdd}
                onOpenEntry={setOpenEntry}
                onOpenStripe={openStripe}
                onOpenChore={setOpenChore}
              />
            ) : null}
            {view === 'month' ? (
              <MonthView
                data={data}
                monthStart={start}
                selected={selected}
                onOpenDay={openDay}
                registerDay={registerDay}
                wide={isWide}
                longWeekdays={bp === 'desktop'}
                height={gridHeight}
                onAdd={onAdd}
                onOpenEntry={setOpenEntry}
                onOpenStripe={openStripe}
                onOpenChore={setOpenChore}
              />
            ) : null}
            {view === 'year' ? (
              <YearView
                data={data}
                year={Number(start.slice(0, 4))}
                columns={isPhone ? 3 : bp === 'desktop' ? 4 : 3}
                selected={selected}
                onOpenDay={openDay}
                registerDay={registerDay}
                onOpenMonth={(monthStart) => {
                  show('month', monthStart);
                  requestScroll();
                }}
                onOpenStripe={openStripe}
                gridSwipe={{ enabled: isPhone, onSwipe: page }}
                belowGrid={laterStrip}
                height={gridHeight}
                fillsWindow={bp === 'desktop'}
                scrollMonth={day}
                scrollRequest={scrollRequest}
              />
            ) : null}
          </CalendarSwipe>
          {view === 'month' ? laterStrip : null}
          {view === 'week' ? (
            <ParkedTarget>
              <View onLayout={(event) => measureBelow(event.nativeEvent.layout.height)}>
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
                    // From 700 px a grid of equal columns, each at least 220 px (REQ-001).
                    <View
                      style={{
                        flexDirection: isPhone ? 'column' : 'row',
                        flexWrap: 'wrap',
                        gap: PARKED_GAP,
                      }}
                      testID="planned-later-grid"
                      onLayout={(event) => setParkedWidth(event.nativeEvent.layout.width)}
                    >
                      {later.map((entry) => (
                        <View
                          key={entry.id}
                          style={isPhone ? undefined : { width: parkedCellWidth ?? PARKED_COLUMN }}
                        >
                          <EntryLine entry={entry} data={data} onPress={setOpenEntry} />
                        </View>
                      ))}
                    </View>
                  )}
                </Section>
              </View>
            </ParkedTarget>
          ) : null}
          {adding ? <AddEntrySheet target={adding} onClose={() => setAdding(undefined)} /> : null}
          {weekMenuOpen && view === 'week' ? (
            <WeekMenuSheet
              weekStart={start}
              onClose={() => setWeekMenuOpen(false)}
              onPlanned={(ids) => setMenuPlanned({ weekStart: start, ids })}
            />
          ) : null}
          {/* A window stays in the address while a page opened from it is on top (AC-016). */}
          {openEntry && focused ? (
            <EntrySheet
              key={openEntry.id}
              entryId={openEntry.id}
              moveFirst={moveFirst}
              weekDates={weekDates(openEntry.date ?? start)}
              onClose={() => setOpenEntry(undefined)}
            />
          ) : null}
          {params.serie && params.termin && focused ? (
            <SeriesOccurrenceSheet
              key={`${params.serie}:${params.termin}`}
              seriesId={params.serie}
              on={params.termin}
              onClose={closeOccurrence}
            />
          ) : null}
          {openChore && focused ? (
            <ChoreSheet
              key={openChore.id}
              chore={openChore}
              onClose={() => setOpenChore(undefined)}
              // „Alle Einträge ›“: the history of „Haushalt“ filtered by the chore (spec 0026, AC-025).
              onShowEntries={() =>
                router.navigate({
                  pathname: '/haushalt',
                  params: { ansicht: 'verlauf', 'nur-aufgabe': openChore.id },
                })
              }
            />
          ) : null}
          {pantryCheck && focused ? (
            <PantryCheckSheet weekDates={shownWeek} onClose={closeWindow} />
          ) : null}
          {newTripWindow && focused ? (
            <TripSheet
              initialRange={params.tag ? { from: params.tag, to: params.tag } : undefined}
              onClose={closeWindow}
            />
          ) : null}
          {trip?.phase === 'sheet' && range ? (
            <TripSheet initialRange={range} focusNote onClose={() => setTrip(null)} />
          ) : null}
          <TripWindowHost page="kalender" />
        </Screen>
      </CalendarDragProvider>
      <TripRangeBanner
        label={trip?.phase === 'drawing' && range ? rangeLabel(range.from, range.to) : null}
      />
    </DragProvider>
  );
}
