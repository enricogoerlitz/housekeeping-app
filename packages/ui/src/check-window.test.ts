import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHECK_WINDOW_MS,
  checkWindowActions,
  createCheckWindow,
  doneRows,
  openRows,
  shownChecked,
  type CheckWindow,
} from './check-window';

// A list as the screen sees it: data from the cache plus the window's taps.
interface Item {
  id: string;
  checked: boolean;
}

function setup(options?: { saveAtOnce?: boolean }) {
  let items: Item[] = [
    { id: 'milch', checked: false },
    { id: 'brot', checked: false },
    { id: 'eier', checked: false },
  ];
  const settled: string[][] = [];
  const window: CheckWindow = createCheckWindow();
  window.onSettle((ids) => settled.push(ids));
  const visible = () =>
    openRows(
      items,
      (item) => item.id,
      (item) => item.checked,
      window.getSnapshot(),
    ).map((item) => item.id);
  const isChecked = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    return shownChecked(window.getSnapshot(), id, item?.checked ?? false);
  };
  /** A tap; with saveAtOnce the data follows at once, like a shopping item (spec 0006). */
  const tap = (id: string) => {
    const next = !isChecked(id);
    window.toggle(id, next, visible());
    if (options?.saveAtOnce ?? true) {
      items = items.map((item) => (item.id === id ? { ...item, checked: next } : item));
    }
  };
  /** A check that arrives from another device. */
  const remote = (id: string, checked: boolean) => {
    items = items.map((item) => (item.id === id ? { ...item, checked } : item));
  };
  return { window, visible, isChecked, tap, remote, settled };
}

describe('check window (spec 0005, REQ-005)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('D3: the window is 2 seconds, defined in one place', () => {
    expect(CHECK_WINDOW_MS).toBe(2000);
  });

  it('AC-026: a check strikes the row through in place; a second tap takes it back', () => {
    const list = setup();
    list.tap('milch');
    expect(list.isChecked('milch')).toBe(true);
    expect(list.visible()).toEqual(['milch', 'brot', 'eier']);

    vi.advanceTimersByTime(1000);
    list.tap('milch');
    expect(list.isChecked('milch')).toBe(false);
    expect(list.visible()).toEqual(['milch', 'brot', 'eier']);
  });

  it('AC-027: every tap restarts the window; rows leave 2 s after the last tap', () => {
    const list = setup();
    list.tap('milch'); // 0.0 s
    vi.advanceTimersByTime(800);
    list.tap('brot'); // 0.8 s
    vi.advanceTimersByTime(700);
    list.tap('milch'); // 1.5 s: Milch is open again
    vi.advanceTimersByTime(1900); // 3.4 s
    expect(list.visible()).toEqual(['milch', 'brot', 'eier']);
    expect(list.isChecked('brot')).toBe(true);

    vi.advanceTimersByTime(100); // 3.5 s
    expect(list.visible()).toEqual(['milch', 'eier']);
    expect(list.isChecked('milch')).toBe(false);
    expect(list.settled).toEqual([['brot']]);
  });

  it('AC-028: several checks leave together', () => {
    const list = setup();
    list.tap('milch');
    vi.advanceTimersByTime(500);
    list.tap('brot');
    vi.advanceTimersByTime(500);
    list.tap('eier');
    vi.advanceTimersByTime(1900); // 2.9 s
    expect(list.visible()).toEqual(['milch', 'brot', 'eier']);

    vi.advanceTimersByTime(100); // 3.0 s
    expect(list.visible()).toEqual([]);
    expect(list.settled).toEqual([['milch', 'brot', 'eier']]);
  });

  it('AC-029: leaving the screen settles at once', () => {
    const list = setup();
    list.tap('brot');
    vi.advanceTimersByTime(300);
    list.window.settle();
    expect(list.settled).toEqual([['brot']]);
    expect(list.visible()).toEqual(['milch', 'eier']);
    // The timer of the settled window must not fire a second time.
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(list.settled).toHaveLength(1);
  });

  it('AC-029: a screen that saves only when the window closes gets the checked rows', () => {
    const list = setup({ saveAtOnce: false });
    list.tap('brot');
    expect(list.isChecked('brot')).toBe(true);
    list.window.settle();
    expect(list.settled).toEqual([['brot']]);
  });

  it('AC-031: a check from another device waits for my window, later ones leave at once', () => {
    const list = setup();
    list.tap('milch');
    vi.advanceTimersByTime(500);
    list.remote('eier', true);
    expect(list.visible()).toEqual(['milch', 'brot', 'eier']);
    expect(list.isChecked('eier')).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(list.visible()).toEqual(['brot']);

    list.remote('brot', true);
    expect(list.visible()).toEqual([]);
  });

  it('a window whose taps were all taken back settles with nothing', () => {
    const list = setup();
    list.tap('milch');
    list.tap('milch');
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(list.settled).toEqual([[]]);
    expect(list.visible()).toEqual(['milch', 'brot', 'eier']);
  });

  it('notifies subscribers on every change and stops after unsubscribing', () => {
    const list = setup();
    const listener = vi.fn();
    const unsubscribe = list.window.subscribe(listener);
    list.tap('milch');
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    list.tap('brot');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('accepts a custom window length', () => {
    const settled: string[][] = [];
    const window = createCheckWindow(500);
    window.onSettle((ids) => settled.push(ids));
    window.toggle('a', true, ['a']);
    vi.advanceTimersByTime(499);
    expect(settled).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(settled).toEqual([['a']]);
  });
});

