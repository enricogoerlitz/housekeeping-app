import { describe, expect, it } from 'vitest';

import { chipRowStyle, fillChipStyle } from './chip-layout';

describe('chips sharing the width (spec 0030, REQ-005)', () => {
  it('AC-019: with fill the row never wraps and every chip gets the same share, whatever its label', () => {
    expect(chipRowStyle(true)).toMatchObject({ flexDirection: 'row', flexWrap: 'nowrap' });
    expect(fillChipStyle()).toMatchObject({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 });
  });

  it('AC-020: without fill the chips keep their own width and wrap', () => {
    expect(chipRowStyle(false)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap', gap: 8 });
  });
});
