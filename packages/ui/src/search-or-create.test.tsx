import { createRef, type ComponentRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TextInput } from 'react-native';

import { Text } from './primitives';
import { SearchOrCreate, type SearchOrCreateProps } from './search-or-create';

function renderSearch(props: Partial<SearchOrCreateProps> = {}) {
  const handlers = {
    onQueryChange: vi.fn(),
    onSelect: vi.fn(),
    onCreate: vi.fn(),
  };
  const view = render(
    <SearchOrCreate
      query=""
      label="Zutat suchen"
      placeholder="Suchen oder anlegen"
      clearLabel="Suche leeren"
      hits={[]}
      createOptions={[]}
      testID="soc"
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...view };
}

const PAELLA_KINDS = [
  { key: 'recipe', label: '„Paella“ als Rezept anlegen' },
  { key: 'item', label: '„Paella“ als Artikel anlegen' },
];

describe('SearchOrCreate (spec 0005, REQ-006)', () => {
  it('a search field named by its label; typing reports the query', () => {
    const { onQueryChange } = renderSearch();
    const input = screen.getByRole('textbox', { name: 'Zutat suchen' });
    fireEvent.change(input, { target: { value: 'Möh' } });
    expect(onQueryChange).toHaveBeenCalledWith('Möh');
    expect(screen.queryByRole('button', { name: 'Suche leeren' })).toBeNull();
  });

  it('✕ empties a filled field', () => {
    const { onQueryChange } = renderSearch({ query: 'Möh' });
    fireEvent.click(screen.getByRole('button', { name: 'Suche leeren' }));
    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('hands the input to `inputRef` (spec 0023, AC-003)', () => {
    const inputRef = createRef<ComponentRef<typeof TextInput>>();
    renderSearch({ inputRef });
    act(() => inputRef.current?.focus());
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Zutat suchen' }));
  });

  it('shows the hits with detail and meta; a tap selects one', () => {
    const { onSelect } = renderSearch({
      query: 'Möh',
      hits: [
        { key: 'm1', title: 'Möhre', detail: 'auch: Karotten', meta: 'Obst & Gemüse' },
        { key: 'm2', title: 'Möhrensaft' },
      ],
    });
    expect(screen.getByText('auch: Karotten')).toBeTruthy();
    expect(screen.getByText('Obst & Gemüse')).toBeTruthy();
    fireEvent.click(screen.getByTestId('soc-hit-m2'));
    expect(onSelect).toHaveBeenCalledWith('m2');
  });

  it('no hits: no list', () => {
    renderSearch({ query: 'Xyz' });
    expect(screen.queryByTestId('soc-hits')).toBeNull();
  });

  it('one create row per kind; a tap creates that kind', () => {
    const { onCreate } = renderSearch({ query: 'Paella', createOptions: PAELLA_KINDS });
    fireEvent.click(screen.getByRole('button', { name: '„Paella“ als Artikel anlegen' }));
    expect(onCreate).toHaveBeenCalledWith('item');
  });

  it('offline: the create rows are disabled and say why', () => {
    const { onCreate } = renderSearch({
      query: 'Paella',
      createOptions: PAELLA_KINDS,
      createDisabledHint: 'Offline – Anlegen geht gerade nicht',
      brake: {
        question: 'Meinst du „Paella Valenciana“?',
        acceptLabel: 'Ja',
        createAnywayLabel: 'Trotzdem neu',
        onAccept: () => undefined,
      },
    });
    const row = screen.getByRole('button', { name: '„Paella“ als Rezept anlegen' });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('soc-create-hint').textContent).toBe(
      'Offline – Anlegen geht gerade nicht',
    );
    // Offline the brake is not offered either: its "Trotzdem neu" could not create.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('brake "Meinst du …?"', () => {
    const brake = (onAccept = vi.fn()) => ({
      question: 'Meinst du „Paella Valenciana“?',
      acceptLabel: 'Ja',
      createAnywayLabel: 'Trotzdem neu',
      onAccept,
    });

    it('the create rows wait; "Ja" takes the look-alike', () => {
      const onAccept = vi.fn();
      const { onCreate } = renderSearch({
        query: 'Paela',
        createOptions: PAELLA_KINDS,
        brake: brake(onAccept),
      });
      expect(screen.getByRole('alert').textContent).toContain('Meinst du „Paella Valenciana“?');
      const row = screen.getByRole('button', { name: '„Paella“ als Rezept anlegen' });
      expect(row.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(row);
      expect(onCreate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Ja' }));
      expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it('"Trotzdem neu" with one kind creates it at once', () => {
      const { onCreate } = renderSearch({
        query: 'Paela',
        createOptions: [{ key: 'item', label: '„Paela“ als Artikel anlegen' }],
        brake: brake(),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Trotzdem neu' }));
      expect(onCreate).toHaveBeenCalledWith('item');
    });

    it('"Trotzdem neu" with several kinds unlocks the rows, only for that query', () => {
      const { onCreate, rerender } = renderSearch({
        query: 'Paela',
        createOptions: PAELLA_KINDS,
        brake: brake(),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Trotzdem neu' }));
      expect(onCreate).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
      const row = () => screen.getByRole('button', { name: '„Paella“ als Rezept anlegen' });
      expect(row().getAttribute('aria-disabled')).toBeNull();
      fireEvent.click(row());
      expect(onCreate).toHaveBeenCalledWith('recipe');

      rerender(
        <SearchOrCreate
          query="Paelaa"
          onQueryChange={() => undefined}
          label="Zutat suchen"
          clearLabel="Suche leeren"
          hits={[]}
          onSelect={() => undefined}
          createOptions={PAELLA_KINDS}
          onCreate={onCreate}
          brake={brake()}
        />,
      );
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(row().getAttribute('aria-disabled')).toBe('true');
    });
  });

  it('"Mehr Angaben" unfolds more fields in place and says whether it is open', () => {
    renderSearch({
      query: 'Paella',
      more: { label: 'Mehr Angaben', children: <Text>Menge und Einheit</Text> },
    });
    const more = screen.getByRole('button', { name: 'Mehr Angaben' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Menge und Einheit')).toBeNull();
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Menge und Einheit')).toBeTruthy();
    fireEvent.click(more);
    expect(screen.queryByText('Menge und Einheit')).toBeNull();
  });
});
