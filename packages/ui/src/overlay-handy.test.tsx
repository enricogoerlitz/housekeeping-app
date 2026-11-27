// Spec 0033 "Handy: Fenster, Tastatur und Fotos": the window on a phone (drag, no scrim, focus,
// the page behind) and the toast that stays off the page's buttons.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { TextInput, View, type HostInstance } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TextField } from './controls';
import { useKeyboard } from './keyboard';
import { HANDOVER_MS, openKeyboardNow } from './keyboard-proxy';
import { Sheet, ToastHost, toast, useToastAvoid } from './overlay';
import { Text } from './primitives';

function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function stubRect(node: Element, rect: { top: number; height: number }) {
  node.getBoundingClientRect = () =>
    ({
      top: rect.top,
      bottom: rect.top + rect.height,
      height: rect.height,
      left: 0,
      right: 390,
      width: 390,
      x: 0,
      y: rect.top,
    }) as DOMRect;
}

/** A touch event as Safari sends it; returns whether the app stopped the browser's own scrolling. */
function touch(node: Element, type: string, at: { x?: number; y: number } | null, time: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = at ? [{ clientX: at.x ?? 100, clientY: at.y }] : [];
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'timeStamp', { value: time });
  act(() => {
    node.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

/** Drags from `from` through the given y positions, one every `step` ms, then lets go. */
function drag(node: Element, ys: number[], step: number, restMs = 0) {
  const [first, ...rest] = ys;
  let time = 1000;
  touch(node, 'touchstart', { y: first ?? 0 }, time);
  let prevented = false;
  for (const y of rest) {
    time += step;
    prevented = touch(node, 'touchmove', { y }, time) || prevented;
  }
  touch(node, 'touchend', null, time + 10 + restMs);
  return prevented;
}

const HEIGHT = 600;

afterEach(async () => {
  setWindow(0, 0);
  cleanup();
  await Promise.resolve();
  document.body.querySelectorAll('[data-sheet-exit]').forEach((copy) => copy.remove());
});

describe('Sheet dragged down on a phone (spec 0033, REQ-001)', () => {
  const cancel = vi.fn();
  const onClose = vi.fn();
  beforeEach(() => {
    cancel.mockReset();
    onClose.mockReset();
  });
  function open() {
    setWindow(390, 844);
    render(
      <Sheet
        visible
        onClose={onClose}
        title="Bad putzen"
        size="m"
        testID="sheet"
        actions={{
          primary: { label: 'Fertig', onPress: () => undefined },
          cancel: { label: 'Abbrechen', onPress: cancel },
        }}
      >
        <Text>Inhalt</Text>
      </Sheet>,
    );
    stubRect(screen.getByTestId('sheet'), { top: 244, height: HEIGHT });
  }

  it('AC-001: pulled down at its header by 40 % and let go, it closes', () => {
    open();
    const prevented = drag(screen.getByTestId('sheet-header'), [100, 160, 220, 280, 340], 200, 0);
    expect(prevented).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('AC-004: closing by the drag does what "Abbrechen" does', () => {
    open();
    drag(screen.getByTestId('sheet-header'), [100, 200, 340], 50);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('AC-002: pulled down 40 % and back up before letting go, it stays', () => {
    open();
    drag(screen.getByTestId('sheet-header'), [100, 220, 340, 220, 100], 200, 0);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('AC-005: only 10 % slowly, it stays', () => {
    open();
    drag(screen.getByTestId('sheet-header'), [100, 130, 160], 400, 200);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('AC-003: content scrolled down: a swipe down scrolls it, the window stays', () => {
    open();
    const content = screen.getByTestId('sheet-content');
    content.scrollTop = 140;
    const prevented = drag(screen.getByText('Inhalt'), [300, 360, 420, 480, 560], 100);
    expect(prevented).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('AC-003: content at its top: a swipe down takes the window along', () => {
    open();
    const prevented = drag(screen.getByText('Inhalt'), [300, 360, 420, 480, 560], 100);
    expect(prevented).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('a sideways swipe in the header leaves the window alone', () => {
    open();
    const header = screen.getByTestId('sheet-header');
    touch(header, 'touchstart', { x: 100, y: 100 }, 0);
    touch(header, 'touchmove', { x: 200, y: 110 }, 50);
    touch(header, 'touchmove', { x: 300, y: 400 }, 100);
    touch(header, 'touchend', null, 110);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('has a grab handle on top; wider screens neither drag nor show one', () => {
    open();
    expect(screen.getByTestId('sheet-grabber')).toBeTruthy();
    cleanup();
    setWindow(1280, 800);
    render(
      <Sheet visible onClose={onClose} title="Bad putzen" size="m" testID="sheet">
        <Text>Inhalt</Text>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet-grabber')).toBeNull();
    stubRect(screen.getByTestId('sheet'), { top: 100, height: HEIGHT });
    drag(screen.getByTestId('sheet-title'), [100, 400, 700], 50);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Sheet without scrim on a phone (spec 0033, REQ-002)', () => {
  const sheet = (onClose = () => undefined) => (
    <Sheet visible onClose={onClose} title="Link" size="s" testID="sheet">
      <Text>Inhalt</Text>
    </Sheet>
  );
  const scrimColor = () =>
    (screen.getByTestId('sheet-scrim').style.backgroundColor || 'transparent').replace(/\s/g, '');

  it('AC-006: the page behind is not darkened; a tap above the window closes it', () => {
    setWindow(390, 844);
    const onClose = vi.fn();
    render(sheet(onClose));
    expect(['transparent', 'rgba(0,0,0,0)']).toContain(scrimColor());
    fireEvent.click(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AC-013: a swipe on the page area above the window moves nothing behind it', () => {
    setWindow(390, 844);
    render(sheet());
    expect(screen.getByTestId('sheet-scrim').style.touchAction).toBe('none');
  });

  it('AC-007: from 1100 px the scrim stays', () => {
    setWindow(1280, 800);
    render(sheet());
    expect(['transparent', 'rgba(0,0,0,0)']).not.toContain(scrimColor());
  });
});

describe('Sheet focus on opening (spec 0033, REQ-006)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-017, AC-019: the first text field takes the cursor once the window has opened', () => {
    setWindow(1280, 800);
    render(
      <Sheet visible onClose={() => undefined} title="Neu" size="m" testID="sheet">
        <TextField label="Titel" autoFocus testID="title" />
        <TextField label="Notiz" testID="note" />
      </Sheet>,
    );
    act(() => vi.advanceTimersByTime(400));
    expect(document.activeElement).toBe(screen.getByTestId('title'));
  });

  it('AC-017: a layer closing behind the window (the "Neu" menu) does not take the cursor away', () => {
    setWindow(1280, 800);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    render(
      <Sheet visible onClose={() => undefined} title="Neu" size="m" testID="sheet">
        <TextField label="Titel" autoFocus testID="title" />
      </Sheet>,
    );
    act(() => vi.advanceTimersByTime(300));
    act(() => trigger.focus());
    act(() => vi.advanceTimersByTime(10));
    expect(document.activeElement).toBe(screen.getByTestId('title'));
    trigger.remove();
  });

  it('AC-019: a search field of its own with autoFocus keeps the cursor as well', () => {
    setWindow(1280, 800);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    render(
      <Sheet visible onClose={() => undefined} title="Neue Zutat" size="m" testID="sheet">
        <TextInput autoFocus testID="search" />
      </Sheet>,
    );
    act(() => trigger.focus());
    act(() => vi.advanceTimersByTime(300));
    act(() => trigger.focus());
    expect(document.activeElement).toBe(screen.getByTestId('search'));
    trigger.remove();
  });

  it('AC-020: a window that only shows something focuses no field', () => {
    setWindow(390, 844);
    render(
      <Sheet visible onClose={() => undefined} title="Bad putzen" size="m" testID="sheet">
        <Text>Alle zwei Wochen</Text>
        <TextField label="Notiz" testID="note" />
      </Sheet>,
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(document.activeElement).not.toBe(screen.getByTestId('note'));
  });
});

describe('Sheet with the keyboard moving (spec 0033, REQ-003)', () => {
  const viewport = window.visualViewport as unknown as EventTarget & { visible?: number };
  function report(visible: number | undefined) {
    viewport.visible = visible;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
  }
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-008 (changed by spec 0044, AC-007): after the first step, further heights wait until they settle', () => {
    setWindow(390, 844);
    render(
      <Sheet visible onClose={() => undefined} title="Link" size="m" testID="sheet">
        <Text>Inhalt</Text>
      </Sheet>,
    );
    report(700);
    report(520);
    report(400);
    // The keyboard coming is taken at once (520 px visible), the rest once it has settled.
    expect(screen.getByTestId('sheet').style.maxHeight).toBe('508px');
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('sheet').style.maxHeight).toBe('388px');
    expect(screen.getByTestId('sheet-layer').style.paddingBottom).toBe('444px');
  });

  it('AC-009: once the keyboard has gone the window stands at the bottom edge again', () => {
    setWindow(390, 844);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(
      <Sheet visible onClose={() => undefined} title="Link" size="m" testID="sheet">
        <Text>Inhalt</Text>
      </Sheet>,
    );
    report(400);
    act(() => vi.advanceTimersByTime(200));
    // iOS left the page scrolled while the keyboard closed.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 180 });
    scrollTo.mockClear();
    report(undefined);
    act(() => vi.advanceTimersByTime(200));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(screen.getByTestId('sheet-layer').style.paddingBottom).toBe('0px');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    scrollTo.mockRestore();
  });
});

describe('Sheet with the keyboard on iPhone (spec 0044, REQ-002, REQ-003)', () => {
  const viewport = window.visualViewport as unknown as EventTarget & {
    visible?: number;
    offsetTop: number;
  };
  const userAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
  function report(visible: number | undefined) {
    viewport.visible = visible;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
  }
  const layer = () => screen.getByTestId('sheet-layer').style.paddingBottom;
  function openSheet() {
    return render(
      <Sheet visible onClose={() => undefined} title="Neu" size="m" testID="sheet">
        <TextField label="Titel" autoFocus testID="title" />
      </Sheet>,
    );
  }
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15',
    });
  });
  afterEach(() => {
    report(undefined);
    act(() => vi.runOnlyPendingTimers());
    // A late autofocus from those timers expects a keyboard once more (a tapped field on iPhone):
    // let that expectation run out too.
    act(() => vi.advanceTimersByTime(HANDOVER_MS + 50));
    viewport.offsetTop = 0;
    vi.useRealTimers();
    if (userAgent) Object.defineProperty(window.navigator, 'userAgent', userAgent);
    else Reflect.deleteProperty(window.navigator, 'userAgent');
  });

  it('AC-003: the keyboard coming puts the window on it at once', () => {
    setWindow(390, 844);
    openSheet();
    report(464);
    expect(layer()).toBe('380px');
  });

  it('AC-004: after a tap that asked for it, the window waits where the keyboard will be', () => {
    setWindow(390, 844);
    // Measured once before.
    report(464);
    report(undefined);
    act(() => openKeyboardNow());
    openSheet();
    expect(layer()).toBe('380px');
    report(464);
    expect(layer()).toBe('380px');
    act(() => vi.advanceTimersByTime(2000));
    expect(layer()).toBe('380px');
  });

  it('AC-004: it waits for the tallest keyboard measured, as a smaller guess lets Safari push the page (iPhone click-through)', () => {
    setWindow(390, 844);
    // Something on the page listens to the keyboard.
    function Listener() {
      useKeyboard();
      return null;
    }
    const page = render(<Listener />);
    // A keyboard with suggestions (380), then one without (350, e.g. a URL field).
    report(464);
    act(() => vi.advanceTimersByTime(200));
    report(undefined);
    report(494);
    act(() => vi.advanceTimersByTime(200));
    report(undefined);
    act(() => openKeyboardNow());
    page.unmount();
    openSheet();
    expect(layer()).toBe('380px');
  });

  it('AC-005: never measured, it waits 45 % of the window high', () => {
    setWindow(390, 700);
    act(() => openKeyboardNow());
    openSheet();
    expect(layer()).toBe('315px');
  });

  it('AC-006: no keyboard after 1.5 s, the window goes back to the bottom edge', () => {
    setWindow(390, 844);
    act(() => openKeyboardNow());
    openSheet();
    expect(layer()).not.toBe('0px');
    act(() => vi.advanceTimersByTime(HANDOVER_MS + 50));
    expect(layer()).toBe('0px');
  });

  it('AC-018: the keyboard of the tap goes to the field once the window has slid in, so iOS sees its neighbours for ˄ ˅ (iPhone click-through, I-04)', () => {
    setWindow(390, 844);
    act(() => openKeyboardNow());
    openSheet();
    const title = screen.getByTestId('title');
    // Still sliding in: the hidden field keeps the keyboard.
    expect(document.activeElement).not.toBe(title);
    act(() => vi.advanceTimersByTime(300));
    expect(document.activeElement).toBe(title);
  });

  it('AC-008: the visible area moved down by 120 px, the window ends at its bottom edge', () => {
    setWindow(390, 844);
    openSheet();
    viewport.offsetTop = 120;
    report(464);
    expect(layer()).toBe('260px');
  });

  it('AC-009: closed with the cursor in a field, the field lets go of it at once', () => {
    setWindow(390, 844);
    const view = openSheet();
    act(() => vi.advanceTimersByTime(400));
    const title = screen.getByTestId('title');
    expect(document.activeElement).toBe(title);
    // The stand-in animation unmounts at once; the window lets go of the cursor itself first.
    const blur = vi.spyOn(title, 'blur');
    view.rerender(
      <Sheet visible={false} onClose={() => undefined} title="Neu" size="m" testID="sheet">
        <TextField label="Titel" autoFocus testID="title" />
      </Sheet>,
    );
    expect(blur).toHaveBeenCalled();
    expect(document.activeElement).not.toBe(title);
  });

  it('AC-010: the keyboard gone, the window is at the bottom edge at once and the page at the top', () => {
    setWindow(390, 844);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    openSheet();
    report(464);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 180 });
    report(undefined);
    expect(layer()).toBe('0px');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    scrollTo.mockRestore();
  });
});

describe('Sheet keeps the page behind still (spec 0033, REQ-004)', () => {
  it('AC-011: what scrolls the page while the window is open is undone; closed, the page is free', async () => {
    setWindow(390, 844);
    const root = document.createElement('div');
    root.id = 'root';
    const page = document.createElement('div');
    page.style.overflowY = 'auto';
    Object.defineProperty(page, 'clientHeight', { configurable: true, value: 700 });
    Object.defineProperty(page, 'scrollHeight', { configurable: true, value: 2000 });
    root.append(page);
    document.body.append(root);
    page.scrollTop = 480;
    const sheet = (visible: boolean) => (
      <Sheet visible={visible} onClose={() => undefined} title="Neue Zutat" size="m">
        <Text>Inhalt</Text>
      </Sheet>
    );
    const { rerender } = render(sheet(true));
    page.scrollTop = 0;
    page.dispatchEvent(new Event('scroll'));
    expect(page.scrollTop).toBe(480);
    vi.useFakeTimers();
    try {
      act(() => rerender(sheet(false)));
      act(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }
    // The lock lets go right after the commit that closed the window.
    await Promise.resolve();
    page.scrollTop = 100;
    page.dispatchEvent(new Event('scroll'));
    expect(page.scrollTop).toBe(100);
    root.remove();
  });
});

describe('Toast clear of the page buttons (spec 0033, REQ-009)', () => {
  function RecipeButtons() {
    const ref = useRef<HostInstance>(null);
    useToastAvoid(ref);
    return <View ref={ref} testID="buttons" />;
  }
  const bottomOf = () => (screen.getByTestId('toast').parentElement as HTMLElement).style.bottom;

  it('AC-025: "Foto gespeichert" stands above "Einplanen" and "Auf die Liste"', () => {
    setWindow(390, 844);
    render(
      <>
        <RecipeButtons />
        <ToastHost />
      </>,
    );
    stubRect(screen.getByTestId('buttons'), { top: 717, height: 46 });
    act(() => toast.show({ message: 'Foto gespeichert' }));
    expect(bottomOf()).toBe(`${844 - 717 + 12}px`);
  });

  it('shown while leaving a page, it moves off the bar of the page it lands on once that is in (iPhone click-through)', () => {
    vi.useFakeTimers();
    try {
      setWindow(390, 844);
      render(
        <>
          <RecipeButtons />
          <ToastHost />
        </>,
      );
      // Still hidden behind the page that closes.
      stubRect(screen.getByTestId('buttons'), { top: 717, height: 0 });
      act(() => toast.show({ message: '1 gekauft · 13 bleiben' }));
      act(() => vi.advanceTimersByTime(20));
      expect(bottomOf()).toBe('74px');
      stubRect(screen.getByTestId('buttons'), { top: 717, height: 46 });
      act(() => vi.advanceTimersByTime(400));
      expect(bottomOf()).toBe(`${844 - 717 + 12}px`);
    } finally {
      act(() => vi.runOnlyPendingTimers());
      vi.useRealTimers();
    }
  });

  it('buttons elsewhere: the toast keeps its place above the tab bar', () => {
    setWindow(390, 844);
    render(
      <>
        <RecipeButtons />
        <ToastHost />
      </>,
    );
    stubRect(screen.getByTestId('buttons'), { top: 300, height: 46 });
    act(() => toast.show({ message: 'Foto gespeichert' }));
    expect(bottomOf()).toBe('74px');
  });

  it('AC-025: above the buttons it would cover the rating stars: it stands at the top (decision 12)', () => {
    setWindow(390, 844);
    render(
      <>
        <RecipeButtons />
        <View accessibilityRole="button" accessibilityLabel="4 Sterne" testID="stars" />
        <ToastHost />
      </>,
    );
    stubRect(screen.getByTestId('buttons'), { top: 717, height: 46 });
    stubRect(screen.getByTestId('stars'), { top: 660, height: 30 });
    act(() => toast.show({ message: 'Foto gespeichert' }));
    const layer = screen.getByTestId('toast').parentElement as HTMLElement;
    expect(layer.style.bottom).toBe('');
    expect(layer.style.top).toBe('8px');
  });
});
