import { act, fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pointer } from '../test/setup';
import { Button, IconButton } from './controls';
import {
  Avatar,
  AvatarStack,
  Badge,
  DueBar,
  EmptyState,
  KindDot,
  KindLine,
  LoadingLines,
  MediaCard,
  Notice,
  OfflineBanner,
  Photo,
  PhotoCollage,
  ProgressBar,
  ProposalCard,
  StatusBanner,
  TypingIndicator,
  type ProposalPartView,
} from './display';
import { Text } from './primitives';
import { ThemeProvider } from './theme-context';
import { getTheme, type ThemeId } from './themes';

afterEach(() => vi.restoreAllMocks());

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const PHOTO = { uri: 'https://example.org/curry.jpg' };

describe('Avatar', () => {
  it('is an image named by the member, showing the initial', () => {
    render(<Avatar name="nadja" color="#335577" size="l" testID="avatar" />);
    const avatar = screen.getByRole('img', { name: 'nadja' });
    expect(avatar).toBe(screen.getByTestId('avatar'));
    expect(avatar.textContent).toBe('N');
  });
});

describe('AvatarStack', () => {
  const members = [
    { id: '1', name: 'Nadja', color: '#335577' },
    { id: '2', name: 'Enrico', color: '#553377' },
  ];

  it('without a label every member is an image of its own', () => {
    render(<AvatarStack members={members} size="xs" />);
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('aria-label'))).toEqual([
      'Nadja',
      'Enrico',
    ]);
  });

  it('with a label the stack is read as one image', () => {
    render(<AvatarStack members={members} accessibilityLabel="dran: Nadja, Enrico" />);
    expect(screen.getByRole('img', { name: 'dran: Nadja, Enrico' })).toBeTruthy();
  });
});

describe('Badge', () => {
  const tones = ['neutral', 'success', 'warn', 'accent', 'essen'] as const;
  it.each(tones)('%s: shows its label in the tone colours', (tone) => {
    const c = getTheme('markthalle', 'light').colors;
    const fg = {
      neutral: c.text,
      success: c.tones.liste.fg,
      warn: c.warnText,
      accent: c.accent === c.text ? c.text : c.accent,
      essen: c.tones.essen.fg,
    }[tone];
    render(<Badge label="vegan" tone={tone} icon="leaf" testID="badge" />);
    expect(screen.getByText('vegan').style.color).toBe(rgb(fg));
    expect(screen.getByTestId('badge').querySelector('svg')).toBeTruthy();
  });

  it('the accent badge writes in the text colour when the accent is the text colour', () => {
    const c = getTheme('frisch', 'light').colors;
    expect(c.accent).toBe(c.text);
    render(
      <ThemeProvider themeId="frisch" mode="light">
        <Badge label="neu" tone="accent" />
      </ThemeProvider>,
    );
    expect(screen.getByText('neu').style.color).toBe(rgb(c.text));
  });

  it('defaults to neutral without an icon', () => {
    render(<Badge label="Vorrat" testID="badge" />);
    expect(screen.getByTestId('badge').querySelector('svg')).toBeNull();
  });
});

