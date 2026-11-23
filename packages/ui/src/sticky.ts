import type { ViewStyle } from 'react-native';

// A head that stays at the top of the page's scroll area while the block it belongs to scrolls
// below it, e.g. the day heads of the calendar (spec 0030, REQ-001, Entscheidung 1). CSS
// `position: sticky` keeps it inside its parent: the next block's head pushes it out. Only the web
// knows sticky positioning (the app is a web app, spec 0015 rests); elsewhere the head stays put.
// The background covers what scrolls under it.

/** The style of a sticky head on `platform`, on the colour `background`. */
export function stickyTopStyle(platform: string, background: string): ViewStyle {
  if (platform !== 'web') return {};
  // React Native's types do not name `sticky`; react-native-web passes it on to CSS.
  return {
    position: 'sticky' as ViewStyle['position'],
    top: 0,
    zIndex: 2,
    backgroundColor: background,
  };
}
