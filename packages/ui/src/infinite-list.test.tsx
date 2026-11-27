import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FOCUS_RING_ROOM } from './controls';
import { InfiniteList } from './infinite-list';
import { Text } from './primitives';
import { scrollShownToTop } from './scroll-top';
import { PageScrollContext } from './shell';
import { TabPreviewContext } from './tab-preview';

type Row = { id: string; header?: boolean };
const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: `r${index}` }));

describe('InfiniteList (AC-029)', () => {
  it('draws the first batch of items, not all of them', () => {
    render(
      <InfiniteList
        data={rows(100)}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{`Zeile ${row.id}`}</Text>}
        batchSize={10}
        testID="list"
      />,
    );
    expect(screen.getByText('Zeile r0')).toBeTruthy();
    expect(screen.queryByText('Zeile r99')).toBeNull();
  });

  it('shows the empty state without items', () => {
    render(
      <InfiniteList<Row>
        data={[]}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{row.id}</Text>}
        ListEmptyComponent={<Text>Noch nichts da</Text>}
      />,
    );
    expect(screen.getByText('Noch nichts da')).toBeTruthy();
  });

  it('draws group headings among the items', () => {
    const data: Row[] = [{ id: 'Obst', header: true }, { id: 'Apfel' }, { id: 'Birne' }];
    render(
      <InfiniteList
        data={data}
        keyExtractor={(row) => row.id}
        isGroupHeader={(row) => !!row.header}
        renderItem={(row) => (row.header ? <Text heading>{row.id}</Text> : <Text>{row.id}</Text>)}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Obst' })).toBeTruthy();
    expect(screen.getByText('Birne')).toBeTruthy();
  });

  it('spec 0057 AC-009: a list that scrolls the page goes to the top on a tap on the active tab', () => {
    const probe = measurable();
    try {
      render(
        <PageScrollContext.Provider value={{ inset: 0, onScroll: () => undefined }}>
          <InfiniteList
            data={rows(5)}
            keyExtractor={(row) => row.id}
            renderItem={(row) => <Text>{row.id}</Text>}
          />
        </PageScrollContext.Provider>,
      );
      expect(scrollShownToTop(true)).toBe(1);
      expect(probe.calls[0]?.top).toBe(0);
    } finally {
      probe.restore();
    }
  });
});

type LayoutNode = HTMLElement & {
  __reactLayoutHandler?: (event: {
    nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
  }) => void;
};

