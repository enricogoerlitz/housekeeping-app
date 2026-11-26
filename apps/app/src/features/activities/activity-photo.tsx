import { useActivityKindsById } from '@housekeeping/api';
import {
  ACTIVITY_ICONS,
  activityIconOf,
  DEFAULT_ACTIVITY_ICON,
  type Activity,
  type ActivityIcon,
} from '@housekeeping/core';
import type { IconName, PhotoProps } from '@housekeeping/ui';

import { OwnPhoto } from '@/features/shell/own-photo';

/** The symbol of activities without own symbol and kind (same as in the plan). */
export const ACTIVITY_ICON: IconName = DEFAULT_ACTIVITY_ICON;

// Every symbol of the fixed choice (core, Entscheidung 5) is one of the app's icons: this line
// stops the type check when one is missing in packages/ui icons.ts.
const ICONS_EXIST: ActivityIcon extends IconName ? true : never = true;

/** The 40 symbols with their words, for the symbol choice (REQ-002). */
export const ACTIVITY_ICON_OPTIONS = ICONS_EXIST ? ACTIVITY_ICONS : [];

/** AC-005: the symbol an activity shows: its own, its kind's or the default. */
export function useActivityIcon(
  activity: Pick<Activity, 'icon' | 'kindId'> | undefined,
): ActivityIcon {
  const kindsById = useActivityKindsById();
  return activity ? activityIconOf(activity, kindsById) : DEFAULT_ACTIVITY_ICON;
}

/**
 * An activity's own photo, or its symbol while there is none or it cannot load (AC-004; spec
 * 0041, AC-005). With a testID, `<testID>-photo` or `<testID>-placeholder` says which one shows.
 */
export function ActivityPhoto(
  props: Pick<PhotoProps, 'width' | 'height' | 'aspectRatio' | 'radius'> & {
    activity: Pick<Activity, 'name' | 'photoPath' | 'icon' | 'kindId'>;
    testID?: string;
  },
) {
  const { activity, ...rest } = props;
  const icon = useActivityIcon(activity);
  return (
    <OwnPhoto
      {...rest}
      photoPath={activity.photoPath}
      name={activity.name}
      placeholderIcon={icon}
    />
  );
}
