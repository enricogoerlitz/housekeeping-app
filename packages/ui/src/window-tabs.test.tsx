import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Text } from './primitives';
import { focusAfterChange, openKeyboardNow } from './keyboard-proxy';
import { TabSwipeContent } from './tab-swipe-area';

// Spec 0055, REQ-001, REQ-002: the tabs of a window ("Mit KI ausfüllen"): the field of the new tab
// takes the cursor in the tap that changed it, and the content swipes like a page's tabs.

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15';
const userAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
const asIPhone = () =>
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: IPHONE });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => vi.runAllTimers());
  vi.useRealTimers();
  if (userAgent) Object.defineProperty(window.navigator, 'userAgent', userAgent);
  else Reflect.deleteProperty(window.navigator, 'userAgent');
});

/** Two tabs, each with its own field; the button switches like a tap on the other tab. */
function Tabs() {
  const [tab, setTab] = useState<'web' | 'prompt'>('web');
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const other = tab === 'web' ? 'prompt' : 'web';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          focusAfterChange(
            () => setTab(other),
            () => field.current,
          )
        }
      >
        <Text>{other}</Text>
      </Pressable>
      {tab === 'web' ? (
        <TextInput key="web" ref={field} testID="web-field" />
      ) : (
        <TextInput key="prompt" ref={field} testID="prompt-field" />
      )}
    </>
  );
}

describe('focusAfterChange (spec 0055, REQ-001)', () => {
  it('AC-002: in the tap the new tab is there and its field has the cursor', () => {
    render(<Tabs />);
    fireEvent.click(screen.getByRole('button', { name: 'prompt' }));
    expect(document.activeElement).toBe(screen.getByTestId('prompt-field'));
  });

  it('AC-003: and back: the field of "Websuche" has it', () => {
    render(<Tabs />);
    fireEvent.click(screen.getByRole('button', { name: 'prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'web' }));
    expect(document.activeElement).toBe(screen.getByTestId('web-field'));
  });

  it('AC-001: on an iPhone the hidden field holds the keyboard while the old field goes', () => {
    asIPhone();
    render(<Tabs />);
    (screen.getByTestId('web-field') as HTMLInputElement).focus();
    const fields = () => document.querySelectorAll('input').length;
    fireEvent.click(screen.getByRole('button', { name: 'prompt' }));
    expect(document.activeElement).toBe(screen.getByTestId('prompt-field'));
    // The hidden field left the page again once the new field had the keyboard.
    expect(fields()).toBe(1);
  });

  it('without a field to focus (the tab shows results) nothing else takes the focus', () => {
    render(<Tabs />);
    const before = document.activeElement;
    act(() =>
      focusAfterChange(
        () => undefined,
        () => null,
      ),
    );
    expect(document.activeElement).toBe(before);
  });

  it('a keyboard opened before stays with the field (openKeyboardNow then focusAfterChange)', () => {
    asIPhone();
    render(<Tabs />);
    openKeyboardNow();
    fireEvent.click(screen.getByRole('button', { name: 'prompt' }));
    expect(document.activeElement).toBe(screen.getByTestId('prompt-field'));
  });
});

/** The window's size for react-native-web (jsdom reports 0 × 0): a phone, so the swipe is on. */
function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

// react-native-web builds PanResponder's gestures from mouse events with their time stamps.
let stamp = 1000;
function mouse(target: Element, type: 'mousedown' | 'mousemove' | 'mouseup', x: number) {
  stamp += 100;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 300,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
  });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  act(() => {
    target.dispatchEvent(event);
  });
}
function swipeLeft(target: Element) {
  mouse(target, 'mousedown', 300);
  for (const x of [280, 240, 200, 160]) mouse(target, 'mousemove', x);
  mouse(target, 'mouseup', 160);
}

/** The window's tabs as "Mit KI ausfüllen" wires them: a swipe moves the cursor while typing. */
function SwipeTabs() {
  const [tab, setTab] = useState<'web' | 'prompt'>('web');
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const index = tab === 'web' ? 0 : 1;
  return (
    <TabSwipeContent
      swipe={{
        index,
        count: 2,
        onStep: (step) =>
          focusAfterChange(
            () => setTab(index + step === 0 ? 'web' : 'prompt'),
            () => field.current,
            { onlyWhenTyping: true },
          ),
      }}
    >
      {tab === 'web' ? (
        <TextInput key="web" ref={field} testID="web-field" />
      ) : (
        <TextInput key="prompt" ref={field} testID="prompt-field" />
      )}
      <Text>Inhalt</Text>
    </TabSwipeContent>
  );
}

describe('a swipe between the tabs while typing (spec 0055, REQ-002; review 0004, I-01/I-02)', () => {
  beforeEach(() => setWindow(390, 844));
  afterEach(() => setWindow(0, 0));

  it('AC-007: the field of the new tab has the cursor, and React warns of nothing', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SwipeTabs />);
    (screen.getByTestId('web-field') as HTMLInputElement).focus();
    swipeLeft(screen.getByText('Inhalt'));
    act(() => vi.advanceTimersByTime(50));
    expect(document.activeElement).toBe(screen.getByTestId('prompt-field'));
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/flushSync/);
    errors.mockRestore();
  });

  it('AC-007 on an iPhone: the hidden field holds the keyboard and goes once the new field has it', () => {
    asIPhone();
    render(<SwipeTabs />);
    (screen.getByTestId('web-field') as HTMLInputElement).focus();
    swipeLeft(screen.getByText('Inhalt'));
    act(() => vi.advanceTimersByTime(50));
    expect(document.activeElement).toBe(screen.getByTestId('prompt-field'));
    expect(document.querySelectorAll('input')).toHaveLength(1);
  });
});

describe('TabSwipeContent (spec 0055, REQ-002)', () => {
  it('AC-006: inside a window the content pans only vertically, so a sideways finger swipes', () => {
    render(
      <TabSwipeContent swipe={{ index: 0, count: 2, onStep: () => undefined }}>
        <Text>Inhalt</Text>
      </TabSwipeContent>,
    );
    const area = screen.getByTestId('tab-swipe-content');
    expect(area.style.touchAction).toBe('pan-y');
    expect(screen.getByText('Inhalt')).toBeTruthy();
  });
});
