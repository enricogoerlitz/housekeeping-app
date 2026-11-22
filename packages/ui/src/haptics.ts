import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The meaningful moments that get a haptic (rule 40-ui): checking off an item, an entry lifting
 * for a drag (spec 0016), a drop.
 */
export type HapticMoment = 'check' | 'lift' | 'drop';

/**
 * A light tap on the device at the moment the visual changes; never the only feedback. On the web
 * it does nothing, and a device without haptics silently ignores it.
 */
export function haptic(moment: HapticMoment): void {
  if (Platform.OS === 'web') return;
  // Lifting and dropping move a thing (light impact); a check is a small tick (selection).
  const run =
    moment !== 'check'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.selectionAsync();
  run.catch(() => undefined);
}
