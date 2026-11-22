import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, type HostInstance } from 'react-native';

// The desktop calendar fills the window's height (spec 0021, REQ-001): the room between the head
// with the tabs and the window's lower edge, measured from where the calendar's content begins.

/** What the page keeps free under its content when it does not clear the assistant button. */
export const PAGE_END = 24;

export interface FillHeight {
  /** Put on an empty view at the top of the calendar's content. */
  markerRef: (node: HostInstance | null) => void;
  onMarkerLayout: () => void;
  /** Height in px from the marker to the end of the page; null until measured or when off. */
  available: number | null;
}

export function useFillHeight(enabled: boolean): FillHeight {
  const { height } = useWindowDimensions();
  const marker = useRef<HostInstance | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const measure = useCallback(() => {
    marker.current?.measureInWindow((_x, y) => setTop(y));
  }, []);
  useEffect(() => {
    if (enabled) measure();
  }, [enabled, height, measure]);
  const markerRef = useCallback((node: HostInstance | null) => {
    marker.current = node;
  }, []);
  return {
    markerRef,
    onMarkerLayout: measure,
    available: enabled && top !== null ? Math.max(0, height - top - PAGE_END) : null,
  };
}
