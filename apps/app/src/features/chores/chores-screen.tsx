import {
  completeChore,
  createChore,
  reassignChoreEvent,
  useChores,
  useCurrentMember,
  useMembers,
  useToday,
} from '@housekeeping/api';
import { choreBucket, isoWeekday, type Chore, type ChoreBucket } from '@housekeeping/core';
import {
  Button,
  EmptyState,
  IconButton,
  List,
  Screen,
  ScreenHeader,
  Section,
  Segmented,
  Stack,
  Text,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { StartPageActions } from '@/features/shell/profile-button';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

import { ChoreHistory } from './chore-history';
import { ChoreRow } from './chore-row';
import { ChoreSheet } from './chore-sheet';
import { NewChoreSheet } from './new-chore-sheet';
import { SpontaneousSheet } from './spontaneous-sheet';

type Tab = 'upcoming' | 'all' | 'history';
type UpcomingBucket = Extract<ChoreBucket, 'today' | 'overdue' | 'flexible' | 'thisWeek'>;

const SECTION_TITLES: Record<UpcomingBucket, string> = {
  today: 'Heute',
  overdue: 'Fällig seit',
  flexible: 'Flexibel',
  thisWeek: 'Diese Woche',
};

// Today first: overdue chores follow calmly instead of leading the screen.
const UPCOMING_ORDER: UpcomingBucket[] = ['today', 'overdue', 'flexible', 'thisWeek'];

export function ChoresScreen() {
  const chores = useChores();
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const online = useOnlineOnly();
  const { isWide } = useBreakpoint();

  const [tab, setTab] = useState<Tab>('upcoming');
  const [openChoreId, setOpenChoreId] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [spontaneous, setSpontaneous] = useState(false);

  const buckets = useMemo(() => {
    const result: Record<ChoreBucket, Chore[]> = {
      today: [],
      overdue: [],
      flexible: [],
      thisWeek: [],
      later: [],
      paused: [],
    };
    for (const chore of chores) result[choreBucket(chore, today)].push(chore);
    result.overdue.sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
    result.thisWeek.sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
    return result;
  }, [chores, today]);

  const openChore = chores.find((chore) => chore.id === openChoreId);

  const complete = (chore: Chore) => {
    const eventId = completeChore(chore.id);
    if (!eventId) return;
    const other = members.find((member) => member.id !== me.id);
    toast.show({
      message: 'Erledigt von dir',
      actionLabel: other?.name,
      onAction: other
        ? undoAction(() => {
            reassignChoreEvent(eventId, other.id);
            toast.show({ message: `Auf ${other.name} umgebucht` });
          })
        : undefined,
    });
  };

  const row = (chore: Chore, options?: { detailed?: boolean; paused?: boolean }) => (
    <ChoreRow
      key={chore.id}
      chore={chore}
      today={today}
      members={members}
      checkDisabled={online.disabled}
      onCheck={() => complete(chore)}
      onOpen={() => setOpenChoreId(chore.id)}
      detailed={options?.detailed}
      paused={options?.paused}
    />
  );

  const section = (bucket: UpcomingBucket) => {
    const list = buckets[bucket];
    if (list.length === 0) return null;
    const points = list.reduce((sum, chore) => sum + chore.effort, 0);
    return (
      <Section
        key={bucket}
        title={SECTION_TITLES[bucket]}
        meta={bucket === 'today' ? `ca. ${points} ${points === 1 ? 'Punkt' : 'Punkte'}` : undefined}
        tone="haushalt"
        testID={`chores-${bucket}`}
      >
        <List>{list.map((chore) => row(chore))}</List>
      </Section>
    );
  };

  const upcomingCount =
    buckets.today.length +
    buckets.overdue.length +
    buckets.flexible.length +
    buckets.thisWeek.length;
  const laterCount = buckets.later.length + buckets.paused.length;

  const spontaneousLink = (
    <Button
      label="Was anderes erledigt?"
      icon="message-square-plus"
      variant="link"
      onPress={() => setSpontaneous(true)}
      disabled={online.disabled}
      hint={online.hint}
      testID="chores-spontaneous"
    />
  );

  let body: ReactNode;
  if (chores.length === 0 && tab !== 'history') {
    body = (
      <ChoresEmpty
        disabled={online.disabled}
        hint={online.hint}
        onCreate={() => setCreating(true)}
      />
    );
  } else if (tab === 'upcoming') {
    const sections = UPCOMING_ORDER.map(section).filter((node) => node !== null);
    const half = Math.ceil(sections.length / 2);
    const left = sections.slice(0, half);
    const right = sections.slice(half);
    body = (
      <Stack gap={0}>
        {upcomingCount === 0 ? (
          <EmptyState
            icon="party-popper"
            title="Alles erledigt"
            text="Für diese Woche steht nichts mehr an."
            testID="chores-upcoming-empty"
          />
        ) : isWide && sections.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
            <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
          </View>
        ) : (
          [...left, ...right]
        )}
        <Stack gap={4}>
          {spontaneousLink}
          {laterCount > 0 ? (
            <Button
              label={`${laterCount} ${laterCount === 1 ? 'weitere Aufgabe' : 'weitere Aufgaben'} später – alle ansehen`}
              variant="link"
              onPress={() => setTab('all')}
              testID="chores-show-all"
            />
          ) : null}
        </Stack>
      </Stack>
    );
  } else if (tab === 'all') {
    const sorted = [...chores].sort((a, b) => a.title.localeCompare(b.title, 'de'));
    body = (
      <Stack gap={12}>
        <List testID="chores-all">
          {sorted.map((chore) =>
            row(chore, { detailed: true, paused: choreBucket(chore, today) === 'paused' }),
          )}
        </List>
        {spontaneousLink}
      </Stack>
    );
  } else {
    body = (
      <Stack gap={12}>
        <ChoreHistory />
        {spontaneousLink}
      </Stack>
    );
  }

  return (
    <Screen testID="chores-screen" maxWidth={tab === 'upcoming' ? 1180 : 820}>
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
              testID="chore-new"
            />
            <StartPageActions />
          </>
        }
      />
      <View style={{ marginBottom: 20, maxWidth: 520 }}>
        <Segmented<Tab>
          label="Ansicht"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: 'Anstehend' },
            { value: 'all', label: 'Alle' },
            { value: 'history', label: 'Verlauf' },
          ]}
          testID="chores-tab"
        />
      </View>
      {online.hint ? (
        <Text variant="small" color="muted" style={{ marginBottom: 12 }}>
          {online.hint}
        </Text>
      ) : null}
      {body}
      <ChoreSheet
        chore={openChore}
        onClose={() => setOpenChoreId(undefined)}
        onComplete={complete}
      />
      <NewChoreSheet visible={creating} onClose={() => setCreating(false)} />
      <SpontaneousSheet visible={spontaneous} onClose={() => setSpontaneous(false)} />
    </Screen>
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
        label="Erste Aufgabe anlegen"
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
