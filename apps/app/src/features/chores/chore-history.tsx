import { useChoreEvents, useMembersById, useToday } from '@housekeeping/api';
import { Avatar, EmptyState, List, ListRow } from '@housekeeping/ui';
import { useMemo } from 'react';

import { historyLine } from './chore-labels';

/**
 * "Verlauf": newest first. Every line carries its day ("… · heute"), so the list needs no extra
 * day headings.
 */
export function ChoreHistory() {
  const events = useChoreEvents();
  const membersById = useMembersById();
  const today = useToday();
  // Stable sort: events of the same day keep their stored order, which is newest first.
  const sorted = useMemo(
    () => [...events].sort((a, b) => (a.doneOn < b.doneOn ? 1 : a.doneOn > b.doneOn ? -1 : 0)),
    [events],
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="Noch nichts erledigt"
        text="Was ihr abhakt, steht hier – mit wer und wann."
        testID="chore-history-empty"
      />
    );
  }
  return (
    <List testID="chore-history">
      {sorted.map((event) => {
        const member = membersById[event.doneBy];
        const name = member?.name ?? 'Jemand';
        return (
          <ListRow
            key={event.id}
            testID={`history-${event.id}`}
            title={historyLine(event, name, today)}
            leading={member ? <Avatar name={member.name} color={member.color} /> : undefined}
          />
        );
      })}
    </List>
  );
}
