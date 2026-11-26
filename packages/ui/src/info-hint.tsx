import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { keyboardFocusRing } from './controls';
import { expandableA11y } from './expandable';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

/**
 * A small (i) next to a field that folds a short explanation open in place, e.g. which units a
 * free amount understands (spec 0036, REQ-006). The label names the question; the words come
 * from the feature.
 */
export function InfoHint(props: { label: string; children: string; testID?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View testID={props.testID}>
      <Pressable
        accessibilityRole="button"
        {...expandableA11y(props.label, open, Platform.OS)}
        onPress={() => setOpen(!open)}
        hitSlop={6}
        testID={props.testID ? `${props.testID}-toggle` : undefined}
        style={(state) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            minHeight: 44,
            alignSelf: 'flex-start',
            borderRadius: theme.shape.radius.control,
            opacity: state.pressed ? 0.6 : 1,
          },
          keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
        ]}
      >
        <Icon name="info" size={16} color="accent" />
        <Text variant="small" color="accent">
          {props.label}
        </Text>
      </Pressable>
      {open ? (
        <Text
          variant="small"
          color="muted"
          testID={props.testID ? `${props.testID}-text` : undefined}
        >
          {props.children}
        </Text>
      ) : null}
    </View>
  );
}
