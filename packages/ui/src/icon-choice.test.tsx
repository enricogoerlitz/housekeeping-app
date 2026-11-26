import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IconChoice } from './icon-choice';

const OPTIONS = [
  { name: 'mountain', label: 'Berg' },
  { name: 'cake', label: 'Torte' },
  { name: 'bath', label: 'Wellness' },
] as const;

describe('IconChoice (spec 0041, REQ-002)', () => {
  it('a radio group named by its label: every symbol by its word, the chosen one checked', () => {
    render(
      <IconChoice label="Symbol" options={[...OPTIONS]} value="cake" onChange={() => undefined} />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Symbol' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Berg',
      'Torte',
      'Wellness',
    ]);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('a tap chooses the symbol; without a value nothing is checked', () => {
    const onChange = vi.fn();
    render(<IconChoice label="Symbol" options={[...OPTIONS]} onChange={onChange} testID="icon" />);
    expect(
      screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
    fireEvent.click(screen.getByTestId('icon-bath'));
    expect(onChange).toHaveBeenCalledWith('bath');
  });

  it('disabled: nothing can be chosen', () => {
    const onChange = vi.fn();
    render(
      <IconChoice
        label="Symbol"
        options={[...OPTIONS]}
        onChange={onChange}
        disabled
        testID="icon"
      />,
    );
    fireEvent.click(screen.getByTestId('icon-cake'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
