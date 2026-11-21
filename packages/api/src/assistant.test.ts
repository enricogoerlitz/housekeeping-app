import { describe, expect, it } from 'vitest';

import { dictatedItems } from './assistant';

describe('dictatedItems', () => {
  it('AC-028: "Milch, sechs Eier und Brot" becomes three proposal rows', () => {
    const items = dictatedItems('Milch, sechs Eier und Brot.');
    expect(items.map(({ text, name, meta }) => ({ text, name, meta }))).toEqual([
      { text: 'Milch', name: 'Milch', meta: undefined },
      { text: '6 Eier', name: 'Eier', meta: '6×' },
      { text: 'Brot', name: 'Brot', meta: undefined },
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it('shows a measured amount and keeps the note in the text', () => {
    expect(dictatedItems('500 g Möhren (bio)')).toMatchObject([
      { text: '500 g Möhren (bio)', name: 'Möhren', meta: '500 g' },
    ]);
  });

  it('nothing said, nothing proposed', () => {
    expect(dictatedItems(' ')).toEqual([]);
  });
});
