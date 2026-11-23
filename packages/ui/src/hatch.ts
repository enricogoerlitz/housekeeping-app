import type { ViewStyle } from 'react-native';

// Hatching marks something planned but not yet in effect, e.g. a trip as "Entwurf" (spec 0030,
// Entscheidung 6): thin diagonal lines in the colour of the thing over its usual soft fill. The app
// runs as a web app; a native build would show the fill without the lines.

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** The colour with this two-digit hex alpha; a colour that is no #RRGGBB(AA) stays as it is. */
export function withAlpha(color: string, alpha: string): string {
  return HEX.test(color) ? `${color.slice(0, 7)}${alpha}` : color;
}

/** The CSS background image of the hatching. */
export function hatchImage(color: string): string {
  return `repeating-linear-gradient(135deg, ${color} 0px, ${color} 1.5px, transparent 1.5px, transparent 6px)`;
}

/** Style that draws the hatching over the view's background colour. */
export function hatchStyle(color: string): ViewStyle {
  return { backgroundImage: hatchImage(color) };
}
