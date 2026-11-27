import { usePhoto } from '@housekeeping/api';
import type { PlanEntryPhoto } from '@housekeeping/core';
import { PhotoCollage } from '@housekeeping/ui';
import { View } from 'react-native';

import { useCoverSources } from '@/features/recipes/recipe-cover';

/** Narrow enough that the window stays about the entry, wide enough to recognise the dish. */
const MAX_WIDTH = 280;

/**
 * The photo at the top of a plan entry's window, centred (spec 0047, REQ-004): a recipe's own or
 * sample photo, a collection's photo or collage, a restaurant's or an activity's own photo. Only
 * once there is a picture to show: no placeholder, no empty frame (AC-016, AC-017).
 */
export function EntryPhoto(props: { photo: PlanEntryPhoto; name: string }) {
  const { photo } = props;
  const covers = useCoverSources(photo.kind === 'recipe' ? photo.recipe : undefined);
  const own = usePhoto(photo.kind === 'place' ? photo.photoPath : undefined);
  const sources = photo.kind === 'recipe' ? covers : own.uri ? [{ uri: own.uri }] : [];
  if (sources.length === 0) return null;
  return (
    <View testID="entry-photo" style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
      <PhotoCollage
        sources={sources}
        aspectRatio={photo.kind === 'recipe' ? 4 / 3 : 16 / 9}
        alt={props.name}
      />
    </View>
  );
}
