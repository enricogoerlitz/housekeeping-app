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
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';

import { TripSheet } from '@/features/trips/trip-sheet';
import { TripWindowHost, useTripWindow } from '@/features/trips/trip-window';
import { AddEntrySheet, type AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { EntrySheet } from '@/features/meal-plan/entry-sheet';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId, useHandedHousehold, useMissingObject } from '@/lib/addressed';
import { useHideAssistantButton } from '@/lib/assistant';
import { useSettings } from '@/lib/settings';
import { usePageParams } from '@/lib/url-state';

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

/** The week "Auf die Einkaufsliste" takes in the month without a chosen day: today's, else the first. */
function defaultSelected(monthStart: ISODate, today: ISODate): ISODate {
  return periodContains('month', monthStart, today) ? today : monthStart;
}

/**
 * "Kalender" (spec 0010): week, month and year with ‹ › and "Heute", ▲ Aktivitäten, ⊔ Auf die
 * Einkaufsliste and ⋯. View, chosen day (which gives the period), the day window, the entry window
 * and the windows "Reise eintragen" and "Auf die Einkaufsliste" stand in the address (spec 0019,
 * REQ-012): paging and choosing a day replace the entry, opening a window adds one. Every jump
 * into the calendar uses the same address (`/kalender?tag=…` from the "Übersicht", AC-038); an
 * invalid day or view gives the week of today (AC-039).
 */
export function CalendarScreen() {
  const data = useCalendarData();
  const settings = useSettings();
  const router = useRouter();
  const tripWindow = useTripWindow('kalender');
  const online = useOnlineOnly();
  const { isPhone, isWide, bp, width } = useBreakpoint();
  const focused = useIsFocused();
  const { today } = data;

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
  const setOpenEntry = (entry: MealPlanEntry | undefined) => {
    setMoveFirst(false);
    if (entry) address.open({ eintrag: entry.id });
    else address.close({ eintrag: undefined });
  };
  const openMove = (entry: MealPlanEntry) => {
    setMoveFirst(true);
    address.open({ eintrag: entry.id });
  };
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
  const show = (nextView: CalendarView, nextStart: ISODate) => {
    // The chosen day stays while it is in the new period; paging chooses the period's start.
    const nextDay = periodContains(nextView, nextStart, day) ? day : nextStart;
    address.replace({
      ansicht: calendarViewSlug(nextView),
      tag: dayParam(nextDay),
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
      if (!online.disabled) openWindow('neu-reise');
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
          onPress={() => openWindow('aus-kalender')}
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
  // A stripe opens its trip window over the calendar (spec 0022, REQ-002).
  const openStripe = (stripe: TripStripe) => tripWindow.open(stripe.tripId);
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
              onClose={() => address.close({ fenster: undefined })}
              onChooseDay={chooseDay}
              // Chores follow the household row of the month, in the year too (REQ-006).
              showHousehold={settings.householdRow.month}
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
