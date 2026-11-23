import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Text } from './primitives';
import { Disclosure, type DisclosureProps } from './disclosure';

function group(props: Partial<DisclosureProps> = {}) {
  return (
    <Disclosure
      title="Gepackt"
      count={4}
      expandedLabel="aufgeklappt"
      collapsedLabel="eingeklappt"
      testID="packed"
      {...props}
    >
      <Text>Zahnbürste</Text>
    </Disclosure>
  );
}

describe('Disclosure (spec 0012, REQ-004)', () => {
  it('D31: folded by default; the header shows the count and says it is folded', () => {
    render(group());
    const header = screen.getByRole('button', { name: 'Gepackt, 4' });
    expect(header.textContent).toBe('Gepackt (4)');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Zahnbürste')).toBeNull();
  });

  it('a tap on the header unfolds and folds the rows', () => {
    render(group());
    const header = screen.getByTestId('packed-toggle');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('packed-body').textContent).toBe('Zahnbürste');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('packed-body')).toBeNull();
  });

  it('defaultExpanded starts unfolded', () => {
    render(group({ defaultExpanded: true }));
    expect(screen.getByText('Zahnbürste')).toBeTruthy();
  });

  it('AC-020: a row sliding into the folded group only raises the count', () => {
    const { rerender } = render(group({ count: 3 }));
    rerender(group({ count: 4 }));
    const header = screen.getByRole('button', { name: 'Gepackt, 4' });
    expect(header.textContent).toBe('Gepackt (4)');
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('AC-021: rows sliding in or out of the unfolded group keep it open', () => {
    const { rerender } = render(group({ defaultExpanded: true }));
    rerender(group({ defaultExpanded: true, count: 5 }));
    expect(screen.getByRole('button', { name: 'Gepackt, 5' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    rerender(group({ count: 3 }));
    expect(screen.getByText('Zahnbürste')).toBeTruthy();
  });

  it('at 0 the group is gone and comes back folded', () => {
    const { rerender } = render(group({ defaultExpanded: true }));
    rerender(group({ count: 0 }));
    expect(screen.queryByTestId('packed')).toBeNull();
    rerender(group({ count: 1 }));
    const header = screen.getByRole('button', { name: 'Gepackt, 1' });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Zahnbürste')).toBeNull();
  });

  it('empty from the start: nothing is shown', () => {
    render(group({ count: 0 }));
    expect(screen.queryByRole('button')).toBeNull();
  });
});
