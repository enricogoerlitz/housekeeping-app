import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressSteps } from './progress-steps';

const steps = [
  {
    id: 'web',
    line: 'Sucht im Web · 6 Quellen',
    details: ['romantisch mitte', 'crackers öffnungszeiten'],
    running: true,
  },
  { id: 'tool', line: 'Liest eure Rezepte · 20 von 143', details: [], running: false },
];

describe('ProgressSteps (spec 0066, REQ-005)', () => {
  it('AC-014: one row per step; a running one says so to screen readers', () => {
    render(<ProgressSteps steps={steps} runningLabel="läuft" testID="steps" />);
    expect(screen.getByTestId('steps-web').textContent).toContain('Sucht im Web · 6 Quellen');
    expect(screen.getByRole('button', { name: 'Sucht im Web · 6 Quellen, läuft' })).toBeTruthy();
    expect(screen.getByTestId('steps-tool').textContent).toContain(
      'Liest eure Rezepte · 20 von 143',
    );
  });

  it('AC-014: a tap opens the details of a step and closes them again', () => {
    render(<ProgressSteps steps={steps} runningLabel="läuft" testID="steps" />);
    const toggle = screen.getByTestId('steps-web-toggle');
    expect(screen.queryByText('romantisch mitte')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('steps-web-details').textContent).toContain(
      'crackers öffnungszeiten',
    );
    fireEvent.click(toggle);
    expect(screen.queryByText('romantisch mitte')).toBeNull();
  });

  it('spec 0067, REQ-008: the details of a tool step are filters and fields, shown without quotes', () => {
    render(
      <ProgressSteps
        steps={[
          {
            id: 't1',
            line: 'Liest eure Rezepte · vegetarisch · 12 von 143',
            details: ['Filter: Ernährung vegan oder vegetarisch', 'Felder: Titel, Zeit'],
            running: false,
            quoted: false,
          },
        ]}
        runningLabel="läuft"
        testID="steps"
      />,
    );
    fireEvent.click(screen.getByTestId('steps-t1-toggle'));
    expect(screen.getByTestId('steps-t1-details').textContent).toBe(
      'Filter: Ernährung vegan oder vegetarischFelder: Titel, Zeit',
    );
  });

  it('a step without details is no button', () => {
    render(<ProgressSteps steps={steps} runningLabel="läuft" testID="steps" />);
    expect(screen.queryByTestId('steps-tool-toggle')).toBeNull();
  });

  it('nothing to show without steps', () => {
    const { container } = render(<ProgressSteps steps={[]} runningLabel="läuft" />);
    expect(container.textContent).toBe('');
  });
});
