import { fireEvent, render, screen } from '@testing-library/react';
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
