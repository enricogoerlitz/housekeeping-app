import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InfoHint } from './info-hint';

describe('InfoHint (spec 0036, REQ-006)', () => {
  it('AC-013: (i) folds the explanation open and closed and says whether it is open', () => {
    render(
      <InfoHint label="Welche Einheiten?" testID="units">
        g, kg, ml, l … Beispiel: 400 ml
      </InfoHint>,
    );
    const toggle = screen.getByRole('button', { name: 'Welche Einheiten?' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Beispiel: 400 ml/)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('units-text').textContent).toContain('Beispiel: 400 ml');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('units-text')).toBeNull();
  });
});
