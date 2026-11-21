import { useContext, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FlatList, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { columnsFor, gridRows, type GridRow } from './grid-columns';
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
  /** Items drawn per step while scrolling; default 20. */
  batchSize?: number;
  /**
   * Turns the list into a grid of tiles: as many columns of at least this width as the list is
   * wide (spec 0008, REQ-004). Group headings span the whole width.
   */
  minColumnWidth?: number;
  /** Fewest columns of the grid, also when they get narrower; default 1 (e.g. 2 on phones). */
  minColumns?: number;
  /** Space between the tiles of the grid, across and down; default 12. */
  gap?: number;
  ListHeaderComponent?: ReactElement;
  ListEmptyComponent?: ReactElement;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A long list without pages (spec 0005, REQ-007): the data is local, so this only draws the
 * visible rows plus a small reserve and draws more while scrolling. Inside a Screen with
 * `scroll={false}` it scrolls the page: header and toolbar react to it. With `minColumnWidth` it
 * is a grid that draws whole rows of tiles.
 */
export function InfiniteList<T>(props: InfiniteListProps<T>) {
  const page = useContext(PageScrollContext);
  const list = useRef<FlatList<GridRow<T>>>(null);
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

  const grid = props.minColumnWidth !== undefined;
  const gap = props.gap ?? 12;
  // The grid needs its own width; it stays invisible for the one frame before it is measured.
  const [width, setWidth] = useState<number>();
  const columns = grid
    ? columnsFor(width ?? 0, {
        minColumnWidth: props.minColumnWidth ?? 0,
        gap,
        minColumns: props.minColumns,
      })
    : 1;
  const { data, isGroupHeader, keyExtractor, renderItem } = props;
  const rows = useMemo(
    () => gridRows(data, columns, isGroupHeader),
    [data, columns, isGroupHeader],
  );

  const batch = Math.max(1, Math.ceil((props.batchSize ?? 20) / columns));
  const headerShift = props.ListHeaderComponent ? 1 : 0;
  const sticky = isGroupHeader
    ? rows.flatMap((row, index) => (row.kind === 'header' ? [index + headerShift] : []))
    : undefined;

  const rowKey = (row: GridRow<T>) =>
    row.kind === 'header'
      ? keyExtractor(row.item, row.index)
      : row.cells[0]
        ? keyExtractor(row.cells[0].item, row.cells[0].index)
        : 'empty';
  const renderRow = (row: GridRow<T>) => {
    if (row.kind === 'header') return renderItem(row.item, row.index);
    const [only] = row.cells;
    if (!grid && only) return renderItem(only.item, only.index);
    return (
      <View style={{ flexDirection: 'row', gap, marginBottom: gap }}>
        {row.cells.map((cell) => (
          <View key={keyExtractor(cell.item, cell.index)} style={CELL}>
            {renderItem(cell.item, cell.index)}
          </View>
        ))}
        {/* The last row keeps the column width of the others. */}
        {Array.from({ length: columns - row.cells.length }, (_, index) => (
          <View key={`filler-${index}`} style={CELL} />
        ))}
      </View>
    );
  };

  return (
    <Animated.FlatList
      ref={list}
      testID={props.testID}
      data={rows}
      keyExtractor={rowKey}
      renderItem={({ item }) => renderRow(item)}
      extraData={columns}
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
      onLayout={grid ? (event) => setWidth(event.nativeEvent.layout.width) : undefined}
      style={[{ flex: 1 }, grid && width === undefined ? { opacity: 0 } : null, props.style]}
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

const CELL: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 };
