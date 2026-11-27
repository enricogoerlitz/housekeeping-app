// Spec 0062 "Rezept anlegen und mit KI ändern": the ways under the one field (REQ-001, REQ-002).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PathButtons, type PathButtonOption } from './path-buttons';
import { getTheme } from './themes';

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const colors = getTheme('markthalle', 'light').colors;

type Path = 'create' | 'web' | 'ai';
const OPTIONS: PathButtonOption<Path>[] = [
  { value: 'create', label: 'Anlegen', icon: 'plus' },
  { value: 'web', label: 'Websuche', icon: 'globe' },
  { value: 'ai', label: 'KI-Rezept', icon: 'sparkles' },
];

describe('PathButtons (spec 0062, REQ-001, REQ-002)', () => {
  it('AC-001: the three ways stand side by side and are disabled while there is no text', () => {
    const onPress = vi.fn();
    render(<PathButtons options={OPTIONS} onPress={onPress} disabled testID="new-recipe-path" />);
    for (const name of ['Anlegen', 'Websuche', 'KI-Rezept']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
    }
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-recipe-path-web')).toBeTruthy();
  });

  it('AC-002: offline every way says why', () => {
    render(
      <PathButtons options={OPTIONS} onPress={() => undefined} disabled hint="Offline – später" />,
    );
    expect(screen.getByRole('button', { name: 'Websuche' }).getAttribute('aria-description')).toBe(
      'Offline – später',
    );
  });

  it('AC-003: the suggested way is filled with the accent, the others are not', () => {
    render(
      <PathButtons
        options={OPTIONS}
        highlighted="web"
        highlightHint="Vorgeschlagen – Eingabetaste"
        onPress={() => undefined}
        testID="new-recipe-path"
      />,
    );
    expect(getComputedStyle(screen.getByTestId('new-recipe-path-web')).backgroundColor).toBe(
      rgb(colors.accent),
    );
    expect(getComputedStyle(screen.getByTestId('new-recipe-path-ai')).backgroundColor).not.toBe(
      rgb(colors.accent),
    );
    expect(screen.getByRole('button', { name: 'Websuche' }).getAttribute('aria-description')).toBe(
      'Vorgeschlagen – Eingabetaste',
    );
  });

  it('a tap takes the way tapped, whichever is highlighted', () => {
    const onPress = vi.fn();
    render(<PathButtons options={OPTIONS} highlighted="web" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'KI-Rezept' }));
    expect(onPress).toHaveBeenCalledWith('ai');
  });
});
