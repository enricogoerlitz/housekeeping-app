import { usePhoto } from '@housekeeping/api';
import type { Activity } from '@housekeeping/core';
import { Photo, type IconName, type PhotoProps } from '@housekeeping/ui';
import { View } from 'react-native';

/** The symbol of activities wherever they have no photo (same as in the plan). */
export const ACTIVITY_ICON: IconName = 'mountain';

/**
 * An activity's own photo, or the placeholder symbol while there is none or it cannot load
 * (AC-004). With a testID, `<testID>-photo` or `<testID>-placeholder` says which one shows.
 */
export function ActivityPhoto(
  props: Pick<PhotoProps, 'width' | 'height' | 'aspectRatio' | 'radius'> & {
    activity: Pick<Activity, 'name' | 'photoPath'>;
    testID?: string;
  },
) {
  const photo = usePhoto(props.activity.photoPath);
  const source = photo.uri ? { uri: photo.uri } : undefined;
  return (
    <View
      testID={props.testID ? `${props.testID}-${source ? 'photo' : 'placeholder'}` : undefined}
      style={{ width: props.width ?? '100%' }}
    >
      <Photo
        source={source}
        placeholderIcon={ACTIVITY_ICON}
        width={props.width}
        height={props.height}
        aspectRatio={props.aspectRatio}
        radius={props.radius}
        alt={source ? props.activity.name : undefined}
      />
    </View>
  );
}
