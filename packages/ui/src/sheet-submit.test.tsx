import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TextField } from './controls';
import { Sheet } from './overlay';
import { SearchOrCreate } from './search-or-create';
import { pointer } from '../test/setup';

// Spec 0036, REQ-014: on the desktop Enter in a one-line field of a window does what its primary
// button does.

afterEach(() => {
  pointer.fine = false;
  // The fading copy a closed window leaves behind (spec 0029, REQ-001).
  document.querySelectorAll('[data-sheet-exit]').forEach((copy) => copy.remove());
});

function NewRestaurant(props: {
  onSave: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Sheet
      visible
      onClose={() => undefined}
      title="Neues Restaurant"
      size="m"
      actions={{
        primary: { label: 'Anlegen', onPress: props.onSave, disabled: props.disabled },
      }}
    >
      {props.children ?? (
        <TextField label="Name" value="Bless" onChangeText={() => undefined} testID="name" />
      )}
    </Sheet>
  );
}

const enter = (testID: string) => fireEvent.keyDown(screen.getByTestId(testID), { key: 'Enter' });

describe('Enter saves a window (spec 0036, REQ-014)', () => {
  it('AC-023: Enter in „Name“ of „Restaurant hinzufügen“ does what its primary button does', () => {
    pointer.fine = true;
    const onSave = vi.fn();
    render(<NewRestaurant onSave={onSave} />);
    enter('name');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('AC-024: Enter in a field of several lines makes a new line, nothing is saved', () => {
    pointer.fine = true;
    const onSave = vi.fn();
    render(
      <NewRestaurant onSave={onSave}>
        <TextField label="Notiz" multiline value="" onChangeText={() => undefined} testID="notes" />
      </NewRestaurant>,
    );
    enter('notes');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC-025: a greyed out „Anlegen“ is not pressed by Enter either', () => {
    pointer.fine = true;
    const onSave = vi.fn();
    render(<NewRestaurant onSave={onSave} disabled />);
    enter('name');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC-026: a field with its own Enter (a suggestion list) keeps it', () => {
    pointer.fine = true;
    const onSave = vi.fn();
    const onTag = vi.fn();
    render(
      <NewRestaurant onSave={onSave}>
        <SearchOrCreate
          query="ofen"
          onQueryChange={() => undefined}
          label="Schlagwort"
          hits={[{ key: 'ofen', title: 'Ofen' }]}
          clearLabel="Leeren"
          createOptions={[]}
          onSelect={() => undefined}
          onCreate={() => undefined}
          onSubmit={onTag}
          testID="tags"
        />
        <SearchOrCreate
          query="Ita"
          onQueryChange={() => undefined}
          label="Küche"
          hits={[{ key: 'it', title: 'Italienisch' }]}
          clearLabel="Leeren"
          createOptions={[]}
          onSelect={() => undefined}
          onCreate={() => undefined}
          testID="cuisine"
        />
      </NewRestaurant>,
    );
    enter('tags-input');
    expect(onTag).toHaveBeenCalledTimes(1);
    enter('cuisine-input');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('AC-027: on a phone the keyboard’s return key saves nothing', () => {
    const onSave = vi.fn();
    render(<NewRestaurant onSave={onSave} />);
    enter('name');
    expect(onSave).not.toHaveBeenCalled();
  });
});