describe('Photo', () => {
  it('without a source shows the placeholder symbol', () => {
    render(<Photo testID="photo" placeholderIcon="leaf" />);
    expect(screen.getByTestId('photo').querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('with a source and alt the picture is described', () => {
    render(<Photo testID="photo" source={PHOTO} alt="Curry im Topf" height={120} />);
    expect(screen.getByTestId('photo').querySelector('svg')).toBeNull();
    expect(screen.getByLabelText('Curry im Topf')).toBeTruthy();
  });

  it('AC-010: while the photo loads a calm surface of the same size stands, without the symbol', () => {
    render(<Photo testID="photo" placeholderIcon="leaf" loading width={80} height={60} />);
    const surface = screen.getByTestId('photo');
    expect(surface.querySelector('svg')).toBeNull();
    expect(getComputedStyle(surface).width).toBe('80px');
    expect(getComputedStyle(surface).height).toBe('60px');
  });

  it('without alt the picture is decorative', () => {
    render(<Photo testID="photo" source={PHOTO} />);
    expect(screen.queryByLabelText(/./)).toBeNull();
  });

  it('spec 0045 AC-015: while it is generated the tile pulses as a progress indicator with a symbol', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const loop = vi.spyOn(Animated, 'loop');
    const { unmount } = render(
      <Photo testID="photo" generating="Foto wird erzeugt" aspectRatio={1} width={80} />,
    );
    await act(async () => undefined);
    const tile = screen.getByRole('progressbar', { name: 'Foto wird erzeugt' });
    expect(tile.querySelector('svg')).toBeTruthy();
    expect(loop).toHaveBeenCalled();
    unmount();
  });

  it('spec 0045 AC-016: reduced motion: the tile stands still', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = vi.spyOn(Animated, 'loop');
    render(<Photo testID="photo" generating="Foto wird erzeugt" aspectRatio={1} width={80} />);
    await act(async () => undefined);
    expect(screen.getByRole('progressbar', { name: 'Foto wird erzeugt' })).toBeTruthy();
    expect(loop).not.toHaveBeenCalled();
  });
});

describe('LoadingLines (spec 0055, REQ-003)', () => {
  it('AC-010: placeholder lines pulse under one progress indicator with the status', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const loop = vi.spyOn(Animated, 'loop');
    render(<LoadingLines label="Das Rezept wird gelesen …" lines={4} testID="lines" />);
    await act(async () => undefined);
    const indicator = screen.getByRole('progressbar', { name: 'Das Rezept wird gelesen …' });
    expect(indicator).toBeTruthy();
    expect(screen.getAllByTestId(/^lines-line-/)).toHaveLength(4);
    expect(loop).toHaveBeenCalled();
  });

  it('AC-012: reduced motion: the lines stand still', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = vi.spyOn(Animated, 'loop');
    render(<LoadingLines label="Der Ort wird eingeordnet …" testID="lines" />);
    await act(async () => undefined);
    expect(screen.getByRole('progressbar', { name: 'Der Ort wird eingeordnet …' })).toBeTruthy();
    expect(loop).not.toHaveBeenCalled();
  });
});

describe('PhotoCollage (spec 0009, E14)', () => {
  it('without photos shows the placeholder', () => {
    render(<PhotoCollage testID="cover" sources={[]} />);
    expect(screen.getByTestId('cover').querySelector('svg')).toBeTruthy();
  });

  it('one photo is a plain photo', () => {
    render(<PhotoCollage testID="cover" sources={[PHOTO]} alt="Grillabend" />);
    expect(screen.queryByTestId('cover-tile-0')).toBeNull();
    expect(screen.getByLabelText('Grillabend')).toBeTruthy();
  });

  it.each([
    [2, 2],
    [3, 3],
    [4, 4],
    [6, 4],
  ])('%i photos give %i tiles; alt describes the collage as one image', (count, tiles) => {
    const sources = Array.from({ length: count }, (_, index) => ({ uri: `p${index}.jpg` }));
    render(<PhotoCollage testID="cover" sources={sources} alt="Grillabend" />);
    for (let index = 0; index < 4; index += 1) {
      expect(screen.queryByTestId(`cover-tile-${index}`) !== null).toBe(index < tiles);
    }
    expect(screen.getByRole('img', { name: 'Grillabend' })).toBe(screen.getByTestId('cover'));
  });

  it('without alt the collage is decorative', () => {
    render(<PhotoCollage testID="cover" sources={[PHOTO, PHOTO]} />);
    expect(screen.getByTestId('cover').getAttribute('role')).toBeNull();
  });
});

