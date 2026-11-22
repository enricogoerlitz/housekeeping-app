import type { Activity } from '@housekeeping/core';
import type { IconName, PhotoProps } from '@housekeeping/ui';

import { OwnPhoto } from '@/features/shell/own-photo';

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
  const { activity, ...rest } = props;
  return (
    <OwnPhoto
      {...rest}
      photoPath={activity.photoPath}
      name={activity.name}
      placeholderIcon={ACTIVITY_ICON}
    />
  );
}
