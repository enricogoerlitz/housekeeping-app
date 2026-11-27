import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lockPageScroll } from './page-scroll-lock';

let root: HTMLDivElement;
let page: HTMLDivElement;

function scrollable(element: HTMLElement, height: number, content: number) {
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: content });
}

function scrollTo(element: HTMLElement, top: number) {
  element.scrollTop = top;
  element.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  page = document.createElement('div');
  scrollable(page, 700, 2000);
  root.append(page);
  document.body.append(root);
  page.scrollTop = 480;
});
afterEach(() => {
  root.remove();
});

describe('lockPageScroll (spec 0033, REQ-004)', () => {
  it('AC-011: what scrolls the page while a window is open is undone; after it, the page is free', () => {
    const release = lockPageScroll();
    scrollTo(page, 120);
    expect(page.scrollTop).toBe(480);
    release();
    scrollTo(page, 120);
    expect(page.scrollTop).toBe(120);
  });

  it('AC-011: on release the page is back at its place even if a scroll went unreported', () => {
    const release = lockPageScroll();
    page.scrollTop = 0;
    release();
    expect(page.scrollTop).toBe(480);
  });

  it('a window on a window shares the lock; the page is free once both are closed', () => {
    const outer = lockPageScroll();
    const inner = lockPageScroll();
    inner();
    inner();
    scrollTo(page, 100);
    expect(page.scrollTop).toBe(480);
    outer();
    scrollTo(page, 100);
    expect(page.scrollTop).toBe(100);
  });

  it('areas outside the page (the window itself) scroll freely', () => {
    const sheet = document.createElement('div');
    scrollable(sheet, 300, 900);
    document.body.append(sheet);
    const release = lockPageScroll();
    scrollTo(sheet, 200);
    expect(sheet.scrollTop).toBe(200);
    release();
    sheet.remove();
  });
});
