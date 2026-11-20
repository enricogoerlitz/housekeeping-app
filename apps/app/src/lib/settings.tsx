import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_THEME_ID, isThemeId, type ColorMode, type ThemeId } from '@housekeeping/ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

// Settings that live only on this device (never synced): theme, appearance and the AI switches.

export type AppearancePreference = 'system' | 'light' | 'dark';

export interface LocalSettings {
  themeId: ThemeId;
  appearance: AppearancePreference;
  /** AI search in the recipe search field. Off until the user switches it on. */
  aiSearch: boolean;
  /** AI suggestions while creating articles and recipes. Off until the user switches it on. */
  aiAssist: boolean;
}

const STORAGE_KEY = 'housekeeping.settings.v1';
const defaults: LocalSettings = {
  themeId: DEFAULT_THEME_ID,
  appearance: 'system',
  aiSearch: false,
  aiAssist: false,
};

/** Stored values are untrusted: anything unknown falls back to the default. */
export function parseSettings(raw: string | null): LocalSettings {
  if (!raw) return defaults;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return defaults;
    const record = value as Record<string, unknown>;
    return {
      themeId: isThemeId(record.themeId) ? record.themeId : defaults.themeId,
      appearance:
        record.appearance === 'light' ||
        record.appearance === 'dark' ||
        record.appearance === 'system'
          ? record.appearance
          : defaults.appearance,
      aiSearch: record.aiSearch === true,
      aiAssist: record.aiAssist === true,
    };
  } catch {
    return defaults;
  }
}

interface SettingsContextValue extends LocalSettings {
  /** The colour mode in effect after resolving "system". */
  mode: ColorMode;
  update: (patch: Partial<LocalSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider(props: { children: ReactNode }) {
  const [settings, setSettings] = useState<LocalSettings | undefined>(undefined);
  const systemScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setSettings(parseSettings(raw));
      })
      .catch(() => {
        // Storage can be unavailable (private mode); the app then runs with defaults.
        if (!cancelled) setSettings(defaults);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<LocalSettings>) => {
    setSettings((current) => {
      const next = { ...(current ?? defaults), ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<SettingsContextValue | undefined>(() => {
    if (!settings) return undefined;
    const mode: ColorMode =
      settings.appearance === 'system'
        ? systemScheme === 'dark'
          ? 'dark'
          : 'light'
        : settings.appearance;
    return { ...settings, mode, update };
  }, [settings, systemScheme, update]);

  // Nothing is rendered until the stored theme is known, so the app never flashes the wrong theme.
  if (!value) return null;
  return <SettingsContext.Provider value={value}>{props.children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
