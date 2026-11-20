import { describe, expect, it } from 'vitest';

import { splitDictation } from './dictation';

describe('splitDictation', () => {
  it('AC-028: "Milch, sechs Eier und Brot" becomes three item texts', () => {
    expect(splitDictation('Milch, sechs Eier und Brot')).toEqual(['Milch', '6 Eier', 'Brot']);
  });

  it('splits on "sowie", semicolons and new lines and drops sentence punctuation', () => {
    expect(splitDictation('Käse sowie Butter;\nzwei Dosen Mais.')).toEqual([
      'Käse',
      'Butter',
      '2 Dosen Mais',
    ]);
  });

  it('removes the fillers "bitte" and "noch"', () => {
    expect(splitDictation('Bitte noch eine Gurke und Tomaten bitte!')).toEqual([
      '1 Gurke',
      'Tomaten',
    ]);
  });

  it('turns "ein halbes" into ½', () => {
    expect(splitDictation('ein halbes Brot')).toEqual(['½ Brot']);
  });

  it('returns nothing for silence or fillers only', () => {
    expect(splitDictation('')).toEqual([]);
    expect(splitDictation(' und , bitte. ')).toEqual([]);
  });
});
