import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AreaToneContext,
  ThemeProvider,
  useAreaColors,
  useBreakpoint,
  useTheme,
} from './theme-context';
import { getTheme, type Tone } from './themes';

function setWindowWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => setWindowWidth(0));

function ThemeProbe() {
  const theme = useTheme();
  return <span data-testid="theme">{`${theme.id}/${theme.mode}`}</span>;
}

function BreakpointProbe() {
  const { bp, isPhone, isWide, width } = useBreakpoint();
  return <span data-testid="bp">{`${bp} ${width} phone:${isPhone} wide:${isWide}`}</span>;
}

function AreaProbe() {
  return <span data-testid="area">{JSON.stringify(useAreaColors() ?? null)}</span>;
}

describe('ThemeProvider', () => {
  it('without a provider the default is Markthalle light', () => {
    render(<ThemeProbe />);
    expect(screen.getByTestId('theme').textContent).toBe('markthalle/light');
  });

  it('gives its theme and mode to everything inside', () => {
    render(
      <ThemeProvider themeId="frisch" mode="dark">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('frisch/dark');
  });
});

describe('useBreakpoint', () => {
  it.each([
    [390, 'phone 390 phone:true wide:false'],
    [699, 'phone 699 phone:true wide:false'],
    [700, 'tablet 700 phone:false wide:true'],
    [1099, 'tablet 1099 phone:false wide:true'],
    [1100, 'desktop 1100 phone:false wide:true'],
  ])('at %i points wide', (width, expected) => {
    setWindowWidth(width);
    render(<BreakpointProbe />);
    expect(screen.getByTestId('bp').textContent).toBe(expected);
  });

  it('follows the window when it is resized', () => {
    setWindowWidth(390);
    render(<BreakpointProbe />);
    act(() => setWindowWidth(1280));
    expect(screen.getByTestId('bp').textContent).toBe('desktop 1280 phone:false wide:true');
  });
});

describe('useAreaColors (spec 0005, D4)', () => {
  const area = (themeId: 'frisch' | 'markthalle', mode: 'light' | 'dark', tone?: Tone) =>
    render(
      <ThemeProvider themeId={themeId} mode={mode}>
        <AreaToneContext.Provider value={tone}>
          <AreaProbe />
        </AreaToneContext.Provider>
      </ThemeProvider>,
    );
  const value = () => JSON.parse(screen.getByTestId('area').textContent ?? 'null') as unknown;

  it('a theme that does not paint areas uses the accent (undefined)', () => {
    area('markthalle', 'light', 'essen');
    expect(value()).toBeNull();
  });

  it('a painting theme without an area uses the accent (undefined)', () => {
    area('frisch', 'light');
    expect(value()).toBeNull();
  });

  it('light mode fills with the soft shade and writes in the strong one', () => {
    const { bg, fg } = getTheme('frisch', 'light').colors.tones.essen;
    area('frisch', 'light', 'essen');
    expect(value()).toEqual({ fill: bg, onFill: fg, line: fg });
  });

  it('dark mode fills with the strong shade and writes in the soft one', () => {
    const { bg, fg } = getTheme('frisch', 'dark').colors.tones.plan;
    area('frisch', 'dark', 'plan');
    expect(value()).toEqual({ fill: fg, onFill: bg, line: fg });
  });
});
