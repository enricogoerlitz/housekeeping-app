import type { ReactNode } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';

import { FOCUS_RING_ROOM } from './controls';

export interface ScrollRowProps {
  children?: ReactNode;
  gap?: number;
  /** Extra style of the content row, e.g. its own side padding. */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A row of chips or tiles that scrolls sideways. It leaves room for the focus ring on all four
 * sides, also around the first and the last item, without moving the row (spec 0019, AC-005).
 */
export function ScrollRow(props: ScrollRowProps) {
  return (
    <ScrollView
      testID={props.testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0, margin: -FOCUS_RING_ROOM }}
      contentContainerStyle={[
        { gap: props.gap ?? 8, alignItems: 'center', padding: FOCUS_RING_ROOM },
        props.contentStyle,
      ]}
    >
      {props.children}
    </ScrollView>
  );
}
