import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoViewer } from './photo-viewer';
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
