import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { safeArea } from '../test/mocks/safe-area';
import { keyboard } from '../test/setup';
import { Button } from './controls';
import { Text } from './primitives';
import {
  AsideInsetContext,
  ComposerBar,
  Fab,
  PageScrollContext,
  PageScrollControlContext,
  Screen,
  ScreenHeader,
  Sidebar,
  TabBar,
  useBottomInset,
  type NavItem,
  type PageScrollControl,
} from './shell';
import { scrollShownToTop } from './scroll-top';
import { AreaToneContext, ThemeProvider } from './theme-context';

/** The window size react-native-web reads (jsdom reports 0 × 0, a phone). */
function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
const PHONE = [390, 844] as const;
const DESKTOP = [1280, 800] as const;

// onLayout in react-native-web comes from a ResizeObserver, which jsdom lacks: this one reports
// the size a test gives a view.
let reportResize: ((entries: { target: Element }[]) => void) | undefined;
const observed = new Set<Element>();
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    constructor(callback: (entries: { target: Element }[]) => void) {
      reportResize = callback;
    }
    observe(node: Element) {
      observed.add(node);
    }
    unobserve(node: Element) {
      observed.delete(node);
    }
    disconnect() {}
  },
});
/** Gives the measured view around `inside` the height `height`. */
function layout(inside: Element, height: number) {
  let node: Element | null = inside;
  while (node && !observed.has(node)) node = node.parentElement;
  Object.defineProperty(node!, 'offsetWidth', { configurable: true, value: 390 });
  Object.defineProperty(node!, 'offsetHeight', { configurable: true, value: height });
  act(() => {
    reportResize?.([{ target: node! }]);
    vi.advanceTimersByTime(0);
  });
}

/** The element of the page's scroll area, which has the scroll handler. */
function scrollArea(inside: Element): HTMLElement {
  let node: HTMLElement | null = inside as HTMLElement;
  while (node) {
    const key = Object.keys(node).find((name) => name.startsWith('__reactProps$'));
    const props = key ? (node as unknown as Record<string, { onScroll?: unknown }>)[key] : null;
    if (typeof props?.onScroll === 'function') return node;
    node = node.parentElement;
  }
  throw new Error('no scroll area');
}
function scrollTo(area: HTMLElement, y: number) {
  Object.defineProperty(area, 'scrollTop', { configurable: true, value: y });
  act(() => {
    fireEvent.scroll(area);
    vi.advanceTimersByTime(200);
  });
}

const header = (
  <ScreenHeader
    title="Rezepte"
    kicker="Montag"
    subtitle="12 Rezepte"
    right={<Button label="Neu" onPress={() => undefined} />}
  />
);

beforeEach(() => {
  vi.useFakeTimers();
  setWindow(...PHONE);
});
afterEach(() => {
  vi.useRealTimers();
  setWindow(0, 0);
});

describe('useBottomInset (spec 0029, REQ-002)', () => {
  function Probe(props: { minimum?: number }) {
    return <Text testID="inset">{String(useBottomInset(props.minimum))}</Text>;
  }

  it('without a home bar: the minimum', () => {
    render(<Probe minimum={12} />);
    expect(screen.getByTestId('inset').textContent).toBe('12');
  });

  it('with a home bar: the safe area plus the gap above it', () => {
    safeArea.insets = { top: 47, right: 0, bottom: 34, left: 0 };
    render(<Probe minimum={12} />);
    expect(screen.getByTestId('inset').textContent).toBe('42');
  });
});

