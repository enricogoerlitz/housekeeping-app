import { useChoreEvents, useChores, useMembersById } from '@housekeeping/api';
import {
  choreDueLabel,
  choreMemberIds,
  choreTurnLabel,
  choresOfDay,
  duePoints,
  flexibleProgress,
  pointsLabel,
  recurrenceLabel,
  withTime,
  type Chore,
  type HouseholdRowItem,
  type ISODate,
} from '@housekeeping/core';
import {
  AvatarStack,
  Button,
  CheckRow,
  DueBar,
  Icon,
  List,
  ListRow,
  RowTransition,
  Section,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { View } from 'react-native';

import { useChoreCheckWindow } from '@/features/chores/chore-check-list';
import { flexibleBarLabel } from '@/features/chores/chore-row';
import { DoneSheet } from '@/features/chores/done-sheet';
import { useChoreAway } from '@/features/chores/use-chore-away';
import { useOnlineOnly } from '@/features/shell/offline';
import { usePageParams } from '@/lib/url-state';

/**
 * "Zu tun" of the shown day (spec 0011, REQ-005, AC-032): today the due chores (core dueChores)
 * with the one chore check window of the Haushalt — a tap strikes through, a second takes it
 * back, 2 s after the last tap the checked ones are booked and leave; leaving the page books at
 * once; no "Rückgängig" (AC-028 to AC-031). Later days show the planned dates, past days what was
 * done, both only to look at and without "Was anderes erledigt?". Next to the title the points of
 * today (spec 0026, REQ-010); during a trip of the whole household the sentence of REQ-013.
 */
export function TodayChores(props: { shown: ISODate; today: ISODate; title: string }) {
  const chores = useChores();
  const events = useChoreEvents();
  const away = useChoreAway();
  const day = choresOfDay({
    chores,
    events,
    members: [...away.members],
    trips: [...away.trips],
    shown: props.shown,
    today: props.today,
  });

  return (
    <Section
      title={props.title}
      testID="today-chores"
      meta={day.kind === 'due' ? pointsLabel(duePoints(chores, props.today, away)) : undefined}
    >
      {day.kind === 'due' ? (
        <DueChores chores={day.chores} today={props.today} />
      ) : day.kind === 'away' ? (
        <>
          <Text color="muted" testID="today-chores-away">
            {day.notice}
          </Text>
          {props.shown === props.today ? <DoneLink /> : null}
        </>
      ) : (
        <ChoresToLookAt items={day.items} kind={day.kind} />
      )}
    </Section>
  );
}

/** "Was anderes erledigt?" under "Zu tun" today, also during a trip (AC-049). */
function DoneLink() {
  const online = useOnlineOnly();
  // "Was hast du erledigt?" stands in the address, `/?fenster=erledigt` (spec 0019).
  const address = usePageParams('uebersicht');
  const sheetOpen = address.params.fenster === 'erledigt';
  const setSheetOpen = (open: boolean) =>
    open ? address.open({ fenster: 'erledigt' }) : address.close({ fenster: undefined });
  return (
    <>
      <View style={{ marginTop: 8 }}>
        <Button
          label="Was anderes erledigt?"
          icon="plus"
          variant="link"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => setSheetOpen(true)}
          testID="today-spontaneous"
        />
      </View>
      <DoneSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

function DueChores(props: { chores: Chore[]; today: ISODate }) {
  const away = useChoreAway();
  const members = away.members;
  const online = useOnlineOnly();
  const check = useChoreCheckWindow(props.chores);

  const rows = check.rows;

  return (
    <>
      {rows.length === 0 ? (
        <Text color="muted" testID="today-chores-empty">
          Heute ist nichts fällig.
        </Text>
      ) : (
        <List>
          {rows.map((chore) => {
            const checked = check.isChecked(chore);
            const flexible = chore.recurrence.type === 'flexible';
            const progress = flexibleProgress(chore, props.today);
            const assignees = choreMemberIds(chore, props.today, away).flatMap((id) =>
              members.filter((member) => member.id === id),
            );
            return (
              <RowTransition key={chore.id}>
                <CheckRow
                  testID={`today-chore-${chore.id}`}
                  title={withTime(chore.title, chore.dueTime)}
                  checked={checked}
                  disabled={online.disabled}
                  onToggle={() => check.toggle(chore)}
                  subtitle={
                    flexible ? (
                      <View>
                        <Text variant="small" color="muted">
                          {recurrenceLabel(chore.recurrence)}
                        </Text>
                        <DueBar value={progress} label={flexibleBarLabel(progress)} />
                      </View>
                    ) : (
                      [recurrenceLabel(chore.recurrence), choreDueLabel(chore, props.today, away)]
                        .filter(Boolean)
                        .join(' · ')
                    )
                  }
                  trailing={
                    assignees.length > 0 ? (
                      <AvatarStack
                        members={assignees}
                        accessibilityLabel={choreTurnLabel(chore, props.today, away)}
                      />
                    ) : undefined
                  }
                />
              </RowTransition>
            );
          })}
        </List>
      )}
      <DoneLink />
    </>
  );
}

/** Another day: "○ Küche wischen (E)" planned, "✓ Fenster Wohnzimmer (N)" done; nothing to tap. */
function ChoresToLookAt(props: { items: HouseholdRowItem[]; kind: 'planned' | 'done' }) {
  const membersById = useMembersById();
  if (props.items.length === 0) {
    return (
      <Text color="muted" testID="today-chores-empty">
        {props.kind === 'done' ? 'An diesem Tag wurde nichts erledigt.' : 'Nichts geplant.'}
      </Text>
    );
  }
  return (
    <List>
      {props.items.map((item) => {
        const people = item.memberIds.flatMap((id) => membersById[id] ?? []);
        const title = item.approximate ? `${item.title}, etwa` : item.title;
        return (
          <ListRow
            key={item.key}
            testID={`today-chore-${item.key}`}
            accessibilityLabel={`${item.status === 'done' ? 'Erledigt' : 'Geplant'}: ${title}`}
            leading={
              <View style={{ width: 24, alignItems: 'center' }}>
                {item.status === 'done' ? <Icon name="check" size={18} color="muted" /> : <Ring />}
              </View>
            }
            title={title}
            trailing={people.length > 0 ? <AvatarStack members={people} /> : undefined}
          />
        );
      })}
    </List>
  );
}

/** An empty ring for a chore that is planned, not done (as in the calendar's household row). */
function Ring() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: theme.colors.checkLine,
      }}
    />
  );
}
