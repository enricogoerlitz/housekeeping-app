import { describe, expect, it, vi } from 'vitest';

import { createRequestSlot } from './request-slot';

describe('createRequestSlot (spec 0036, REQ-012)', () => {
  it('holds one request at a time and tells its listeners', () => {
    const slot = createRequestSlot<string>();
    const listener = vi.fn();
    const stop = slot.subscribe(listener);
    expect(slot.current()).toBeUndefined();
    slot.open('„Bless“ löschen?');
    expect(slot.current()).toBe('„Bless“ löschen?');
    slot.open('„Milch“ entfernen?');
    expect(slot.current()).toBe('„Milch“ entfernen?');
    slot.close();
    expect(slot.current()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    slot.open('Foto entfernen?');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('closing only closes the request it was given for', () => {
    const slot = createRequestSlot<{ title: string }>();
    const first = { title: 'Foto entfernen?' };
    const second = { title: '„Bless“ löschen?' };
    slot.open(first);
    slot.open(second);
    slot.close(first);
    expect(slot.current()).toBe(second);
    slot.close(second);
    expect(slot.current()).toBeUndefined();
  });
});
