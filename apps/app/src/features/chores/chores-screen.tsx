import { createChore, useChoreEvents, useChores, useMembers, useToday } from '@housekeeping/api';
import {
  choreBucket,
  choreShownOn,
  dueChores,
  duePoints,
  householdAwayNotice,
  isoWeekday,
  pointsLabel,
  type Chore,
  type ChoreAway,
  type ChoreBucket,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  EmptyState,
  IconButton,
  InfiniteList,
  List,
  ListDetail,
  RowTransition,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  ViewTabs,
  tabSwipe,
  toast,
  useBreakpoint,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useMemo, type ReactElement } from 'react';
import { View } from 'react-native';

import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId, useHandedHousehold, useMissingObject } from '@/lib/addressed';
import { PagePreview, usePageParams } from '@/lib/url-state';

import { useChoreCheckWindow } from './chore-check-list';
import { ChoreHistory } from './chore-history';
import { ChoreRow } from './chore-row';
import { ChorePanel, ChoreSheet } from './chore-sheet';
import { DoneSheet } from './done-sheet';
import { HistoryEventPanel, HistoryEventSheet } from './history-event-sheet';
import { NewChoreSheet } from './new-chore-sheet';
import { useChoreAway } from './use-chore-away';

type Tab = 'upcoming' | 'all' | 'history';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'upcoming', label: 'Anstehend' },
  { value: 'all', label: 'Alle' },
  { value: 'history', label: 'Verlauf' },
];

const TAB_OF_VIEW = { anstehend: 'upcoming', alle: 'all', verlauf: 'history' } as const;
const VIEW_OF_TAB = { upcoming: 'anstehend', all: 'alle', history: 'verlauf' } as const;
type UpcomingBucket = Extract<
  ChoreBucket,
  'today' | 'overdue' | 'flexible' | 'thisWeek' | 'noDate'
>;

const SECTION_TITLES: Record<UpcomingBucket, string> = {
  today: 'Heute',
  overdue: 'Noch offen',
  flexible: 'Flexibel',
  thisWeek: 'Diese Woche',
  noDate: 'Ohne Termin',
};

// Today first: what is still open follows calmly instead of leading the screen (spec 0026,
// REQ-006: one-off chores without a date after this week).
const UPCOMING_ORDER: UpcomingBucket[] = ['today', 'overdue', 'flexible', 'thisWeek', 'noDate'];

function bucketsOf(chores: Chore[], today: string, away: ChoreAway): Record<ChoreBucket, Chore[]> {
  const result: Record<ChoreBucket, Chore[]> = {
    today: [],
    overdue: [],
    flexible: [],
    thisWeek: [],
    noDate: [],
    later: [],
    paused: [],
    asNeeded: [],
  };
  for (const chore of chores) result[choreBucket(chore, today, away)].push(chore);
  // Today and "Noch offen" in the order of "Zu tun" (core dueChores).
  const order = new Map(dueChores(chores, today, away).map((chore, index) => [chore.id, index]));
  const byDue = (a: Chore, b: Chore) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  result.today.sort(byDue);
  result.overdue.sort(byDue);
  result.thisWeek.sort(
    (a, b) =>
      choreShownOn(a, today, away).localeCompare(choreShownOn(b, today, away)) ||
      a.title.localeCompare(b.title, 'de'),
  );
  result.noDate.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return result;
}

/**
 * „Haushalt“ (REQ-008 to REQ-010): view tabs Anstehend · Alle · Verlauf with one content width
 * (AC-046); on wide screens „Alle“ and „Verlauf“ are list and detail (AC-047). „Anstehend“ checks
 * chores off with the collecting window (AC-033). Reading works offline; every write needs the
 * network.
 */
