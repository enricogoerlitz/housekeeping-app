import { describe, expect, it } from 'vitest';

import { indexById } from './queries';

// The by-id indexes back the detail pages, whose ids come from the address bar: a name of
// Object.prototype must never resolve to something that is not an entry (deep link
// /plan/aktivitaet/constructor crashed the page).
describe('indexById', () => {
  it('finds entries by id and nothing for names of Object.prototype', () => {
    const entry = { id: 'a', name: 'A' };
    const index = indexById([entry]);
    expect(index.a).toBe(entry);
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(index[name], name).toBeUndefined();
    }
  });

  it('an entry whose id is a prototype name is an ordinary entry', () => {
    const entry = { id: '__proto__' };
    const index = indexById([entry, { id: 'b' }]);
    expect(index.__proto__).toBe(entry);
    expect(Object.keys(index)).toEqual(['__proto__', 'b']);
    expect(index.toString).toBeUndefined();
  });

  it('is cached per array instance', () => {
    const list = [{ id: 'a' }];
    expect(indexById(list)).toBe(indexById(list));
  });
});
