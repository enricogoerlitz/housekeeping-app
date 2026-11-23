import { render, screen } from '@testing-library/react';
import { Pressable, Text } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { useSoftDisabled } from './hint';

function SoftButton(props: { disabled: boolean; hint?: string; onPress: () => void }) {
  const ref = useSoftDisabled(props.disabled, props.hint);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel="Hinzufügen"
      accessibilityHint={props.hint}
      onPress={props.onPress}
    >
      <Text>+</Text>
    </Pressable>
  );
}

describe('a control that stays pressable while greyed out (spec 0021, AC-009)', () => {
  it('says it is disabled and why, keeps its own text, and still takes the press', () => {
    const onPress = vi.fn();
    const { rerender } = render(<SoftButton disabled hint="Offline" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Hinzufügen' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-description')).toBe('Offline');
    expect(button.textContent).toBe('+');
    button.click();
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<SoftButton disabled={false} onPress={onPress} />);
    expect(button.getAttribute('aria-disabled')).toBe('false');
    expect(button.hasAttribute('aria-description')).toBe(false);
  });
});
