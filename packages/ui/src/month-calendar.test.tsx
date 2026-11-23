import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MonthCalendar, type MonthCalendarProps } from './month-calendar';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const label = (date: string) => `Tag ${date}`;

type Props = Partial<MonthCalendarProps> & { onSelect?: (date: string) => void };

/** Holds the shown month like a feature does, so paging re-renders the calendar. */
function Calendar(props: Props & { start?: string; onPage?: (month: string) => void }) {
  const [month, setMonth] = useState(props.start ?? '2026-11-01');
  return (
    <MonthCalendar
      testID="cal"
      title={`Monat ${month.slice(0, 7)}`}
      weekdayLabels={WEEKDAYS}
      previousLabel="Voriger Monat"
      nextLabel="Nächster Monat"
      dayLabel={label}
      onSelect={() => undefined}
      {...props}
      month={month}
      onMonthChange={(next) => {
        props.onPage?.(next);
        setMonth(next);
      }}
    />
  );
}

const day = (date: string) => screen.getByRole('button', { name: label(date) });
const press = (key: string) => {
  const target = document.activeElement as HTMLElement;
  act(() => {
    fireEvent.keyDown(target, { key });
  });
};

describe('MonthCalendar (spec 0016, REQ-005)', () => {
  it('AC-019: a month grid Monday to Sunday with title, heads and one button per day', () => {
    render(<Calendar hint="Tippe einen Tag an" />);
    expect(screen.getByTestId('cal-title').textContent).toBe('Monat 2026-11');
    expect(screen.getByText('Tippe einen Tag an')).toBeTruthy();
    for (const head of WEEKDAYS) expect(screen.getByText(head)).toBeTruthy();
    const days = screen.getAllByRole('button', { name: /^Tag / });
    expect(days).toHaveLength(30);
    expect(days[0]?.textContent).toBe('1');
    expect(screen.getByTestId('cal-day-2026-11-30').textContent).toBe('30');
  });

  it('AC-020: ‹ and › page a month either way, also across the year', () => {
    const onPage = vi.fn();
    render(<Calendar start="2026-12-15" onPage={onPage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(onPage).toHaveBeenLastCalledWith('2027-01-01');
    expect(screen.getByTestId('cal-title').textContent).toBe('Monat 2027-01');
    fireEvent.click(screen.getByTestId('cal-prev'));
    fireEvent.click(screen.getByTestId('cal-prev'));
    expect(onPage).toHaveBeenLastCalledWith('2026-11-01');
  });

  it('a tap on a free day selects it; a blocked day is disabled and does not', () => {
    const onSelect = vi.fn();
    render(<Calendar onSelect={onSelect} isDisabled={(date) => date === '2026-11-10'} />);
    fireEvent.click(day('2026-11-12'));
    expect(onSelect).toHaveBeenCalledWith('2026-11-12');
    const blocked = day('2026-11-10');
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(blocked);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('the marked range is selected, the days outside it are not', () => {
    render(<Calendar marked={{ from: '2026-11-03', to: '2026-11-05' }} today="2026-11-04" />);
    const selected = (date: string) => day(date).getAttribute('aria-selected');
    expect(['02', '03', '04', '05', '06'].map((d) => selected(`2026-11-${d}`))).toEqual([
      'false',
      'true',
      'true',
      'true',
      'false',
    ]);
  });

  describe('AC-021: keyboard (roving focus)', () => {
    const tabStops = () =>
      screen
        .getAllByRole('button', { name: /^Tag / })
        .filter((button) => button.getAttribute('tabindex') === '0')
        .map((button) => button.getAttribute('aria-label'));

    it('Tab enters on the marked day only', () => {
      render(<Calendar marked={{ from: '2026-11-18', to: '2026-11-18' }} today="2026-11-02" />);
      expect(tabStops()).toEqual([label('2026-11-18')]);
    });

    it('focusDate wins over the marked day; without both, today; else the first free day', () => {
      const { unmount } = render(
        <Calendar focusDate="2026-11-20" marked={{ from: '2026-11-18', to: '2026-11-18' }} />,
      );
      expect(tabStops()).toEqual([label('2026-11-20')]);
      unmount();
      const second = render(<Calendar today="2026-11-07" />);
      expect(tabStops()).toEqual([label('2026-11-07')]);
      second.unmount();
      render(<Calendar isDisabled={(date) => date < '2026-11-04'} />);
      expect(tabStops()).toEqual([label('2026-11-04')]);
    });

    it('arrows move a day or a week and skip blocked days', () => {
      render(
        <Calendar
          marked={{ from: '2026-11-10', to: '2026-11-10' }}
          isDisabled={(date) => date === '2026-11-11'}
        />,
      );
      day('2026-11-10').focus();
      press('ArrowRight');
      expect(document.activeElement).toBe(day('2026-11-12'));
      press('ArrowDown');
      expect(document.activeElement).toBe(day('2026-11-19'));
      press('ArrowUp');
      press('ArrowLeft');
      expect(document.activeElement).toBe(day('2026-11-10'));
      expect(tabStops()).toEqual([label('2026-11-10')]);
    });

    it('an arrow past the edge pages and focuses the day in the new month', () => {
      const onPage = vi.fn();
      render(<Calendar today="2026-11-30" onPage={onPage} />);
      day('2026-11-30').focus();
      press('ArrowRight');
      expect(onPage).toHaveBeenCalledWith('2026-12-01');
      expect(document.activeElement).toBe(day('2026-12-01'));
      expect(tabStops()).toEqual([label('2026-12-01')]);
    });

    it('PageUp and PageDown move a month to the same day', () => {
      render(<Calendar today="2026-11-15" />);
      day('2026-11-15').focus();
      press('PageDown');
      expect(document.activeElement).toBe(day('2026-12-15'));
      press('PageUp');
      press('PageUp');
      expect(document.activeElement).toBe(day('2026-10-15'));
    });

    it('arrow keys do not scroll the page; other keys are left alone', () => {
      render(<Calendar today="2026-11-15" />);
      const target = day('2026-11-15');
      target.focus();
      const arrow = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        target.dispatchEvent(arrow);
      });
      expect(arrow.defaultPrevented).toBe(true);
      const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      const focused = document.activeElement as HTMLElement;
      act(() => {
        focused.dispatchEvent(other);
      });
      expect(other.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(focused);
    });

    it('a month without a free day has no tab stop and ignores the keys', () => {
      const onPage = vi.fn();
      render(<Calendar isDisabled={() => true} onPage={onPage} />);
      expect(tabStops()).toEqual([]);
      fireEvent.keyDown(day('2026-11-15'), { key: 'ArrowRight' });
      expect(onPage).not.toHaveBeenCalled();
    });
  });
});
