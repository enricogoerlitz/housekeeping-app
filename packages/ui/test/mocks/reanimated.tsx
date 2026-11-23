// Stand-in for react-native-reanimated in the component tests (jsdom, react-native-web): no UI
// thread, so shared values are plain objects, animated styles are computed on render and every
// animation jumps to its end and reports it finished. Components keep their structure and roles.
import { createElement, forwardRef, useState, type ComponentType } from 'react';
import { FlatList, Image, ScrollView, Text, View } from 'react-native';

type Props = Record<string, unknown>;

const ANIMATION_PROPS = ['entering', 'exiting', 'layout'];

function createAnimatedComponent<P extends object>(component: ComponentType<P>) {
  return forwardRef<unknown, Props>(function Animated(props, ref) {
    const rest: Props = { ...props };
    for (const name of ANIMATION_PROPS) delete rest[name];
    return createElement(component as ComponentType<Props>, { ...rest, ref });
  });
}

const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  ScrollView: createAnimatedComponent(ScrollView),
  FlatList: createAnimatedComponent(FlatList),
  Image: createAnimatedComponent(Image),
  createAnimatedComponent,
};
export default Animated;

export interface SharedValue<T> {
  value: T;
  get: () => T;
  set: (value: T | ((current: T) => T)) => void;
}

export function makeShared<T>(initial: T): SharedValue<T> {
  const shared: SharedValue<T> = {
    value: initial,
    get: () => shared.value,
    // Like Reanimated: a function is an updater of the current value.
    set: (value) => {
      shared.value =
        typeof value === 'function' ? (value as (current: T) => T)(shared.value) : value;
    },
  };
  return shared;
}

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [shared] = useState(() => makeShared(initial));
  return shared;
}

export function useAnimatedStyle<T>(updater: () => T): T {
  return updater();
}

type Handler = (event: unknown) => void;
export function useAnimatedScrollHandler(
  handlers: Handler | { onScroll?: Handler },
): (event: { nativeEvent: unknown }) => void {
  return (event) => {
    const onScroll = typeof handlers === 'function' ? handlers : handlers.onScroll;
    onScroll?.(event.nativeEvent);
  };
}

type Done = ((finished?: boolean) => void) | undefined;
export function withTiming<T>(value: T, _config?: unknown, done?: Done): T {
  done?.(true);
  return value;
}
export function withSpring<T>(value: T, _config?: unknown, done?: Done): T {
  done?.(true);
  return value;
}
export function cancelAnimation(): void {}
export function useReducedMotion(): boolean {
  return reducedMotion.value;
}
/** Tests switch "reduce motion" with `reducedMotion.value = true`. */
export const reducedMotion = { value: false };

export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

const identity = (t: number) => t;
const easingFactory = () => identity;
export const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  bezier: easingFactory,
  in: easingFactory,
  out: easingFactory,
  inOut: easingFactory,
};

/** Layout animations: builders whose every method returns the builder. */
function builder(): object {
  const target: object = new Proxy(
    {},
    { get: (_target, name) => (name === 'then' ? undefined : () => target) },
  );
  return target;
}
export const FadeIn = builder();
export const FadeOut = builder();
export const LinearTransition = builder();
