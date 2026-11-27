import { Text, needsPortraitHint, useFinePointer, useTheme } from '@housekeeping/ui';
import { useSyncExternalStore } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

type Held = 'portrait' | 'landscape' | undefined;

/** How the screen is held; the keyboard shrinking the window does not change it. */
function readHeld(): Held {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const type = window.screen?.orientation?.type;
  if (type) return type.startsWith('landscape') ? 'landscape' : 'portrait';
  // Older iOS: the deprecated `window.orientation` in degrees.
  const degrees = (window as { orientation?: number }).orientation;
  if (typeof degrees === 'number') return Math.abs(degrees) === 90 ? 'landscape' : 'portrait';
  return undefined;
}

function subscribeHeld(listener: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const orientation = window.screen?.orientation;
  orientation?.addEventListener('change', listener);
  window.addEventListener('orientationchange', listener);
  return () => {
    orientation?.removeEventListener('change', listener);
    window.removeEventListener('orientationchange', listener);
  };
}

/**
 * Over the whole app while a phone is held sideways (spec 0034, REQ-009, AC-021): iOS does not
 * let the installed app lock portrait, so it asks to turn the phone. Upright everything is as
 * before; the app below stays mounted. The keyboard shrinking the window is no turn: the screen's
 * own orientation decides where the browser tells it.
 */
export function PortraitHint() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const finePointer = useFinePointer();
  const orientation = useSyncExternalStore(subscribeHeld, readHeld, () => undefined);
  const screen = Platform.OS === 'web' && typeof window !== 'undefined' ? window.screen : undefined;
  if (
    !needsPortraitHint({
      width,
      height,
      finePointer,
      orientation,
      screen: screen ? { width: screen.width, height: screen.height } : undefined,
    })
  ) {
    return null;
  }
  return (
    <View
      testID="portrait-hint"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.shape.gutter,
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text variant="heading" style={{ textAlign: 'center' }}>
        Bitte Handy hochkant halten
      </Text>
    </View>
  );
}
