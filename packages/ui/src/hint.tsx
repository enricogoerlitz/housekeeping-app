import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, Text, type HostInstance } from 'react-native';

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

/**
 * `aria-disabled` for a Pressable that stays pressable while greyed out, so a press can say why
 * (e.g. offline). react-native-web's Pressable writes the attribute only from `disabled`, which
 * would also swallow the press; this sets it on the node. Pass the ref to the Pressable.
 */
export function useAriaDisabled(disabled: boolean): RefObject<HostInstance | null> {
  const ref = useRef<HostInstance>(null);
  useLayoutEffect(() => {
    const node = ref.current as unknown;
    if (typeof Element !== 'undefined' && node instanceof Element) {
      node.setAttribute('aria-disabled', String(disabled));
    }
  }, [disabled]);
  return ref;
}
