import type { Activity, MapsApp, Restaurant } from '@housekeeping/core';
import { Button, Sheet, Stack, Text } from '@housekeeping/ui';

import { openRoute } from '@/lib/open-route';

/** Where a route goes: a restaurant, or an activity with its place name (spec 0004). */
export type RouteTarget = Pick<Restaurant, 'name' | 'address' | 'location'> &
  Partial<Pick<Activity, 'placeName'>>;

/** "Route": pick the map app; it opens with the place as destination (AC-012, spec 0004 AC-014). */
export function RouteSheet(props: {
  restaurant: RouteTarget;
  visible: boolean;
  onClose: () => void;
}) {
  const target = props.restaurant;
  // Spec 0029, REQ-004: no empty browser window stays behind in the installed iPhone app.
  const open = (app: MapsApp) => {
    props.onClose();
    openRoute(app, target);
  };
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title="Route"
      testID="route-sheet"
      size="s"
    >
      <Stack gap={12}>
        <Text color="muted">
          Ziel: {target.placeName || target.name}
          {target.address ? `, ${target.address}` : ''}
        </Text>
        <Button
          label="Apple Karten"
          icon="map-pin"
          full
          onPress={() => open('apple')}
          testID="route-apple"
        />
        <Button
          label="Google Maps"
          icon="map-pin"
          variant="secondary"
          full
          onPress={() => open('google')}
          testID="route-google"
        />
      </Stack>
    </Sheet>
  );
}