/** What the browser's ResizeObserver would report to react-native-web's onLayout. */
const layout = (node: Element, width: number, height: number) =>
  act(() => {
    (node as LayoutNode).__reactLayoutHandler?.({
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });

const scrollTo = (node: HTMLElement, y: number) => {
  node.scrollTop = y;
  act(() => {
    fireEvent.scroll(node);
  });
};

const tiles = (count: number, prefix = 't'): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}` }));

/** The rows of a grid, each as the ids of its tiles. */
const gridRows = (list: HTMLElement) =>
  Array.from(list.querySelectorAll<HTMLElement>('div'))
    .filter((node) => node.style.flexDirection === 'row' && node.style.gap === '12px')
    .map((row) => Array.from(row.children).map((cell) => cell.textContent));

describe('InfiniteList as a grid (spec 0008, REQ-004)', () => {
  const Grid = (props: { data: Row[]; minColumns?: number; header?: boolean }) => (
    <InfiniteList
      testID="grid"
      data={props.data}
      keyExtractor={(row) => row.id}
      renderItem={(row) => <Text>{row.id}</Text>}
      isGroupHeader={props.header ? (row) => !!row.header : undefined}
      minColumnWidth={100}
      minColumns={props.minColumns}
    />
  );

  it('stays invisible until its width is known', () => {
    render(<Grid data={tiles(3)} />);
    const grid = screen.getByTestId('grid');
    expect(grid.style.opacity).toBe('0');
    layout(grid, 400, 600);
    expect(grid.style.opacity).toBe('');
  });

  it('AC-015 (0034): a grid measured before under its restoreKey shows at once, e.g. after a tab swipe', () => {
    const Kept = () => (
      <InfiniteList
        testID="kept"
        data={tiles(3)}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{row.id}</Text>}
        minColumnWidth={100}
        restoreKey="kept-grid"
      />
    );
    const first = render(<Kept />);
    layout(screen.getByTestId('kept'), 400, 600);
    first.unmount();
    render(<Kept />);
    expect(screen.getByTestId('kept').style.opacity).toBe('');
    expect(gridRows(screen.getByTestId('kept'))[0]).toHaveLength(3);
  });

  it('draws as many columns as fit; the last row keeps the column width', () => {
    render(<Grid data={tiles(7)} />);
    const grid = screen.getByTestId('grid');
    // 344 wide less the focus ring's room: three columns of at least 100 with gaps of 12.
    layout(grid, 344, 600);
    expect(gridRows(grid)).toEqual([
      ['t0', 't1', 't2'],
      ['t3', 't4', 't5'],
      ['t6', '', ''],
    ]);
  });

  it('follows its width', () => {
    render(<Grid data={tiles(4)} />);
    const grid = screen.getByTestId('grid');
    layout(grid, 344, 600);
    layout(grid, 232, 600);
    expect(gridRows(grid)).toEqual([
      ['t0', 't1'],
      ['t2', 't3'],
    ]);
  });

  it('keeps the fewest columns also when they get narrower', () => {
    render(<Grid data={tiles(3)} minColumns={2} />);
    const grid = screen.getByTestId('grid');
    layout(grid, 120, 600);
    expect(gridRows(grid)).toEqual([
      ['t0', 't1'],
      ['t2', ''],
    ]);
  });

  it('a group heading takes a row of its own across the whole width', () => {
    const data: Row[] = [
      { id: 'Obst', header: true },
      ...tiles(2, 'o'),
      { id: 'Brot', header: true },
      ...tiles(1, 'b'),
    ];
    render(<Grid data={data} header />);
    const grid = screen.getByTestId('grid');
    layout(grid, 344, 600);
    expect(gridRows(grid)).toEqual([
      ['o0', 'o1', ''],
      ['b0', '', ''],
    ]);
    expect(screen.getByText('Obst').closest('[style*="flex-direction: row"]')).toBeNull();
  });
});

describe('InfiniteList scrolling', () => {
  const List = (props: { restoreKey?: string; header?: boolean }) => (
    <InfiniteList
      testID="list"
      data={rows(60)}
      keyExtractor={(row) => row.id}
      renderItem={(row) => <Text>{`Zeile ${row.id}`}</Text>}
      restoreKey={props.restoreKey}
      ListHeaderComponent={props.header ? <Text>Kopf</Text> : undefined}
    />
  );
  const contentOf = (list: HTMLElement) => list.firstElementChild as HTMLElement;

  it('inside a page that scrolls itself: reports the scroll and starts below the header', () => {
    const onScroll = vi.fn();
    render(
      <PageScrollContext.Provider value={{ inset: 96, onScroll }}>
        <List header />
      </PageScrollContext.Provider>,
    );
    const list = screen.getByTestId('list');
    expect(screen.getByText('Kopf')).toBeTruthy();
    expect(contentOf(list).style.paddingTop).toBe(`${96 + FOCUS_RING_ROOM}px`);
    scrollTo(list, 240);
    expect(onScroll).toHaveBeenCalledWith(240);
  });

  it('restoreKey: coming back returns to the place it was left', () => {
    vi.useFakeTimers();
    try {
      const first = render(<List restoreKey="recipes" />);
      scrollTo(screen.getByTestId('list'), 500);
      first.unmount();

      render(<List restoreKey="recipes" />);
      const list = screen.getByTestId('list');
      expect(list.scrollTop).toBe(0);
      layout(contentOf(list), 400, 3000);
      expect(list.scrollTop).toBe(500);

      // Once the place is reached, scrolling is free again.
      vi.advanceTimersByTime(100);
      scrollTo(list, 500);
      list.scrollTop = 0;
      layout(contentOf(list), 400, 3200);
      expect(list.scrollTop).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restoreKey: gives up after 40 tries when the place is never reached', () => {
    const first = render(<List restoreKey="far" />);
    scrollTo(screen.getByTestId('list'), 9000);
    first.unmount();

    render(<List restoreKey="far" />);
    const list = screen.getByTestId('list');
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      list.scrollTop = 0;
      layout(contentOf(list), 400, 1000 + attempt);
      expect(list.scrollTop).toBe(9000);
    }
    list.scrollTop = 0;
    layout(contentOf(list), 400, 2000);
    layout(contentOf(list), 400, 2001);
    expect(list.scrollTop).toBe(0);
  });

  it('AC-015 (0034): beside a tab swipe it shows the remembered place and leaves it as it was', () => {
    const first = render(<List restoreKey="neighbour" />);
    scrollTo(screen.getByTestId('list'), 500);
    first.unmount();

    const preview = render(
      <TabPreviewContext.Provider value={{ top: 0, inset: 0 }}>
        <List restoreKey="neighbour" />
      </TabPreviewContext.Provider>,
    );
    const shown = screen.getByTestId('list');
    layout(contentOf(shown), 400, 3000);
    expect(shown.scrollTop).toBe(500);
    scrollTo(shown, 40);
    preview.unmount();

    render(<List restoreKey="neighbour" />);
    const list = screen.getByTestId('list');
    layout(contentOf(list), 400, 3000);
    expect(list.scrollTop).toBe(500);
  });

  it('without restoreKey it starts at the top', () => {
    const first = render(<List />);
    scrollTo(screen.getByTestId('list'), 500);
    first.unmount();
    render(<List />);
    const list = screen.getByTestId('list');
    layout(contentOf(list), 400, 3000);
    expect(list.scrollTop).toBe(0);
  });

  it('AC-015: a screen hidden in a stack gets its place back when it shows again', () => {
    render(<List />);
    const list = screen.getByTestId('list');
    scrollTo(list, 300);
    layout(list, 400, 0);
    // display: none loses the scroll position.
    list.scrollTop = 0;
    layout(list, 400, 0);
    layout(list, 400, 700);
    expect(list.scrollTop).toBe(300);
    list.scrollTop = 0;
    layout(list, 400, 700);
    expect(list.scrollTop).toBe(0);
  });
});

/** Lets every element report a box (jsdom has no layout) and records `scroll` calls. */
function measurable(): { calls: { el: Element; top: unknown }[]; restore: () => void } {
  const calls: { el: Element; top: unknown }[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const rects = proto.getClientRects;
  const scroll = proto.scroll;
  proto.getClientRects = () => [{}];
  proto.scroll = function (this: Element, options: { top?: unknown }) {
    calls.push({ el: this, top: options.top });
  };
  return {
    calls,
    restore: () => {
      proto.getClientRects = rects;
      proto.scroll = scroll;
    },
  };
}
