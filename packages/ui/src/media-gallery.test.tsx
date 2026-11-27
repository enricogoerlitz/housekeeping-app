import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaGallery } from './media-gallery';
import { Text } from './primitives';

const labels = {
  previous: 'Vorheriges',
  next: 'Nächstes',
  position: (page: number, count: number) => `${page} von ${count}`,
};

const pages = (count: number) =>
  Array.from({ length: count }, (_, n) => <Text key={n}>{`Seite ${n + 1}`}</Text>);

function mouse(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches }));
}

afterEach(() => vi.unstubAllGlobals());

describe('MediaGallery (spec 0046, REQ-003)', () => {
  it('AC-009: three pages show three dots, the first active', () => {
    render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {pages(3)}
      </MediaGallery>,
    );
    expect(screen.getByText('Seite 1')).toBeTruthy();
    expect(screen.getByLabelText('1 von 3')).toBeTruthy();
    expect(screen.getByTestId('gallery-dot-0').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('gallery-dot-1').getAttribute('data-active')).toBe('false');
  });

  it('AC-009: with a mouse "Nächstes" turns to the next page; no arrow past the ends', () => {
    mouse(true);
    const onIndexChange = vi.fn();
    render(
      <MediaGallery
        aspectRatio={4 / 3}
        labels={labels}
        onIndexChange={onIndexChange}
        testID="gallery"
      >
        {pages(2)}
      </MediaGallery>,
    );
    expect(screen.queryByRole('button', { name: 'Vorheriges' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nächstes' }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByLabelText('2 von 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nächstes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vorheriges' }));
    expect(screen.getByLabelText('1 von 2')).toBeTruthy();
  });

  it('AC-009: the arrow keys turn the pages', () => {
    render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {pages(3)}
      </MediaGallery>,
    );
    const gallery = screen.getByTestId('gallery');
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    expect(screen.getByLabelText('3 von 3')).toBeTruthy();
    fireEvent.keyDown(gallery, { key: 'ArrowLeft' });
    expect(screen.getByLabelText('2 von 3')).toBeTruthy();
  });

  it('AC-009: on a touch screen there are no arrows (the finger swipes)', () => {
    mouse(false);
    render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {pages(3)}
      </MediaGallery>,
    );
    expect(screen.queryByRole('button', { name: 'Nächstes' })).toBeNull();
  });

  it('AC-010, AC-011: a single page is shown as it is, without dots or arrows', () => {
    mouse(true);
    render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {pages(1)}
      </MediaGallery>,
    );
    expect(screen.getByText('Seite 1')).toBeTruthy();
    expect(screen.queryByTestId('gallery-dots')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nächstes' })).toBeNull();
  });

  it('AC-017: when a page goes away the gallery stays on a page that exists', () => {
    const { rerender } = render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {pages(3)}
      </MediaGallery>,
    );
    const gallery = screen.getByTestId('gallery');
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    fireEvent.keyDown(gallery, { key: 'ArrowRight' });
    rerender(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {pages(2)}
      </MediaGallery>,
    );
    expect(screen.getByLabelText('2 von 2')).toBeTruthy();
  });
});

// react-native-web measures a view (onLayout) only if it has an onLayout when it mounts: it starts
// observing it with the ResizeObserver then and never later. `resize` reports a new size.
const observed = new Set<Element>();
let resize: ((entries: { target: Element }[]) => void) | undefined;
class FakeResizeObserver {
  constructor(callback: (entries: { target: Element }[]) => void) {
    resize = callback;
  }
  observe(node: Element) {
    observed.add(node);
  }
  unobserve(node: Element) {
    observed.delete(node);
  }
  disconnect() {
    observed.clear();
  }
}

const keyed = (keys: readonly string[]) =>
  keys.map((key) => <Text key={key}>{`Seite ${key}`}</Text>);

/** Lays the gallery out 400 px wide (react-native-web measures offsetWidth after a tick). */
async function layOut(frame: HTMLElement): Promise<void> {
  Object.defineProperty(frame, 'offsetWidth', { configurable: true, value: 400 });
  Object.defineProperty(frame, 'offsetHeight', { configurable: true, value: 300 });
  await act(async () => {
    resize?.([{ target: frame }]);
    await new Promise((done) => setTimeout(done, 0));
  });
}

/** The browser scrolls the frame to `left`, as Safari does when it restores a page. */
function scrollTo(frame: HTMLElement, left: number): void {
  const scroller = frame.firstElementChild as HTMLElement;
  scroller.scrollLeft = left;
  fireEvent.scroll(scroller);
}

describe('MediaGallery, findings from production (spec 0046, 27.11.)', () => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);

  it('AC-020: a video added to the single photo keeps the frame measured, so the pages get their width', () => {
    const { rerender } = render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {keyed(['photo'])}
      </MediaGallery>,
    );
    rerender(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {keyed(['photo', 'video-1'])}
      </MediaGallery>,
    );
    expect(screen.getByLabelText('1 von 2')).toBeTruthy();
    expect(observed.has(screen.getByTestId('gallery'))).toBe(true);
  });

  it('AC-021: a scroll the person did not make (Safari restoring the page) leaves the gallery on the photo', async () => {
    render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {keyed(['photo', 'video-1', 'video-2'])}
      </MediaGallery>,
    );
    const frame = screen.getByTestId('gallery');
    await layOut(frame);
    scrollTo(frame, 800);
    expect(screen.getByLabelText('1 von 3')).toBeTruthy();
    expect((frame.firstElementChild as HTMLElement).scrollLeft).toBe(0);
  });

  it('AC-021: a swipe of the person turns the page', async () => {
    render(
      <MediaGallery aspectRatio={4 / 3} labels={labels} testID="gallery">
        {keyed(['photo', 'video-1', 'video-2'])}
      </MediaGallery>,
    );
    const frame = screen.getByTestId('gallery');
    await layOut(frame);
    const touch = { identifier: 1, force: 1, clientX: 300, clientY: 100, pageX: 300, pageY: 100 };
    fireEvent.touchStart(frame, { touches: [touch], changedTouches: [touch] });
    scrollTo(frame, 800);
    expect(screen.getByLabelText('3 von 3')).toBeTruthy();
  });
});
