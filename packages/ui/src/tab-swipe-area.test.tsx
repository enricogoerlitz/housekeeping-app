import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test/mocks/reanimated';
import { pointer } from '../test/setup';
import { Button } from './controls';
import { DragContext } from './drag-context';
import type { DragController } from './drag-controller';
import { Text } from './primitives';
import { SwipeArea } from './swipe-area';
import { Screen, ScreenHeader } from './shell';
import { SwipeToRemove } from './swipe-row';
import { TabSwipeArea } from './tab-swipe-area';
import type { TabSwipe } from './tab-swipe';

type LayoutNode = HTMLElement & {
  __reactLayoutHandler?: (event: {
    nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
  }) => void;
};

/** The window size react-native-web reads (jsdom reports 0 × 0). */
function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// react-native-web builds PanResponder's gestures from mouse events on the document; the time
// stamps drive its velocity, so each event gets its own.
let stamp = 1000;
function mouse(target: Element, type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number) {
  stamp += 100;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
  });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  act(() => {
    target.dispatchEvent(event);
  });
}
function drag(target: Element, points: [number, number][]) {
  const [first, ...rest] = points;
  mouse(target, 'mousedown', first![0], first![1]);
  for (const [x, y] of rest) mouse(target, 'mousemove', x, y);
  const last = points[points.length - 1]!;
  mouse(target, 'mouseup', last[0], last[1]);
}
/** A native scroll that starts while the finger is down (iOS with `pan-y`, spec 0030). */
function nativeScroll(target: Element) {
  act(() => {
    target.dispatchEvent(new Event('scroll', { bubbles: false }));
  });
}

// 40 px per 100 ms: slow, so the distance decides.
const LEFT: [number, number][] = [
  [300, 300],
  [280, 300],
  [240, 300],
  [200, 300],
  [160, 300],
];
const RIGHT: [number, number][] = [
  [90, 300],
  [110, 300],
  [150, 300],
  [190, 300],
  [230, 300],
];

function renderArea(index = 1, count = 3) {
  const onStep = vi.fn();
  const swipe: TabSwipe = { index, count, onStep };
  const view = render(
    <TabSwipeArea swipe={swipe}>
      <Button label="Inhalt" onPress={() => undefined} />
    </TabSwipeArea>,
  );
  const content = screen.getByRole('button', { name: 'Inhalt' });
  return { ...view, onStep, content, swipe };
}

beforeEach(() => {
  setWindow(390, 844);
});
afterEach(() => {
  vi.useRealTimers();
  setWindow(0, 0);
});