describe('Screen (spec 0005, REQ-002)', () => {
  it('spec 0057 AC-009: a tap on the active tab scrolls the shown page to the top', () => {
    const probe = measurable();
    try {
      render(
        <Screen testID="page">
          <Text>Inhalt</Text>
        </Screen>,
      );
      expect(scrollShownToTop(false)).toBe(1);
      expect(probe.calls).toHaveLength(1);
      expect(probe.calls[0]?.top).toBe(0);
    } finally {
      probe.restore();
    }
  });

  it('shows header, tabs, toolbar, content and footer', () => {
    render(
      <Screen
        testID="page"
        header={header}
        tabs={<Text>Tabs</Text>}
        toolbar={<Text>Suche</Text>}
        footer={<Text>Fuß</Text>}
      >
        <Text>Inhalt</Text>
      </Screen>,
    );
    const page = screen.getByTestId('page');
    for (const text of ['Tabs', 'Suche', 'Inhalt', 'Fuß', 'Montag', '12 Rezepte']) {
      expect(within(page).getByText(text)).toBeTruthy();
    }
    expect(within(page).getByRole('heading', { name: 'Rezepte' })).toBeTruthy();
  });

  it('gives its area to the content (spec 0005, D4)', () => {
    function Area() {
      return <Text testID="tone">{useContext(AreaToneContext) ?? 'none'}</Text>;
    }
    setWindow(...DESKTOP);
    const { rerender } = render(
      <Screen tone="essen" header={header}>
        <Area />
      </Screen>,
    );
    expect(screen.getByTestId('tone').textContent).toBe('essen');
    setWindow(...PHONE);
    rerender(
      <Screen tone="essen" header={header}>
        <Area />
      </Screen>,
    );
    expect(screen.getByTestId('tone').textContent).toBe('essen');
  });

  it('phones: the content stays hidden until the header was measured, so nothing jumps', () => {
    render(
      <Screen header={header}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    const area = scrollArea(screen.getByText('Inhalt'));
    expect(area.style.opacity).toBe('0');
    layout(screen.getByTestId('screen-title'), 120);
    expect(area.style.opacity).toBe('1');
  });

  it('wider screens: the content shows at once, without a header lying over it', () => {
    setWindow(...DESKTOP);
    render(
      <Screen header={header}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    expect(scrollArea(screen.getByText('Inhalt')).style.opacity).toBe('1');
  });

  it('phones: the header shrinks to a narrow bar once scrolled and grows back at the top', () => {
    render(
      <Screen header={header}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    const area = scrollArea(screen.getByText('Inhalt'));
    layout(screen.getByTestId('screen-title'), 120);
    expect(screen.getByText('Montag')).toBeTruthy();
    scrollTo(area, 30);
    expect(screen.getByText('Montag')).toBeTruthy();
    scrollTo(area, 100);
    expect(screen.queryByText('Montag')).toBeNull();
    expect(screen.queryByText('12 Rezepte')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rezepte' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neu' })).toBeTruthy();
    // The narrow bar measured: the scroll area starts below it, so headings stick under it.
    layout(screen.getByTestId('screen-title'), 56);
    expect(area.style.marginTop).toBe('56px');
    scrollTo(area, 20);
    expect(screen.queryByText('Montag')).toBeNull();
    scrollTo(area, 0);
    expect(screen.getByText('Montag')).toBeTruthy();
  });

  it('phones: the toolbar slides away while scrolling down', () => {
    render(
      <Screen header={header} toolbar={<Text>Suche</Text>}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    layout(screen.getByTestId('screen-title'), 120);
    layout(screen.getByText('Suche'), 50);
    const toolbar = screen.getByText('Suche').parentElement!.parentElement!;
    expect(toolbar.style.top).toBe('120px');
    scrollTo(scrollArea(screen.getByText('Inhalt')), 100);
    expect(toolbar.style.transform).toBe('translateY(-50px)');
  });

  it('wider screens: the header never shrinks', () => {
    setWindow(...DESKTOP);
    render(
      <Screen header={header}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    scrollTo(scrollArea(screen.getByText('Inhalt')), 300);
    expect(screen.getByText('Montag')).toBeTruthy();
  });

  it('a page that scrolls itself gets the header space and the scroll handler', () => {
    let page: { inset: number; onScroll: (y: number) => void } | undefined;
    function List() {
      page = useContext(PageScrollContext);
      return <Text>Liste</Text>;
    }
    render(
      <Screen header={header} scroll={false}>
        <List />
      </Screen>,
    );
    layout(screen.getByTestId('screen-title'), 120);
    expect(page?.inset).toBe(120);
    act(() => page!.onScroll(100));
    expect(screen.queryByText('Montag')).toBeNull();
    act(() => page!.onScroll(0));
    expect(screen.getByText('Montag')).toBeTruthy();
  });

  it('wider screens: a page that scrolls itself needs no inset', () => {
    setWindow(...DESKTOP);
    let page: { inset: number } | undefined;
    function List() {
      page = useContext(PageScrollContext);
      return null;
    }
    render(
      <Screen header={header} scroll={false}>
        <List />
      </Screen>,
    );
    expect(page?.inset).toBe(0);
  });

  it('spec 0016: a drag can switch the page scrolling off, scroll it along and measure it', () => {
    let control: PageScrollControl | undefined;
    function Drag() {
      control = useContext(PageScrollControlContext);
      return <Text>Eintrag</Text>;
    }
    render(
      <Screen>
        <Drag />
      </Screen>,
    );
    const area = scrollArea(screen.getByText('Eintrag'));
    const scroll = vi.fn();
    Object.defineProperty(area, 'scroll', { configurable: true, value: scroll });
    scrollTo(area, 100);
    act(() => control!.scrollBy(40));
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ top: 140 }));
    act(() => control!.scrollBy(-300));
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));

    act(() => control!.setScrollEnabled(false));
    expect(getComputedStyle(area).overflowY).toBe('hidden');
    act(() => control!.setScrollEnabled(true));
    expect(getComputedStyle(area).overflowY).not.toBe('hidden');

    const done = vi.fn();
    act(() => {
      control!.measure(done);
      vi.advanceTimersByTime(0);
    });
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0, width: expect.any(Number), height: 0 }),
    );
  });

  it('measuring after the page is gone reports nothing', () => {
    let control: PageScrollControl | undefined;
    function Drag() {
      control = useContext(PageScrollControlContext);
      return null;
    }
    const { unmount } = render(
      <Screen>
        <Drag />
      </Screen>,
    );
    unmount();
    const done = vi.fn();
    control!.measure(done);
    expect(done).toHaveBeenCalledWith(null);
  });

  it('a panel in `aside` gets room at the end of the page; wider screens put it beside', () => {
    let report: ((height: number) => void) | undefined;
    function Panel() {
      report = useContext(AsideInsetContext);
      return <Text>Panel</Text>;
    }
    setWindow(...DESKTOP);
    render(
      <Screen aside={<Panel />} header={header}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    expect(screen.getByText('Panel')).toBeTruthy();
    const content = screen.getByText('Inhalt').parentElement!;
    expect(content.style.paddingBottom).toBe('96px');
    act(() => report!(300));
    expect(content.style.paddingBottom).toBe('324px');
  });

  it('without the assistant button the page ends with a small gap', () => {
    render(
      <Screen clearFab={false}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    expect(screen.getByText('Inhalt').parentElement!.style.paddingBottom).toBe('24px');
  });

  it('spec 0030, REQ-007: under a tab swipe the content pans only vertically and swipes', () => {
    const onStep = vi.fn();
    render(
      <Screen header={header} tabSwipe={{ index: 0, count: 2, onStep }}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    const content = screen.getByText('Inhalt').parentElement!;
    expect(content.style.touchAction).toBe('pan-y');
  });

  it('without a tab swipe the browser keeps every pan', () => {
    render(
      <Screen header={header}>
        <Text>Inhalt</Text>
      </Screen>,
    );
    expect(screen.getByText('Inhalt').parentElement!.style.touchAction).toBe('');
  });
});

describe('ScreenHeader', () => {
  it('title as heading with kicker, line above, subtitle and buttons', () => {
    render(
      <ScreenHeader
        title="Übersicht"
        kicker="Montag"
        subtitle="3 Termine"
        above={<Text>WG</Text>}
        right={<Button label="Neu" onPress={() => undefined} />}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Übersicht' })).toBeTruthy();
    expect(screen.getByTestId('screen-title').textContent).toBe('Übersicht');
    for (const text of ['Montag', '3 Termine', 'WG']) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neu' })).toBeTruthy();
  });

  it('"Zurück" goes back', () => {
    const onBack = vi.fn();
    render(<ScreenHeader title="Rezept" onBack={onBack} testID="title" />);
    expect(screen.getByTestId('title').textContent).toBe('Rezept');
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('spec 0010, AC-025: "‹ Kalender" names where back leads', () => {
    const onBack = vi.fn();
    render(<ScreenHeader title="Montag" onBack={onBack} backLabel="Kalender" />);
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    const back = screen.getByRole('button', { name: 'Zurück: Kalender' });
    expect(screen.getByTestId('back-label').textContent).toBe('Kalender');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('in the narrow bar "‹ Kalender" becomes the arrow and the extra lines go', () => {
    render(
      <Screen
        header={
          <ScreenHeader
            title="Montag"
            kicker="November"
            above={<Text>WG</Text>}
            onBack={() => undefined}
            backLabel="Kalender"
          />
        }
      >
        <Text>Inhalt</Text>
      </Screen>,
    );
    layout(screen.getByTestId('screen-title'), 120);
    scrollTo(scrollArea(screen.getByText('Inhalt')), 100);
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Zurück: Kalender' })).toBeNull();
    expect(screen.queryByText('WG')).toBeNull();
    expect(screen.queryByText('November')).toBeNull();
  });

  describe('titleOnScroll (spec 0008, AC-019, AC-020)', () => {
    const bar = (
      <ScreenHeader
        title="Lasagne"
        titleOnScroll
        onBack={() => undefined}
        right={<Button label="Bearbeiten" onPress={() => undefined} />}
      />
    );

    it('AC-019: on phones the title appears only once the page is scrolled', () => {
      render(
        <Screen header={bar}>
          <Text>Inhalt</Text>
        </Screen>,
      );
      expect(screen.queryByRole('heading', { name: 'Lasagne' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Zurück' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeTruthy();
      layout(screen.getByRole('button', { name: 'Zurück' }), 60);
      scrollTo(scrollArea(screen.getByText('Inhalt')), 100);
      expect(screen.getByRole('heading', { name: 'Lasagne' })).toBeTruthy();
    });

    it('AC-020: wider screens show the title from the start', () => {
      setWindow(...DESKTOP);
      render(bar);
      expect(screen.getByRole('heading', { name: 'Lasagne' })).toBeTruthy();
    });

    it('with a back label the bar shows "‹ Kalender"', () => {
      const onBack = vi.fn();
      render(<ScreenHeader title="Montag" titleOnScroll onBack={onBack} backLabel="Kalender" />);
      fireEvent.click(screen.getByRole('button', { name: 'Zurück: Kalender' }));
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    });

    it('without back only the title', () => {
      setWindow(...DESKTOP);
      render(<ScreenHeader title="Montag" titleOnScroll testID="bar-title" />);
      expect(screen.getByTestId('bar-title').textContent).toBe('Montag');
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});

const items: NavItem[] = [
  { key: 'today', label: 'Heute', icon: 'house' },
  { key: 'recipes', label: 'Rezepte', icon: 'book-open' },
];

describe('TabBar', () => {
  it('spec 0032, AC-001, AC-002: hidden while the keyboard is open, back once it closes', () => {
    render(<TabBar items={items} activeKey="today" onSelect={() => undefined} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    act(() => keyboard.open(400));
    expect(screen.queryByRole('tablist')).toBeNull();
    act(() => keyboard.close());
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  it('spec 0032, AC-003: 100 px less visible (browser bar) keeps it', () => {
    render(<TabBar items={items} activeKey="today" onSelect={() => undefined} />);
    act(() => keyboard.open(744));
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  it('a tab list of named tabs; a tap selects another', () => {
    const onSelect = vi.fn();
    render(<TabBar items={items} activeKey="today" onSelect={onSelect} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Rezepte' }));
    expect(onSelect).toHaveBeenCalledWith('recipes');
    expect(screen.getByTestId('tab-today')).toBeTruthy();
  });

  // react-native-web ignores `accessibilityState`; the tab sets `aria-selected` itself.
  it('the active tab is announced as selected on the web', () => {
    render(
      <ThemeProvider themeId="frisch" mode="light">
        <TabBar items={items} activeKey="recipes" onSelect={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('tab', { name: 'Rezepte' }).getAttribute('aria-selected')).toBe('true');
  });

  it('stands above the home bar', () => {
    safeArea.insets = { top: 0, right: 0, bottom: 34, left: 0 };
    render(<TabBar items={items} activeKey="today" onSelect={() => undefined} />);
    const bar = screen.getByRole('tablist');
    expect(bar.style.paddingBottom).toBe('42px');
    expect(bar.style.height).toBe('104px');
  });
});

describe('Sidebar (spec 0005, REQ-010)', () => {
  it('household button, areas as tabs, groups of links and a footer', () => {
    const onBrandPress = vi.fn();
    const onSelect = vi.fn();
    const onShops = vi.fn();
    render(
      <Sidebar
        brand="WG"
        brandLabel="WG, Haushalt wechseln"
        onBrandPress={onBrandPress}
        items={items}
        activeKey="recipes"
        onSelect={onSelect}
        belowItems={<Button label="Assistent" onPress={() => undefined} />}
        groupsTestID="sidebar-groups"
        groups={[
          {
            key: 'manage',
            title: 'Verwalten',
            blocks: [
              [
                {
                  key: 'shops',
                  label: 'Supermärkte',
                  icon: 'store',
                  onPress: onShops,
                  active: true,
                },
              ],
              [{ key: 'members', label: 'Mitglieder', icon: 'users', onPress: () => undefined }],
            ],
            extra: <Text>Schalter</Text>,
          },
        ]}
        footer={<Text>Profil</Text>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'WG, Haushalt wechseln' }));
    expect(onBrandPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('WG')).toBeTruthy();

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Heute' }));
    expect(onSelect).toHaveBeenCalledWith('today');

    const groups = screen.getByTestId('sidebar-groups');
    expect(within(groups).getByText('Verwalten')).toBeTruthy();
    const shops = within(groups).getByRole('link', { name: 'Supermärkte' });
    expect(shops.getAttribute('aria-current')).toBe('page');
    const members = within(groups).getByRole('link', { name: 'Mitglieder' });
    expect(members.getAttribute('aria-current')).toBeNull();
    fireEvent.click(shops);
    expect(onShops).toHaveBeenCalledTimes(1);
    expect(within(groups).getByText('Schalter')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Assistent' })).toBeTruthy();
    expect(screen.getByText('Profil')).toBeTruthy();
  });

  // As in the TabBar: `aria-selected`, since `accessibilityState` does not reach the browser.
  it('the active area is announced as selected on the web', () => {
    render(
      <Sidebar brand="WG" brandLabel="WG" items={items} activeKey="today" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('tab', { name: 'Heute' }).getAttribute('aria-selected')).toBe('true');
  });

  it('without groups and footer only the household and the areas', () => {
    render(
      <ThemeProvider themeId="klar" mode="dark">
        <Sidebar brand="WG" brandLabel="WG" items={items} activeKey="today" onSelect={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('Fab', () => {
  it('a button named by its label', () => {
    const onPress = vi.fn();
    render(<Fab icon="sparkles" label="Assistent" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistent' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('assistant-open')).toBeTruthy();
  });
});

describe('ComposerBar', () => {
  it('holds its input', () => {
    render(
      <ComposerBar testID="composer">
        <Text>Artikel hinzufügen</Text>
      </ComposerBar>,
    );
    expect(within(screen.getByTestId('composer')).getByText('Artikel hinzufügen')).toBeTruthy();
  });

  it('wider screens too', () => {
    setWindow(...DESKTOP);
    render(
      <ComposerBar testID="composer">
        <Text>Artikel hinzufügen</Text>
      </ComposerBar>,
    );
    expect(screen.getByTestId('composer')).toBeTruthy();
  });
});

/** Lets every element report a box (jsdom has no layout) and records `scroll` calls. */
function measurable(): { calls: { el: Element; top: unknown }[]; restore: () => void } {
  const calls: { el: Element; top: unknown }[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const rects = proto.getClientRects;
  const scroll = proto.scroll;
  proto.getClientRects = () => [{}];
  proto.scroll = function (this: Element, options: { top?: unknown }) {
    calls.push({ el: this, top: options.top });
  };
  return {
    calls,
    restore: () => {
      proto.getClientRects = rects;
      proto.scroll = scroll;
    },
  };
}
