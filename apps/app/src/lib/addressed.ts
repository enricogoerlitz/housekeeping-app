import { switchHousehold, useAddressedObject, type AddressedKind } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import { useEffect } from 'react';

/**
 * What an id from the address shows (spec 0019, REQ-017): `shown` in the active household;
 * `switching` while the app changes to the own household that holds it (with a toast, AC-051);
 * `missing` when no own household holds it, so the page shows "nicht gefunden" and nothing of the
 * object (AC-050); `none` without an id.
 */
export function useAddressedId(
  kind: AddressedKind,
  id: Id | undefined,
): 'shown' | 'switching' | 'missing' | 'none' {
  const found = useAddressedObject(kind, id);
  const switchTo = found?.status === 'switch' ? found : undefined;
  useEffect(() => {
    if (!switchTo) return;
    switchHousehold(switchTo.householdId);
    toast.show({ message: `Haushalt „${switchTo.householdName}“ ist jetzt aktiv` });
  }, [switchTo]);
  if (!found) return 'none';
  return found.status === 'shown' ? 'shown' : found.status === 'switch' ? 'switching' : 'missing';
}
