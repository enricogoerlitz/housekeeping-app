import { useMembers, useTrips } from '@housekeeping/api';
import type { ChoreAway } from '@housekeeping/core';
import { useMemo } from 'react';

/** Members and trips of the shown household: who is away when (spec 0026, REQ-011). */
export function useChoreAway(): ChoreAway {
  const members = useMembers();
  const trips = useTrips();
  return useMemo(() => ({ members, trips }), [members, trips]);
}
