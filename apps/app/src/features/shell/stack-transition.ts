import { EDGE_SWIPE_START, nextEdgeSwipe, systemSwipeNavigation } from '@housekeeping/ui';
import { CardStyleInterpolators, type StackNavigationOptions } from 'expo-router/js-stack';
import { Easing, Platform } from 'react-native';

// Spec 0034, REQ-003: on phones a page opened in an area's stack slides in from the right and
// "‹ Zurück" slides it out to the right, like the iOS gesture; with reduced motion it only fades.
// When the system's own edge swipe changed the page, iOS has animated already: no second slide
// (AC-007). Nor when a swipe through a list's entries replaces the page (REQ-008): that swipe
// moves the content itself.

type TransitionSpec = NonNullable<StackNavigationOptions['transitionSpec']>['open'];

/** iOS-like push: 300 ms on the sheet curve (spec 0034, AC-006). */
const SLIDE: TransitionSpec = {
  animation: 'timing',
  config: { duration: 300, easing: Easing.bezier(0.32, 0.72, 0, 1) },
};
const FADE: TransitionSpec = {
  animation: 'timing',
  config: { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) },
};
const INSTANT: TransitionSpec = { animation: 'timing', config: { duration: 0 } };

let edgeSwipe = EDGE_SWIPE_START;
let skipUntil = 0;
const SKIP_MS = 600;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const options = { capture: true, passive: true };
  window.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      edgeSwipe = nextEdgeSwipe(edgeSwipe, {
        type: 'touchstart',
        x: touch.clientX,
        width: window.innerWidth,
      });
    },
    options,
  );
  window.addEventListener(
    'touchmove',
    (event) => {
      const touch = event.touches[0];
      if (touch) edgeSwipe = nextEdgeSwipe(edgeSwipe, { type: 'touchmove', x: touch.clientX });
    },
    options,
  );
  window.addEventListener(
    'touchcancel',
    () => {
      edgeSwipe = nextEdgeSwipe(edgeSwipe, { type: 'touchcancel' });
    },
    options,
  );
  window.addEventListener(
    'popstate',
    () => {
      edgeSwipe = nextEdgeSwipe(edgeSwipe, { type: 'popstate' });
    },
    true,
  );
}

/** The next page change within a moment does not slide: the caller animates it itself. */
export function skipStackTransition(): void {
  skipUntil = Date.now() + SKIP_MS;
}

function instant(): boolean {
  return systemSwipeNavigation(edgeSwipe) || Date.now() < skipUntil;
}

/** A spec decided when the stack starts animating, not when the page was rendered. */
function decidedLate(spec: TransitionSpec): TransitionSpec {
  return {
    get animation() {
      return instant() ? INSTANT.animation : spec.animation;
    },
    get config() {
      return instant() ? INSTANT.config : spec.config;
    },
  } as TransitionSpec;
}

/** The options of a phone's area stack on the web. */
export function phoneStackOptions(reducedMotion: boolean): StackNavigationOptions {
  const spec = decidedLate(reducedMotion ? FADE : SLIDE);
  return {
    headerShown: false,
    // The JS stack does not animate on the web unless asked to.
    animation: 'default',
    // The system's edge swipe goes back; a second gesture of our own would fight it.
    gestureEnabled: false,
    cardStyleInterpolator: reducedMotion
      ? CardStyleInterpolators.forFadeFromCenter
      : CardStyleInterpolators.forHorizontalIOS,
    transitionSpec: { open: spec, close: spec },
  };
}
