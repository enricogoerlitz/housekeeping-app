import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useContext } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reducedMotion } from '../test/mocks/reanimated';
import { safeArea } from '../test/mocks/safe-area';
import { Button } from './controls';
import { Text } from './primitives';
import { Sheet, ToastHost, toast, useToastClearance } from './overlay';
import { PageScrollContext, PageScrollControlContext, Screen } from './shell';

/** The window size react-native-web reads (jsdom reports 0 × 0, a phone). */
function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(async () => {
  setWindow(0, 0);
  // A window still open when a test ends leaves its fading copy (sheet-exit.web.ts).
  cleanup();
  await Promise.resolve();
  document.body.querySelectorAll('[data-sheet-exit]').forEach((copy) => copy.remove());
});

describe('Sheet (AC-029)', () => {
  it('a modal window named by its title, with "Schließen"', () => {
    const onClose = vi.fn();
    render(
      <Sheet visible onClose={onClose} title="Einplanen" size="m" testID="sheet">
        <Text>Inhalt</Text>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { name: 'Einplanen' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closed: not shown; after closing it is gone once faded out', () => {
    const { rerender } = render(
      <Sheet visible={false} onClose={() => undefined} title="Einplanen" size="s" />,
    );
    expect(screen.queryByRole('heading', { name: 'Einplanen' })).toBeNull();
    rerender(<Sheet visible onClose={() => undefined} title="Einplanen" size="s" />);
    expect(screen.getByRole('heading', { name: 'Einplanen' })).toBeTruthy();
    act(() => {
      rerender(<Sheet visible={false} onClose={() => undefined} title="Einplanen" size="s" />);
    });
    expect(screen.queryByRole('heading', { name: 'Einplanen' })).toBeNull();
  });
});

describe('Sheet leaving with its page (spec 0029, REQ-001)', () => {
  const exitCopy = () => document.body.querySelector('[data-sheet-exit]');

  it('removed while open: an inert copy fades out over it and then goes', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <Sheet visible onClose={() => undefined} title="Einplanen" size="m" testID="sheet">
          <Text>Inhalt</Text>
        </Sheet>,
      );
      unmount();
      await Promise.resolve();
      const copy = exitCopy();
      expect(copy).not.toBeNull();
      expect(copy?.hasAttribute('inert')).toBe(true);
      expect(copy?.querySelector('[data-testid="sheet"]')).not.toBeNull();
      expect(copy?.querySelector('[id]')).toBeNull();
      // Not a window any more: Escape and focus traps look for [aria-modal].
      expect(copy?.querySelector('[aria-modal]')).toBeNull();
      expect(copy?.querySelector('[role="dialog"]')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(exitCopy()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closed before it is removed: no copy, it has faded out already', async () => {
    const { rerender, unmount } = render(
      <Sheet visible onClose={() => undefined} title="Einplanen" size="m" />,
    );
    act(() => {
      rerender(<Sheet visible={false} onClose={() => undefined} title="Einplanen" size="m" />);
    });
    unmount();
    await Promise.resolve();
    expect(exitCopy()).toBeNull();
  });
});

describe('Sheet sizes and layout (spec 0005, REQ-003)', () => {
  const sheet = (size: 's' | 'm' | 'l') => (
    <Sheet visible onClose={() => undefined} title="Einplanen" size={size} testID="sheet">
      <Text>Inhalt</Text>
    </Sheet>
  );

  it('wider screens: a centred window of fixed size; s follows its content', () => {
    setWindow(1280, 800);
    const { rerender } = render(sheet('m'));
    const window = screen.getByTestId('sheet');
    expect(window.style.width).toBe('560px');
    expect(window.style.height).toBe('640px');
    rerender(sheet('l'));
    expect(screen.getByTestId('sheet').style.width).toBe('760px');
    expect(screen.getByTestId('sheet').style.height).toBe('680px');
    rerender(sheet('s'));
    expect(screen.getByTestId('sheet').style.width).toBe('440px');
    expect(screen.getByTestId('sheet').style.height).toBe('');
  });

  it('phones: a sheet from below over the full width; m and l keep their height', () => {
    setWindow(390, 844);
    const { rerender } = render(sheet('m'));
    expect(screen.getByTestId('sheet').style.width).toBe('');
    expect(screen.getByTestId('sheet').style.height).toBe('760px');
    rerender(sheet('s'));
    expect(screen.getByTestId('sheet').style.height).toBe('');
    expect(screen.getByTestId('sheet').style.maxHeight).toBe('422px');
  });

  it('spec 0029, AC-007: on phones the sheet ends above the home bar with its gap', () => {
    setWindow(390, 844);
    const { rerender } = render(sheet('m'));
    expect(screen.getByTestId('sheet').style.paddingBottom).toBe('12px');
    safeArea.insets = { top: 47, right: 0, bottom: 34, left: 0 };
    rerender(sheet('l'));
    expect(screen.getByTestId('sheet').style.paddingBottom).toBe('42px');
  });

  it('with reduced motion the sheet opens and closes all the same', () => {
    reducedMotion.value = true;
    setWindow(390, 844);
    const { rerender } = render(sheet('s'));
    expect(screen.getByRole('heading', { name: 'Einplanen' })).toBeTruthy();
    act(() => {
      rerender(
        <Sheet visible={false} onClose={() => undefined} title="Einplanen" size="s">
          <Text>Inhalt</Text>
        </Sheet>,
      );
    });
    expect(screen.queryByRole('heading', { name: 'Einplanen' })).toBeNull();
  });

  it('header above and footer below the scrolling middle', () => {
    const onSave = vi.fn();
    render(
      <Sheet
        visible
        onClose={() => undefined}
        title="Rezept wählen"
        size="l"
        header={<Text>Suche</Text>}
        footer={<Button label="Übernehmen" onPress={onSave} />}
      >
        <Text>Lasagne</Text>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    const order = ['Rezept wählen', 'Suche', 'Lasagne', 'Übernehmen'].map((text) =>
      within(dialog).getByText(text),
    );
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it on the web', () => {
    const onClose = vi.fn();
    render(
      <Sheet visible onClose={onClose} title="Einplanen" size="s">
        <Text>Inhalt</Text>
      </Sheet>,
    );
    act(() => {
      fireEvent.keyUp(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a drag inside the sheet does not reach the page behind it', () => {
    let seen: { page: unknown; control: unknown } | undefined;
    function Probe() {
      seen = {
        page: useContext(PageScrollContext),
        control: useContext(PageScrollControlContext),
      };
      return null;
    }
    render(
      <Screen scroll={false}>
        <Sheet visible onClose={() => undefined} title="Einplanen" size="m">
          <Probe />
        </Sheet>
      </Screen>,
    );
    expect(seen).toEqual({ page: undefined, control: undefined });
  });
});

describe('Toast with "Rückgängig" (spec 0005; spec 0019, AC-024)', () => {
  afterEach(() => {
    act(() => toast.hide());
    vi.useRealTimers();
  });

  const bottomOf = () => screen.getByTestId('toast').parentElement!.style.bottom;

  it('nothing to show: no toast', () => {
    render(<ToastHost />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stands in its own layer on the page, so an open window (Modal) never covers it', () => {
    const { container } = render(<ToastHost />);
    act(() => toast.show({ message: 'Gespeichert', actionLabel: 'Rückgängig', onAction: vi.fn() }));
    const alert = screen.getByRole('alert');
    expect(container.contains(alert)).toBe(false);
    expect(alert.closest('body')).toBe(document.body);
    act(() => toast.hide());
  });

  it('shows the message as an alert, without action when none is given', () => {
    render(<ToastHost />);
    act(() => toast.show({ message: 'Gespeichert' }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Gespeichert')).toBeTruthy();
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('"Rückgängig" runs the action once and hides the toast; it does not expire', () => {
    const onAction = vi.fn();
    const onExpire = vi.fn();
    render(<ToastHost />);
    act(() =>
      toast.show({ message: 'Rezept gelöscht', actionLabel: 'Rückgängig', onAction, onExpire }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => toast.hide());
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('ends after five seconds; then the action is out of reach', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<ToastHost />);
    act(() => toast.show({ message: 'Rezept gelöscht', actionLabel: 'Rückgängig', onExpire }));
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('a new toast replaces the previous one, which expires', () => {
    const onExpire = vi.fn();
    render(<ToastHost />);
    act(() => toast.show({ message: 'Erster', onExpire }));
    act(() => toast.show({ message: 'Zweiter' }));
    expect(screen.queryByText('Erster')).toBeNull();
    expect(screen.getByText('Zweiter')).toBeTruthy();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('hide ends it without its action', () => {
    const onAction = vi.fn();
    const onExpire = vi.fn();
    render(<ToastHost />);
    act(() => toast.show({ message: 'Gelöscht', actionLabel: 'Rückgängig', onAction, onExpire }));
    act(() => toast.hide());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('AC-024: on phones it stands above the tab bar and the home bar', () => {
    setWindow(390, 844);
    const { rerender } = render(<ToastHost />);
    act(() => toast.show({ message: 'Gespeichert' }));
    // Tab bar 62 + gap 12.
    expect(bottomOf()).toBe('74px');
    safeArea.insets = { top: 47, right: 0, bottom: 34, left: 0 };
    rerender(<ToastHost />);
    // Safe area 34 + home bar gap 8 + tab bar 62 + gap 12.
    expect(bottomOf()).toBe('116px');
  });

  it('wider screens: near the bottom edge, there is no tab bar', () => {
    setWindow(1280, 800);
    render(<ToastHost />);
    act(() => toast.show({ message: 'Gespeichert' }));
    expect(bottomOf()).toBe('24px');
  });

  it('AC-024: a page with its own bottom bar keeps the toast above it while shown', () => {
    setWindow(390, 844);
    function StoreMode(props: { bar?: number }) {
      useToastClearance(props.bar);
      return null;
    }
    const { rerender } = render(
      <>
        <StoreMode bar={80} />
        <ToastHost />
      </>,
    );
    act(() => toast.show({ message: 'Abgehakt' }));
    expect(bottomOf()).toBe('92px');
    rerender(
      <>
        <StoreMode />
        <ToastHost />
      </>,
    );
    expect(bottomOf()).toBe('74px');
  });
});
