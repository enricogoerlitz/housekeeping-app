// react-native-safe-area-context in the component tests: a device without notch, or the insets a
// test sets with `safeArea.insets = { … }`.
export const safeArea = { insets: { top: 0, right: 0, bottom: 0, left: 0 } };

export function useSafeAreaInsets() {
  return safeArea.insets;
}
