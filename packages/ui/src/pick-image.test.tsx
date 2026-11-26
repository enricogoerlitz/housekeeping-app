import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickImageFile } from './pick-image';

const picker = () => document.body.querySelector<HTMLInputElement>('input[type="file"]');

function choose(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
}

afterEach(() => {
  picker()?.remove();
});

describe('pickImageFile (spec 0033, REQ-008)', () => {
  it('AC-023: the picker stays in the document until the photo arrives, then hands it over', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const onFile = vi.fn();
    pickImageFile(onFile);
    const input = picker();
    expect(input).not.toBeNull();
    expect(input?.accept).toBe('image/*');
    expect(click).toHaveBeenCalledTimes(1);
    const photo = new File(['x'], 'kuchen.jpg', { type: 'image/jpeg' });
    choose(input as HTMLInputElement, [photo]);
    expect(onFile).toHaveBeenCalledWith(photo);
    expect(picker()).toBeNull();
    click.mockRestore();
  });

  it('AC-024: cancelled in the library: nothing happens and the picker is gone', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const onFile = vi.fn();
    pickImageFile(onFile);
    picker()?.dispatchEvent(new Event('cancel'));
    expect(onFile).not.toHaveBeenCalled();
    expect(picker()).toBeNull();
    click.mockRestore();
  });

  it('a change without a file calls nothing', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const onFile = vi.fn();
    pickImageFile(onFile);
    choose(picker() as HTMLInputElement, []);
    expect(onFile).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('a second try replaces a picker that never reported back', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    pickImageFile(() => undefined);
    pickImageFile(() => undefined);
    expect(document.body.querySelectorAll('input[type="file"]')).toHaveLength(1);
    click.mockRestore();
  });
});
