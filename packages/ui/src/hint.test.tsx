import { render, screen } from '@testing-library/react';
import { Pressable } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { useAriaDisabled, useHint } from './hint';

function SoftButton(props: { disabled: boolean; hint?: string; onPress: () => void }) {
  const ref = useAriaDisabled(props.disabled);
  const hint = useHint(props.hint);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel="Hinzufügen"
      {...hint.props}
      onPress={props.onPress}
    >
      {hint.node}
    </Pressable>
  );
}

describe('a control that stays pressable while greyed out (spec 0021, AC-009)', () => {
  it('says it is disabled and why, and still takes the press that explains it', () => {
    const onPress = vi.fn();
    const { rerender } = render(<SoftButton disabled hint="Offline" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Hinzufügen' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('Offline');
    button.click();
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<SoftButton disabled={false} onPress={onPress} />);
    expect(button.getAttribute('aria-disabled')).toBe('false');
  });
});
