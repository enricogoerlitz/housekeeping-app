import { espresso } from './espresso';
import { frisch } from './frisch';
import { klar } from './klar';
import { lavendel } from './lavendel';
import { markthalle } from './markthalle';
import { mitternacht } from './mitternacht';
import { salbei } from './salbei';
import { wolke } from './wolke';
import { zitrus } from './zitrus';
import type { ColorMode, Theme, ThemeFamily, ThemeId } from './types';

export * from './types';

/** All selectable themes, in the order shown in the picker. The first one is the default. */
export const themeFamilies: ThemeFamily[] = [
  markthalle,
  klar,
  frisch,
  wolke,
  mitternacht,
  zitrus,
  salbei,
  lavendel,
  espresso,
];
export const DEFAULT_THEME_ID: ThemeId = 'markthalle';

export function isThemeId(value: unknown): value is ThemeId {
  return themeFamilies.some((family) => family.id === value);
}

/** Unknown ids fall back to the default theme, so a stale stored value never breaks the app. */
export function getTheme(id: string | null | undefined, mode: ColorMode): Theme {
  const family = themeFamilies.find((candidate) => candidate.id === id) ?? markthalle;
  return mode === 'dark' ? family.dark : family.light;
}

/** How many themes the picker shows until "Mehr anzeigen" (spec 0058, REQ-007). */
const PICKER_SHORT = 3;

/**
 * The themes of the picker (spec 0058, REQ-007): the chosen one first, then the others in the
 * order of `themeFamilies`; three of them, or all when expanded.
 */
export function pickerFamilies(selectedId: string, expanded: boolean): ThemeFamily[] {
  const selected = themeFamilies.filter((family) => family.id === selectedId);
  const ordered = [...selected, ...themeFamilies.filter((family) => family.id !== selectedId)];
  return expanded ? ordered : ordered.slice(0, PICKER_SHORT);
}
