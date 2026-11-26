import { render } from '@testing-library/react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { useRevealOnShow } from './reveal-on-show';

function Message(props: { text: string | undefined }) {
  const ref = useRevealOnShow(props.text);
  return (
    <div data-testid="area" style={{ overflowY: 'auto', height: 100 }}>
      {props.text ? <View ref={ref} testID="message" /> : null}
    </div>
  );
}

const band = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;

describe('useRevealOnShow (review 0003: photo window errors behind the footer)', () => {
  it('scrolls a message that appears below the fold into view in its own scroll area', () => {
    const view = render(<Message text={undefined} />);
    const area = view.getByTestId('area');
    // A React Native Web ScrollView puts its own scrollTo({ x, y }) on its node; the
    // browser's { top } would scroll it to the start.
    const patched = vi.fn();
    area.scrollTo = patched as typeof area.scrollTo;
    area.getBoundingClientRect = () => band(0, 100);
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
      return this.dataset.testid === 'message' ? band(130, 150) : original.call(this);
    };
    try {
      view.rerender(<Message text="Die KI ist gerade nicht erreichbar." />);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
    expect(area.scrollTop).toBe(50);
    expect(patched).not.toHaveBeenCalled();
  });

  it('leaves the area alone while there is no message', () => {
    const view = render(<Message text={undefined} />);
    const area = view.getByTestId('area');
    const scrollTo = vi.fn();
    area.scrollTo = scrollTo as typeof area.scrollTo;
    view.rerender(<Message text={undefined} />);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
