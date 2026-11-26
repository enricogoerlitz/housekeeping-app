import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from './theme-context';

const SIZE = 18;

/**
 * A child (an icon button) with the red circle and a number at its top right (spec 0051, REQ-003):
 * the number of open notices, "9+" above nine. Without `count` only the child shows. The circle is
 * hidden from the screen reader; the button's own label names the count.
 */
export function WithBadge(props: {
  count: string | undefined;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ position: 'relative' }}>
      {props.children}
      {props.count === undefined ? null : (
        <View
          testID={props.testID}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -2,
            right: -4,
            minWidth: SIZE,
            height: SIZE,
            paddingHorizontal: 4,
            borderRadius: SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.badge,
            borderWidth: 2,
            borderColor: theme.colors.bg,
            boxSizing: 'content-box',
          }}
        >
          <Text
            style={{
              ...theme.type.caption,
              fontSize: 11,
              lineHeight: 14,
              fontWeight: '700',
              color: theme.colors.onBadge,
            }}
          >
            {props.count}
          </Text>
        </View>
      )}
    </View>
  );
}
