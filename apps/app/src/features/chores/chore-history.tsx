import { useChoreEvents, useChores, useMembers, useMembersById, useToday } from '@housekeeping/api';
import {
  filterHistory,
  historyGroups,
  type ChoreEvent,
  type HistoryFilter,
  type Id,
} from '@housekeeping/core';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Icon,
  InfiniteList,
  List,
  ListRow,
  Menu,
  Row,
  Stack,
  Text,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useMemo, type ReactElement } from 'react';
import { View } from 'react-native';

import { eventIcon, eventKindLabel } from './chore-labels';

type HistoryItem =
  | { type: 'year'; key: string; year: string }
  | { type: 'month'; key: string; title: string }
  | { type: 'week'; key: string; title: string }
  | { type: 'row'; key: string; event: ChoreEvent; dayLabel: string };

/**
 * „Alle“, one chip per member and „Aufgabe ▾“ (spec 0026, REQ-008): both filters act together and
 * stand in the address (`person`, `nur-aufgabe`); a chosen chore shows as „Bad putzen ✕“.
 */
function HistoryFilters(props: {
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
}) {
  const members = useMembers();
  const chores = useChores();
  const { filter } = props;
  const chosen = chores.find((chore) => chore.id === filter.choreId);
  const sorted = useMemo(
    () => [...chores].sort((a, b) => a.title.localeCompare(b.title, 'de')),
    [chores],
  );
  return (
    <Row wrap gap={8} style={{ marginBottom: 8 }}>
      <Chip
        label="Alle"
        selected={filter.person === undefined}
        onPress={() => props.onFilter({ ...filter, person: undefined })}
        testID="history-filter-all"
      />
      {members.map((member) => (
        <Chip
          key={member.id}
          label={member.name}
          icon="user"
          selected={filter.person === member.id}
          onPress={() => props.onFilter({ ...filter, person: member.id })}
          testID={`history-filter-${member.id}`}
        />
      ))}
      {chosen ? (
        <Chip
          label={chosen.title}
          selected
          removable
          accessibilityLabel={`Filter ${chosen.title} entfernen`}
          onPress={() => props.onFilter({ ...filter, choreId: undefined })}
          testID="history-filter-chore"
        />
      ) : (
        <Menu<Id>
          label="Aufgabe"
          accessibilityLabel="Nach Aufgabe filtern"
          options={sorted.map((chore) => ({ value: chore.id, label: chore.title }))}
          onChange={(choreId) => props.onFilter({ ...filter, choreId })}
          testID="history-filter-chore-menu"
        />
      )}
    </Row>
  );
}

/**
 * „Verlauf“ (REQ-010): months, within them weeks cut to the month, a year divider before the
 * first month of another year; nothing is folded away, the month headings stick while scrolling
 * (AC-056 to AC-058). A row shows the kind, the chore, who did it and the day („Fr 20.“); a tap
 * opens the entry (AC-059 to AC-061). Filters by person and chore above it (spec 0026, REQ-008).
 */
export function ChoreHistory(props: {
  selectedId?: Id;
  onSelect: (eventId: Id) => void;
  header?: ReactElement;
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
}) {
  const allEvents = useChoreEvents();
  const membersById = useMembersById();
  const today = useToday();
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  const { filter } = props;
  const filtered = filter.person !== undefined || filter.choreId !== undefined;
  const events = useMemo(
    () => filterHistory(allEvents, { person: filter.person, choreId: filter.choreId }),
    [allEvents, filter.person, filter.choreId],
  );

  const items = useMemo(
    () =>
      historyGroups(events, today).flatMap((month): HistoryItem[] => [
        ...(month.yearDivider
          ? [{ type: 'year' as const, key: `year-${month.yearDivider}`, year: month.yearDivider }]
          : []),
        { type: 'month', key: `month-${month.key}`, title: month.title },
        ...month.weeks.flatMap((week): HistoryItem[] => [
          { type: 'week', key: `week-${week.key}`, title: week.title },
          ...week.rows.map((row): HistoryItem => ({
            type: 'row',
            key: row.event.id,
            event: row.event,
            dayLabel: row.dayLabel,
          })),
        ]),
      ]),
    [events, today],
  );

  const renderItem = (item: HistoryItem): ReactElement => {
    switch (item.type) {
      case 'year':
        return (
          <View
            testID={`history-year-${item.year}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            <Text variant="smallStrong" color="muted">
              {item.year}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
          </View>
        );
      case 'month':
        return (
          <View
            testID={`history-${item.key}`}
            style={{ backgroundColor: theme.colors.bg, paddingTop: 16, paddingBottom: 4 }}
          >
            <Text variant="sectionLabel" heading>
              {item.title}
            </Text>
          </View>
        );
      case 'week':
        return (
          <Text
            variant="smallStrong"
            color="muted"
            testID={`history-${item.key}`}
            style={{ marginTop: 10, marginBottom: 6 }}
          >
            {item.title}
          </Text>
        );
      case 'row': {
        const { event } = item;
        const member = membersById[event.doneBy];
        const name = member?.name ?? 'Jemand';
        return (
          <View style={{ marginBottom: 6 }}>
            <List>
              <ListRow
                testID={`history-${event.id}`}
                title={event.title}
                accessibilityLabel={`${event.title}, ${eventKindLabel(event)} von ${name}, ${item.dayLabel}`}
                subtitle={
                  event.kind === 'skipped' ? (
                    <Text variant="small" color="muted">
                      übersprungen
                    </Text>
                  ) : undefined
                }
                leading={<Icon name={eventIcon(event)} size={18} color="muted" />}
                trailing={
                  <Row gap={10}>
                    {member ? <Avatar name={member.name} color={member.color} /> : null}
                    <Text
                      variant="small"
                      color="muted"
                      style={{ minWidth: 44, textAlign: 'right' }}
                      testID={`history-${event.id}-day`}
                    >
                      {item.dayLabel}
                    </Text>
                  </Row>
                }
                selected={!isPhone && event.id === props.selectedId}
                onPress={() => props.onSelect(event.id)}
              />
            </List>
          </View>
        );
      }
    }
  };

  return (
    <InfiniteList
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      isGroupHeader={(item) => item.type === 'month'}
      restoreKey="chore-history"
      ListHeaderComponent={
        <Stack gap={0}>
          {props.header}
          {allEvents.length > 0 ? (
            <HistoryFilters filter={filter} onFilter={props.onFilter} />
          ) : null}
        </Stack>
      }
      ListEmptyComponent={
        filtered && allEvents.length > 0 ? (
          <EmptyState
            icon="list-filter"
            title="Keine Einträge für diese Auswahl"
            testID="chore-history-filtered-empty"
          >
            <Button
              label="Filter zurücksetzen"
              variant="secondary"
              onPress={() => props.onFilter({})}
              testID="chore-history-reset"
            />
          </EmptyState>
        ) : (
          <EmptyState
            icon="history"
            title="Noch nichts erledigt"
            text="Was ihr abhakt, steht hier – mit wer und wann."
            testID="chore-history-empty"
          />
        )
      }
      testID="chore-history"
    />
  );
}
