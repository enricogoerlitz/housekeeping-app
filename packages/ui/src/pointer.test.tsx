import { render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';

import { pointer } from '../test/setup';
import { useFinePointer, useHover } from './pointer';

const setOS = (os: string) =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });

afterEach(() => setOS('web'));

function Probe(props: { hovered?: boolean }) {
  const fine = useFinePointer();
  const hover = useHover();
  return (
    <span data-testid="probe">{`fine:${String(fine)} hover:${String(hover(props.hovered))}`}</span>
  );
}

describe('useFinePointer / useHover (spec 0019, REQ-003)', () => {
  it('a mouse or trackpad: hover counts', () => {
    pointer.fine = true;
    render(<Probe hovered />);
    expect(screen.getByTestId('probe').textContent).toBe('fine:true hover:true');
  });

  it('a mouse that is not over the element: no hover', () => {
    pointer.fine = true;
    render(<Probe hovered={false} />);
    expect(screen.getByTestId('probe').textContent).toBe('fine:true hover:false');
  });

  it('touch: a sticky hover after a tap does not count', () => {
    render(<Probe hovered />);
    expect(screen.getByTestId('probe').textContent).toBe('fine:false hover:false');
  });

  it('native: never a fine pointer', () => {
    pointer.fine = true;
    setOS('ios');
    render(<Probe hovered />);
    expect(screen.getByTestId('probe').textContent).toBe('fine:false hover:false');
  });
});
