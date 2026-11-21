import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** The meaningful moments that get a haptic (rule 40-ui): checking off an item, a drop. */
export type HapticMoment = 'check' | 'drop';

/**
 * A light tap on the device at the moment the visual changes; never the only feedback. On the web
 * it does nothing, and a device without haptics silently ignores it.
 */
export function haptic(moment: HapticMoment): void {
  if (Platform.OS === 'web') return;
  // A drop is a drag that commits (light impact); a check is a small tick (selection).
  const run =
    moment === 'drop'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.selectionAsync();
  run.catch(() => undefined);
}
