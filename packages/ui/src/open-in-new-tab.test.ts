import { describe, expect, it, vi } from 'vitest';

import { openByLink, openInNewTab, type LinkElement } from './open-in-new-tab';

describe('openInNewTab (spec 0023, REQ-009)', () => {
  it('AC-031: opens the address in a new tab without opener and referrer', () => {
    const open = vi.fn(() => null);
    openInNewTab('https://www.chefkoch.de/rezepte/123/lasagne.html', open);
    expect(open).toHaveBeenCalledWith(
      'https://www.chefkoch.de/rezepte/123/lasagne.html',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('cuts the opener even when the browser hands back the new window', () => {
    const tab = { opener: {} as unknown };
    openInNewTab('https://chefkoch.de', () => tab);
    expect(tab.opener).toBeNull();
  });
});

describe('openByLink in the installed iOS app (spec 0034, REQ-011)', () => {
  it('AC-024: taps a real link instead of window.open, so no empty window stays behind', () => {
    const appended: LinkElement[] = [];
    const removed: LinkElement[] = [];
    const link: LinkElement = { href: '', target: '', rel: '', click: vi.fn() };
    openByLink('https://www.chefkoch.de/rezepte/123/lasagne.html', {
      create: () => link,
      append: (element) => appended.push(element),
      remove: (element) => removed.push(element),
    });
    expect(link).toMatchObject({
      href: 'https://www.chefkoch.de/rezepte/123/lasagne.html',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(appended).toEqual([link]);
    expect(removed).toEqual([link]);
  });
});
