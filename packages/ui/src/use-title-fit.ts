import { useRef, useState, type RefObject } from 'react';
import type { HostInstance, LayoutChangeEvent } from 'react-native';

import { domTextWidth, naturalTitleWidth, titleOnOwnLine } from './title-fit';

type Handler = (event: LayoutChangeEvent) => void;

/**
 * Measures a bar (its row, its actions and the title's natural width) and says whether the
 * title goes on a line of its own (`titleOnOwnLine`). The actions keep their size and the title
 * its natural width either way, so the answer never flips back and forth. The natural width of a
 * cut title is known on the web only (the DOM node's scrollWidth); elsewhere it stays in the row.
 */
export function useTitleFit(layout: { padding: number; gap: number; actions: number }): {
  ownLine: boolean;
  onRow: Handler;
  titleRef: RefObject<HostInstance | null>;
  onTitle: Handler;
  onAction: (index: number) => Handler;
} {
  const titleRef = useRef<HostInstance>(null);
  const [sizes, setSizes] = useState(() => ({
    row: 0,
    title: 0,
    actions: Array.from({ length: layout.actions }, () => 0),
  }));
  const width = (event: LayoutChangeEvent) => Math.ceil(event.nativeEvent.layout.width);
  return {
    ownLine: titleOnOwnLine({ ...sizes, padding: layout.padding, gap: layout.gap }),
    onRow: (event) => {
      const row = width(event);
      setSizes((current) => (current.row === row ? current : { ...current, row }));
    },
    titleRef,
    onTitle: () => {
      const node = titleRef.current as unknown as { scrollWidth?: number } | null;
      const title = naturalTitleWidth(
        node ? { scrollWidth: node.scrollWidth, textWidth: () => domTextWidth(node) } : null,
      );
      setSizes((current) => (current.title === title ? current : { ...current, title }));
    },
    onAction: (index) => (event) => {
      const action = width(event);
      setSizes((current) =>
        current.actions[index] === action
          ? current
          : {
              ...current,
              actions: current.actions.map((old, at) => (at === index ? action : old)),
            },
      );
    },
  };
}
