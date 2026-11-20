import { choreBucket } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { completeChore, createChore, reassignChoreEvent } from './commands-chores';
import { ENRICO, NADJA } from './seed/demo';
import { getData } from './store';
import { TODAY, withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('chore commands', () => {
  it('AC-035: checking "Bad putzen" removes it from today and logs Enrico today', () => {
    const eventId = completeChore('chore-bad');
    const data = getData();
    const bathroom = data.chores.find((chore) => chore.id === 'chore-bad');
    expect(bathroom && choreBucket(bathroom, TODAY)).not.toBe('today');
    expect(bathroom?.lastDoneOn).toBe(TODAY);
    expect(data.choreEvents[0]).toMatchObject({
      id: eventId,
      title: 'Bad putzen',
      doneBy: ENRICO,
      doneOn: TODAY,
      kind: 'done',
    });

    if (!eventId) throw new Error('no event');
    reassignChoreEvent(eventId, NADJA);
    expect(getData().choreEvents[0]?.doneBy).toBe(NADJA);
  });

  it('hands a rotating chore to the next member and drops one-off chores', () => {
    completeChore('chore-muell', NADJA);
    expect(getData().chores.find((c) => c.id === 'chore-muell')?.nextAssigneeId).toBe(ENRICO);
    completeChore('chore-gluehbirne');
    expect(getData().chores.some((c) => c.id === 'chore-gluehbirne')).toBe(false);
    expect(completeChore('chore-weg')).toBeNull();
  });

  it('AC-036: "Staubsaugen" weekly on Saturday, rotating, is due this week; no title fails', () => {
    const id = createChore({
      title: 'Staubsaugen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
    });
    const chore = getData().chores.find((candidate) => candidate.id === id);
    expect(chore).toMatchObject({ nextDueOn: '2026-11-21', nextAssigneeId: ENRICO });
    expect(chore && choreBucket(chore, TODAY)).toBe('thisWeek');
    expect(() =>
      createChore({ title: ' ', recurrence: { type: 'once' }, assignment: { type: 'anyone' } }),
    ).toThrow('Titel fehlt');
  });
});
