import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { describe, expect, it } from 'vitest';

import { WithBadge } from './count-badge';
import { getTheme } from './themes';

describe('WithBadge: the red circle with a number (spec 0051, REQ-003)', () => {
  it('AC-014: shows the number top right of its child, in the badge colours', () => {
    render(
      <WithBadge count="3" testID="bell-badge">
        <Text>Glocke</Text>
      </WithBadge>,
    );
    const badge = screen.getByTestId('bell-badge');
    expect(badge.textContent).toBe('3');
    expect(screen.getByText('Glocke')).toBeTruthy();
    const colors = getTheme('klar', 'light').colors;
    expect(getComputedStyle(badge).backgroundColor).toBe('rgb(215, 0, 21)');
    expect(colors.badge).toBe('#D70015');
  });

  it('AC-015: without a number there is no circle', () => {
    render(
      <WithBadge count={undefined} testID="bell-badge">
        <Text>Glocke</Text>
      </WithBadge>,
    );
    expect(screen.queryByTestId('bell-badge')).toBeNull();
    expect(screen.getByText('Glocke')).toBeTruthy();
  });

  it('is hidden from the screen reader: the button names the count', () => {
    render(
      <WithBadge count="9+" testID="bell-badge">
        <Text>Glocke</Text>
      </WithBadge>,
    );
    expect(screen.getByTestId('bell-badge').getAttribute('aria-hidden')).toBe('true');
  });
});
