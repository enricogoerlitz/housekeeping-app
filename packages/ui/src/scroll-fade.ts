// A row that scrolls sideways fades out at an edge where more follows, so a chip there reads as
// "more this way" instead of being cut into a half circle (review 0003).

/** How wide the fade is: about half a chip's height. */
const FADE = 28;

export interface ScrollFade {
  start: boolean;
  end: boolean;
}

/** Which edges fade: the start once scrolled, the end while more follows (1 px for rounding). */
export function scrollFade(row: { offset: number; content: number; view: number }): ScrollFade {
  return {
    start: row.offset > 1,
    end: row.offset + row.view < row.content - 1,
  };
}

/** The CSS mask for those edges; undefined when nothing fades. */
export function scrollFadeMask(fade: ScrollFade): string | undefined {
  if (!fade.start && !fade.end) return undefined;
  const start = fade.start ? FADE : 0;
  const end = fade.end ? FADE : 0;
  return `linear-gradient(to right, transparent 0px, #000 ${start}px, #000 calc(100% - ${end}px), ${fade.end ? 'transparent' : '#000'} 100%)`;
}
