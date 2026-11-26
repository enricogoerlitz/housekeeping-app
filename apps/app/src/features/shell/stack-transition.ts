import { EDGE_SWIPE_START, nextEdgeSwipe, systemSwipeNavigation } from '@housekeeping/ui';
import { CardStyleInterpolators, type StackNavigationOptions } from 'expo-router/js-stack';
import { SceneStyleInterpolators, type BottomTabNavigationOptions } from 'expo-router/tabs';
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

type TabOptions = Pick<BottomTabNavigationOptions, 'sceneStyleInterpolator' | 'transitionSpec'>;
type TabInterpolator = NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>;

/**
 * A page outside the tab bar ("Verwalten", its pages, the settings) is a tab of its own, not a
 * page in a stack: it slides by its place in the tab order, in from the right going forward, out
 * to the right going back (spec 0034, REQ-003).
 */
const forPage: TabInterpolator = ({ current }) => ({
  sceneStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: ['-100%', '0%', '100%'],
        }),
      },
    ],
  },
});
/** A tab of the tab bar stays still: it is shown at once, and a page slides in over it. */
const forStill: TabInterpolator = () => ({ sceneStyle: {} });

/** The options of a tab on a phone on the web: `page` for one outside the tab bar. */
export function phoneTabOptions(reducedMotion: boolean, page: boolean): TabOptions {
  const spec = decidedLate(reducedMotion ? FADE : SLIDE);
  return {
    transitionSpec: spec as TabOptions['transitionSpec'],
    sceneStyleInterpolator: !page
      ? forStill
      : reducedMotion
        ? SceneStyleInterpolators.forFade
        : forPage,
  };
}

/** The options of a phone's area stack on the web. */
export function phoneStackOptions(reducedMotion: boolean): StackNavigationOptions {
  const spec = decidedLate(reducedMotion ? FADE : SLIDE);
  return {
    headerShown: false,
    // There is no header; 'float' only keeps the card a bounded box. With 'screen' a stack that
    // fills the whole window ("Einkaufen", "Kochen": no tab bar) lets its card grow with the page
    // (`minHeight: 100%`, meant for a scrolling document), but the app's body never scrolls, so
    // the page's own ScrollView had no height limit and nothing scrolled (iPhone, 26.11.).
    headerMode: 'float',
    // Spec 0034, REQ-002 (H-07): the page below stays laid out under the open one. Hidden with
    // `display: none` it lost its scroll place for two frames on coming back; after iOS's own
    // edge swipe (no slide of ours to cover it) that showed as a flash of the list's top.
    detachPreviousScreen: false,
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