describe('TabSwipeArea (spec 0029, REQ-003)', () => {
  it('a swipe to the left past the threshold shows the next tab', () => {
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('a swipe to the right shows the previous tab', () => {
    const { onStep, content } = renderArea();
    drag(content, RIGHT);
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it('on the first tab a swipe to the right only resists and changes nothing', () => {
    const { onStep, content } = renderArea(0);
    drag(content, RIGHT);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a short swipe springs back', () => {
    const { onStep, content } = renderArea();
    drag(content, [
      [300, 300],
      [285, 300],
      [270, 300],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('AC-025: a move that starts vertically stays a scroll, even when it turns sideways', () => {
    const { onStep, content } = renderArea();
    drag(content, [
      [300, 300],
      [298, 330],
      [250, 335],
      [150, 340],
      [100, 340],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a move from the screen edge belongs to the system back gesture', () => {
    const { onStep, content } = renderArea();
    drag(content, [
      [10, 300],
      [30, 300],
      [70, 300],
      [110, 300],
      [150, 300],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('only with a finger: a mouse or trackpad does not swipe', () => {
    pointer.fine = true;
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('only on phones', () => {
    setWindow(1024, 768);
    const { onStep, content } = renderArea();
    drag(content, [
      [900, 300],
      [880, 300],
      [840, 300],
      [800, 300],
      [700, 300],
      [600, 300],
    ]);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('with reduced motion the tab changes at once', () => {
    reducedMotion.value = true;
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('decision 8: a touch in a row that scrolls sideways belongs to that row', () => {
    const onStep = vi.fn();
    render(
      <TabSwipeArea swipe={{ index: 1, count: 3, onStep }}>
        <Text testID="chips" style={{ overflowX: 'auto' } as object}>
          Chips
        </Text>
      </TabSwipeArea>,
    );
    const chips = screen.getByTestId('chips');
    Object.defineProperty(chips, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(chips, 'clientWidth', { configurable: true, value: 390 });
    drag(chips, LEFT);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('AC-013/AC-014 (spec 0034): a swipe area inside pages, the room around it changes the tab', () => {
    const onStep = vi.fn();
    const onPage = vi.fn();
    render(
      <TabSwipeArea swipe={{ index: 1, count: 3, onStep }}>
        <SwipeArea onSwipe={onPage}>
          <Text>Raster</Text>
        </SwipeArea>
        <Text>Darunter</Text>
      </TabSwipeArea>,
    );
    drag(screen.getByText('Raster'), LEFT);
    expect(onPage).toHaveBeenCalledWith(1);
    expect(onStep).not.toHaveBeenCalled();
    drag(screen.getByText('Darunter'), LEFT);
    expect(onStep).toHaveBeenCalledWith(1);
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it('a row swipe inside claims the move first', () => {
    const onStep = vi.fn();
    const onRemove = vi.fn();
    vi.useFakeTimers();
    render(
      <TabSwipeArea swipe={{ index: 1, count: 3, onStep }}>
        <SwipeToRemove onRemove={onRemove} label="Entfernen">
          <Text>Milch</Text>
        </SwipeToRemove>
      </TabSwipeArea>,
    );
    drag(screen.getByText('Milch'), [
      [300, 300],
      [280, 300],
      [150, 300],
    ]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a swipe that is cut off springs back', () => {
    const { onStep, content } = renderArea();
    mouse(content, 'mousedown', 300, 300);
    mouse(content, 'mousemove', 280, 300);
    mouse(content, 'mousemove', 200, 300);
    act(() => {
      content.dispatchEvent(new Event('touchcancel', { bubbles: true }));
    });
    mouse(content, 'mouseup', 160, 300);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('the tab did not change after all: the content comes back and the next swipe works', () => {
    vi.useFakeTimers();
    const { onStep, content } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('the new tab arrives once the screen shows it', () => {
    const { onStep, content, rerender } = renderArea();
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledWith(1);
    rerender(
      <TabSwipeArea swipe={{ index: 2, count: 3, onStep }}>
        <Text>Neuer Tab</Text>
      </TabSwipeArea>,
    );
    expect(screen.getByText('Neuer Tab')).toBeTruthy();
    // On the last tab only the way back is left.
    drag(screen.getByText('Neuer Tab'), LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
    drag(screen.getByText('Neuer Tab'), RIGHT);
    expect(onStep).toHaveBeenLastCalledWith(-1);
  });

  it('with reduced motion the new tab only fades in', () => {
    reducedMotion.value = true;
    const { onStep, content, rerender } = renderArea();
    drag(content, LEFT);
    rerender(
      <TabSwipeArea swipe={{ index: 2, count: 3, onStep }}>
        <Text>Neuer Tab</Text>
      </TabSwipeArea>,
    );
    expect(screen.getByText('Neuer Tab')).toBeTruthy();
  });

  it('taps on the content keep working', () => {
    const onPress = vi.fn();
    render(
      <TabSwipeArea swipe={{ index: 0, count: 2, onStep: () => undefined }}>
        <Button label="Öffnen" onPress={onPress} />
      </TabSwipeArea>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('while something hangs on the finger (a trip drawn in the year) the move is no tab swipe', () => {
    const onStep = vi.fn();
    const dragging = {
      getSnapshot: () => ({ phase: 'dragging', sourceId: 'trip:2027-01-04' }),
      subscribe: () => () => undefined,
    } as unknown as DragController<ReactNode>;
    render(
      <DragContext.Provider value={dragging}>
        <TabSwipeArea swipe={{ index: 1, count: 3, onStep }}>
          <Button label="Inhalt" onPress={() => undefined} />
        </TabSwipeArea>
      </DragContext.Provider>,
    );
    drag(screen.getByRole('button', { name: 'Inhalt' }), RIGHT);
    expect(onStep).not.toHaveBeenCalled();
  });
});

describe('TabSwipeArea after a native scroll began (spec 0030, REQ-007)', () => {
  it('a sideways move still changes the tab', () => {
    const { onStep, content } = renderArea();
    mouse(content, 'mousedown', 300, 300);
    nativeScroll(content);
    for (const [x, y] of LEFT.slice(1)) mouse(content, 'mousemove', x, y);
    mouse(content, 'mouseup', 160, 300);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('a mostly vertical move stays a scroll', () => {
    const { onStep, content } = renderArea();
    mouse(content, 'mousedown', 300, 300);
    nativeScroll(content);
    mouse(content, 'mousemove', 295, 340);
    mouse(content, 'mousemove', 200, 345);
    mouse(content, 'mousemove', 120, 345);
    mouse(content, 'mouseup', 120, 345);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a scroll without a finger on the screen is left alone', () => {
    const { onStep, content } = renderArea();
    nativeScroll(content);
    drag(content, LEFT);
    expect(onStep).toHaveBeenCalledTimes(1);
  });
});

describe('TabSwipeArea with the neighbour beside it (spec 0034, REQ-007)', () => {
  // "Rezepte" with "Restaurants" to its right; the drag stays down until `release`.
  function renderPreview(index = 0, count = 2) {
    const onStep = vi.fn();
    const preview = vi.fn((step: -1 | 1) => (
      <Text>{step === 1 ? 'Restaurants-Liste' : 'Davor-Liste'}</Text>
    ));
    const view = render(
      <TabSwipeArea swipe={{ index, count, onStep, preview }}>
        <Button label="Rezepte-Liste" onPress={() => undefined} />
      </TabSwipeArea>,
    );
    const content = screen.getByRole('button', { name: 'Rezepte-Liste' });
    return { ...view, onStep, preview, content };
  }
  function hold(target: Element, points: [number, number][]) {
    const [first, ...rest] = points;
    mouse(target, 'mousedown', first![0], first![1]);
    for (const [x, y] of rest) mouse(target, 'mousemove', x, y);
  }
  const HALF: [number, number][] = [
    [300, 300],
    [280, 300],
    [240, 300],
    [190, 300],
    [150, 300],
    [105, 300],
  ];
  const neighbour = () => screen.queryByTestId('tab-swipe-preview-next');

  it('AC-015: held half way to the left, the next tab stands right beside the content', () => {
    const { preview, content } = renderPreview();
    hold(content, HALF);
    expect(screen.getByText('Restaurants-Liste')).toBeTruthy();
    expect(neighbour()?.style.left).toBe('390px');
    expect(preview).toHaveBeenCalledWith(1);
    expect(preview).not.toHaveBeenCalledWith(-1);
    // A picture only: not read out and not touched.
    expect(neighbour()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('AC-015: the neighbour is drawn only once a swipe takes the finger', () => {
    const { preview, content } = renderPreview();
    fireEvent.click(content);
    hold(content, [
      [300, 300],
      [298, 340],
      [296, 400],
    ]);
    expect(preview).not.toHaveBeenCalled();
    expect(neighbour()).toBeNull();
  });

  it('AC-016: released before the threshold, "Rezepte" springs back and the neighbour leaves', () => {
    vi.useFakeTimers();
    const { onStep, content } = renderPreview();
    hold(content, [
      [300, 300],
      [285, 300],
      [270, 300],
    ]);
    expect(neighbour()).not.toBeNull();
    mouse(content, 'mouseup', 270, 300);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onStep).not.toHaveBeenCalled();
    expect(neighbour()).toBeNull();
  });

  it('AC-015: past the threshold the tab changes, the neighbour leaves once the new tab shows', () => {
    vi.useFakeTimers();
    const { onStep, content, rerender, preview } = renderPreview();
    hold(content, HALF);
    mouse(content, 'mouseup', 105, 300);
    expect(onStep).toHaveBeenCalledWith(1);
    rerender(
      <TabSwipeArea swipe={{ index: 1, count: 2, onStep, preview }}>
        <Text>Restaurants-Seite</Text>
      </TabSwipeArea>,
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Restaurants-Seite')).toBeTruthy();
    expect(neighbour()).toBeNull();
    expect(screen.queryByText('Restaurants-Liste')).toBeNull();
  });

  it('AC-015: with reduced motion nothing slides, so no neighbour is drawn', () => {
    reducedMotion.value = true;
    const { preview, onStep, content } = renderPreview();
    hold(content, HALF);
    expect(preview).not.toHaveBeenCalled();
    mouse(content, 'mouseup', 105, 300);
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('AC-015: a page that arrives anew after the swipe shows at once, in the frame of the one before', () => {
    const onStep = vi.fn();
    const page = (tab: 'recipes' | 'restaurants') => (
      <Screen
        key={tab}
        header={<ScreenHeader title="Essen" />}
        tabSwipe={{
          index: tab === 'recipes' ? 0 : 1,
          count: 2,
          onStep,
          preview: () => <Text>Coccodrillo</Text>,
        }}
      >
        <Text>{tab === 'recipes' ? 'Apfelkuchen' : 'AMRIT'}</Text>
      </Screen>
    );
    const hidden = (text: string) => {
      for (let node = screen.getByText(text).parentElement; node; node = node.parentElement) {
        if (node.style.opacity === '0') return true;
      }
      return false;
    };
    // The header's size as the browser reports it to react-native-web's onLayout.
    const measureHeader = () => {
      let node: HTMLElement | null = screen.getByText('Essen');
      while (node && !(node as LayoutNode).__reactLayoutHandler) node = node.parentElement;
      act(() => {
        (node as LayoutNode).__reactLayoutHandler?.({
          nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } },
        });
      });
    };
    const { rerender } = render(page('recipes'));
    measureHeader();
    expect(hidden('Apfelkuchen')).toBe(false);
    hold(screen.getByText('Apfelkuchen'), HALF);
    mouse(screen.getByText('Apfelkuchen'), 'mouseup', 105, 300);
    expect(onStep).toHaveBeenCalledWith(1);
    // A new page (Essen swaps the whole Screen): nothing measured yet, it shows all the same.
    rerender(page('restaurants'));
    expect(hidden('AMRIT')).toBe(false);
  });

  it('AC-015: the neighbour page shows only its content, without header and toolbar', () => {
    const onStep = vi.fn();
    render(
      <TabSwipeArea
        swipe={{
          index: 0,
          count: 2,
          onStep,
          preview: () => (
            <Screen
              testID="restaurants-screen"
              header={<ScreenHeader title="Essen" />}
              toolbar={<Text>Restaurants suchen</Text>}
            >
              <Text>Coccodrillo</Text>
            </Screen>
          ),
        }}
      >
        <Button label="Rezepte-Liste" onPress={() => undefined} />
      </TabSwipeArea>,
    );
    hold(screen.getByRole('button', { name: 'Rezepte-Liste' }), HALF);
    expect(screen.getByText('Coccodrillo')).toBeTruthy();
    expect(screen.queryByText('Restaurants suchen')).toBeNull();
    expect(screen.queryByText('Essen')).toBeNull();
    // Only one page of that name: the real one comes after the swipe.
    expect(screen.queryByTestId('restaurants-screen')).toBeNull();
  });
});
