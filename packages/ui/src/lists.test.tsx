import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from './controls';
import { CheckRow, GhostRow, GroupLabel, List, ListRow, Section, SelectRow } from './lists';
import { Text } from './primitives';
import { ThemeProvider } from './theme-context';
import { getTheme, type ThemeId } from './themes';
import { pointer } from '../test/setup';

describe('ListRow', () => {
  it('AC-028: with controls there is no button inside a button', () => {
    const open = vi.fn();
    const more = vi.fn();
    render(
      <ListRow
        title="Milch"
        testID="item"
        onPress={open}
        controls={<IconButton icon="plus" label="Eins mehr" onPress={more} />}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.parentElement?.closest('[role="button"]')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Eins mehr' }));
    expect(more).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Milch' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('item-open')).toBeTruthy();
  });

  it('AC-028: a checkable row with controls is one checkbox beside its buttons', () => {
    render(
      <ListRow
        title="Mehl"
        checked
        onPress={() => undefined}
        controls={<IconButton icon="minus" label="Eins weniger" />}
      />,
    );
    const row = screen.getByRole('checkbox', { name: 'Mehl' });
    expect(row.getAttribute('aria-checked')).toBe('true');
    expect(row.querySelector('[role="button"]')).toBeNull();
  });
});

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const THEMES: ThemeId[] = ['markthalle', 'klar', 'frisch'];

describe('Section', () => {
  it.each(THEMES)('%s: the title is a heading, meta stands beside it', (themeId) => {
    render(
      <ThemeProvider themeId={themeId} mode="light">
        <Section title="Zutaten" meta="ca. 4 Punkte" testID="section">
          <Text>Mehl</Text>
        </Section>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Zutaten' })).toBeTruthy();
    expect(screen.getByText('ca. 4 Punkte')).toBeTruthy();
    expect(screen.getByTestId('section').textContent).toContain('Mehl');
  });

  it('an action takes the place of meta', () => {
    const add = vi.fn();
    render(
      <Section
        title="Zutaten"
        meta="ca. 4 Punkte"
        action={<IconButton icon="plus" label="Zutat hinzufügen" onPress={add} />}
      />,
    );
    expect(screen.queryByText('ca. 4 Punkte')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zutat hinzufügen' }));
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('without a title there is no heading; meta alone still shows', () => {
    render(<Section meta="3 offen" />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('3 offen')).toBeTruthy();
  });

  it('without title, meta and action only the content shows', () => {
    render(
      <Section testID="section">
        <Text>Nur Inhalt</Text>
      </Section>,
    );
    expect(screen.getByTestId('section').textContent).toBe('Nur Inhalt');
  });
});

describe('GroupLabel', () => {
  it.each(THEMES)('%s: a small heading', (themeId) => {
    render(
      <ThemeProvider themeId={themeId} mode="light">
        <GroupLabel testID="area">Obst und Gemüse</GroupLabel>
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Obst und Gemüse' })).toBe(
      screen.getByTestId('area'),
    );
  });
});

describe('List', () => {
  it('without rows it draws nothing', () => {
    const { container } = render(<List testID="list">{null}</List>);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('list')).toBeNull();
  });

  it.each(THEMES)('%s: shows its rows in order', (themeId) => {
    render(
      <ThemeProvider themeId={themeId} mode="light">
        <List testID="list">
          <ListRow key="a" title="Äpfel" />
          {false}
          <ListRow key="b" title="Birnen" />
          <ListRow title="Kirschen" />
        </List>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('list').textContent).toBe('ÄpfelBirnenKirschen');
  });
});

describe('ListRow', () => {
  it('without onPress it is no button and shows title, note, subtitle, leading and trailing', () => {
    render(
      <ListRow
        testID="row"
        title="Milch"
        note="laktosefrei"
        subtitle="2 Liter"
        leading={<Text>L</Text>}
        trailing={<Text>T</Text>}
        controls={<IconButton icon="plus" label="Eins mehr" />}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Milch' })).toBeNull();
    expect(screen.getByTestId('row').textContent).toBe('LMilch (laktosefrei)2 LiterT');
    expect(screen.getByRole('button', { name: 'Eins mehr' })).toBeTruthy();
  });

  it('a title and subtitle that are elements are drawn as they are; the label names the row', () => {
    const open = vi.fn();
    render(
      <ListRow
        title={<Text>Eigener Titel</Text>}
        subtitle={<Text>Eigene Zeile</Text>}
        accessibilityLabel="Rezept Curry"
        onPress={open}
      />,
    );
    const row = screen.getByRole('button', { name: 'Rezept Curry' });
    expect(row.textContent).toBe('Eigener TitelEigene Zeile');
    fireEvent.click(row);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('strike crosses out the title', () => {
    render(<ListRow title="Milch" strike />);
    expect(screen.getByText('Milch').style.textDecorationLine).toBe('line-through');
  });

  it('disabled: says so and does not press', () => {
    const open = vi.fn();
    render(<ListRow title="Milch" onPress={open} disabled />);
    const row = screen.getByRole('button', { name: 'Milch' });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(open).not.toHaveBeenCalled();
  });

  it('disabled with controls: the press area does not press, the controls stay', () => {
    const open = vi.fn();
    render(
      <ListRow
        title="Milch"
        testID="item"
        onPress={open}
        disabled
        controls={<IconButton icon="plus" label="Eins mehr" />}
      />,
    );
    const area = screen.getByRole('button', { name: 'Milch' });
    expect(area.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(area);
    expect(open).not.toHaveBeenCalled();
  });

  it('review 0031: selected and the hint reach the browser', () => {
    render(<ListRow title="Curry" selected hint="Öffnet das Rezept" onPress={() => undefined} />);
    const row = screen.getByRole('button', { name: 'Curry' });
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.getAttribute('aria-description')).toBe('Öffnet das Rezept');
  });

  it('selected: the row shown in the detail column is highlighted in accentSoft', () => {
    render(<ListRow title="Curry" selected onPress={() => undefined} />);
    const row = screen.getByRole('button', { name: 'Curry' });
    expect(row.style.backgroundColor).toBe(rgb(getTheme('markthalle', 'light').colors.accentSoft));
  });

  it('D-06 (review 0004): a selected row under the mouse keeps its highlight', () => {
    pointer.fine = true;
    render(<ListRow title="Chili" checked selected onPress={() => undefined} />);
    const row = screen.getByRole('checkbox', { name: 'Chili' });
    fireEvent.pointerEnter(row, { pointerType: 'mouse' });
    expect(row.style.backgroundColor).toBe(rgb(getTheme('markthalle', 'light').colors.accentSoft));
  });

  it.each(THEMES)('%s: a selected row on a pressable list is still a button', (themeId) => {
    render(
      <ThemeProvider themeId={themeId} mode="light">
        <List>
          <ListRow title="Curry" onPress={() => undefined} />
          <ListRow title="Dal" selected onPress={() => undefined} />
        </List>
      </ThemeProvider>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  describe('checkable row (space bar on the web)', () => {
    it('is a checkbox with its state; a click and the space bar toggle it', () => {
      const toggle = vi.fn();
      render(<ListRow title="Mehl" checked={false} onPress={toggle} />);
      const row = screen.getByRole('checkbox', { name: 'Mehl' });
      expect(row.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(row);
      fireEvent.keyDown(row, { key: ' ' });
      fireEvent.keyDown(row, { key: 'Spacebar' });
      expect(toggle).toHaveBeenCalledTimes(3);
    });

    it('a held space bar toggles once, other keys do nothing', () => {
      const toggle = vi.fn();
      render(<ListRow title="Mehl" checked onPress={toggle} />);
      const row = screen.getByRole('checkbox', { name: 'Mehl' });
      fireEvent.keyDown(row, { key: ' ', repeat: true });
      fireEvent.keyDown(row, { key: 'a' });
      expect(toggle).not.toHaveBeenCalled();
    });

    it('the space bar does not scroll the page', () => {
      render(<ListRow title="Mehl" checked onPress={() => undefined} />);
      const row = screen.getByRole('checkbox', { name: 'Mehl' });
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      row.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('disabled: neither the space bar nor a click toggles', () => {
      const toggle = vi.fn();
      render(<ListRow title="Mehl" checked={false} onPress={toggle} disabled />);
      const row = screen.getByRole('checkbox', { name: 'Mehl' });
      expect(row.getAttribute('aria-disabled')).toBe('true');
      fireEvent.keyDown(row, { key: ' ' });
      fireEvent.click(row);
      expect(toggle).not.toHaveBeenCalled();
    });

    it('with controls the space bar toggles the press area, not the buttons', () => {
      const toggle = vi.fn();
      const more = vi.fn();
      render(
        <ListRow
          title="Mehl"
          checked={false}
          onPress={toggle}
          controls={<IconButton icon="plus" label="Eins mehr" onPress={more} />}
        />,
      );
      const row = screen.getByRole('checkbox', { name: 'Mehl' });
      fireEvent.keyDown(row, { key: ' ' });
      expect(toggle).toHaveBeenCalledTimes(1);
      expect(more).not.toHaveBeenCalled();
    });
  });
});

describe('CheckRow', () => {
  it('a checkbox named by the title toggles; a checked row is struck through', () => {
    const toggle = vi.fn();
    render(<CheckRow testID="milk" title="Milch" note="1 l" checked onToggle={toggle} />);
    const box = screen.getByRole('checkbox', { name: 'Milch' });
    expect(box).toBe(screen.getByTestId('milk-check'));
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Milch').style.textDecorationLine).toBe('line-through');
    fireEvent.click(box);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('without onToggle the checkbox cannot be pressed', () => {
    render(<CheckRow title="Milch" checked={false} />);
    const box = screen.getByRole('checkbox', { name: 'Milch' });
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Milch').style.textDecorationLine).toBe('');
  });

  it('disabled: the checkbox does not toggle', () => {
    const toggle = vi.fn();
    render(<CheckRow title="Milch" checked={false} onToggle={toggle} disabled />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milch' }));
    expect(toggle).not.toHaveBeenCalled();
  });

  it('with onPress and controls: details, checkbox and controls each do their own thing', () => {
    const toggle = vi.fn();
    const open = vi.fn();
    const more = vi.fn();
    render(
      <CheckRow
        testID="milk"
        title="Milch"
        checked={false}
        onToggle={toggle}
        onPress={open}
        controls={<IconButton icon="ellipsis" label="Mehr zu Milch" onPress={more} />}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milch' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mehr zu Milch' }));
    expect(more).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('milk-open'));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('SelectRow (spec 0009, E16)', () => {
  it('the whole row is one checkbox named by title and subtitle; a tap toggles it', () => {
    const toggle = vi.fn();
    render(<SelectRow testID="curry" title="Curry" subtitle="30 Min" selected onToggle={toggle} />);
    const row = screen.getByRole('checkbox', { name: 'Curry, 30 Min' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(row.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Curry').style.textDecorationLine).toBe('');
    fireEvent.click(row);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('the space bar toggles it', () => {
    const toggle = vi.fn();
    render(<SelectRow title="Curry" selected={false} onToggle={toggle} />);
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Curry' }), { key: ' ' });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('disabled with a hint: shows why and cannot be ticked', () => {
    const toggle = vi.fn();
    render(
      <SelectRow
        title="Curry"
        subtitle="30 Min"
        hint="schon enthalten"
        selected={false}
        disabled
        onToggle={toggle}
      />,
    );
    expect(screen.getByText('30 Min · schon enthalten')).toBeTruthy();
    const row = screen.getByRole('checkbox', { name: 'Curry, 30 Min' });
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: ' ' });
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('GhostRow', () => {
  it('a proposal with accept and discard named by its title', () => {
    const accept = vi.fn();
    const discard = vi.fn();
    render(
      <GhostRow
        testID="ghost"
        title="Eier"
        note="Bio"
        meta="6×"
        onAccept={accept}
        onDiscard={discard}
      />,
    );
    expect(screen.getByTestId('ghost').textContent).toContain('Eier (Bio)');
    expect(screen.getByText('6×')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eier übernehmen' }));
    expect(accept).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ghost-discard'));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ghost-accept')).toBeTruthy();
  });

  it('without note and meta only the title and the two buttons show', () => {
    render(<GhostRow title="Eier" onAccept={() => undefined} onDiscard={() => undefined} />);
    expect(screen.getByText('Eier').textContent).toBe('Eier');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
