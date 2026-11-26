import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Modal, TextInput } from 'react-native';
import { Text } from './primitives';
import { EditableSection, type EditableSectionProps } from './editable-section';

function section(props: Partial<EditableSectionProps> = {}) {
  return (
    <EditableSection
      title="Notizen"
      editing={false}
      onEdit={() => undefined}
      onDone={() => undefined}
      editLabel="Notizen bearbeiten"
      doneLabel="Fertig"
      testID="notes"
      {...props}
    >
      <Text>Mit Safran</Text>
    </EditableSection>
  );
}

describe('EditableSection (spec 0008, REQ-007)', () => {
  it('read: the title with a pencil that opens the section', () => {
    const onEdit = vi.fn();
    render(section({ onEdit, accessory: <Text>4 Portionen</Text> }));
    expect(screen.getByRole('heading', { name: 'Notizen' })).toBeTruthy();
    expect(screen.getByText('Mit Safran')).toBeTruthy();
    expect(screen.getByText('4 Portionen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fertig' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Notizen bearbeiten' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('offline: the pencil is greyed out and does not open', () => {
    const onEdit = vi.fn();
    render(section({ onEdit, disabled: true, hint: 'Offline' }));
    const pencil = screen.getByRole('button', { name: 'Notizen bearbeiten' });
    expect(pencil.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(pencil);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('editing: "Fertig" instead of the pencil and the accessory; it reports done', () => {
    const onDone = vi.fn();
    render(section({ editing: true, onDone, accessory: <Text>4 Portionen</Text> }));
    expect(screen.queryByRole('button', { name: 'Notizen bearbeiten' })).toBeNull();
    expect(screen.queryByText('4 Portionen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('after its own "Fertig" the focus returns to the pencil', () => {
    const { rerender } = render(section({ editing: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    rerender(section({ editing: false }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notizen bearbeiten' }));
  });

  it('closed from elsewhere (another pencil), it leaves the focus alone', () => {
    const { rerender } = render(section({ editing: true }));
    rerender(section({ editing: false }));
    expect(document.activeElement).toBe(document.body);
  });

  it('inline: no title row, the pencil stands beside the content', () => {
    render(section({ inline: true }));
    expect(screen.queryByRole('heading', { name: 'Notizen' })).toBeNull();
    expect(screen.getByText('Mit Safran')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notizen bearbeiten' })).toBeTruthy();
  });
});

describe('EditableSection "Abbrechen" (spec 0023, REQ-003)', () => {
  it('AC-009: closes without saving; the focus returns to the pencil', () => {
    const onCancel = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(
      section({ editing: true, onCancel, onDone, cancelLabel: 'Abbrechen' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    rerender(section({ editing: false, onCancel, cancelLabel: 'Abbrechen' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notizen bearbeiten' }));
  });

  it('AC-010: Escape on the web cancels; other keys do not', () => {
    const onCancel = vi.fn();
    const { rerender } = render(section({ editing: true, onCancel, cancelLabel: 'Abbrechen' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(section({ editing: false, onCancel, cancelLabel: 'Abbrechen' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notizen bearbeiten' }));
  });

  it('AC-010: Escape typed in a field of the section cancels too', () => {
    // react-native-web's TextInput stops its key events from bubbling up to the window.
    const onCancel = vi.fn();
    render(
      <EditableSection
        title="Kopf"
        editing
        inline
        onEdit={() => undefined}
        onDone={() => undefined}
        onCancel={onCancel}
        cancelLabel="Abbrechen"
        editLabel="Kopf bearbeiten"
        doneLabel="Fertig"
      >
        <TextInput accessibilityLabel="Titel" defaultValue="Lasagne neu" />
      </EditableSection>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Titel' }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('inline while editing: "Abbrechen" and "Fertig" stand above the fields, not beside them', () => {
    render(
      section({ inline: true, editing: true, onCancel: () => undefined, cancelLabel: 'Abbrechen' }),
    );
    const done = screen.getByRole('button', { name: 'Fertig' });
    const content = screen.getByText('Mit Safran');
    expect(done.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const box = screen.getByTestId('notes');
    expect(getComputedStyle(box).flexDirection).toBe('column');
  });

  it('AC-011: Escape leaves the section alone while a window above is open', () => {
    const onCancel = vi.fn();
    render(
      <>
        {section({ editing: true, onCancel, cancelLabel: 'Abbrechen' })}
        <Modal visible transparent>
          <Text>Fenster</Text>
        </Modal>
      </>,
    );
    expect(document.querySelector('[aria-modal="true"]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('an Escape something else already handled does not cancel', () => {
    const onCancel = vi.fn();
    render(section({ editing: true, onCancel, cancelLabel: 'Abbrechen' }));
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('without onCancel, or while read, Escape does nothing', () => {
    const onCancel = vi.fn();
    const { rerender } = render(section({ editing: true }));
    fireEvent.keyDown(window, { key: 'Escape' });
    rerender(section({ editing: false, onCancel, cancelLabel: 'Abbrechen' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Abbrechen' })).toBeNull();
  });
});

describe('EditableSection scrollOnOpen (spec 0023, AC-012; spec 0033, REQ-004)', () => {
  const matchMedia = window.matchMedia;
  const rect = HTMLElement.prototype.getBoundingClientRect;
  let page: HTMLDivElement;
  const scrollTo = vi.fn();
  afterEach(() => {
    scrollTo.mockReset();
    page.remove();
    HTMLElement.prototype.getBoundingClientRect = rect;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
  });

  /** Renders into a scroll area spanning 100–700 px; the section stands at `top`, 200 high. */
  function inPage(element: ReactElement, top: number) {
    page = document.createElement('div');
    page.style.overflowY = 'auto';
    page.scrollTop = 300;
    page.scrollTo = scrollTo as unknown as typeof page.scrollTo;
    page.getBoundingClientRect = () => ({ top: 100, bottom: 700 }) as DOMRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({ top, bottom: top + 200 }) as DOMRect;
    document.body.append(page);
    return render(element, { container: page.appendChild(document.createElement('div')) });
  }

  it('spec 0033, AC-012: a section fully in view does not scroll the page', () => {
    const { rerender } = inPage(section({ scrollOnOpen: true }), 200);
    rerender(section({ scrollOnOpen: true, editing: true }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('AC-012: a section partly out of view scrolls its head to the top, smoothly, once', () => {
    const { rerender } = inPage(section({ scrollOnOpen: true }), 600);
    expect(scrollTo).not.toHaveBeenCalled();
    rerender(section({ scrollOnOpen: true, editing: true }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' });
  });

  it('AC-012: with reduced motion it jumps', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('prefers-reduced-motion') }),
    });
    const { rerender } = inPage(section({ scrollOnOpen: true, inline: true }), 600);
    rerender(section({ scrollOnOpen: true, editing: true, inline: true }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'auto' });
  });

  it('without scrollOnOpen nothing scrolls', () => {
    const { rerender } = inPage(section(), 600);
    act(() => {
      rerender(section({ editing: true }));
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
