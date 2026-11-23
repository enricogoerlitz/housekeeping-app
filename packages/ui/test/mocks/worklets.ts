// react-native-worklets in the component tests: there is only one thread.
export function scheduleOnRN<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
  fn(...args);
}