export function ChoresScreen() {
  const chores = useChores();
  const events = useChoreEvents();
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();

  const address = usePageParams('haushalt');
  const { params } = address;
  const tab: Tab = params.ansicht ? TAB_OF_VIEW[params.ansicht] : 'upcoming';
  useHandedHousehold(params.haushalt, address.replace);

  // Deleted on another device (or here) while open: the window or column just closes; an id the
  // household does not have closes with a toast (AC-052). Another own household's switches.
  const openChore = chores.find((chore) => chore.id === params.aufgabe);
  const openEvent = events.find((event) => event.id === params.verlauf);
  const choreFound = useAddressedId('chores', params.aufgabe);
  const eventFound = useAddressedId('choreEvents', params.verlauf);
  const handed = params.haushalt !== undefined;
  useMissingObject(
    params.aufgabe,
    choreFound !== 'missing' || handed,
    'Diese Aufgabe gibt es nicht mehr',
    () => address.replace({ aufgabe: undefined }),
  );
  useMissingObject(
    params.verlauf,
    eventFound !== 'missing' || handed,
    'Diesen Eintrag gibt es nicht mehr',
    () => address.replace({ verlauf: undefined }),
  );
  const split = !isPhone && tab !== 'upcoming';
  const creating = params.fenster === 'neu-aufgabe';
  const logging = params.fenster === 'erledigt';

  // On wide screens "Alle" and "Verlauf" select in place; elsewhere the chore opens as a window,
  // which adds a history entry (REQ-013, REQ-014).
  const select = (patch: { aufgabe?: Id; verlauf?: Id }) => {
    if (split) address.replace(patch);
    else address.open(patch);
  };
  const deselect = (patch: { aufgabe?: undefined; verlauf?: undefined }) => {
    if (split) address.replace(patch);
    else address.close(patch);
  };
  const setChoreId = (id: Id | undefined) =>
    id ? select({ aufgabe: id }) : deselect({ aufgabe: undefined });
  const setEventId = (id: Id | undefined) =>
    id ? select({ verlauf: id }) : deselect({ verlauf: undefined });
  const setCreating = (open: boolean) =>
    open ? address.open({ fenster: 'neu-aufgabe' }) : address.close({ fenster: undefined });
  // "Neue Aufgabe": the title gets the keyboard with the tap (spec 0033, REQ-006).
  const startCreating = () => {
    openKeyboardNow();
    setCreating(true);
  };
  const setLogging = (open: boolean) =>
    open ? address.open({ fenster: 'erledigt' }) : address.close({ fenster: undefined });

  const changeTab = (next: Tab) =>
    address.replace({
      ansicht: VIEW_OF_TAB[next],
      aufgabe: undefined,
      verlauf: undefined,
    });
  // „Alle Einträge ›“: the history filtered by the chore, kept in the address (REQ-008, AC-025).
  const showEntries = (choreId: Id) =>
    address.replace({
      ansicht: 'verlauf',
      aufgabe: undefined,
      verlauf: undefined,
      'nur-aufgabe': choreId,
    });

  const doneLink = (
    <Button
      label="Was anderes erledigt?"
      icon="message-square-plus"
      variant="link"
      onPress={() => setLogging(true)}
      disabled={online.disabled}
      hint={online.hint}
      testID="chores-done-open"
    />
  );
  const offlineHint = online.hint ? (
    <Text variant="small" color="warn" style={{ marginBottom: 8 }} testID="chores-offline-hint">
      {online.hint}
    </Text>
  ) : null;
  const listHeader = (
    <View style={{ gap: 4, marginBottom: 8 }}>
      {offlineHint}
      {doneLink}
    </View>
  );
  const empty = (
    <ChoresEmpty disabled={online.disabled} hint={online.hint} onCreate={startCreating} />
  );

  let body: ReactElement;
  if (tab === 'upcoming') {
    body =
      chores.length === 0 ? (
        <View>
          {offlineHint}
          {empty}
        </View>
      ) : (
        <UpcomingChores
          chores={chores}
          onOpen={setChoreId}
          header={offlineHint}
          doneLink={doneLink}
        />
      );
  } else if (tab === 'all') {
    body = (
      <ListDetail
        list={
          <AllChores
            chores={chores}
            selectedId={openChore?.id}
            onOpen={setChoreId}
            header={listHeader}
            empty={empty}
          />
        }
        detail={
          openChore ? (
            <ChorePanel
              key={openChore.id}
              chore={openChore}
              onClose={() => setChoreId(undefined)}
              onShowEntries={() => showEntries(openChore.id)}
            />
          ) : undefined
        }
        placeholder={{
          icon: 'list-checks',
          title: 'Wähl eine Aufgabe aus',
          text: 'Hier siehst du Rhythmus, Termin und Verlauf und kannst sie bearbeiten.',
        }}
        testID="chores-split"
      />
    );
  } else {
    body = (
      <ListDetail
        list={
          <ChoreHistory
            selectedId={openEvent?.id}
            onSelect={setEventId}
            header={listHeader}
            filter={{ person: params.person, choreId: params['nur-aufgabe'] }}
            onFilter={(filter) =>
              address.replace({ person: filter.person, 'nur-aufgabe': filter.choreId })
            }
          />
        }
        detail={
          openEvent ? (
            <HistoryEventPanel
              key={openEvent.id}
              event={openEvent}
              onClose={() => setEventId(undefined)}
            />
          ) : undefined
        }
        placeholder={{
          icon: 'history',
          title: 'Wähl einen Eintrag aus',
          text: 'Hier änderst du, wer es erledigt hat, oder entfernst den Eintrag.',
        }}
        testID="history-split"
      />
    );
  }

  return (
    <Screen
      testID="chores-screen"
      tone="haushalt"
      scroll={tab === 'upcoming'}
      style={tab === 'upcoming' ? undefined : { flex: 1, paddingBottom: 0 }}
      header={
        <ScreenHeader
          title="Haushalt"
          right={
            <>
              {isPhone ? (
                // Like "+" on Essen and the other icons of the header: no tinted circle (I-17).
                <IconButton
                  icon="plus"
                  label="Neue Aufgabe"
                  onPress={startCreating}
                  disabled={online.disabled}
                  hint={online.hint}
                  testID="chore-new"
                />
              ) : (
                // Wide screens name the action, like "Aktivität anlegen" (review 0003).
                <Button
                  label="Aufgabe anlegen"
                  icon="plus"
                  size="sm"
                  onPress={startCreating}
                  disabled={online.disabled}
                  hint={online.hint}
                  testID="chore-new"
                />
              )}
              <StartPageActions />
            </>
          }
        />
      }
      tabs={
        <ViewTabs<Tab>
          label="Ansicht"
          value={tab}
          onChange={changeTab}
          options={TAB_OPTIONS}
          testID="chores-tab"
        />
      }
      // On phones a sideways swipe changes the tab (spec 0029, REQ-003), with the neighbour tab
      // beside the content (spec 0034, REQ-007): the page as the tab would show it, no window.
      tabSwipe={tabSwipe(TAB_OPTIONS, tab, changeTab, (next) => (
        <PagePreview
          page="haushalt"
          params={{
            ...params,
            ansicht: VIEW_OF_TAB[next],
            aufgabe: undefined,
            verlauf: undefined,
            fenster: undefined,
            haushalt: undefined,
          }}
        >
          <ChoresScreen />
        </PagePreview>
      ))}
    >
      {body}
      {openChore && !split ? (
        <ChoreSheet
          key={openChore.id}
          chore={openChore}
          onClose={() => setChoreId(undefined)}
          onShowEntries={() => showEntries(openChore.id)}
        />
      ) : null}
      {openEvent && !split ? (
        <HistoryEventSheet
          key={openEvent.id}
          event={openEvent}
          onClose={() => setEventId(undefined)}
        />
      ) : null}
      <NewChoreSheet visible={creating} onClose={() => setCreating(false)} />
      <DoneSheet visible={logging} onClose={() => setLogging(false)} />
    </Screen>
  );
}

