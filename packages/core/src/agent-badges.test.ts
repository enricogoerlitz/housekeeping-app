import { describe, expect, it } from 'vitest';

import {
  AGENT_BADGES,
  addBadge,
  badgeLabel,
  backspaceRemovesBadge,
  matchBadges,
  messageLinks,
  slashQuery,
  takeSlash,
  withoutLink,
  withoutSlash,
} from './agent-badges';

describe('the badges of the start page (REQ-003)', () => {
  it('AC-005: lists Rezepte · Ausgehen · Planen · Einkaufen · Haushalt with one line each', () => {
    expect(AGENT_BADGES.map((badge) => badge.label)).toEqual([
      'Rezepte',
      'Ausgehen',
      'Planen',
      'Einkaufen',
      'Haushalt',
    ]);
    for (const badge of AGENT_BADGES) expect(badge.line.length).toBeGreaterThan(10);
    expect(badgeLabel('ausgehen')).toBe('Ausgehen');
  });
});

describe('slash menu (REQ-004)', () => {
  it('finds the slash word at the cursor, at the start or after a space', () => {
    expect(slashQuery('/re', 3)).toEqual({ start: 0, end: 3, query: 're' });
    expect(slashQuery('Hallo /Ein', 10)).toEqual({ start: 6, end: 10, query: 'Ein' });
    expect(slashQuery('/', 1)).toEqual({ start: 0, end: 1, query: '' });
  });

  it('is no slash word inside a link, after a letter or behind the cursor', () => {
    expect(slashQuery('https://x.de/re', 15)).toBeUndefined();
    expect(slashQuery('a/re', 4)).toBeUndefined();
    expect(slashQuery('/re weiter', 10)).toBeUndefined();
    expect(slashQuery('/re', 1)).toBeUndefined();
  });

  it('AC-006: "/re" offers Rezepte and Ausgehen (Restaurants), nothing else', () => {
    expect(matchBadges('re', []).map((badge) => badge.slug)).toEqual(['rezepte', 'ausgehen']);
    expect(matchBadges('', []).length).toBe(5);
    expect(matchBadges('EIN', []).map((badge) => badge.slug)).toEqual(['einkaufen']);
    expect(matchBadges('akti', []).map((badge) => badge.slug)).toEqual(['ausgehen']);
    expect(matchBadges('xyz', [])).toEqual([]);
  });

  it('leaves out badges that are already set', () => {
    expect(matchBadges('re', ['rezepte']).map((badge) => badge.slug)).toEqual(['ausgehen']);
  });

  it('AC-006: choosing replaces "/re" with nothing and puts the cursor there', () => {
    expect(takeSlash('/re', { start: 0, end: 3, query: 're' })).toEqual({ text: '', cursor: 0 });
    expect(takeSlash('Leg das an /re bitte', { start: 11, end: 14, query: 're' })).toEqual({
      text: 'Leg das an bitte',
      cursor: 11,
    });
  });
});

describe('badges in the input (REQ-004)', () => {
  it('AC-008: several badges, each once, at most five', () => {
    expect(addBadge(['rezepte'], 'ausgehen')).toEqual(['rezepte', 'ausgehen']);
    expect(addBadge(['rezepte'], 'rezepte')).toEqual(['rezepte']);
  });

  it('AC-007: backspace right behind the badges removes the last one whole', () => {
    expect(backspaceRemovesBadge(['rezepte', 'ausgehen'], { start: 0, end: 0 })).toEqual([
      'rezepte',
    ]);
  });

  it('AC-007: backspace inside the text or over a selection leaves the badges', () => {
    expect(backspaceRemovesBadge(['rezepte'], { start: 3, end: 3 })).toBeUndefined();
    expect(backspaceRemovesBadge(['rezepte'], { start: 0, end: 4 })).toBeUndefined();
    expect(backspaceRemovesBadge([], { start: 0, end: 0 })).toBeUndefined();
  });

  it('AC-006 (click-through A): a badge picked elsewhere while "/re" is typed takes the "/re" too', () => {
    expect(withoutSlash('/re', 3)).toEqual({ text: '', cursor: 0 });
    expect(withoutSlash('Was kochen /re', 14)).toEqual({ text: 'Was kochen ', cursor: 11 });
    expect(withoutSlash('ohne Slash', 10)).toEqual({ text: 'ohne Slash', cursor: 10 });
  });
});

describe('REQ-005: a link in the message shows as a chip (review D)', () => {
  it('names the host of each link once, http(s) only, at most three', () => {
    const text =
      'leg das an https://www.chefkoch.de/rezepte/1/Lasagne.html und https://vm.tiktok.com/ZGdX/ ' +
      'und nochmal https://www.chefkoch.de/rezepte/1/Lasagne.html, ftp://x.org/a mailto:a@b.de';
    expect(messageLinks(text)).toEqual([
      { url: 'https://www.chefkoch.de/rezepte/1/Lasagne.html', host: 'chefkoch.de' },
      { url: 'https://vm.tiktok.com/ZGdX/', host: 'vm.tiktok.com' },
    ]);
    const many = ['a', 'b', 'c', 'd'].map((x) => `https://${x}.example.org/`).join(' ');
    expect(messageLinks(many)).toHaveLength(3);
    expect(messageLinks('kein Link, nur www.chefkoch.de')).toEqual([]);
  });

  it('✕ takes the link out of the text, the rest stays readable', () => {
    expect(
      withoutLink('leg das an https://www.chefkoch.de/r/1 für 2', 'https://www.chefkoch.de/r/1'),
    ).toBe('leg das an für 2');
    expect(withoutLink('https://a.example.org/x', 'https://a.example.org/x')).toBe('');
  });
});
