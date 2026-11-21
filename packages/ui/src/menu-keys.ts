// Keyboard of the `Menu` on the web (spec 0008, platforms). Pure, so it is tested in Node.

export type MenuKeyResult = { focus: number } | { choose: number };

/**
 * What a key does in an open menu with `count` entries while entry `focused` has the focus.
 * Arrows move and wrap around, Home and End jump. Space picks the value in a choice menu (the
 * menu acts on its release); Enter (and Space on a plain action entry) is handled by the
 * pressable itself. Escape closes the menu elsewhere. Undefined: the key is not the menu's.
 */
export function menuKey(
  key: string,
  focused: number,
  count: number,
  isChoice: boolean,
): MenuKeyResult | undefined {
  if (count === 0) return undefined;
  const wrap = (index: number) => ((index % count) + count) % count;
  if (key === 'ArrowDown') return { focus: wrap(focused + 1) };
  if (key === 'ArrowUp') return { focus: wrap(focused - 1) };
  if (key === 'Home') return { focus: 0 };
  if (key === 'End') return { focus: count - 1 };
  if (isChoice && (key === ' ' || key === 'Spacebar')) return { choose: focused };
  return undefined;
}
