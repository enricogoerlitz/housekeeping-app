import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewSwitch } from './view-switch';

const VIEWS = [
  { value: 'tiles', label: 'Kacheln', icon: 'layout-grid' },
  { value: 'list', label: 'Liste', icon: 'list' },
] as const;

describe('ViewSwitch (spec 0038, decision 1)', () => {
  it('a radio group named by its label; the symbols are named "Kacheln" and "Liste"', () => {
    render(<ViewSwitch options={VIEWS} value="list" onChange={() => undefined} label="Ansicht" />);
    const group = screen.getByRole('radiogroup', { name: 'Ansicht' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Kacheln', 'Liste']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('pressing the other symbol chooses it; the chosen one does not report again', () => {
    const onChange = vi.fn();
    render(
      <ViewSwitch options={VIEWS} value="tiles" onChange={onChange} label="Ansicht" testID="v" />,
    );
    fireEvent.click(screen.getByTestId('v-list'));
    expect(onChange).toHaveBeenCalledWith('list');
    fireEvent.click(screen.getByTestId('v-tiles'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
