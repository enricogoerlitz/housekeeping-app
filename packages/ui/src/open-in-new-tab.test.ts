import { describe, expect, it, vi } from 'vitest';

import { openInNewTab } from './open-in-new-tab';

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