describe('set and settle (spec 0011)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Rows of "Wie war's?": rated only once the window closes and the rating is saved.
  function recap() {
    const items: Item[] = [
      { id: 'enzo', checked: false },
      { id: 'lasagne', checked: false },
    ];
    const window = createCheckWindow();
    const settled: string[][] = [];
    window.onSettle((ids) => settled.push(ids));
    const changes: [string, boolean][] = [];
    const actions = () => {
      const snapshot = window.getSnapshot();
      const rows = openRows(
        items,
        (item) => item.id,
        (item) => item.checked,
        snapshot,
      );
      return checkWindowActions({
        window,
        rows,
        getId: (item: Item) => item.id,
        isChecked: (item: Item) => shownChecked(snapshot, item.id, item.checked),
        changed: (item: Item, checked: boolean) => changes.push([item.id, checked]),
      });
    };
    const row = (id: string) => items.find((item) => item.id === id) as Item;
    const visible = () =>
      openRows(
        items,
        (item) => item.id,
        (item) => item.checked,
        window.getSnapshot(),
      ).map((item) => item.id);
    const shown = (id: string) => shownChecked(window.getSnapshot(), id, row(id).checked);
    return { window, settled, changes, actions, row, visible, shown };
  }

  it('AC-019: set keeps the row and restarts the window without toggling it back', () => {
    const list = recap();
    list.actions().set(list.row('enzo'), true); // third star, 0 s
    vi.advanceTimersByTime(1000);
    list.actions().set(list.row('enzo'), true); // fourth star, 1 s
    expect(list.shown('enzo')).toBe(true);

    vi.advanceTimersByTime(1900); // 2.9 s: 2 s after the last tap not yet over
    expect(list.visible()).toEqual(['enzo', 'lasagne']);
    expect(list.settled).toEqual([]);

    vi.advanceTimersByTime(100); // 3.0 s
    expect(list.settled).toEqual([['enzo']]);
    expect(list.changes).toEqual([
      ['enzo', true],
      ['enzo', true],
    ]);
  });

  it('set can open a row again, like taking a check back', () => {
    const list = recap();
    list.actions().set(list.row('enzo'), true);
    list.actions().set(list.row('enzo'), false);
    expect(list.shown('enzo')).toBe(false);
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(list.settled).toEqual([[]]);
  });

  it('toggle still flips the shown state', () => {
    const list = recap();
    list.actions().toggle(list.row('lasagne'));
    expect(list.shown('lasagne')).toBe(true);
    list.actions().toggle(list.row('lasagne'));
    expect(list.shown('lasagne')).toBe(false);
    expect(list.changes).toEqual([
      ['lasagne', true],
      ['lasagne', false],
    ]);
  });

  it('AC-030: settle closes the running window at once, e.g. when the tab changes', () => {
    const list = recap();
    list.actions().set(list.row('lasagne'), true);
    vi.advanceTimersByTime(1000);
    list.actions().settle();
    expect(list.settled).toEqual([['lasagne']]);
    expect(list.visible()).toEqual(['enzo', 'lasagne']); // the data follows once it is saved
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(list.settled).toHaveLength(1);
  });

  it('settle without a running window does nothing', () => {
    const list = recap();
    list.actions().settle();
    expect(list.settled).toEqual([]);
  });
});

