import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from './theme-context';

/** Content that arrives sooner never shows a placeholder (spec 0034, REQ-001). */
export const PLACEHOLDER_DELAY_MS = 400;

export interface ListPlaceholderProps {
  /** What the screen reader hears, e.g. "Wird geladen". */
  label: string;
  /** Number of rows in the shape of the list it stands for. */
  rows?: number;
  testID?: string;
}

/**
 * The calm stand-in for a list that takes longer than 400 ms (spec 0034, REQ-001): nothing at
 * first, then quiet rows in the list's shape. No spinner; the page's heading stands from the start.
 */
export function ListPlaceholder(props: ListPlaceholderProps) {
  const theme = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), PLACEHOLDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  const rows = Array.from({ length: props.rows ?? 3 }, (_, index) => index);
  return (
    <View accessible accessibilityLabel={props.label} testID={props.testID} style={{ gap: 8 }}>
      {rows.map((row) => (
        <View
          key={row}
          testID={props.testID ? `${props.testID}-row` : undefined}
          style={{
            height: 44,
            borderRadius: theme.shape.radius.control,
            backgroundColor: theme.colors.surfaceSunken,
          }}
        />
      ))}
    </View>
  );
}
