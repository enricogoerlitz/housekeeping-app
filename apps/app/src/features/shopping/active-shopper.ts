import { useCurrentMemberId, useMembers, useShoppingItems } from '@housekeeping/api';
import { activeShopper, type ActiveShopper } from '@housekeeping/core';
import { useEffect, useState } from 'react';

// The hint goes away by itself SHOPPER_ACTIVE_MINUTES after the last check (AC-012), so the
// clock ticks while the screen is open; a minute is precise enough for a 15-minute rule.
const TICK_MS = 60_000;

function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** "Nadja kauft gerade ein · 7 von 14" (Offene Frage 1 A): another member checked recently. */
export function useActiveShopper(): ActiveShopper | undefined {
  const items = useShoppingItems();
  const members = useMembers();
  const me = useCurrentMemberId();
  const now = useNow();
  return activeShopper(items, members, me, now);
}
