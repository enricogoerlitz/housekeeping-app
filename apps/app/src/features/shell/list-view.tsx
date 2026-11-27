import { usePhoto } from '@housekeeping/api';
import { listViewOf, opensQuickView, type ListView, type ListViewArea } from '@housekeeping/core';
import { MediaCard, useBreakpoint, ViewSwitch, type IconName } from '@housekeeping/ui';
import type { ReactNode } from 'react';

import { useSettings } from '@/lib/settings';

/** Tiles: at least this wide, two side by side on phones (as the recipe tiles, spec 0008). */
export const TILE_MIN_WIDTH = 260;

const VIEWS = [
  { value: 'tiles', label: 'Kacheln', icon: 'layout-grid' },
  { value: 'list', label: 'Liste', icon: 'list' },
] as const;

/**
 * The view of one area as chosen on this device (spec 0038, REQ-001), and whether an entry opens
 * beside the list (quick view) instead of on its own page.
 */
export function useListView(area: ListViewArea) {
  const settings = useSettings();
  const { isWide } = useBreakpoint();
  const view = listViewOf(settings.listViews, area);
  const setView = (next: ListView) =>
    settings.update({ listViews: { ...settings.listViews, [area]: next } });
  return { view, quick: opensQuickView(view, isWide), setView };
}

/** The two symbols "Kacheln" and "Liste" at the end of the filter row (spec 0038, decision 1). */
export function ListViewSwitch(props: {
  value: ListView;
  onChange: (view: ListView) => void;
  testID: string;
}) {
  return (
    <ViewSwitch
      options={VIEWS}
      value={props.value}
      onChange={props.onChange}
      label="Ansicht"
      testID={props.testID}
    />
  );
}

/**
 * A restaurant or an activity as a tile (spec 0038, AC-006): its own photo big in 4:3, else its
 * symbol; the meta line below the name.
 */
export function PlaceTile(props: {
  name: string;
  photoPath: string | undefined;
  placeholderIcon: IconName;
  meta?: ReactNode;
  onPress: () => void;
  testID: string;
}) {
  const { isPhone } = useBreakpoint();
  const photo = usePhoto(props.photoPath);
  return (
    <MediaCard
      testID={props.testID}
      title={props.name}
      image={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon={props.placeholderIcon}
      layout="photoTop"
      photoAspectRatio={4 / 3}
      size={isPhone ? 'm' : 'l'}
      meta={props.meta}
      onPress={props.onPress}
    />
  );
}
