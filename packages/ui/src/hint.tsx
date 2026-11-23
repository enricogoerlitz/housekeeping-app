import { useId, type ReactNode } from 'react';
import { Platform, Text } from 'react-native';

/**
 * `accessibilityHint` that also reaches the browser: react-native-web drops the prop, so on the
 * web the same text hangs on a hidden node named by `aria-describedby` (spec 0023, AC-048).
 * Spread `props` on the control and render `node` inside it.
 */
export function useHint(hint: string | undefined): { props: object; node: ReactNode } {
  const id = useId();
  if (!hint) return { props: {}, node: null };
  if (Platform.OS !== 'web') return { props: { accessibilityHint: hint }, node: null };
  return {
    props: { accessibilityHint: hint, 'aria-describedby': id },
    node: (
      <Text nativeID={id} style={{ display: 'none' }}>
        {hint}
      </Text>
    ),
  };
}
