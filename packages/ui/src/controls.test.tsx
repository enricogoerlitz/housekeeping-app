import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostInstance } from 'react-native';

import {
  Button,
  Checkbox,
  CheckboxMark,
  Chip,
  ChipView,
  IconButton,
  Stars,
  SwitchRow,
  TextField,
  keyboardFocus,
  keyboardFocusRing,
  keyboardFocused,
} from './controls';
import { DEFAULT_THEME_ID, getTheme } from './themes';
import { pointer } from '../test/setup';

/** The accessible description the browser reads (`aria-description`, AC-048 of 0023). */
function description(element: HTMLElement): string {
  return element.getAttribute('aria-description') ?? '';
}

describe('Button (AC-029)', () => {
  it('is a button named by its label and presses', () => {
    const onPress = vi.fn();
    render(<Button label="Speichern" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Speichern' });
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled: says so and does not press', () => {
    const onPress = vi.fn();
    render(<Button label="Speichern" onPress={onPress} disabled hint="Offline" />);
    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(description(button)).toBe('Offline');
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Checkbox (AC-029)', () => {
  it('is a checkbox with its name and state, and toggles', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Milch" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Milch' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('checked and disabled', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Milch" checked onChange={onChange} disabled />);
    const box = screen.getByRole('checkbox', { name: 'Milch' });
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(box.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SwitchRow (AC-029)', () => {
  it('is a switch named by its label with its state, and switches', () => {
    const onValueChange = vi.fn();
    render(<SwitchRow label="Tagesüberblick" value={false} onValueChange={onValueChange} />);
    const toggle = screen.getByRole('switch', { name: 'Tagesüberblick' });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('on and disabled', () => {
    render(<SwitchRow label="Tagesüberblick" value onValueChange={() => undefined} disabled />);
    const toggle = screen.getByRole('switch', { name: 'Tagesüberblick' }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(true);
  });

  it('with details: the text is a button of its own beside the switch', () => {
    const onDetail = vi.fn();
    render(
      <SwitchRow
        label="Tagesüberblick"
        value
        onValueChange={() => undefined}
        onDetail={onDetail}
        detailLabel="Tagesüberblick einstellen"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tagesüberblick einstellen' }));
    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch')).toBeTruthy();
  });
});

describe('keyboard focus ring (spec 0019, REQ-002)', () => {
  const theme = getTheme(DEFAULT_THEME_ID, 'light');

  it('keyboardFocus: only a :focus-visible target counts; without a way to tell it does', () => {
    expect(keyboardFocus({ target: { matches: () => true } })).toBe(true);
    expect(keyboardFocus({ target: { matches: () => false } })).toBe(false);
    expect(keyboardFocus({})).toBe(true);
  });

  it('keyboardFocusRing: no ring without focus, a 2 px outline with keyboard focus', () => {
    expect(keyboardFocusRing(theme, false)).toBeNull();
    expect(keyboardFocusRing(theme, undefined)).toBeNull();
    render(<Button label="Speichern" />);
    act(() => screen.getByRole('button', { name: 'Speichern' }).focus());
    expect(keyboardFocused(true)).toBe(true);
    expect(keyboardFocusRing(theme, true)).toMatchObject({ outlineWidth: 2, outlineOffset: 2 });
  });

  it('a click focus (not :focus-visible) gets no ring', () => {
    render(<Button label="Speichern" />);
    const button = screen.getByRole('button', { name: 'Speichern' });
    act(() => button.focus());
    const matches = vi.spyOn(button, 'matches').mockReturnValue(false);
    expect(keyboardFocused(true)).toBe(false);
    expect(keyboardFocusRing(theme, true)).toBeNull();
    matches.mockRestore();
  });

  it('a control focused by keyboard draws the outline', () => {
    render(<Button label="Speichern" />);
    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button.style.outlineWidth).toBe('');
    act(() => button.focus());
    expect(button.style.outlineWidth).toBe('2px');
  });
});

describe('Button variants', () => {
  it('accessibilityLabel says more than the label (spec 0027, AC-039)', () => {
    render(
      <Button
        label="Löschen"
        accessibilityLabel="Rezept Paella löschen"
        variant="ghost"
        icon="trash"
        size="sm"
        full
      />,
    );
    expect(screen.getByRole('button', { name: 'Rezept Paella löschen' })).toBeTruthy();
    expect(screen.getByText('Löschen')).toBeTruthy();
  });

  it('secondary and link buttons press like the primary one', () => {
    const onPress = vi.fn();
    render(
      <>
        <Button label="Abbrechen" variant="secondary" onPress={onPress} />
        <Button label="Mehr" variant="link" onPress={onPress} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});

describe('IconButton', () => {
  it('is a button named by its label and presses', () => {
    const onPress = vi.fn();
    render(<IconButton icon="pencil" label="Bearbeiten" onPress={onPress} testID="edit" />);
    const button = screen.getByRole('button', { name: 'Bearbeiten' });
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled: says so and does not press', () => {
    const onPress = vi.fn();
    render(
      <IconButton icon="pencil" label="Bearbeiten" onPress={onPress} disabled hint="Offline" />,
    );
    const button = screen.getByRole('button', { name: 'Bearbeiten' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(description(button)).toBe('Offline');
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hands its node to `ref`, so the focus can return to it', () => {
    const ref = createRef<HostInstance>();
    render(
      <>
        <IconButton ref={ref} icon="x" label="Schließen" variant="filled" size={36} />
        <IconButton icon="plus" label="Neu" variant="soft" color="accent" />
      </>,
    );
    act(() => ref.current?.focus());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Schließen' }));
  });

  it('plain: a fine pointer hovering shades it', () => {
    pointer.fine = true;
    render(<IconButton icon="x" label="Schließen" />);
    const button = screen.getByRole('button', { name: 'Schließen' });
    const before = button.style.backgroundColor;
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(button.style.backgroundColor).not.toBe(before);
  });
});

describe('Chip', () => {
  it('without onPress it is a static label, no button', () => {
    render(<Chip label="Vegan" tone="essen" icon="leaf" />);
    expect(screen.getByText('Vegan')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a toggle: a pressed button with its state', () => {
    const onPress = vi.fn();
    render(<Chip label="Vegan" selected onPress={onPress} icon="leaf" />);
    const chip = screen.getByRole('button', { name: 'Vegan' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('removable: shows ✕, has its own name and is no toggle', () => {
    const onPress = vi.fn();
    render(
      <Chip
        label="Vegan"
        removable
        accessibilityLabel="Vegan entfernen"
        tone="essen"
        onPress={onPress}
      />,
    );
    const chip = screen.getByRole('button', { name: 'Vegan entfernen' });
    expect(chip.getAttribute('aria-pressed')).toBeNull();
    expect(chip.querySelectorAll('svg')).toHaveLength(1);
    fireEvent.click(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('with a detail line: both lines name it ("Mi 25.11.")', () => {
    render(<Chip label="Mi" detail="25.11." onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Mi 25.11.' })).toBeTruthy();
    expect(screen.getByText('25.11.')).toBeTruthy();
  });

  it('disabled: says so and does not press', () => {
    const onPress = vi.fn();
    render(<Chip label="Vegan" disabled hint="Offline" onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Vegan' });
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(description(chip)).toBe('Offline');
    fireEvent.click(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a fine pointer hovering an unselected chip shades it', () => {
    pointer.fine = true;
    render(<Chip label="Vegan" onPress={() => undefined} />);
    const chip = screen.getByRole('button', { name: 'Vegan' });
    const before = chip.style.backgroundColor;
    fireEvent.pointerEnter(chip, { pointerType: 'mouse' });
    expect(chip.style.backgroundColor).not.toBe(before);
  });
});

describe('ChipView as a radio', () => {
  it('is a radio with aria-checked and no pressed or selected state', () => {
    const onPress = vi.fn();
    render(<ChipView role="radio" label="Mittag" selected fill onPress={onPress} />);
    const radio = screen.getByRole('radio', { name: 'Mittag' });
    expect(radio.getAttribute('aria-checked')).toBe('true');
    expect(radio.getAttribute('aria-pressed')).toBeNull();
    expect(radio.getAttribute('aria-selected')).toBeNull();
    fireEvent.click(radio);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Checkbox and CheckboxMark', () => {
  it('a checkbox without onChange cannot be pressed', () => {
    render(<Checkbox label="Milch" checked={false} />);
    expect(screen.getByRole('checkbox', { name: 'Milch' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('CheckboxMark: only the look, no focusable checkbox of its own', () => {
    const { container, rerender } = render(<CheckboxMark checked={false} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    rerender(<CheckboxMark checked />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('SwitchRow details', () => {
  it('the detail button carries the description and can be disabled', () => {
    const onDetail = vi.fn();
    render(
      <SwitchRow
        label="Tagesüberblick"
        description="Jeden Morgen um 7"
        value
        onValueChange={() => undefined}
        onDetail={onDetail}
        detailLabel="Tagesüberblick einstellen"
        detailDisabled
        testID="row"
      />,
    );
    const detail = screen.getByRole('button', {
      name: 'Tagesüberblick einstellen, Jeden Morgen um 7',
    });
    expect(detail.getAttribute('data-testid')).toBe('row-detail');
    expect(detail.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(detail);
    expect(onDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Tagesüberblick' })).toBeTruthy();
  });
});

/** One finger at `x` on `target`; the responder system reads both touch lists. */
function touch(
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  target: HTMLElement,
  x: number,
) {
  const point = { identifier: 0, target, clientX: x, clientY: 0, pageX: x, pageY: 0 };
  const ended = type === 'touchEnd' || type === 'touchCancel';
  fireEvent[type](target, { touches: ended ? [] : [point], changedTouches: [point] });
}

/** Stars drawn filled (a half star counts its filled half). */
function filledStars(slider: HTMLElement): number {
  return [...slider.querySelectorAll('svg')].filter((svg) => svg.getAttribute('fill') !== 'none')
    .length;
}

describe('Stars (spec 0011, REQ-004)', () => {
  it('read only: one image named by the value', () => {
    render(<Stars value={4.5} />);
    const image = screen.getByRole('img', { name: '4,5 von 5 Sternen' });
    expect(image.getAttribute('aria-valuenow')).toBeNull();
    expect(image.getAttribute('tabindex')).not.toBe('0');
    expect(filledStars(image)).toBe(5);
  });

  it('changeable: one slider with its label, range and value text', () => {
    render(<Stars value={3} onChange={() => undefined} label="Deine Bewertung" />);
    const slider = screen.getByRole('slider', { name: 'Deine Bewertung' });
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('5');
    expect(slider.getAttribute('aria-valuenow')).toBe('3');
    expect(slider.getAttribute('aria-valuetext')).toBe('3 von 5 Sternen');
  });

  it('without a label the value is the name', () => {
    render(<Stars value={2} onChange={() => undefined} />);
    expect(screen.getByRole('slider', { name: '2 von 5 Sternen' })).toBeTruthy();
  });

  it('keyboard: arrows step by half a star, Home and End jump, other keys do nothing', () => {
    const onChange = vi.fn();
    render(<Stars value={3} onChange={onChange} label="Bewertung" />);
    const slider = screen.getByRole('slider', { name: 'Bewertung' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'End' });
    fireEvent.keyDown(slider, { key: 'a' });
    expect(onChange.mock.calls).toEqual([[3.5], [3.5], [2.5], [2.5], [0.5], [5]]);
  });

  it('keyboard: a step that changes nothing or leaves it unrated is not reported', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stars value={5} onChange={onChange} label="Bewertung" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    rerender(<Stars value={0} onChange={onChange} label="Bewertung" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a tap on the left half of a star sets half a star, on the right half the full star', () => {
    const onChange = vi.fn();
    render(<Stars value={1} onChange={onChange} testID="stars" />);
    const left = screen.getByTestId('stars-3-half');
    touch('touchStart', left, 0);
    touch('touchEnd', left, 0);
    const right = screen.getByTestId('stars-4');
    touch('touchStart', right, 0);
    touch('touchEnd', right, 0);
    expect(onChange.mock.calls).toEqual([[2.5], [4]]);
  });

  it('dragging along the stars previews, letting go sets', () => {
    const onChange = vi.fn();
    render(<Stars value={1} onChange={onChange} testID="stars" size={20} />);
    const slider = screen.getByRole('slider');
    const first = screen.getByTestId('stars-1-half');
    touch('touchStart', first, 2);
    // Pitch 21: x = 2 + 63 lies in the left half of the fourth star.
    touch('touchMove', first, 65);
    expect(filledStars(slider)).toBe(4);
    expect(onChange).not.toHaveBeenCalled();
    touch('touchEnd', first, 65);
    expect(onChange).toHaveBeenCalledWith(3.5);
  });

  it('the system taking the gesture sets nothing', () => {
    const onChange = vi.fn();
    render(<Stars value={1} onChange={onChange} testID="stars" />);
    const star = screen.getByTestId('stars-4');
    touch('touchStart', star, 0);
    touch('touchCancel', star, 0);
    expect(onChange).not.toHaveBeenCalled();
    expect(filledStars(screen.getByRole('slider'))).toBe(1);
  });

  it('mouse: hovering previews the stars, leaving shows the saved value again', () => {
    render(<Stars value={2} onChange={() => undefined} testID="stars" />);
    const slider = screen.getByRole('slider');
    expect(filledStars(slider)).toBe(2);
    fireEvent.pointerEnter(screen.getByTestId('stars-4'));
    expect(filledStars(slider)).toBe(4);
    fireEvent.pointerLeave(slider);
    expect(filledStars(slider)).toBe(2);
  });

  it('disabled: shows the value, says so, and does not react', () => {
    const onChange = vi.fn();
    render(
      <Stars value={2} onChange={onChange} disabled hint="Offline" label="Bewertung" testID="s" />,
    );
    const slider = screen.getByRole('slider', { name: 'Bewertung' });
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    expect(description(slider)).toBe('Offline');
    expect(slider.getAttribute('tabindex')).not.toBe('0');
    expect(screen.queryByTestId('s-3')).toBeNull();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keyboard focus draws the ring around the stars', () => {
    render(<Stars value={2} onChange={() => undefined} label="Bewertung" />);
    const slider = screen.getByRole('slider');
    act(() => slider.focus());
    expect(slider.style.outlineWidth).toBe('2px');
    act(() => slider.blur());
    expect(slider.style.outlineWidth).toBe('');
  });
});

describe('TextField', () => {
  const scrollIntoView = vi.fn();
  afterEach(() => {
    scrollIntoView.mockReset();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('the visible label names the input; typing reports the text', () => {
    const onChangeText = vi.fn();
    render(<TextField label="Titel" value="" onChangeText={onChangeText} hint="Kurz und klar" />);
    const input = screen.getByRole('textbox', { name: 'Titel' });
    fireEvent.change(input, { target: { value: 'Paella' } });
    expect(onChangeText).toHaveBeenCalledWith('Paella');
    expect(screen.getByText('Titel')).toBeTruthy();
    expect(screen.getByText('Kurz und klar')).toBeTruthy();
  });

  it('without a label: accessibilityLabel, else the placeholder names it', () => {
    render(
      <>
        <TextField accessibilityLabel="Suche" placeholder="Rezepte suchen" round />
        <TextField placeholder="Notiz" multiline />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Suche' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Notiz' })).toBeTruthy();
  });

  it('an error replaces the hint', () => {
    render(<TextField label="Menge" error="Bitte eine Zahl" hint="z. B. 2" testID="amount" />);
    expect(screen.getByTestId('amount-error').textContent).toBe('Bitte eine Zahl');
    expect(screen.queryByText('z. B. 2')).toBeNull();
  });

  it('focus and blur reach the caller', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(<TextField label="Titel" onFocus={onFocus} onBlur={onBlur} left={null} right={null} />);
    const input = screen.getByRole('textbox', { name: 'Titel' });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('an error that appears later scrolls into view; one present on mount does not (spec 0013)', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { rerender } = render(<TextField label="Uhrzeit" error="Zu früh" />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<TextField label="Uhrzeit" />);
    rerender(<TextField label="Uhrzeit" error="Ungültig" />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
