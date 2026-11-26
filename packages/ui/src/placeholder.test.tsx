import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListPlaceholder, PLACEHOLDER_DELAY_MS } from './placeholder';

describe('the calm placeholder of content that takes long (spec 0034, REQ-001)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-002: shows nothing for 400 ms, then rows in the shape of a list', () => {
    render(<ListPlaceholder label="Wird geladen" rows={3} testID="ph" />);
    expect(screen.queryByTestId('ph')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(PLACEHOLDER_DELAY_MS - 1);
    });
    expect(screen.queryByTestId('ph')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const placeholder = screen.getByTestId('ph');
    expect(placeholder.getAttribute('aria-label')).toBe('Wird geladen');
    expect(placeholder.querySelectorAll('[data-testid="ph-row"]')).toHaveLength(3);
  });

  it('AC-003: content that arrives within 200 ms never shows the placeholder', () => {
    const { rerender } = render(<ListPlaceholder label="Wird geladen" testID="ph" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<span>Inhalt</span>);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('ph')).toBeNull();
    expect(screen.getByText('Inhalt')).toBeTruthy();
  });
});
