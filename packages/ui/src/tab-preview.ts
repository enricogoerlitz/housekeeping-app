import { createContext, useContext } from 'react';

/**
 * Where the content of a page with chrome on phones starts (spec 0034, REQ-007): below the
 * narrow bar (`top`) and, inside the scroll area, below header, tabs and toolbar (`inset`).
 */
export interface TabPreviewFrame {
  top: number;
  inset: number;
}

/**
 * Set around the neighbour tab drawn beside the content during a tab swipe. A Screen inside
 * draws only its content, in the frame of the page it stands beside; nothing in it is touched.
 */
export const TabPreviewContext = createContext<TabPreviewFrame | undefined>(undefined);

/** Whether this is the picture of a neighbour tab during a swipe, not the page itself. */
export function useTabPreview(): boolean {
  return useContext(TabPreviewContext) !== undefined;
}
