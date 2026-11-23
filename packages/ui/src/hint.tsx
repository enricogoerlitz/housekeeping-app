import { useLayoutEffect, useRef, type Ref, type RefCallback, type RefObject } from 'react';
import type { HostInstance } from 'react-native';

/**
 * ARIA attributes react-native-web does not write (`aria-description`, or `aria-disabled` on a
 * Pressable without `disabled`), set on the node itself; `undefined` removes one. Native ignores
 * them. Pass the ref to the control.
 */
function useWebAria(
  attributes: Record<string, string | undefined>,
): RefObject<HostInstance | null> {
  const ref = useRef<HostInstance>(null);
  // `undefined` stays in the key as null, so a dropped value is removed from the node.
  const key = JSON.stringify(attributes, (_name, value: unknown) => value ?? null);
  useLayoutEffect(() => {
    const node = ref.current as unknown;
    if (typeof Element === 'undefined' || !(node instanceof Element)) return;
    for (const [name, value] of Object.entries(JSON.parse(key) as Record<string, string | null>)) {
      if (value === null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
  }, [key]);
  return ref;
}

/**
 * `accessibilityHint` that also reaches the browser (spec 0023, AC-048): react-native-web drops
 * the prop, so on the web the same text becomes the node's `aria-description`. Keep
 * `accessibilityHint` for native and pass the ref to the control.
 */
export function useHint(hint: string | undefined): RefObject<HostInstance | null> {
  return useWebAria({ 'aria-description': hint || undefined });
}

/**
 * A Pressable that stays pressable while greyed out, so a press can say why (e.g. offline):
 * react-native-web's Pressable writes `aria-disabled` only from `disabled`, which would also
 * swallow the press. Keep `accessibilityHint` for native and pass the ref to the Pressable.
 */
export function useSoftDisabled(
  disabled: boolean,
  hint: string | undefined,
): RefObject<HostInstance | null> {
  return useWebAria({
    'aria-disabled': String(disabled),
    'aria-description': hint || undefined,
  });
}

/**
 * The same as a callback ref, for places where a hook cannot run (an item in a list): sets or
 * removes the attributes on every render. Native ignores them.
 */
export function ariaRef(attributes: Record<string, string | undefined>): RefCallback<HostInstance> {
  return (node) => {
    const element = node as unknown;
    if (typeof Element === 'undefined' || !(element instanceof Element)) return;
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
  };
}

/** One ref for a node that two owners need (e.g. the caller's and the hint's). */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as RefObject<T | null>).current = node;
    }
  };
}
