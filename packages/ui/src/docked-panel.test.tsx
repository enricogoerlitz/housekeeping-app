import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DockedPanel, type DockedPanelProps } from './docked-panel';
import { Text } from './primitives';
import { Screen } from './shell';

/** The window size react-native-web reads (jsdom reports 0 × 0, a phone). */
function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// onLayout in react-native-web comes from a ResizeObserver, which jsdom lacks: this one reports
// the size a test gives a view.
let reportResize: ((entries: { target: Element }[]) => void) | undefined;
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    constructor(callback: (entries: { target: Element }[]) => void) {
      reportResize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
function layout(node: Element, height: number) {
  Object.defineProperty(node, 'offsetWidth', { configurable: true, value: 390 });
  Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height });
  act(() => {
    reportResize?.([{ target: node }]);
    vi.advanceTimersByTime(0);
  });
}
/** Measures the phone panel: an 800 pt screen area and a 60 pt header line. */
function measurePanel() {
  layout(screen.getByTestId('panel').parentElement!, 800);
  layout(screen.getByTestId('panel-handle').parentElement!, 60);
}

let stamp = 1000;
function mouse(target: Element, type: 'mousedown' | 'mousemove' | 'mouseup', y: number) {
  stamp += 100;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 200,
    clientY: y,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
  });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  act(() => {
    target.dispatchEvent(event);
  });
}
/** Drags the handle through the given y positions, 100 ms apart. */
function drag(ys: number[]) {
  const handle = screen.getByTestId('panel-handle');
  const [first, ...rest] = ys;
  mouse(handle, 'mousedown', first!);
  for (const y of rest) mouse(handle, 'mousemove', y);
  mouse(handle, 'mouseup', ys[ys.length - 1]!);
}

/**
 * Runs one of the handle's screen reader actions, which the web does not reach through the DOM:
 * the handler of the view with `testID` in the tree React shows now.
 */
function accessibilityAction(testID: string, actionName: string) {
  type Fiber = {
    memoizedProps?: Record<string, unknown> | null;
    child: Fiber | null;
    sibling: Fiber | null;
    stateNode: { current: Fiber } | null;
  };
  const container = screen.getByTestId(testID).closest('body > div')!;
  const key = Object.keys(container).find((name) => name.startsWith('__reactContainer$'))!;
  const stack = [(container as unknown as Record<string, Fiber>)[key]!.stateNode!.current];
  while (stack.length > 0) {
    const fiber = stack.pop()!;
    const props = fiber.memoizedProps;
    if (props?.testID === testID && typeof props.onAccessibilityAction === 'function') {
      const handler = props.onAccessibilityAction as (event: object) => void;
      act(() => handler({ nativeEvent: { actionName } }));
      return;
    }
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  throw new Error(`no accessibility actions on ${testID}`);
}

function renderPanel(props: Partial<DockedPanelProps> = {}) {
  const onClose = vi.fn();
  const onStateChange = vi.fn();
  const all = {
    open: true,
    onClose,
    onStateChange,
    label: 'Tages-Fenster',
    closeLabel: 'Schließen',
    handleLabel: 'Größe ändern',
    header: <Text>Montag, 23. November</Text>,
    testID: 'panel',
    ...props,
  };
  const view = render(
    <DockedPanel {...all}>
      <Text>Frühstück</Text>
    </DockedPanel>,
  );
  const rerender = (next: Partial<DockedPanelProps>) =>
    view.rerender(
      <DockedPanel {...all} {...next}>
        <Text>Frühstück</Text>
      </DockedPanel>,
    );
  return { ...view, onClose, onStateChange, rerender };
}

const escape = () =>
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setWindow(0, 0);
});

