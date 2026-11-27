import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PhotoViewer, ViewerPhoto } from './photo-viewer';
import { Text } from './primitives';
import { ThemeProvider } from './theme-context';
import { getTheme } from './themes';

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('PhotoViewer (spec 0036, REQ-009)', () => {
  it('AC-016: shows the photo on the whole screen; ✕ closes it', () => {
    const onClose = vi.fn();
    render(
      <PhotoViewer
        sources={[{ uri: 'blob:amrit' }]}
        alt="AMRIT"
        closeLabel="Schließen"
        onClose={onClose}
        testID="viewer"
      />,
    );
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect(screen.getByLabelText('AMRIT')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['light', 'dark'] as const)(
    'AC-016: the photo stands on a dark stage with a light ✕ in %s mode',
    (mode) => {
      render(
        <ThemeProvider themeId="markthalle" mode={mode}>
          <PhotoViewer
            sources={[{ uri: 'blob:amrit' }]}
            closeLabel="Schließen"
            onClose={() => {}}
            testID="viewer"
          />
        </ThemeProvider>,
      );
      const dark = getTheme('markthalle', 'dark').colors;
      expect(screen.getByTestId('viewer').style.backgroundColor).toBe(rgb(dark.bg));
      const close = screen.getByRole('button', { name: 'Schließen' });
      expect(close.querySelector('svg')?.getAttribute('stroke')).toBe(dark.text);
    },
  );

  it('AC-016: Escape closes it', () => {
    const onClose = vi.fn();
    render(
      <PhotoViewer sources={[{ uri: 'blob:amrit' }]} closeLabel="Schließen" onClose={onClose} />,
    );
    // react-native-web's Modal calls onRequestClose on Escape (keyup).
    fireEvent.keyUp(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PhotoViewer with pages: the photo and the videos (spec 0056, REQ-003)', () => {
  const labels = {
    previous: 'Vorheriges',
    next: 'Nächstes',
    position: (page: number, count: number) => `${page} von ${count}`,
  };
  const pages = [
    <ViewerPhoto key="photo" sources={[{ uri: 'blob:curry' }]} alt="Mango-Curry" />,
    <Text key="v1">Video 1</Text>,
    <Text key="v2">Video 2</Text>,
  ];
  afterEach(() => vi.unstubAllGlobals());

  it('AC-010: the photo first, three dots; the arrow key turns to "Video 1"', () => {
    const onIndexChange = vi.fn();
    render(
      <PhotoViewer
        sources={[]}
        closeLabel="Schließen"
        onClose={() => {}}
        pages={{ content: pages, labels, onIndexChange }}
        testID="viewer"
      />,
    );
    expect(screen.getByLabelText('Mango-Curry')).toBeTruthy();
    expect(screen.getByLabelText('1 von 3')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('viewer-pages'), { key: 'ArrowRight' });
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByLabelText('2 von 3')).toBeTruthy();
  });

  it('AC-013: it opens on the page it is given', () => {
    render(
      <PhotoViewer
        sources={[]}
        closeLabel="Schließen"
        onClose={() => {}}
        pages={{ content: pages, labels, initialIndex: 2 }}
        testID="viewer"
      />,
    );
    expect(screen.getByLabelText('3 von 3')).toBeTruthy();
    expect(screen.getByTestId('viewer-pages-dot-2').getAttribute('data-active')).toBe('true');
  });

  it('AC-012: with a mouse there is no arrow right on the last page', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(
      <PhotoViewer
        sources={[]}
        closeLabel="Schließen"
        onClose={() => {}}
        pages={{ content: pages, labels, initialIndex: 1 }}
        testID="viewer"
      />,
    );
    // With a mouse ← and → work at once: the pages have the focus.
    expect(document.activeElement).toBe(screen.getByTestId('viewer-pages'));
    fireEvent.click(screen.getByRole('button', { name: 'Nächstes' }));
    expect(screen.getByLabelText('3 von 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nächstes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vorheriges' }));
    expect(screen.getByLabelText('2 von 3')).toBeTruthy();
  });

  it('AC-015: a single page shows without dots and arrows', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(
      <PhotoViewer
        sources={[]}
        closeLabel="Schließen"
        onClose={() => {}}
        pages={{ content: [pages[0]], labels }}
        testID="viewer"
      />,
    );
    expect(screen.getByLabelText('Mango-Curry')).toBeTruthy();
    expect(screen.queryByTestId('viewer-pages-dots')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nächstes' })).toBeNull();
  });
});
