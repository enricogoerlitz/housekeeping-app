// The page behind an open window stays where it is (spec 0033, REQ-004, decision 3). A window
// lives outside #root; whatever scrolls the page meanwhile (focus coming back to the page, the
// keyboard, iOS revealing a field) is undone at once, before it is drawn.

interface Locked {
  element: Element;
  top: number;
}

let holders = 0;
let locked: Locked[] = [];

function scrollAreas(): Locked[] {
  const root = document.getElementById('root');
  if (!root) return [];
  const areas: Locked[] = [];
  for (const element of root.querySelectorAll('*')) {
    // Layout values first: only the few elements that can scroll need their style read.
    if (element.scrollHeight <= element.clientHeight && element.scrollTop === 0) continue;
    const { overflowY } = getComputedStyle(element);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
      areas.push({ element, top: element.scrollTop });
    }
  }
  return areas;
}

function restore() {
  for (const area of locked) {
    if (area.element.scrollTop !== area.top) area.element.scrollTop = area.top;
  }
}

function onScroll(event: Event) {
  const area = locked.find((candidate) => candidate.element === event.target);
  if (area && area.element.scrollTop !== area.top) area.element.scrollTop = area.top;
}

/**
 * Holds every scroll area of the page at its place until the returned release is called; nested
 * windows share one lock. The release puts everything back once more and lets go.
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (holders === 0) {
    locked = scrollAreas();
    document.addEventListener('scroll', onScroll, true);
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0) return;
    restore();
    locked = [];
    document.removeEventListener('scroll', onScroll, true);
  };
}
