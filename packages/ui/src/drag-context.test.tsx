import { render } from '@testing-library/react';
import type { HostInstance, NativeSyntheticEvent } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { accessibilityProps, measureNode, useDragController } from './drag-context';

type ActionEvent = NativeSyntheticEvent<Readonly<{ actionName: string }>>;
const action = (actionName: string) => ({ nativeEvent: { actionName } }) as ActionEvent;

const nodeMeasuring = (x: number, y: number, width: number, height: number) =>
  ({
    measureInWindow: (done: (x: number, y: number, w: number, h: number) => void) =>
      done(x, y, width, height),
  }) as unknown as HostInstance;

describe('useDragController', () => {
  it('drag sources and drop targets need a DragProvider above them', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useDragController();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow('need a DragProvider above them');
    vi.restoreAllMocks();
  });
});

describe('measureNode', () => {
  it('reports the window rectangle of a laid-out view', () => {
    const done = vi.fn();
    measureNode(nodeMeasuring(10, 20, 100, 40), done);
    expect(done).toHaveBeenCalledWith({ x: 10, y: 20, width: 100, height: 40 });
  });

  it('a view without size or without a node counts as not laid out', () => {
    const done = vi.fn();
    measureNode(nodeMeasuring(10, 20, 0, 0), done);
    measureNode(null, done);
    expect(done.mock.calls).toEqual([[null], [null]]);
  });

  it('a line (width or height 0) still counts as laid out', () => {
    const done = vi.fn();
    measureNode(nodeMeasuring(0, 0, 0, 40), done);
    expect(done).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 40 });
  });
});

describe('accessibilityProps (spec 0016, "Screenreader")', () => {
  it('without an action the source gets no accessibility action', () => {
    expect(accessibilityProps(undefined)).toEqual({});
  });

  it('offers the move under its label and runs it only for that action', () => {
    const onAction = vi.fn();
    const props = accessibilityProps({ label: 'Verschieben', onAction });
    expect(props.accessibilityActions).toEqual([{ name: 'move', label: 'Verschieben' }]);
    props.onAccessibilityAction?.(action('activate'));
    expect(onAction).not.toHaveBeenCalled();
    props.onAccessibilityAction?.(action('move'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