/**
 * „Anstehend“: today, still open, flexible, this week's chores and one-off chores without a date,
 * checked off with one collecting window over all sections (AC-033). Later and paused ones stand
 * only under „Alle“ (spec 0026, REQ-006); „bei Bedarf“ never counts (AC-043). Above the sections
 * the points of today (REQ-010), or during a trip of the whole household the sentence of REQ-013.
 */
function UpcomingChores(props: {
  chores: Chore[];
  onOpen: (id: Id) => void;
  header: ReactElement | null;
  doneLink: ReactElement;
}) {
  const away = useChoreAway();
  const today = useToday();
  const online = useOnlineOnly();
  const { isWide } = useBreakpoint();
  const buckets = useMemo(() => bucketsOf(props.chores, today, away), [props.chores, today, away]);
  const awayNotice = householdAwayNotice(today, today, away);
  const points = pointsLabel(duePoints(props.chores, today, away));
  const upcoming = useMemo(() => UPCOMING_ORDER.flatMap((bucket) => buckets[bucket]), [buckets]);
  const check = useChoreCheckWindow(upcoming);
  // The rows the window still shows; booked ones keep their section until it closes.
  const shown = new Set(check.rows.map((chore) => chore.id));
  const sections = UPCOMING_ORDER.flatMap((bucket) => {
    const list = buckets[bucket].filter((chore) => shown.has(chore.id));
    if (list.length === 0) return [];
    return [
      <Section key={bucket} title={SECTION_TITLES[bucket]} testID={`chores-${bucket}`}>
        <List>
          {list.map((chore) => (
            <RowTransition key={chore.id}>
              <ChoreRow
                chore={chore}
                today={today}
                away={away}
                check={{
                  checked: check.isChecked(chore),
                  disabled: online.disabled,
                  onToggle: () => check.toggle(chore),
                }}
                onOpen={() => props.onOpen(chore.id)}
              />
            </RowTransition>
          ))}
        </List>
      </Section>,
    ];
  });
  const half = Math.ceil(sections.length / 2);

  return (
    <Stack gap={0}>
      {props.header}
      {awayNotice ? (
        <Text color="muted" style={{ marginBottom: 12 }} testID="chores-away">
          {awayNotice}
        </Text>
      ) : points ? (
        <Text variant="smallStrong" style={{ marginBottom: 12 }} testID="chores-points">
          {`Zu tun heute: ${points}`}
        </Text>
      ) : null}
      {sections.length === 0 ? (
        <EmptyState
          icon="party-popper"
          title="Alles erledigt"
          text="Für diese Woche steht nichts mehr an. Alles Weitere steht unter „Alle“."
          testID="chores-upcoming-empty"
        />
      ) : isWide && sections.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{sections.slice(0, half)}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{sections.slice(half)}</View>
        </View>
      ) : (
        sections
      )}
      <Stack gap={4}>{props.doneLink}</Stack>
    </Stack>
  );
}