describe('DockedPanel on phones (spec 0016, REQ-006)', () => {
  it('a region named by its label, with header, content and ✕', () => {
    const { onClose } = renderPanel();
    measurePanel();
    const region = screen.getByRole('region', { name: 'Tages-Fenster' });
    expect(within(region).getByText('Montag, 23. November')).toBeTruthy();
    expect(within(region).getByText('Frühstück')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Größe ändern' })).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closed: not there', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('keyboard on the handle: arrows change the size, down from half closes', () => {
    const { onStateChange, onClose } = renderPanel();
    measurePanel();
    const handle = screen.getByTestId('panel-handle');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(onStateChange).toHaveBeenLastCalledWith('full');
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(onStateChange).toHaveBeenLastCalledWith('half');
    fireEvent.keyDown(handle, { key: 'x' });
    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });

  it('Enter and Space on the handle toggle between half and full', () => {
    const { onStateChange } = renderPanel();
    measurePanel();
    const handle = screen.getByTestId('panel-handle');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onStateChange).toHaveBeenLastCalledWith('full');
    fireEvent.keyDown(handle, { key: ' ' });
    expect(onStateChange).toHaveBeenLastCalledWith('half');
  });

  it('screen reader actions on the handle: activate, increment, decrement', () => {
    const { onStateChange, onClose } = renderPanel();
    measurePanel();
    accessibilityAction('panel-handle', 'activate');
    expect(onStateChange).toHaveBeenLastCalledWith('full');
    accessibilityAction('panel-handle', 'decrement');
    expect(onStateChange).toHaveBeenLastCalledWith('half');
    accessibilityAction('panel-handle', 'increment');
    expect(onStateChange).toHaveBeenLastCalledWith('full');
    accessibilityAction('panel-handle', 'decrement');
    accessibilityAction('panel-handle', 'decrement');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a size set by the page: collapsed grows to half', () => {
    const { onStateChange } = renderPanel({ state: 'collapsed' });
    measurePanel();
    fireEvent.keyDown(screen.getByTestId('panel-handle'), { key: 'ArrowUp' });
    expect(onStateChange).toHaveBeenCalledWith('half');
  });

  it('a tap on the handle grows the panel to full height', () => {
    const { onStateChange } = renderPanel();
    measurePanel();
    drag([500, 502]);
    expect(onStateChange).toHaveBeenCalledWith('full');
  });

  it('dragged up and let go near the top it snaps to full height', () => {
    const { onStateChange, onClose } = renderPanel();
    measurePanel();
    drag([500, 460, 420, 380, 340, 300, 260, 220]);
    expect(onStateChange).toHaveBeenCalledWith('full');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dragged down from half it closes', () => {
    const { onClose } = renderPanel();
    measurePanel();
    drag([400, 440, 480, 520, 560, 600, 640, 680, 720]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a short flick up grows it one size', () => {
    const { onStateChange } = renderPanel();
    measurePanel();
    drag([500, 490, 400]);
    expect(onStateChange).toHaveBeenCalledWith('full');
  });

  it('dragged a little and let go slowly it stays at its size', () => {
    const { onStateChange, onClose } = renderPanel();
    measurePanel();
    drag([500, 480, 460, 440]);
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a drag that is cut off still lands on a size', () => {
    const { onStateChange } = renderPanel();
    measurePanel();
    const handle = screen.getByTestId('panel-handle');
    for (const y of [500, 460, 420, 380, 340, 300, 260, 220]) {
      mouse(handle, y === 500 ? 'mousedown' : 'mousemove', y);
    }
    act(() => {
      handle.dispatchEvent(new Event('touchcancel', { bubbles: true }));
    });
    expect(onStateChange).toHaveBeenCalledWith('full');
  });

  it('closed by the page: slides away, then unmounts and gives the focus back', () => {
    const focus = vi.fn();
    const { rerender } = renderPanel({ returnFocusRef: { current: { focus } } });
    measurePanel();
    rerender({ open: false });
    expect(screen.queryByRole('region')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    rerender({ open: true });
    expect(screen.getByRole('region', { name: 'Tages-Fenster' })).toBeTruthy();
  });

  it('closed with the handle but kept open by the page: back to its size', () => {
    const { onClose, onStateChange } = renderPanel();
    measurePanel();
    fireEvent.keyDown(screen.getByTestId('panel-handle'), { key: 'ArrowDown' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Tages-Fenster' })).toBeTruthy();
    drag([500, 502]);
    expect(onStateChange).toHaveBeenCalledWith('full');
  });

  it('a size the page sets during a drag does not take the panel from the finger', () => {
    const { rerender, onClose } = renderPanel({ state: 'half' });
    measurePanel();
    const handle = screen.getByTestId('panel-handle');
    mouse(handle, 'mousedown', 400);
    mouse(handle, 'mousemove', 440);
    rerender({ state: 'full' });
    for (const y of [480, 520, 560, 600, 640, 680, 720]) mouse(handle, 'mousemove', y);
    mouse(handle, 'mouseup', 720);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keyboard focus on the handle shows the focus ring', () => {
    renderPanel();
    measurePanel();
    const handle = screen.getByTestId('panel-handle');
    act(() => {
      handle.focus();
    });
    expect(handle.style.outlineStyle).toBe('solid');
    act(() => {
      handle.blur();
    });
    expect(handle.style.outlineStyle).toBe('');
  });

  it('Escape on the web closes it', () => {
    const { onClose } = renderPanel();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape leaves it to a window above, and to a key already handled', () => {
    const { onClose } = renderPanel();
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    escape();
    dialog.remove();
    const handled = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', handled, { capture: true });
    escape();
    window.removeEventListener('keydown', handled, { capture: true });
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closed: Escape does nothing', () => {
    const { onClose } = renderPanel({ open: false });
    escape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('in a Screen the page gets room at its end for the part the panel covers', () => {
    const page = (open: boolean) => (
      <Screen
        aside={
          <DockedPanel
            open={open}
            onClose={() => undefined}
            label="Tages-Fenster"
            closeLabel="Schließen"
            handleLabel="Größe ändern"
            testID="panel"
          />
        }
      >
        <Text>Monat</Text>
      </Screen>
    );
    const { rerender } = render(page(true));
    const content = screen.getByText('Monat').parentElement!;
    expect(content.style.paddingBottom).toBe('96px');
    measurePanel();
    // Half of the 800 pt area, plus the usual gap.
    expect(content.style.paddingBottom).toBe('424px');
    rerender(page(false));
    expect(content.style.paddingBottom).toBe('96px');
  });
});

describe('DockedPanel beside the content from 1100 px', () => {
  it('a region with header, content and ✕', () => {
    setWindow(1280, 800);
    const { onClose } = renderPanel();
    const region = screen.getByRole('region', { name: 'Tages-Fenster' });
    expect(within(region).getByText('Frühstück')).toBeTruthy();
    expect(within(region).queryByRole('button', { name: 'Größe ändern' })).toBeNull();
    fireEvent.click(within(region).getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    escape();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closed: gone at once, the focus goes back', () => {
    setWindow(1280, 800);
    const focus = vi.fn();
    const { rerender } = renderPanel({ returnFocusRef: { current: { focus } } });
    rerender({ open: false });
    expect(screen.queryByRole('region')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
