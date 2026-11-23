import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChoiceChips, Menu, ViewTabs, type MenuOption } from './choice';

const TABS = [
  { value: 'a', label: 'Alle' },
  { value: 'b', label: 'Favoriten' },
  { value: 'c', label: 'Zuletzt' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

// react-native-web reports `onLayout` through a ResizeObserver, which jsdom lacks: this one lets a
// test say when the observed views changed size. The element sizes come from `offset*`.
const observed = new Set<Element>();
let notify: ((entries: { target: Element }[]) => void) | undefined;
class TestResizeObserver {
  constructor(callback: (entries: { target: Element }[]) => void) {
    notify = callback;
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
Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: TestResizeObserver });

function setBox(node: Element, box: { left?: number; width?: number }) {
  Object.defineProperty(node, 'offsetLeft', { configurable: true, value: box.left ?? 0 });
  Object.defineProperty(node, 'offsetWidth', { configurable: true, value: box.width ?? 0 });
}

/** Reports the layout of every observed view; the measurements arrive on a timer. */
function layoutAll() {
  act(() => {
    notify?.([...observed].map((target) => ({ target })));
    vi.runAllTimers();
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ViewTabs (spec 0005, D1)', () => {
  it('a tab list named by its label; the active tab is selected and takes the Tab key', () => {
    render(<ViewTabs options={[...TABS]} value="b" onChange={() => undefined} label="Ansicht" />);
    const list = screen.getByRole('tablist', { name: 'Ansicht' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('a tap on a tab chooses it', () => {
    const onChange = vi.fn();
    render(
      <ViewTabs options={[...TABS]} value="a" onChange={onChange} label="Ansicht" testID="v" />,
    );
    fireEvent.click(screen.getByTestId('v-c'));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('arrow keys move and wrap, Home and End jump, and the focus follows', () => {
    const onChange = vi.fn();
    render(
      <ViewTabs<TabValue> options={[...TABS]} value="a" onChange={onChange} label="Ansicht" />,
    );
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Favoriten' }));
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Zuletzt' }));
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange.mock.calls).toEqual([['b'], ['c'], ['c'], ['a']]);
  });

  it('AC-024: a chosen tab that is cut off scrolls into view, a visible one does not', () => {
    vi.useFakeTimers();
    const options = [...TABS, { value: 'd', label: 'Archiv' } as const];
    const { rerender } = render(
      <ViewTabs
        options={options}
        value="a"
        onChange={() => undefined}
        label="Ansicht"
        testID="v"
      />,
    );
    const list = screen.getByRole('tablist');
    const scroller = list.parentElement?.parentElement as HTMLElement;
    const scroll = vi.fn();
    Object.defineProperty(scroller, 'scroll', { configurable: true, value: scroll });
    setBox(scroller, { width: 200 });
    options.forEach((option, index) => {
      setBox(screen.getByTestId(`v-${option.value}`), { left: index * 100, width: 80 });
    });
    layoutAll();
    expect(scroll).not.toHaveBeenCalled();

    // "Archiv" spans 300–380 in a 200 wide viewport: scroll so it ends 16 before the edge.
    rerender(
      <ViewTabs
        options={options}
        value="d"
        onChange={() => undefined}
        label="Ansicht"
        testID="v"
      />,
    );
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, left: 196, behavior: 'smooth' });

    // Scrolled to 196, "Alle" (0–80) is cut off on the left.
    Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 196 });
    fireEvent.scroll(scroller);
    rerender(
      <ViewTabs
        options={options}
        value="a"
        onChange={() => undefined}
        label="Ansicht"
        testID="v"
      />,
    );
    expect(scroll).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'smooth' });
  });
});

describe('ChoiceChips', () => {
  const MEALS = [
    { value: 'mittag', label: 'Mittag' },
    { value: 'abend', label: 'Abend', detail: '18 Uhr' },
  ];

  it('a radio group named by its label: exactly the chosen chip is checked', () => {
    const onChange = vi.fn();
    render(
      <ChoiceChips
        options={MEALS}
        value="mittag"
        onChange={onChange}
        label="Mahlzeit"
        testID="m"
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Mahlzeit' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(screen.getByRole('radio', { name: 'Abend 18 Uhr' })).toBe(screen.getByTestId('m-abend'));
    fireEvent.click(radios[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('abend');
  });

  it('disabled: the chosen value still shows, nothing changes', () => {
    const onChange = vi.fn();
    render(
      <ChoiceChips
        options={MEALS}
        value="abend"
        onChange={onChange}
        label="Mahlzeit"
        disabled
        hint="Offline"
        fill
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
    expect(screen.getByRole('radio', { name: 'Abend 18 Uhr' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(radios[0] as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
  });
});

const SORT: MenuOption<'recent' | 'name' | 'rating'>[] = [
  { value: 'recent', label: 'Zuletzt' },
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Bewertung', disabled: true, hint: 'Noch keine Bewertungen' },
];

function renderSort(onChange = vi.fn(), value: 'recent' | 'name' | 'rating' | undefined = 'name') {
  render(
    <Menu
      label="Name"
      accessibilityLabel="Sortierung: Name"
      icon="arrow-up-down"
      options={SORT}
      value={value}
      onChange={onChange}
      testID="sort"
    />,
  );
  return { onChange, trigger: screen.getByTestId('sort') };
}

async function openMenu(trigger: HTMLElement) {
  fireEvent.click(trigger);
  return screen.findByRole('menu');
}

describe('Menu (spec 0010, spec 0019 REQ-004)', () => {
  it('review 0031: a greyed-out option says why on the web', async () => {
    const { trigger } = renderSort();
    const menu = await openMenu(trigger);
    const rating = within(menu).getByRole('menuitemradio', { name: 'Bewertung' });
    expect(rating.getAttribute('aria-description')).toBe('Noch keine Bewertungen');
  });

  it('the trigger is a button that says it opens a closed menu', () => {
    const { trigger } = renderSort();
    expect(trigger.getAttribute('role')).toBe('button');
    expect(trigger.getAttribute('aria-label')).toBe('Sortierung: Name');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens at its trigger: a choice marks the current entry, a disabled one says why', async () => {
    const { trigger } = renderSort();
    const menu = await openMenu(trigger);
    expect(menu.getAttribute('aria-label')).toBe('Sortierung: Name');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(items[2]?.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText('Noch keine Bewertungen')).toBeTruthy();
  });

  it('AC-010: opened by mouse or finger, no entry takes the focus', async () => {
    const { trigger } = renderSort();
    const menu = await openMenu(trigger);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(menu.contains(document.activeElement)).toBe(false);
  });

  it('choosing an entry reports it, closes the menu and gives the focus back', async () => {
    const { trigger, onChange } = renderSort();
    await openMenu(trigger);
    fireEvent.click(screen.getByTestId('sort-recent'));
    expect(onChange).toHaveBeenCalledWith('recent');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('a disabled entry cannot be chosen', async () => {
    const { trigger, onChange } = renderSort();
    await openMenu(trigger);
    fireEvent.click(screen.getByTestId('sort-rating'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a tap outside closes without choosing', async () => {
    const { trigger, onChange } = renderSort();
    await openMenu(trigger);
    const backdrop = screen
      .getAllByRole('button', { name: 'Sortierung: Name' })
      .find((button) => button !== trigger);
    fireEvent.click(backdrop as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape closes only the menu, stops there and focuses the trigger', async () => {
    const { trigger } = renderSort();
    await openMenu(trigger);
    const below = vi.fn();
    document.addEventListener('keyup', below);
    fireEvent.keyUp(document.body, { key: 'a' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyUp(document.body, { key: 'Escape' });
    document.removeEventListener('keyup', below);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(below).toHaveBeenCalledTimes(1);
  });

  it('AC-011: opened with the keyboard, the current entry gets the focus', async () => {
    const { trigger } = renderSort();
    act(() => trigger.focus());
    await openMenu(trigger);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('sort-name')));
  });

  it('keyboard: arrows move and wrap, Home and End jump; Space picks the focused choice', async () => {
    const { trigger, onChange } = renderSort();
    const menu = await openMenu(trigger);
    const item = (value: string) => screen.getByTestId(`sort-${value}`);
    act(() => item('recent').focus());
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(item('rating'));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item('recent'));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(item('rating'));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(item('recent'));
    fireEvent.keyDown(menu, { key: 'x' });
    fireEvent.keyUp(menu, { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyUp(menu, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('name');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keyboard: Space on a disabled entry picks nothing', async () => {
    const { trigger, onChange } = renderSort();
    const menu = await openMenu(trigger);
    act(() => screen.getByTestId('sort-rating').focus());
    fireEvent.keyUp(menu, { key: ' ' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('without a value it is a list of actions behind an icon (spec 0010)', async () => {
    const onChange = vi.fn();
    render(
      <Menu
        trigger="icon"
        label="Mehr"
        accessibilityLabel="Weitere Aktionen"
        options={[
          { value: 'copy', label: 'Kopieren' },
          { value: 'delete', label: 'Löschen' },
        ]}
        onChange={onChange}
        testID="more"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Weitere Aktionen' });
    expect(screen.queryByText('Mehr')).toBeNull();
    const menu = await openMenu(trigger);
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual([null, null]);
    act(() => items[0]?.focus());
    // Space on an action is the pressable's own, not the menu's.
    fireEvent.keyUp(menu, { key: ' ' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(items[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('delete');
  });

  it('without a value the first entry gets the keyboard focus', async () => {
    render(
      <Menu
        trigger="icon"
        icon="pencil"
        label="Mehr"
        accessibilityLabel="Weitere Aktionen"
        options={[
          { value: 'copy', label: 'Kopieren' },
          { value: 'delete', label: 'Löschen' },
        ]}
        onChange={() => undefined}
        testID="more"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Weitere Aktionen' });
    act(() => trigger.focus());
    await openMenu(trigger);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('more-copy')));
  });
});
