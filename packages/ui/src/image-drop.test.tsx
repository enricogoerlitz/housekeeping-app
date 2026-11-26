import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useImageDropAndPaste } from './image-drop';
import { fileFromTransfer } from './transfer-file';

/** A DataTransfer as the browser hands it over (jsdom has none). */
function transfer(files: File[], types = files.length > 0 ? ['Files'] : ['text/plain']) {
  return {
    files,
    types,
    items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

function fire(type: string, data: DataTransfer, target: EventTarget = document) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', {
    value: data,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function Probe(props: { enabled: boolean; onFile: (file: File) => void }) {
  const dragging = useImageDropAndPaste(props.enabled, props.onFile);
  return <span data-testid="probe">{dragging ? 'dragging' : 'idle'}</span>;
}

const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'kuchen.jpg', { type: 'image/jpeg' });
const pdf = new File(['%PDF'], 'rezept.pdf', { type: 'application/pdf' });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fileFromTransfer', () => {
  it('takes the first file, from files or from items', () => {
    expect(fileFromTransfer(transfer([jpeg, pdf]))).toBe(jpeg);
    const onlyItems = { files: [], items: [{ kind: 'file', getAsFile: () => pdf }] };
    expect(fileFromTransfer(onlyItems as unknown as DataTransfer)).toBe(pdf);
    expect(fileFromTransfer(transfer([]))).toBeUndefined();
    expect(fileFromTransfer(null)).toBeUndefined();
  });
});

describe('useImageDropAndPaste (spec 0039, REQ-002)', () => {
  it('AC-003: a file dragged into the window shows the drop state and is handed over', () => {
    const onFile = vi.fn();
    const view = render(<Probe enabled onFile={onFile} />);
    const over = fire('dragover', transfer([jpeg]));
    expect(over.defaultPrevented).toBe(true);
    expect(view.getByTestId('probe').textContent).toBe('dragging');
    const drop = fire('drop', transfer([jpeg]));
    expect(drop.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledWith(jpeg);
    expect(view.getByTestId('probe').textContent).toBe('idle');
  });

  it('AC-005: a dropped PDF is handed over too, so the window can say "Das ist kein Bild"', () => {
    const onFile = vi.fn();
    render(<Probe enabled onFile={onFile} />);
    fire('drop', transfer([pdf]));
    expect(onFile).toHaveBeenCalledWith(pdf);
  });

  it('AC-004: a pasted image (⌘V) is handed over; pasted text is left to the field', () => {
    const onFile = vi.fn();
    render(<Probe enabled onFile={onFile} />);
    const image = fire('paste', transfer([jpeg]));
    expect(image.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledWith(jpeg);
    const text = fire('paste', transfer([]));
    expect(text.defaultPrevented).toBe(false);
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it('dragging away ends the drop state; dragging text does nothing', () => {
    const view = render(<Probe enabled onFile={vi.fn()} />);
    fire('dragover', transfer([jpeg]));
    fire('dragleave', transfer([jpeg]));
    expect(view.getByTestId('probe').textContent).toBe('idle');
    const text = fire('dragover', transfer([]));
    expect(text.defaultPrevented).toBe(false);
    expect(view.getByTestId('probe').textContent).toBe('idle');
  });

  it('while the window is closed nothing is caught', () => {
    const onFile = vi.fn();
    render(<Probe enabled={false} onFile={onFile} />);
    const drop = fire('drop', transfer([jpeg]));
    fire('paste', transfer([jpeg]));
    expect(drop.defaultPrevented).toBe(false);
    expect(onFile).not.toHaveBeenCalled();
  });
});
