import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Text } from './primitives';
import { FilterBar, type FilterBarProps } from './filter-bar';

/** The window width react-native-web reads (jsdom has none, i.e. a phone). */
function setWindowWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => setWindowWidth(0));

function renderBar(props: Partial<FilterBarProps> = {}) {
  const onReset = vi.fn();
  render(
    <FilterBar
      search={<Text>Suchfeld</Text>}
      filterLabel="Filter"
      activeCount={0}
      sort={<Text>Sortierung</Text>}
      chips={<Text>Vegan</Text>}
      panel={<Text>Alle Filterfelder</Text>}
      panelTitle="Rezepte filtern"
      resetLabel="Zurücksetzen"
      onReset={onReset}
      applyLabel="8 Rezepte zeigen"
      collapseLabel="Einklappen"
      testID="bar"
      {...props}
    />,
  );
  return { onReset, filter: screen.getByTestId('bar-filter') };
}

describe('FilterBar (spec 0005, REQ-007)', () => {
  it('shows search, filter button, sort and chips; the panel stays closed', () => {
    const { filter } = renderBar();
    expect(screen.getByText('Suchfeld')).toBeTruthy();
    expect(screen.getByText('Sortierung')).toBeTruthy();
    expect(screen.getByText('Vegan')).toBeTruthy();
    expect(filter).toBe(screen.getByRole('button', { name: 'Filter' }));
    expect(filter.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Alle Filterfelder')).toBeNull();
  });

  it('the filter button is highlighted while a filter is on', () => {
    const { filter } = renderBar({ filterLabel: 'Filter (1)', activeCount: 1 });
    expect(filter).toBe(screen.getByRole('button', { name: 'Filter (1)' }));
    expect(filter.getAttribute('aria-pressed')).toBe('true');
  });

  it('phone: the panel is a window; its button only closes it, reset resets', () => {
    const { filter, onReset } = renderBar();
    fireEvent.click(filter);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Rezepte filtern' })).toBeTruthy();
    expect(within(dialog).getByText('Alle Filterfelder')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: '8 Rezepte zeigen' }));
    });
    expect(screen.queryByText('Alle Filterfelder')).toBeNull();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('phone: closing the window closes the panel', () => {
    const { filter } = renderBar();
    fireEvent.click(filter);
    act(() => {
      fireEvent.click(screen.getByTestId('bar-panel-close'));
    });
    expect(screen.queryByText('Alle Filterfelder')).toBeNull();
  });

  describe('wide screens', () => {
    it('the panel unfolds below the row, no window; "Einklappen" folds it', () => {
      setWindowWidth(1200);
      const { filter, onReset } = renderBar();
      fireEvent.click(filter);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(within(screen.getByTestId('bar-panel')).getByText('Alle Filterfelder')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
      expect(onReset).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Einklappen' }));
      expect(screen.queryByTestId('bar-panel')).toBeNull();
    });

    it('the filter button toggles the panel', () => {
      setWindowWidth(1200);
      const { filter } = renderBar();
      fireEvent.click(filter);
      expect(screen.getByTestId('bar-panel')).toBeTruthy();
      fireEvent.click(filter);
      expect(screen.queryByTestId('bar-panel')).toBeNull();
    });

    it('Escape folds the unfolded panel (spec 0008, platforms); other keys do not', () => {
      setWindowWidth(1200);
      const { filter } = renderBar();
      fireEvent.click(filter);
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(screen.getByTestId('bar-panel')).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('bar-panel')).toBeNull();
    });
  });
});
