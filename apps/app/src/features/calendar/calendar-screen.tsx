import {
  monthTitle,
  orderSlotEntries,
  periodContains,
  periodStart,
  shiftPeriod,
  switchView,
  weekDates,
  weekRangeLabel,
  type AbsenceStripe,
  type CalendarView,
  type ISODate,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  IconButton,
  Menu,
  Screen,
  ScreenHeader,
  Section,
  Text,
  ViewTabs,
  useBreakpoint,
  type MenuOption,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AbsenceSheet } from '@/features/absences/absence-sheet';
import { AddEntrySheet, type AddTarget } from '@/features/meal-plan/add-entry-sheet';
import { EntrySheet } from '@/features/meal-plan/entry-sheet';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useSettings } from '@/lib/settings';

import { EntryLine } from './calendar-parts';
import { useCalendarData } from './calendar-data';
import { MonthView } from './month-view';
import { WeekView } from './week-view';
import { YearView } from './year-view';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year', label: 'Jahr' },
];

type MoreAction = 'household-row' | 'absence-new' | 'absences';

/** The day of the month whose entries stand under the grid on phones: today, else the first. */
function defaultSelected(monthStart: ISODate, today: ISODate): ISODate {
  return periodContains('month', monthStart, today) ? today : monthStart;
}

/**
 * "Kalender" (spec 0010): week, month and year with ‹ › and "Heute", ▲ Aktivitäten, ⊔ Auf die
 * Einkaufsliste and ⋯. View and period are the screen's state; the page "Aktivitäten" opens on top
 * of it, so "‹ Kalender" comes back to the same view (AC-025, AC-040).
 */
export function CalendarScreen() {
  const data = useCalendarData();
  const settings = useSettings();
  const router = useRouter();
  const online = useOnlineOnly();
  const { isPhone, isWide, bp } = useBreakpoint();
  const { today } = data;

  const [view, setView] = useState<CalendarView>('week');
  const [start, setStart] = useState<ISODate>(() => periodStart('week', today));
  const [selected, setSelected] = useState<ISODate>(today);
  const [adding, setAdding] = useState<AddTarget | undefined>();
  const [openEntry, setOpenEntry] = useState<MealPlanEntry | undefined>();
  const [pantryCheck, setPantryCheck] = useState(false);
  const [absence, setAbsence] = useState<{ stripe?: AbsenceStripe } | undefined>();

  const show = (nextView: CalendarView, nextStart: ISODate) => {
    setView(nextView);
    setStart(nextStart);
    if (nextView === 'month') setSelected(defaultSelected(nextStart, today));
  };
  const changeView = (next: CalendarView) => {
    if (next !== view) show(next, switchView(view, next, start, today));
  };
  const page = (steps: number) => show(view, shiftPeriod(view, start, steps));
  const toToday = () => show(view, periodStart(view, today));

  const householdOn =
    view === 'week'
      ? settings.householdRow.week
      : view === 'month'
        ? settings.householdRow.month
        : false;
  const shownWeek = weekDates(view === 'month' ? selected : start);

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
      value: 'absence-new',
      label: 'Abwesenheit eintragen',
      disabled: online.disabled,
      hint: online.hint,
    },
    { value: 'absences', label: 'Abwesenheiten' },
  ];
  const onMore = (action: MoreAction) => {
    if (action === 'household-row') {
      if (view === 'year') return;
      settings.update({
        householdRow: { ...settings.householdRow, [view]: !householdOn },
      });
    } else if (action === 'absence-new') {
      if (!online.disabled) setAbsence({});
    } else {
      router.navigate('/abwesenheiten');
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
  const later = orderSlotEntries(data.entries.filter((entry) => entry.date === null));
  const lastSlotId = data.slots[data.slots.length - 1]?.id;

  return (
    <Screen
      tone="plan"
      testID="calendar-screen"
      header={<ScreenHeader title="Kalender" right={actions} />}
      tabs={tabs}
    >
      {view === 'week' ? (
        <WeekView
          data={data}
          weekStart={start}
          showHousehold={householdOn}
          wide={isWide}
          onAdd={onAdd}
          onOpenEntry={setOpenEntry}
          onEditStripe={(stripe) => setAbsence({ stripe })}
        />
      ) : null}
      {view === 'month' ? (
        <MonthView
          data={data}
          monthStart={start}
          selected={selected}
          onSelect={setSelected}
          showHousehold={householdOn}
          wide={isWide}
          onAdd={onAdd}
          onOpenEntry={setOpenEntry}
          onEditStripe={(stripe) => setAbsence({ stripe })}
          onOpenDay={(date) => show('week', periodStart('week', date))}
        />
      ) : null}
      {view === 'year' ? (
        <YearView
          data={data}
          year={Number(start.slice(0, 4))}
          columns={isPhone ? 3 : bp === 'desktop' ? 4 : 3}
          onOpenMonth={(monthStart) => show('month', monthStart)}
          onEditStripe={(stripe) => setAbsence({ stripe })}
        />
      ) : null}
      {view === 'week' ? (
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
              Nichts vorgemerkt. Hier landet, was bald dran sein soll, aber noch keinen Tag hat.
            </Text>
          ) : (
            <View style={{ flexDirection: isPhone ? 'column' : 'row', flexWrap: 'wrap', gap: 6 }}>
              {later.map((entry) => (
                <View key={entry.id} style={isPhone ? undefined : { width: 280 }}>
                  <EntryLine entry={entry} data={data} onPress={setOpenEntry} />
                </View>
              ))}
            </View>
          )}
        </Section>
      ) : null}
      {adding ? <AddEntrySheet target={adding} onClose={() => setAdding(undefined)} /> : null}
      {openEntry ? (
        <EntrySheet
          entryId={openEntry.id}
          weekDates={weekDates(openEntry.date ?? start)}
          onClose={() => setOpenEntry(undefined)}
        />
      ) : null}
      {pantryCheck ? (
        <PantryCheckSheet
          weekDates={shownWeek}
          listId={data.household.defaultListId}
          onClose={() => setPantryCheck(false)}
        />
      ) : null}
      {absence ? (
        <AbsenceSheet stripe={absence.stripe} onClose={() => setAbsence(undefined)} />
      ) : null}
    </Screen>
  );
}
