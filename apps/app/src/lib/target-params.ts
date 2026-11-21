import { switchHousehold } from '@housekeeping/api';
import { parseNotificationTarget, type NotificationTarget } from '@housekeeping/core';
import { useLocalSearchParams, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { useEffect } from 'react';

type Param = string | string[] | undefined;

/** The pages a notification opens with parameters: Übersicht, Haushalt, Kalender. */
type TargetPath = '/' | '/haushalt' | '/kalender';

/**
 * The target a page was opened with, from its route parameters, with the same checks as the link
 * of a notification (core `parseNotificationTarget`, spec 0013, AC-037, AC-038): unknown pages,
 * broken ids or days give the "Übersicht", which the page then ignores. Of a repeated parameter
 * the first counts.
 */
export function targetOfParams(
  path: TargetPath,
  params: Record<string, Param>,
): NotificationTarget {
  const query = Object.entries(params).flatMap(([key, value]) => {
    const first = Array.isArray(value) ? value[0] : value;
    return first === undefined ? [] : [`${encodeURIComponent(key)}=${encodeURIComponent(first)}`];
  });
  return parseNotificationTarget(query.length > 0 ? `${path}?${query.join('&')}` : path);
}

/**
 * The target handed to a page by a link (`/?haushalt=…`, `/haushalt?aufgabe=…`,
 * `/kalender?tag=…&eintrag=…`, each with `haushalt=…`), read from the parameters `keys`. An own
 * household other than the active one becomes active (Decision 12; `switchHousehold` ignores any
 * other id). The parameters are cleared on the page's own route afterwards, so the same link works
 * again and the page takes the target once.
 */
export function useHandedTarget(path: TargetPath, keys: readonly string[]): NotificationTarget {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const target = targetOfParams(
    path,
    Object.fromEntries(Object.entries(params).filter(([key]) => keys.includes(key))),
  );
  const householdId = 'householdId' in target ? target.householdId : undefined;
  // On the page's own route: router.setParams would set it on the focused route above it.
  const navigation =
    useNavigation<NativeStackNavigationProp<{ page: Record<string, string | undefined> }>>();
  const handed = keys.some((key) => params[key] !== undefined);
  useEffect(() => {
    if (householdId) switchHousehold(householdId);
  }, [householdId]);
  useEffect(() => {
    if (handed) navigation.setParams(Object.fromEntries(keys.map((key) => [key, undefined])));
  }, [handed, keys, navigation]);
  return target;
}
