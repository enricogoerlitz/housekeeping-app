// Spec 0054 "Einheitliche Bedienmuster": one way to create something on every page (REQ-001)
// and text buttons without the accent for leaving or removing (REQ-008).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './controls';
import { CreateButton } from './create-button';
import { getTheme } from './themes';

function setWidth(width: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 844 });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const colors = getTheme('markthalle', 'light').colors;

afterEach(() => setWidth(1024));

describe('CreateButton (spec 0054, REQ-001)', () => {
  it('AC-001: on a phone a "+" named after what it creates, without visible text', () => {
    setWidth(390);
    const onPress = vi.fn();
    render(<CreateButton label="Rezept anlegen" onPress={onPress} testID="recipe-new" />);
    const button = screen.getByRole('button', { name: 'Rezept anlegen' });
    expect(screen.queryByText('Rezept anlegen')).toBeNull();
    expect(button.querySelector('svg')).toBeTruthy();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('AC-002: on a desktop a filled button with "+" and the text', () => {
    setWidth(1440);
    render(<CreateButton label="Rezept anlegen" onPress={() => undefined} testID="recipe-new" />);
    const button = screen.getByTestId('recipe-new');
    expect(screen.getByText('Rezept anlegen')).toBeTruthy();
    expect(button.querySelector('svg')).toBeTruthy();
    expect(getComputedStyle(button).backgroundColor).toBe(rgb(colors.accent));
  });

  it('AC-003: offline it does nothing and says why', () => {
    for (const width of [390, 1440]) {
      setWidth(width);
      const onPress = vi.fn();
      const { unmount } = render(
        <CreateButton label="Reise eintragen" onPress={onPress} disabled hint="Offline – später" />,
      );
      const button = screen.getByRole('button', { name: 'Reise eintragen' });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-description')).toBe('Offline – später');
      fireEvent.click(button);
      expect(onPress).not.toHaveBeenCalled();
      unmount();
    }
  });
});

describe('Button quiet (spec 0054, REQ-008)', () => {
  it('AC-021: a quiet text button is in ink, a plain one in the accent', () => {
    render(
      <>
        <Button label="Verlassen" variant="link" quiet />
        <Button label="Wechseln" variant="link" />
      </>,
    );
    expect(screen.getByText('Verlassen').style.color).toBe(rgb(colors.text));
    expect(screen.getByText('Wechseln').style.color).toBe(rgb(colors.accent));
  });
});
