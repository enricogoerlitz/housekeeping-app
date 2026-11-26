import { Text, needsPortraitHint, useFinePointer, useTheme } from '@housekeeping/ui';
import { View, useWindowDimensions } from 'react-native';

/**
 * Over the whole app while a phone is held sideways (spec 0034, REQ-009, AC-021): iOS does not
 * let the installed app lock portrait, so it asks to turn the phone. Upright everything is as
 * before; the app below stays mounted.
 */
export function PortraitHint() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const finePointer = useFinePointer();
  if (!needsPortraitHint({ width, height, finePointer })) return null;
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
