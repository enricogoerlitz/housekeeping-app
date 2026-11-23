import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { minuteOptions } from './time-field-state';
import { TimeSelect } from './time-select';

// `./time-select` resolves to the web file here, as in Metro on the web; the native twin is
// loaded by its full name.
const { TimeSelect: NativeTimeSelect } =
  await vi.importActual<typeof import('./time-select')>('./time-select.tsx');

const OPTIONS = minuteOptions(true);

describe('TimeSelect on the web (spec 0027, Decision 6)', () => {
  it("the browser's own select, named and showing the chosen value", () => {
    const onChange = vi.fn();
    render(
      <TimeSelect
        accessibilityLabel="Uhrzeit, Minute"
        options={OPTIONS}
        value="30"
        onChange={onChange}
        testID="minute"
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Uhrzeit, Minute' }) as HTMLSelectElement;
    expect(select).toBe(screen.getByTestId('minute'));
    expect(select.value).toBe('30');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(OPTIONS.map((option) => option.label));
    fireEvent.change(select, { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith('45');
  });

  it('disabled: the select cannot be changed', () => {
    render(
      <TimeSelect
        accessibilityLabel="Uhrzeit, Minute"
        options={OPTIONS}
        value=""
        onChange={() => undefined}
        disabled
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Uhrzeit, Minute' }) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('');
  });
});

describe('TimeSelect on iOS and Android (spec 0027, Decision 6)', () => {
  it('a menu button that reads the name and value; choosing reports the value', async () => {
    const onChange = vi.fn();
    render(
      <NativeTimeSelect
        accessibilityLabel="Uhrzeit, Minute"
        options={OPTIONS}
        value="30"
        onChange={onChange}
        testID="minute"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Uhrzeit, Minute, 30' });
    expect(trigger.textContent).toBe('30');
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).getByRole('menuitemradio', { name: '30' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '45' }));
    expect(onChange).toHaveBeenCalledWith('45');
  });

  it('without a matching value it shows "–"', () => {
    render(
      <NativeTimeSelect
        accessibilityLabel="Uhrzeit, Minute"
        options={minuteOptions(false)}
        value=""
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Uhrzeit, Minute, –' })).toBeTruthy();
  });

  it('disabled: only the value, read with its name, no button', () => {
    render(
      <NativeTimeSelect
        accessibilityLabel="Uhrzeit, Minute"
        options={OPTIONS}
        value="05"
        onChange={() => undefined}
        disabled
        testID="minute"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const value = screen.getByTestId('minute');
    expect(value.getAttribute('aria-label')).toBe('Uhrzeit, Minute, 05');
    expect(value.textContent).toBe('05');
  });
});