describe('MediaCard', () => {
  const THEMES: ThemeId[] = ['markthalle', 'klar'];

  it.each(THEMES)('%s: a pressable card is one button named by title and badge', (themeId) => {
    const open = vi.fn();
    render(
      <ThemeProvider themeId={themeId} mode="light">
        <MediaCard
          testID="card"
          title="Curry"
          kicker="Abend · 60 Min"
          meta="für 4"
          image={PHOTO}
          badge={{ label: 'Rezept', icon: 'chef-hat', testID: 'card-badge' }}
          onPress={open}
        />
      </ThemeProvider>,
    );
    const card = screen.getByRole('button', { name: 'Curry, Rezept' });
    expect(card.textContent).toContain('Abend · 60 Min');
    expect(card.textContent).toContain('für 4');
    expect(screen.getByTestId('card-badge').textContent).toBe('Rezept');
    fireEvent.click(card);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each(THEMES)('%s: the corner is a button of its own beside the card', (themeId) => {
    const open = vi.fn();
    const route = vi.fn();
    render(
      <ThemeProvider themeId={themeId} mode="light">
        <MediaCard
          title="Biergarten"
          size="l"
          onPress={open}
          corner={<IconButton icon="map-pin" label="Route" onPress={route} />}
        />
      </ThemeProvider>,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.parentElement?.closest('[role="button"]')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Route' }));
    expect(route).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Biergarten' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('without onPress it is no button; custom meta shows as given', () => {
    render(
      <MediaCard
        testID="card"
        title="Curry"
        layout="thumbRow"
        meta={<Text>Nadja kocht</Text>}
        badge={{ label: 'Rezept' }}
        kicker="Abend"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('card').textContent).toBe('RezeptAbendCurryNadja kocht');
  });

  it('a forced photo-on-top layout with a collage, an aspect ratio and a large size', () => {
    render(
      <MediaCard
        testID="card"
        title="Grillabend"
        layout="photoTop"
        size="l"
        photoAspectRatio={4 / 3}
        images={[PHOTO, PHOTO, PHOTO]}
        badge={{ label: 'Sammlung' }}
      />,
    );
    expect(screen.getByTestId('card').textContent).toBe('SammlungGrillabend');
  });

  it('AC-007: with a mouse the card still presses while hovered', () => {
    pointer.fine = true;
    const open = vi.fn();
    render(<MediaCard title="Curry" layout="photoTop" onPress={open} />);
    const card = screen.getByRole('button', { name: 'Curry' });
    fireEvent.mouseOver(card);
    fireEvent.click(card);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressBar and DueBar', () => {
  // react-native-web drops `accessibilityValue`, so the share is read from the fill's width.
  const fill = (name: string) =>
    (screen.getByRole('progressbar', { name }).firstElementChild as HTMLElement).style.width;

  it('ProgressBar: a progress bar named by its label, filled by its value, clamped', () => {
    render(
      <>
        <ProgressBar value={0.42} label="Einkauf" testID="bar" />
        <ProgressBar value={1.7} label="Über voll" />
        <ProgressBar value={-1} label="Leer" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'Einkauf' })).toBe(screen.getByTestId('bar'));
    expect([fill('Einkauf'), fill('Über voll'), fill('Leer')]).toEqual(['42%', '100%', '0%']);
  });

  it('DueBar: never fully empty, full when overdue', () => {
    render(
      <>
        <DueBar value={0} label="Bad putzen" />
        <DueBar value={0.5} label="Küche" />
        <DueBar value={1.5} label="Fenster" />
      </>,
    );
    expect([fill('Bad putzen'), fill('Küche'), fill('Fenster')]).toEqual(['4%', '50%', '100%']);
  });

  it('review 0031: the value reaches the browser as aria-valuenow (0 to 100)', () => {
    render(
      <>
        <ProgressBar value={0.42} label="Einkauf" />
        <DueBar value={0.5} label="Küche" />
      </>,
    );
    const now = (name: string) => {
      const bar = screen.getByRole('progressbar', { name });
      return [
        bar.getAttribute('aria-valuemin'),
        bar.getAttribute('aria-valuemax'),
        bar.getAttribute('aria-valuenow'),
      ];
    };
    expect(now('Einkauf')).toEqual(['0', '100', '42']);
    expect(now('Küche')).toEqual(['0', '100', '50']);
  });
});

describe('EmptyState', () => {
  it('a heading, text and first steps as buttons', () => {
    const create = vi.fn();
    render(
      <EmptyState testID="empty" icon="chef-hat" title="Noch keine Rezepte" text="Leg eins an.">
        <Button key="new" label="Rezept anlegen" onPress={create} />
        <Button label="Importieren" />
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { name: 'Noch keine Rezepte' })).toBeTruthy();
    expect(screen.getByText('Leg eins an.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rezept anlegen' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeTruthy();
  });

  it('AC-085: each button sits in a box of its own', () => {
    render(
      <EmptyState icon="chef-hat" title="Leer">
        <Button label="Eins" />
        <Button label="Zwei" />
      </EmptyState>,
    );
    const [one, two] = screen.getAllByRole('button');
    expect(one?.parentElement).not.toBe(two?.parentElement);
  });

  it('only the title without text and steps', () => {
    render(<EmptyState testID="empty" icon="chef-hat" title="Leer" />);
    expect(screen.getByTestId('empty').textContent).toBe('Leer');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('banners', () => {
  it('OfflineBanner: an alert with its text and the default test id', () => {
    render(<OfflineBanner text="Offline – Änderungen später" />);
    const banner = screen.getByRole('alert');
    expect(banner).toBe(screen.getByTestId('offline-banner'));
    expect(banner.textContent).toBe('Offline – Änderungen später');
    expect(screen.getByText('Offline – Änderungen später').style.color).toBe(
      rgb(getTheme('markthalle', 'light').colors.warnText),
    );
  });

  it('OfflineBanner: takes its own test id', () => {
    render(<OfflineBanner text="Offline" testID="offline" />);
    expect(screen.getByTestId('offline')).toBe(screen.getByRole('alert'));
  });

  it('StatusBanner: a polite status with an action', () => {
    const reload = vi.fn();
    render(
      <StatusBanner
        testID="update"
        icon="refresh-cw"
        text="Neue Version da"
        action={<Button label="Neu laden" onPress={reload} />}
      />,
    );
    const banner = screen.getByRole('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.textContent).toContain('Neue Version da');
    fireEvent.click(screen.getByRole('button', { name: 'Neu laden' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('StatusBanner: without an action only the text', () => {
    render(<StatusBanner icon="refresh-cw" text="Neue Version da" />);
    expect(screen.getByRole('status').textContent).toBe('Neue Version da');
  });

  it('Notice: a quiet hint with an optional action', () => {
    const show = vi.fn();
    render(
      <>
        <Notice testID="n1" text="Passt nicht für Nadja" />
        <Notice
          testID="n2"
          icon="pencil"
          text="Curry geändert"
          action={<Button label="Zeigen" variant="link" onPress={show} />}
        />
      </>,
    );
    expect(screen.getByTestId('n1').textContent).toBe('Passt nicht für Nadja');
    fireEvent.click(screen.getByRole('button', { name: 'Zeigen' }));
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe('ProposalCard', () => {
  const parts: ProposalPartView[] = [
    { id: 'time', label: 'Zeit', before: '30 Min', after: '45 Min', checked: true },
    { id: 'salt', label: 'Salz', after: '1 TL', checked: false },
    { id: 'pepper', label: 'Pfeffer', before: 'viel', checked: false },
  ];

  it('open: parts are checkboxes; accept, edit and discard press', () => {
    const toggle = vi.fn();
    const accept = vi.fn();
    const edit = vi.fn();
    const discard = vi.fn();
    render(
      <ProposalCard
        testID="proposal"
        title="Curry anpassen"
        note="Beispielantwort"
        parts={parts}
        onTogglePart={toggle}
        onAccept={accept}
        onEdit={edit}
        onDiscard={discard}
      />,
    );
    expect(screen.getByTestId('proposal-note').textContent).toBe('Beispielantwort');
    expect(screen.getByText('30 Min').style.textDecorationLine).toBe('line-through');
    expect(screen.getByTestId('proposal').textContent).toContain('30 Min → 45 Min');
    expect(screen.getByTestId('proposal').textContent).toContain('1 TL');
    const time = screen.getByRole('checkbox', { name: 'Zeit übernehmen' });
    expect(time.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('proposal-part-salt'));
    expect(toggle).toHaveBeenCalledWith('salt');
    fireEvent.click(screen.getByTestId('proposal-accept'));
    fireEvent.click(screen.getByRole('button', { name: 'Ändern …' }));
    fireEvent.click(screen.getByTestId('proposal-discard'));
    expect([accept, edit, discard].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('without onEdit there is no edit button and no test ids without testID', () => {
    render(
      <ProposalCard
        title="Curry anpassen"
        parts={parts}
        onTogglePart={() => undefined}
        onAccept={() => undefined}
        onDiscard={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Ändern …' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeTruthy();
  });

  it.each([
    ['accepted', 'Übernommen'],
    ['discarded', 'Verworfen'],
  ] as const)('%s: a confirmation replaces the buttons, parts are locked', (status, text) => {
    const toggle = vi.fn();
    render(
      <ProposalCard
        title="Curry anpassen"
        parts={parts}
        status={status}
        onTogglePart={toggle}
        onAccept={() => undefined}
        onDiscard={() => undefined}
      />,
    );
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    const salt = screen.getByRole('checkbox', { name: 'Salz übernehmen' });
    expect(salt.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(salt);
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('TypingIndicator', () => {
  const dots = (id: string) =>
    Array.from(screen.getByTestId(id).children).map((dot) => (dot as HTMLElement).style.opacity);

  it('a progress indicator with its label and three pulsing dots', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { unmount } = render(<TypingIndicator label="schreibt …" testID="typing" />);
    await act(async () => undefined);
    expect(screen.getByRole('progressbar', { name: 'schreibt …' })).toBeTruthy();
    expect(dots('typing')).toEqual(['0.3', '0.3', '0.3']);
    unmount();
  });

  it('reduced motion: the dots stand still', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(<TypingIndicator label="schreibt …" testID="typing" />);
    await act(async () => undefined);
    expect(dots('typing')).toEqual(['0.6', '0.6', '0.6']);
  });

  it('when the system cannot tell, the dots stand still', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('no'));
    render(<TypingIndicator label="schreibt …" testID="typing" />);
    await act(async () => undefined);
    expect(dots('typing')).toEqual(['0.6', '0.6', '0.6']);
  });

  it('an answer after unmounting is ignored', async () => {
    let answer: (reduced: boolean) => void = () => undefined;
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
    );
    const { unmount } = render(<TypingIndicator label="schreibt …" />);
    unmount();
    await act(async () => answer(false));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('KindLine (spec 0010, D19)', () => {
  it('without onPress it is no button; shows prefix, the kind symbol and the title', () => {
    render(
      <KindLine
        testID="line"
        kind="recipe"
        title="Curry"
        prefix="Abend"
        accessibilityLabel="Abend: Curry"
      />,
    );
    const line = screen.getByTestId('line');
    expect(screen.queryByRole('button')).toBeNull();
    expect(line.getAttribute('aria-label')).toBe('Abend: Curry');
    expect(line.textContent).toBe('AbendCurry');
    expect(line.querySelector('svg')).toBeTruthy();
  });

  it('with onPress it is a button named by its title', () => {
    const open = vi.fn();
    render(<KindLine kind="activity" title="Wandern" onPress={open} size="compact" />);
    fireEvent.click(screen.getByRole('button', { name: 'Wandern' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a struck chore is crossed out; leading replaces the symbol; detail and trailing show', () => {
    render(
      <KindLine
        testID="line"
        kind="chore"
        title="Bad putzen"
        struck
        dashed
        quiet
        leading={<Text>☐</Text>}
        detail={<Text>Erinnerung 9:00</Text>}
        trailing={<Text>Nadja</Text>}
        onPress={() => undefined}
        accessibilityLabel="Bad putzen, erledigt"
        accessibilityAction={{ label: 'Verschieben', onAction: () => undefined }}
      />,
    );
    const line = screen.getByRole('button', { name: 'Bad putzen, erledigt' });
    expect(line.textContent).toBe('☐Bad putzenErinnerung 9:00Nadja');
    expect(line.querySelector('svg')).toBeNull();
    expect(screen.getByText('Bad putzen').style.textDecorationLine).toBe('line-through');
  });

  it('N-18 (review 0004): a row never breaks a word right before its hyphen ("Kichererbsen|-Eintopf")', () => {
    render(
      <>
        <KindLine kind="recipe" title="Kichererbsen-Eintopf" />
        <KindLine kind="recipe" title="Mango-Curry" size="compact" />
      </>,
    );
    const row = screen.getByText('Kichererbsen-Eintopf');
    expect(row.style.getPropertyValue('overflow-wrap')).toBe('normal');
    expect(parseFloat(row.style.getPropertyValue('padding-right'))).toBeGreaterThan(0);
    // The month's one line stays as it is.
    expect(screen.getByText('Mango-Curry').style.getPropertyValue('padding-right')).toBe('');
  });

  it('spec 0057 AC-024: the title breaks between words, without automatic hyphenation', () => {
    render(<KindLine kind="restaurant" title="Gasthausbesuch" />);
    expect(screen.getByText('Gasthausbesuch').style.getPropertyValue('hyphens')).toBe('manual');
  });

  it('with a mouse it still presses while hovered', () => {
    pointer.fine = true;
    const open = vi.fn();
    render(<KindLine kind="collection" title="Grillabend" onPress={open} />);
    const line = screen.getByRole('button', { name: 'Grillabend' });
    fireEvent.mouseOver(line);
    fireEvent.click(line);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('KindDot', () => {
  it('a dot in the colour of its kind', () => {
    const { container } = render(<KindDot kind="recipe" size={8} />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot.style.backgroundColor).toBe(
      rgb(getTheme('markthalle', 'light').colors.kinds.recipe),
    );
    expect(dot.style.width).toBe('8px');
  });
});
