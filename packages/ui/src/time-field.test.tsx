import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimeField, type TimeFieldProps } from './time-field';

function renderField(props: Partial<TimeFieldProps> = {}) {
  const onChange = vi.fn();
  render(
    <TimeField
      label="Uhrzeit"
      hourLabel="Stunde"
      minuteLabel="Minute"
      value="19:30"
      onChange={onChange}
      testID="time"
      {...props}
    />,
  );
  const select = (part: string) =>
    screen.getByRole('combobox', {
      name: `${props.accessibilityName ?? 'Uhrzeit'}, ${part}`,
    }) as HTMLSelectElement;
  return { onChange, hour: select('Stunde'), minute: select('Minute') };
}

const labels = (select: HTMLSelectElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('TimeField (spec 0027, REQ-007)', () => {
  it('AC-031: two selects named by the field and their part, showing the time', () => {
    const { hour, minute } = renderField();
    expect(screen.getByText('Uhrzeit')).toBeTruthy();
    expect(hour.value).toBe('19');
    expect(minute.value).toBe('30');
    expect(hour).toBe(screen.getByTestId('time-hour'));
    expect(minute).toBe(screen.getByTestId('time-minute'));
  });

  it('AC-031: accessibilityName replaces the label for screen readers', () => {
    renderField({ label: 'Uhrzeit (optional)', accessibilityName: 'Erinnerung' });
    expect(screen.getByRole('combobox', { name: 'Erinnerung, Stunde' })).toBeTruthy();
    expect(screen.getByText('Uhrzeit (optional)')).toBeTruthy();
  });

  it('AC-029: hours 0–23 and minutes in five-minute steps, no "–" once a time is set', () => {
    const { hour, minute } = renderField();
    expect(labels(hour)).toHaveLength(24);
    expect(labels(hour)[0]).toBe('0');
    expect(labels(minute)).toEqual([
      '00',
      '05',
      '10',
      '15',
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
      '50',
      '55',
    ]);
  });

  it('choosing an hour keeps the minute, choosing a minute keeps the hour', () => {
    const { onChange, hour, minute } = renderField();
    fireEvent.change(hour, { target: { value: '07' } });
    expect(onChange).toHaveBeenLastCalledWith('07:30');
    fireEvent.change(minute, { target: { value: '45' } });
    expect(onChange).toHaveBeenLastCalledWith('19:45');
  });

  it('without a time: "–" in both, the minute greyed out; an hour sets ":00"', () => {
    const { onChange, hour, minute } = renderField({ value: undefined });
    expect(hour.value).toBe('');
    expect(labels(hour)[0]).toBe('–');
    expect(minute.value).toBe('');
    expect(minute.disabled).toBe(true);
    fireEvent.change(hour, { target: { value: '08' } });
    expect(onChange).toHaveBeenCalledWith('08:00');
  });

  it('AC-030: optional keeps "–" as an hour, which removes the time; ✕ removes it too', () => {
    const { onChange, hour } = renderField({ optional: true, clearLabel: 'Uhrzeit entfernen' });
    expect(labels(hour)[0]).toBe('–');
    fireEvent.change(hour, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Uhrzeit entfernen' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('AC-030: ✕ falls back to the label as its name', () => {
    renderField({ optional: true });
    expect(screen.getByTestId('time-clear').getAttribute('aria-label')).toBe('Uhrzeit');
  });

  it('a required time has no ✕, nor an optional one without a time', () => {
    renderField();
    expect(screen.queryByTestId('time-clear')).toBeNull();
  });

  it('disabled: both selects greyed out, no ✕, the hint says why', () => {
    const { hour, minute } = renderField({
      optional: true,
      clearLabel: 'Uhrzeit entfernen',
      disabled: true,
      hint: 'Offline',
    });
    expect(hour.disabled).toBe(true);
    expect(minute.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Uhrzeit entfernen' })).toBeNull();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('an error replaces the hint', () => {
    renderField({ error: 'Bitte eine Uhrzeit wählen', hint: 'Zum Beispiel 19:30' });
    expect(screen.getByTestId('time-error').textContent).toBe('Bitte eine Uhrzeit wählen');
    expect(screen.queryByText('Zum Beispiel 19:30')).toBeNull();
  });
});
