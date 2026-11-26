import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoViewer } from './photo-viewer';

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