/** „Alle“: every chore by title, „bei Bedarf“ and paused ones included (AC-043). */
function AllChores(props: {
  chores: Chore[];
  selectedId?: Id;
  onOpen: (id: Id) => void;
  header: ReactElement;
  empty: ReactElement;
}) {
  const away = useChoreAway();
  const today = useToday();
  const { isPhone } = useBreakpoint();
  const sorted = useMemo(
    () => [...props.chores].sort((a, b) => a.title.localeCompare(b.title, 'de')),
    [props.chores],
  );
  return (
    <InfiniteList
      data={sorted}
      keyExtractor={(chore) => chore.id}
      renderItem={(chore) => (
        <View style={{ marginBottom: 6 }}>
          <List>
            <ChoreRow
              chore={chore}
              today={today}
              away={away}
              detailed
              paused={choreBucket(chore, today, away) === 'paused'}
              selected={!isPhone && chore.id === props.selectedId}
              onOpen={() => props.onOpen(chore.id)}
            />
          </List>
        </View>
      )}
      restoreKey="chores-all"
      ListHeaderComponent={props.header}
      ListEmptyComponent={props.empty}
      testID="chores-all"
    />
  );
}

/** First steps for a household without chores: one tap on a template, or a chore of your own. */
function ChoresEmpty(props: { disabled: boolean; hint: string | undefined; onCreate: () => void }) {
  const members = useMembers();
  const today = useToday();
  const weekday = isoWeekday(today);
  const templates = [
    {
      label: 'Bad putzen – wöchentlich',
      create: () =>
        createChore({
          title: 'Bad putzen',
          room: 'Bad',
          recurrence: { type: 'weekly', every: 1, weekdays: [weekday] },
          assignment: { type: 'rotating', memberIds: members.map((m) => m.id) },
          effort: 2,
        }),
    },
    {
      label: 'Bettwäsche – etwa alle 2 Wochen',
      create: () =>
        createChore({
          title: 'Bettwäsche wechseln',
          room: 'Schlafzimmer',
          recurrence: { type: 'flexible', everyDays: 14 },
          assignment: { type: 'rotating', memberIds: members.map((m) => m.id) },
          effort: 2,
        }),
    },
    {
      label: 'Müll rausbringen – wöchentlich',
      create: () =>
        createChore({
          title: 'Müll rausbringen',
          recurrence: { type: 'weekly', every: 1, weekdays: [weekday] },
          assignment: { type: 'anyone' },
          effort: 1,
        }),
    },
  ];
  return (
    <EmptyState
      icon="list-checks"
      title="Noch keine Aufgaben"
      text="Legt eure erste Aufgabe an oder nehmt eine Vorlage."
      testID="chores-empty"
    >
      <Button
        label="Aufgabe anlegen"
        icon="plus"
        onPress={props.onCreate}
        disabled={props.disabled}
        hint={props.hint}
        testID="chores-empty-new"
      />
      {templates.map((template, index) => (
        <Button
          key={template.label}
          label={template.label}
          variant="ghost"
          size="sm"
          disabled={props.disabled}
          hint={props.hint}
          onPress={() => {
            template.create();
            toast.show({ message: 'Aufgabe angelegt' });
          }}
          testID={`chores-template-${index}`}
        />
      ))}
    </EmptyState>
  );
}
