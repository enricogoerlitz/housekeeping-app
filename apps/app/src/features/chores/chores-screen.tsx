import { createChore, useChoreEvents, useChores, useMembers, useToday } from '@housekeeping/api';
import { choreBucket, isoWeekday, type Chore, type ChoreBucket, type Id } from '@housekeeping/core';
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
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useMemo, type ReactElement } from 'react';
import { View } from 'react-native';

import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId, useHandedHousehold, useMissingObject } from '@/lib/addressed';
import { usePageParams } from '@/lib/url-state';

import { useChoreCheckWindow } from './chore-check-list';
import { ChoreHistory } from './chore-history';
import { ChoreRow } from './chore-row';
import { ChorePanel, ChoreSheet } from './chore-sheet';
import { DoneSheet } from './done-sheet';
import { HistoryEventPanel, HistoryEventSheet } from './history-event-sheet';
import { NewChoreSheet } from './new-chore-sheet';

type Tab = 'upcoming' | 'all' | 'history';

const TAB_OF_VIEW = { anstehend: 'upcoming', alle: 'all', verlauf: 'history' } as const;
const VIEW_OF_TAB = { upcoming: 'anstehend', all: 'alle', history: 'verlauf' } as const;
type UpcomingBucket = Extract<ChoreBucket, 'today' | 'overdue' | 'flexible' | 'thisWeek'>;

const SECTION_TITLES: Record<UpcomingBucket, string> = {
  today: 'Heute',
  overdue: 'Fällig seit',
  flexible: 'Flexibel',
  thisWeek: 'Diese Woche',
};

// Today first: overdue chores follow calmly instead of leading the screen.
const UPCOMING_ORDER: UpcomingBucket[] = ['today', 'overdue', 'flexible', 'thisWeek'];

function bucketsOf(chores: Chore[], today: string): Record<ChoreBucket, Chore[]> {
  const result: Record<ChoreBucket, Chore[]> = {
    today: [],
    overdue: [],
    flexible: [],
    thisWeek: [],
    later: [],
    paused: [],
    asNeeded: [],
  };
  for (const chore of chores) result[choreBucket(chore, today)].push(chore);
  result.overdue.sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
  result.thisWeek.sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
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
  const setLogging = (open: boolean) =>
    open ? address.open({ fenster: 'erledigt' }) : address.close({ fenster: undefined });

  const changeTab = (next: Tab) =>
    address.replace({
      ansicht: VIEW_OF_TAB[next],
      aufgabe: undefined,
      verlauf: undefined,
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
    <ChoresEmpty disabled={online.disabled} hint={online.hint} onCreate={() => setCreating(true)} />
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
          onShowAll={() => changeTab('all')}
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
        list={<ChoreHistory selectedId={openEvent?.id} onSelect={setEventId} header={listHeader} />}
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
              <IconButton
                icon="plus"
                variant="soft"
                label="Neue Aufgabe"
                onPress={() => setCreating(true)}
                disabled={online.disabled}
                hint={online.hint}
                testID="chore-new"
              />
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
          options={[
            { value: 'upcoming', label: 'Anstehend' },
            { value: 'all', label: 'Alle' },
            { value: 'history', label: 'Verlauf' },
          ]}
          testID="chores-tab"
        />
      }
    >
      {body}
      {openChore && !split ? (
        <ChoreSheet key={openChore.id} chore={openChore} onClose={() => setChoreId(undefined)} />
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
 * „Anstehend“: today, overdue, flexible and this week's chores, checked off with one collecting
 * window over all sections (AC-033); later and paused ones are behind „alle ansehen“, chores
 * „bei Bedarf“ never count (AC-043).
 */
function UpcomingChores(props: {
  chores: Chore[];
  onOpen: (id: Id) => void;
  onShowAll: () => void;
  header: ReactElement | null;
  doneLink: ReactElement;
}) {
  const members = useMembers();
  const today = useToday();
  const online = useOnlineOnly();
  const { isWide } = useBreakpoint();
  const buckets = useMemo(() => bucketsOf(props.chores, today), [props.chores, today]);
  const upcoming = useMemo(() => UPCOMING_ORDER.flatMap((bucket) => buckets[bucket]), [buckets]);
  const check = useChoreCheckWindow(upcoming);
  // The rows the window still shows; booked ones keep their section until it closes.
  const shown = new Set(check.rows.map((chore) => chore.id));
  const sections = UPCOMING_ORDER.flatMap((bucket) => {
    const list = buckets[bucket].filter((chore) => shown.has(chore.id));
    if (list.length === 0) return [];
    const points = list.reduce((sum, chore) => sum + chore.effort, 0);
    return [
      <Section
        key={bucket}
        title={SECTION_TITLES[bucket]}
        meta={bucket === 'today' ? `ca. ${points} ${points === 1 ? 'Punkt' : 'Punkte'}` : undefined}
        testID={`chores-${bucket}`}
      >
        <List>
          {list.map((chore) => (
            <RowTransition key={chore.id}>
              <ChoreRow
                chore={chore}
                today={today}
                members={members}
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
  const laterCount = buckets.later.length + buckets.paused.length;

  return (
    <Stack gap={0}>
      {props.header}
      {sections.length === 0 ? (
        <EmptyState
          icon="party-popper"
          title="Alles erledigt"
          text="Für diese Woche steht nichts mehr an."
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
      <Stack gap={4}>
        {props.doneLink}
        {laterCount > 0 ? (
          <Button
            label={`${laterCount} ${laterCount === 1 ? 'weitere Aufgabe' : 'weitere Aufgaben'} später – alle ansehen`}
            variant="link"
            onPress={props.onShowAll}
            testID="chores-show-all"
          />
        ) : null}
      </Stack>
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
  const members = useMembers();
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
              members={members}
              detailed
              paused={choreBucket(chore, today) === 'paused'}
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
      text="Leg eure erste Aufgabe an oder nimm eine Vorlage."
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
