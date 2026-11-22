import { switchHousehold, useAddressedObject, type AddressedKind } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import { useEffect, useRef } from 'react';

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

/**
 * `haushalt` from a notification's link (spec 0013, Decision 12): an own household becomes active
 * (`switchHousehold` ignores any other id), then the parameter leaves the address (spec 0019,
 * Decision 5).
 */
export function useHandedHousehold(
  householdId: Id | undefined,
  replace: (patch: { haushalt: undefined }) => void,
): void {
  useEffect(() => {
    if (!householdId) return;
    switchHousehold(householdId);
    replace({ haushalt: undefined });
  }, [householdId, replace]);
}

/**
 * An object parameter whose object is not in the active household (AC-052): a toast with
 * `message`, no window, and `clear` removes the parameter. An object that was shown and then
 * removed (another device) just closes, without the toast.
 */
export function useMissingObject(
  id: Id | undefined,
  present: boolean,
  message: string,
  clear: () => void,
): void {
  const seen = useRef<Id | undefined>(undefined);
  useEffect(() => {
    if (present && id) seen.current = id;
  }, [present, id]);
  const missing = id !== undefined && !present;
  useEffect(() => {
    if (!missing) return;
    if (seen.current !== id) toast.show({ message });
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per missing id
  }, [missing, id]);
}
