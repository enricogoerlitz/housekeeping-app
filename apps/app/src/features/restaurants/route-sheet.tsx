import { routeLinks, type Restaurant } from '@housekeeping/core';
import { Button, Sheet, Stack, Text } from '@housekeeping/ui';
import { Linking } from 'react-native';

/** "Route": pick the map app; it opens with the restaurant as destination (AC-012). */
export function RouteSheet(props: {
  restaurant: Restaurant;
  visible: boolean;
  onClose: () => void;
}) {
  const links = routeLinks(props.restaurant);
  const open = (url: string) => {
    props.onClose();
    Linking.openURL(url).catch(() => undefined);
  };
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title="Route" testID="route-sheet">
      <Stack gap={12}>
        <Text color="muted">
          Ziel: {props.restaurant.name}
          {props.restaurant.address ? `, ${props.restaurant.address}` : ''}
        </Text>
        <Button
          label="Apple Karten"
          icon="map-pin"
          full
          onPress={() => open(links.apple)}
          testID="route-apple"
        />
        <Button
          label="Google Maps"
          icon="map-pin"
          variant="secondary"
          full
          onPress={() => open(links.google)}
          testID="route-google"
        />
      </Stack>
    </Sheet>
  );
}
