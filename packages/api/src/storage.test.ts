import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from './storage';

describe('memory storage', () => {
  it('stores several values in one step and reads them back', async () => {
    const storage = createMemoryStorage();
    await storage.setMany([
      ['a', { n: 1 }],
      ['b', [1, 2]],
    ]);
    expect(await storage.get('a')).toEqual({ n: 1 });
    expect(await storage.get('b')).toEqual([1, 2]);
    expect(await storage.get('missing')).toBeUndefined();
  });

  it('keeps a copy, so later changes to the object do not leak into storage', async () => {
    const storage = createMemoryStorage();
    const value = { n: 1 };
    await storage.setMany([['a', value]]);
    value.n = 2;
    expect(await storage.get('a')).toEqual({ n: 1 });
  });

  it('deletes keys and clears everything', async () => {
    const storage = createMemoryStorage();
    await storage.setMany([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    await storage.del(['a', 'b']);
    expect(await storage.get('a')).toBeUndefined();
    expect(await storage.get('c')).toBe(3);
    await storage.clear();
    expect(await storage.get('c')).toBeUndefined();
  });

  it('writes nothing when one value cannot be stored (all or nothing)', async () => {
    const storage = createMemoryStorage();
    await storage.setMany([['a', 1]]);
    await expect(
      storage.setMany([
        ['a', 2],
        ['b', () => 'not cloneable'],
      ]),
    ).rejects.toThrow();
    expect(await storage.get('a')).toBe(1);
    expect(await storage.get('b')).toBeUndefined();
  });
});
