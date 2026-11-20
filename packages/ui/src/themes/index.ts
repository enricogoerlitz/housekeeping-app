import { frisch } from './frisch';
import { klar } from './klar';
import { markthalle } from './markthalle';
import type { ColorMode, Theme, ThemeFamily, ThemeId } from './types';

export * from './types';

/** All selectable themes, in the order shown in the picker. The first one is the default. */
export const themeFamilies: ThemeFamily[] = [markthalle, klar, frisch];
export const DEFAULT_THEME_ID: ThemeId = 'markthalle';

export function isThemeId(value: unknown): value is ThemeId {
  return themeFamilies.some((family) => family.id === value);
}

/** Unknown ids fall back to the default theme, so a stale stored value never breaks the app. */
export function getTheme(id: string | null | undefined, mode: ColorMode): Theme {
  const family = themeFamilies.find((candidate) => candidate.id === id) ?? markthalle;
  return mode === 'dark' ? family.dark : family.light;
}
