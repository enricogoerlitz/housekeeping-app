import { useContext, useEffect, useRef, type ReactElement } from 'react';
import { FlatList, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { PageScrollContext } from './shell';

// Scroll positions of lists that were left, per `restoreKey`, while the app runs.
const positions = new Map<string, number>();

export interface InfiniteListProps<T> {
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactElement;
  /** Group headings among the items; each sticks to the top until the next one comes (AC-010). */
  isGroupHeader?: (item: T) => boolean;
  /** Remembers the scroll position under this key, e.g. across view tabs and detail pages. */
  restoreKey?: string;
  /** Rows drawn per step while scrolling; default 20. */
  batchSize?: number;
  ListHeaderComponent?: ReactElement;
  ListEmptyComponent?: ReactElement;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A long list without pages (spec 0005, REQ-007): the data is local, so this only draws the
 * visible rows plus a small reserve and draws more while scrolling. Inside a Screen with
 * `scroll={false}` it scrolls the page: header and toolbar react to it.
 */
export function InfiniteList<T>(props: InfiniteListProps<T>) {
  const page = useContext(PageScrollContext);
  const list = useRef<FlatList<T>>(null);
  const offset = useSharedValue(0);
  const saved = props.restoreKey ? (positions.get(props.restoreKey) ?? 0) : 0;
  // The place to return to; 0 once it was reached (or there is none), so scrolling stays free.
  const target = useSharedValue(saved);
  const attempts = useRef(0);
  const pageScroll = page?.onScroll;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.set(event.contentOffset.y);
      if (target.get() > 0 && event.contentOffset.y >= target.get() - 1) target.set(0);
      if (pageScroll) pageScroll(event.contentOffset.y);
    },
  });

  const { restoreKey } = props;
  useEffect(
    () => () => {
      if (restoreKey) positions.set(restoreKey, offset.get());
    },
    [offset, restoreKey],
  );

  const batch = props.batchSize ?? 20;
  const headerShift = props.ListHeaderComponent ? 1 : 0;
  const isGroupHeader = props.isGroupHeader;
  const sticky = isGroupHeader
    ? props.data.flatMap((item, index) => (isGroupHeader(item) ? [index + headerShift] : []))
    : undefined;

  return (
    <Animated.FlatList
      ref={list}
      testID={props.testID}
      data={props.data}
      keyExtractor={props.keyExtractor}
      renderItem={({ item, index }) => props.renderItem(item, index)}
      stickyHeaderIndices={sticky}
      initialNumToRender={batch}
      maxToRenderPerBatch={batch}
      windowSize={7}
      ListHeaderComponent={props.ListHeaderComponent}
      ListEmptyComponent={props.ListEmptyComponent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={[{ flex: 1 }, props.style]}
      contentContainerStyle={page ? { paddingTop: page.inset, paddingBottom: 24 } : undefined}
      onContentSizeChange={() => {
        const goal = target.get();
        if (goal <= 0) return;
        // The list only grows while it draws rows near its end: jump as far as it goes, and
        // again after each growth, until the saved place is reached.
        attempts.current += 1;
        if (attempts.current > 40) target.set(0);
        else list.current?.scrollToOffset({ offset: goal, animated: false });
      }}
    />
  );
}
