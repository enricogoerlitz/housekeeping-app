import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Divider, Icon, Row, Stack, Surface, Text, useColor, type ColorToken } from './primitives';
import { ThemeProvider, ToneContext } from './theme-context';
import { getTheme } from './themes';

describe('Text', () => {
  it('a heading is a heading for screen readers', () => {
    render(<Text heading>Rezepte</Text>);
    expect(screen.getByRole('heading', { name: 'Rezepte' })).toBeTruthy();
  });

  it('renders an icon', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('plain text is no heading', () => {
    render(<Text testID="t">Milch</Text>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByTestId('t').textContent).toBe('Milch');
  });

  it('strike draws the text crossed out', () => {
    render(
      <Text strike testID="t">
        Milch
      </Text>,
    );
    expect(screen.getByTestId('t').style.textDecorationLine).toBe('line-through');
  });

  it('spec 0057 AC-021: title roles break between words only, never by automatic hyphenation', () => {
    render(
      <>
        <Text variant="rowTitle" testID="title">
          Halloumi-Pfanne
        </Text>
        <Text variant="cardTitle" testID="card">
          Spaghetti Bolognese
        </Text>
        <Text testID="body">Rindfleischetikettierung</Text>
      </>,
    );
    expect(screen.getByTestId('title').style.getPropertyValue('hyphens')).toBe('manual');
    expect(screen.getByTestId('card').style.getPropertyValue('hyphens')).toBe('manual');
    expect(screen.getByTestId('body').style.getPropertyValue('hyphens')).toBe('');
  });

  it('spec 0057 AC-022, AC-023: with wholeWords a word wider than the line cuts the title to one line with "…"', () => {
    vi.useFakeTimers();
    render(
      <Text variant="caption" numberOfLines={2} wholeWords testID="tile">
        Kichererbsen-Eintopf
      </Text>,
    );
    const tile = screen.getByTestId('tile');
    // Words are not broken inside, so a too long one overflows and can be told.
    expect(tile.style.getPropertyValue('overflow-wrap')).toBe('normal');
    expect(oneLine(tile)).toBe(false);
    Object.defineProperty(tile, 'scrollWidth', { configurable: true, value: 96 });
    Object.defineProperty(tile, 'clientWidth', { configurable: true, value: 80 });
    layout(tile, 80, 32);
    expect(oneLine(tile)).toBe(true);
    vi.useRealTimers();
  });

  it('spec 0057 AC-021: with wholeWords a title whose words fit keeps its lines', () => {
    vi.useFakeTimers();
    render(
      <Text variant="cardTitle" numberOfLines={2} wholeWords testID="card">
        Halloumi-Pfanne
      </Text>,
    );
    const card = screen.getByTestId('card');
    Object.defineProperty(card, 'scrollWidth', { configurable: true, value: 140 });
    Object.defineProperty(card, 'clientWidth', { configurable: true, value: 140 });
    layout(card, 140, 46);
    expect(oneLine(card)).toBe(false);
    vi.useRealTimers();
  });
});

// onLayout in react-native-web comes from a ResizeObserver, which jsdom lacks: this one reports
// the size a test gives a view.
let reportResize: ((entries: { target: Element }[]) => void) | undefined;
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    constructor(callback: (entries: { target: Element }[]) => void) {
      reportResize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
/** react-native-web draws one line with "…" by classes: no wrapping, text-overflow ellipsis. */
function oneLine(node: Element): boolean {
  return node.className.includes('r-whiteSpace') && node.className.includes('r-textOverflow');
}
function layout(node: Element, width: number, height: number) {
  Object.defineProperty(node, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height });
  act(() => {
    reportResize?.([{ target: node }]);
    vi.advanceTimersByTime(0);
  });
}

function Colors(props: { fallback?: ColorToken }) {
  const resolved = {
    text: useColor('text'),
    muted: useColor('muted'),
    accent: useColor('accent'),
    onAccent: useColor('onAccent'),
    success: useColor('success'),
    onSuccess: useColor('onSuccess'),
    warn: useColor('warn'),
    star: useColor('star'),
    due: useColor('due'),
    removed: useColor('removed'),
    none: useColor(undefined, props.fallback),
  };
  return <span data-testid="colors">{JSON.stringify(resolved)}</span>;
}
const read = () =>
  JSON.parse(screen.getByTestId('colors').textContent ?? '{}') as Record<string, string>;

describe('useColor', () => {
  it('resolves every token from the theme', () => {
    const c = getTheme('klar', 'dark').colors;
    render(
      <ThemeProvider themeId="klar" mode="dark">
        <Colors />
      </ThemeProvider>,
    );
    expect(read()).toEqual({
      text: c.text,
      muted: c.textMuted,
      accent: c.accent,
      onAccent: c.onAccent,
      success: c.success,
      onSuccess: c.onSuccess,
      warn: c.warnText,
      star: c.star,
      due: c.due,
      removed: c.removedText,
      none: c.text,
    });
  });

  it('without a token it takes the fallback', () => {
    render(<Colors fallback="muted" />);
    expect(read().none).toBe(getTheme('markthalle', 'light').colors.textMuted);
  });

  it('on a tone tile text, muted and accent take the tile foreground; the rest stays', () => {
    const c = getTheme('markthalle', 'light').colors;
    render(
      <ToneContext.Provider value={{ fg: '#123456' }}>
        <Colors />
      </ToneContext.Provider>,
    );
    const colors = read();
    expect([colors.text, colors.muted, colors.accent]).toEqual(['#123456', '#123456', '#123456']);
    expect(colors.success).toBe(c.success);
    expect(colors.onAccent).toBe(c.onAccent);
  });
});

describe('Surface', () => {
  it('resets an inherited tone, so text on it uses the normal colours again', () => {
    const c = getTheme('markthalle', 'light').colors;
    render(
      <ToneContext.Provider value={{ fg: '#123456' }}>
        <Surface testID="card" sunken padding={0}>
          <Colors />
        </Surface>
      </ToneContext.Provider>,
    );
    expect(screen.getByTestId('card')).toBeTruthy();
    expect(read().text).toBe(c.text);
  });

  it('a card with a border theme shows its content', () => {
    render(
      <ThemeProvider themeId="klar" mode="light">
        <Surface testID="card">
          <Text>Inhalt</Text>
        </Surface>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('card').textContent).toBe('Inhalt');
  });
});

describe('layout helpers', () => {
  it('Row, Stack and Divider keep their children in order', () => {
    const { container } = render(
      <Stack gap={4}>
        <Row gap={2} wrap justify="space-between">
          <Text>A</Text>
          <Text>B</Text>
        </Row>
        <Divider inset={16} />
        <Row>
          <Text>C</Text>
        </Row>
      </Stack>,
    );
    expect(container.textContent).toBe('ABC');
  });
});

describe('Icon', () => {
  it('filled paints the shape in the stroke colour; otherwise it stays empty', () => {
    const { container } = render(
      <>
        <Icon name="star" filled color="star" size={14} testID="full" />
        <Icon name="star" testID="empty" />
      </>,
    );
    const [full, empty] = Array.from(container.querySelectorAll('svg'));
    expect(full?.getAttribute('fill')).not.toBe('none');
    expect(empty?.getAttribute('fill')).toBe('none');
  });
});
