import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fontsFor, useFontsLoaded } from './font-loading';

// Spec 0058, REQ-006: a theme's fonts load when it is shown, never all at once.
const font = vi.hoisted(() => {
  const loaded = new Set<string>();
  const pending: { map: Record<string, number>; resolve: () => void; reject: () => void }[] = [];
  return {
    loaded,
    pending,
    isLoaded: (name: string) => loaded.has(name),
    loadAsync: (map: Record<string, number>) =>
      new Promise<void>((resolve, reject) => {
        pending.push({
          map,
          resolve: () => {
            Object.keys(map).forEach((name) => loaded.add(name));
            resolve();
          },
          reject: () => reject(new Error('font failed')),
        });
      }),
  };
});
vi.mock('expo-font', () => ({ isLoaded: font.isLoaded, loadAsync: font.loadAsync }));

const ASSETS = { A_400: 1, A_700: 2, B_400: 3 };

function Probe(props: { keys: string[] }) {
  const loaded = useFontsLoaded(props.keys, ASSETS);
  return <span data-testid="state">{loaded ? 'ready' : 'waiting'}</span>;
}
const state = () => screen.getByTestId('state').textContent;

beforeEach(() => {
  font.loaded.clear();
  font.pending.length = 0;
});

describe('fontsFor', () => {
  it('picks only the named files and ignores unknown names', () => {
    expect(fontsFor(['A_700', 'nope'], ASSETS)).toEqual({ A_700: 2 });
    expect(fontsFor([], ASSETS)).toEqual({});
  });
});

describe('useFontsLoaded (spec 0058, REQ-006)', () => {
  it('AC-012: a theme with the system font loads no file and is ready at once', () => {
    render(<Probe keys={[]} />);
    expect(state()).toBe('ready');
    expect(font.pending).toHaveLength(0);
  });

  it("AC-013: loads exactly the theme's own files and is ready once they are", async () => {
    render(<Probe keys={['A_400', 'A_700']} />);
    expect(state()).toBe('waiting');
    expect(font.pending.map((call) => call.map)).toEqual([{ A_400: 1, A_700: 2 }]);
    await act(async () => font.pending[0]?.resolve());
    expect(state()).toBe('ready');
  });

  it('AC-014: a file that fails to load does not hold the app back', async () => {
    render(<Probe keys={['B_400']} />);
    await act(async () => font.pending[0]?.reject());
    expect(state()).toBe('ready');
  });

  it('AC-015: another theme loads its own files; files already there are not loaded again', async () => {
    font.loaded.add('A_400');
    const { rerender } = render(<Probe keys={['A_400']} />);
    expect(state()).toBe('ready');
    expect(font.pending).toHaveLength(0);
    rerender(<Probe keys={['B_400']} />);
    expect(state()).toBe('waiting');
    expect(font.pending.map((call) => call.map)).toEqual([{ B_400: 3 }]);
    await act(async () => font.pending[0]?.resolve());
    expect(state()).toBe('ready');
  });
});
