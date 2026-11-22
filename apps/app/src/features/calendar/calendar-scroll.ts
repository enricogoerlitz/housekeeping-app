import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { Platform, type HostInstance } from 'react-native';

// Phones and scrolling tablets open week and year at today (spec 0021, REQ-004): the page scrolls
// so the day or month stands right under the tabs. The app ships as a web app (PWA), where the
// page is a scrolling element of the DOM; other platforms keep the top.

function isElement(node: unknown): node is HTMLElement {
  return typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;
}

function scrollerOf(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
  }
  return null;
}

/** The page to the node's top, without animation; `toTop` to the start of the page instead. */
function scrollPageTo(node: HostInstance | undefined, toTop: boolean): void {
  if (Platform.OS !== 'web' || !isElement(node)) return;
  if (toTop) scrollerOf(node)?.scrollTo({ top: 0 });
  else node.scrollIntoView({ block: 'start', inline: 'nearest' });
}

/**
 * Nodes by key and a scroll to `target` on mount and whenever `request` or `period` changes: the
 * first key means the start of the page. `request` changes on a change of view, paging and
 * „Heute“; the address may follow a moment later, so the shown `period` counts too. Choosing a
 * day changes neither, so the year stays where it is while the day window opens.
 */
export function useScrollTo<K>(options: {
  enabled: boolean;
  request: number;
  period: string;
  target: K;
  first: K;
}): (key: K, node: HostInstance | null) => void {
  const nodes = useRef(new Map<K, HostInstance>());
  const scroll = useEffectEvent(() => {
    if (!options.enabled) return;
    scrollPageTo(nodes.current.get(options.target), options.target === options.first);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => scroll());
    return () => cancelAnimationFrame(frame);
  }, [options.request, options.period]);
  return useCallback((key: K, node: HostInstance | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);
}