describe('keep in done (spec 0012, AC-021)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // A bag of the trip window: Badehose packed (in "Gepackt (n)"), the others open.
  function bag(keepInDone: boolean) {
    let items: Item[] = [
      { id: 'badehose', checked: true },
      { id: 'handtuch', checked: false },
      { id: 'sonnenhut', checked: false },
    ];
    const window = createCheckWindow();
    const getId = (item: Item) => item.id;
    const isData = (item: Item) => item.checked;
    const open = () =>
      openRows(items, getId, isData, window.getSnapshot(), { keepInDone }).map(getId);
    const done = () =>
      doneRows(items, getId, isData, window.getSnapshot(), { keepInDone }).map(getId);
    const shown = (id: string) =>
      shownChecked(
        window.getSnapshot(),
        id,
        items.find((item) => item.id === id)?.checked ?? false,
      );
    const tap = (id: string) => {
      const next = !shown(id);
      window.toggle(id, next, open());
      items = items.map((item) => (item.id === id ? { ...item, checked: next } : item));
    };
    return { open, done, shown, tap };
  }

  it('AC-021: a row unchecked in the checked group stays there 2 s, then moves back', () => {
    const list = bag(true);
    list.tap('badehose');
    expect(list.shown('badehose')).toBe(false);
    expect(list.open()).toEqual(['handtuch', 'sonnenhut']);
    expect(list.done()).toEqual(['badehose']);

    vi.advanceTimersByTime(CHECK_WINDOW_MS - 1);
    expect(list.done()).toEqual(['badehose']);
    vi.advanceTimersByTime(1);
    expect(list.open()).toEqual(['badehose', 'handtuch', 'sonnenhut']);
    expect(list.done()).toEqual([]);
  });

  it('AC-021: checked again in the same window, it simply stays in the checked group', () => {
    const list = bag(true);
    list.tap('badehose');
    vi.advanceTimersByTime(500);
    list.tap('badehose');
    expect(list.shown('badehose')).toBe(true);
    expect(list.done()).toEqual(['badehose']);
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(list.open()).toEqual(['handtuch', 'sonnenhut']);
    expect(list.done()).toEqual(['badehose']);
  });

  it('AC-020: rows checked in the open list stay there and leave together with the window', () => {
    const list = bag(true);
    list.tap('badehose'); // from the group
    list.tap('handtuch'); // from the open list
    expect(list.open()).toEqual(['handtuch', 'sonnenhut']);
    expect(list.done()).toEqual(['badehose']);
    vi.advanceTimersByTime(CHECK_WINDOW_MS);
    expect(list.open()).toEqual(['badehose', 'sonnenhut']);
    expect(list.done()).toEqual(['handtuch']);
  });

  it('without the option a row unchecked in the checked group goes back at once', () => {
    const list = bag(false);
    list.tap('badehose');
    expect(list.open()).toEqual(['badehose', 'handtuch', 'sonnenhut']);
    expect(list.done()).toEqual([]);
  });
});
