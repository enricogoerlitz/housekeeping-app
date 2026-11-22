import {
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  ScrollView,
  View,
  type AccessibilityActionEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton, keyboardFocusRing, keyboardFocus } from './controls';
import {
  dragHeight,
  isTap,
  panelHeights,
  panelPlacement,
  sidePanelWidth,
  snapHeight,
  snapPanel,
  stepPanel,
  tapPanel,
  type DockedPanelState,
  type PanelHeights,
  type PanelSnap,
} from './docked-panel-state';
import { AsideInsetContext } from './shell';
import { useBreakpoint, useTheme } from './theme-context';

export type { DockedPanelState };

export interface DockedPanelProps {
  open: boolean;
  /** ✕, Escape on the web, Android back, and on phones a drag down. Set `open` to false. */
  onClose: () => void;
  /** The line beside ✕; on phones it is all that stays visible while collapsed (e.g. the date). */
  header?: ReactNode;
  /** Scrolls inside the panel. */
  children?: ReactNode;
  /** Accessible name of the region, e.g. "Tages-Fenster". */
  label: string;
  /** Accessible name of ✕, e.g. "Schließen". */
  closeLabel: string;
  /** Accessible name of the phone drag handle, e.g. "Größe ändern". */
  handleLabel: string;
  /**
   * Phone size. Leave it out and the panel keeps its own, opening at half height; set it to
   * `collapsed` while the feature runs a drag out of the panel.
   */
  state?: DockedPanelState;
  /** The user changed the phone size with the handle. */
  onStateChange?: (state: DockedPanelState) => void;
  /** Gets the focus back when the panel closes, e.g. the day that opened it (spec 0016, AC-024). */
  returnFocusRef?: RefObject<{ focus: () => void } | null>;
  /** The panel; ✕ is `${testID}-close`, the phone handle `${testID}-handle`. */
  testID?: string;
}

// Keeps the status bar and a strip of the page visible above a full panel.
const TOP_GAP = 8;
// The panel reaches this far below the visible edge, so rubber-banding past full shows no gap.
const BLEED = 40;
const SPRING = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;
const WEB_HANDLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle)
    : null;
// The hidden part of the panel lies below the edge; `clip` (unlike `hidden`) cannot be scrolled
// by the browser, e.g. when focus moves into that part, so the page around never shifts.
const HOST_CLIP: ViewStyle =
  Platform.OS === 'web' ? ({ overflow: 'clip' } as unknown as ViewStyle) : { overflow: 'hidden' };
// The page behind must not scroll on when the panel's content reaches its end.
const WEB_SCROLL: ViewStyle | null =
  Platform.OS === 'web' ? ({ overscrollBehavior: 'contain' } as unknown as ViewStyle) : null;

type KeyEvent = { key: string; preventDefault: () => void };

/**
 * A panel that leaves the page usable (spec 0016, REQ-006): on phones it sits at the bottom of the
 * screen area at half height, grows to full height or shrinks to its header line, and closes when
 * dragged down; from 1100 px it stands beside the content with ✕ (tablets keep it at the bottom,
 * see `panelPlacement`). Put it into `Screen`'s `aside`.
 */
export function DockedPanel(props: DockedPanelProps) {
  const { width } = useBreakpoint();
  const bottom = panelPlacement(width) === 'bottom';
  // On phones the panel stays mounted until its closing slide has ended.
  const [mounted, setMounted] = useState(props.open);
  if (props.open && !mounted) setMounted(true);
  const isOpen = useRef(props.open);
  useLayoutEffect(() => {
    isOpen.current = props.open;
  }, [props.open]);

  const close = useEffectEvent(() => props.onClose());
  const returnFocus = useEffectEvent(() => props.returnFocusRef?.current?.focus());

  useEffect(() => {
    if (!props.open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A window above (Sheet, Popover) closes first; it handles its own Escape.
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open]);

  useEffect(() => {
    if (!props.open || Platform.OS !== 'android') return;
    // Handlers run newest first: a drag started later cancels before this closes (spec 0016).
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [props.open]);

  const wasOpen = useRef(props.open);
  useEffect(() => {
    if (wasOpen.current && !props.open) returnFocus();
    wasOpen.current = props.open;
  }, [props.open]);

  if (!bottom) return props.open ? <SidePanel {...props} /> : null;
  if (!mounted) return null;
  return (
    <PhonePanel
      {...props}
      onClosed={() => {
        if (!isOpen.current) setMounted(false);
      }}
    />
  );
}

function SidePanel(props: DockedPanelProps) {
  const theme = useTheme();
  const { width } = useBreakpoint();
  const c = theme.colors;
  return (
    <View
      testID={props.testID}
      role="region"
      aria-label={props.label}
      style={{
        width: sidePanelWidth(width),
        borderLeftWidth: 1,
        borderLeftColor: c.border,
        backgroundColor: c.bg,
      }}
    >
      <PanelHeader {...props} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={[{ flex: 1 }, WEB_SCROLL]}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24 }}
      >
        {props.children}
      </ScrollView>
    </View>
  );
}

function PanelHeader(props: DockedPanelProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 52,
        paddingLeft: 20,
        paddingRight: 10,
        paddingTop: 4,
      }}
    >
      <View style={{ flex: 1 }}>{props.header}</View>
      <IconButton
        icon="x"
        label={props.closeLabel}
        onPress={props.onClose}
        testID={props.testID ? `${props.testID}-close` : undefined}
      />
    </View>
  );
}

type PhonePanelProps = DockedPanelProps & { onClosed: () => void };

/** The latest render, read by the gesture handlers that are created once. */
interface Live {
  state: DockedPanelState;
  heights: PanelHeights;
  props: PhonePanelProps;
  finishClose: () => void;
}

function PhonePanel(props: PhonePanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const [own, setOwn] = useState<DockedPanelState>('half');
  const state = props.state ?? own;
  const [container, setContainer] = useState(0);
  const [line, setLine] = useState(0);
  const [handleFocused, setHandleFocused] = useState(false);
  const ready = container > 0 && line > 0;
  const heights = useMemo(
    () => panelHeights({ container, topGap: insets.top + TOP_GAP, collapsed: line }),
    [container, line, insets.top],
  );
  // What the panel moves to; the content gets room below, so its end can scroll into view.
  const [target, setTarget] = useState<PanelSnap>('closed');

  const visible = useSharedValue(0);
  const full = useSharedValue(0);
  useEffect(() => {
    full.set(heights.full);
  }, [heights.full, full]);

  const animatedFor = useRef<{ snap: PanelSnap; heights: PanelHeights } | undefined>(undefined);
  const closing = useRef(false);
  const dragging = useRef(false);

  const finishClose = () => {
    const current = live.current;
    if (current.props.open) {
      // The page kept it open: back to the size it had.
      closing.current = false;
      animateTo(current.state);
      return;
    }
    current.props.onClosed();
  };
  const live = useRef<Live>({
    state,
    heights,
    props,
    finishClose,
  });
  useLayoutEffect(() => {
    live.current = { state, heights, props, finishClose };
  });

  /** `velocity` in px/ms of the finger, down = positive, so the release keeps its speed. */
  function animateTo(snap: PanelSnap, velocity = 0) {
    const sizes = live.current.heights;
    animatedFor.current = { snap, heights: sizes };
    setTarget(snap);
    const done = snap === 'closed' ? () => live.current.finishClose() : undefined;
    visible.set(
      withSpring(
        snapHeight(snap, sizes),
        { ...SPRING, velocity: -velocity * 1000, reduceMotion: ReduceMotion.System },
        (finished) => {
          if (finished && done) scheduleOnRN(done);
        },
      ),
    );
  }

  const settle = useEffectEvent(() => {
    if (!props.open) {
      if (!closing.current) {
        closing.current = true;
        animateTo('closed');
      }
      return;
    }
    closing.current = false;
    if (dragging.current) return;
    const last = animatedFor.current;
    if (last && last.snap === state && last.heights === heights) return;
    animateTo(state);
  });
  useEffect(() => {
    if (ready) settle();
  }, [ready, props.open, state, heights]);

  const change = (snap: PanelSnap, velocity = 0) => {
    const current = live.current;
    if (snap === 'closed') {
      closing.current = true;
      animateTo('closed', velocity);
      current.props.onClose();
      return;
    }
    animateTo(snap, velocity);
    if (snap === current.state) return;
    setOwn(snap);
    current.props.onStateChange?.(snap);
  };

  const [responder] = useState(() => {
    let start = 0;
    const release = (gesture: PanResponderGestureState) => {
      dragging.current = false;
      const { state: from, heights: sizes } = live.current;
      if (isTap(gesture.dx, gesture.dy)) {
        change(tapPanel(from));
        return;
      }
      change(
        snapPanel({ from, height: visible.get(), velocity: gesture.vy, heights: sizes }),
        gesture.vy,
      );
    };
    return PanResponder.create({
      // Buttons in the header answer first; a vertical move takes over from them. A panel that
      // is already closing cannot be caught any more: the page has closed it.
      onStartShouldSetPanResponder: () => live.current.props.open,
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        live.current.props.open &&
        Math.abs(gesture.dy) > 6 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // Caught mid-slide: it stays where it is and follows the finger from there.
        cancelAnimation(visible);
        start = visible.get();
        dragging.current = true;
      },
      onPanResponderMove: (_event, gesture) => {
        visible.set(dragHeight(start, gesture.dy, full.get()));
      },
      onPanResponderRelease: (_event, gesture) => release(gesture),
      onPanResponderTerminate: (_event, gesture) => release(gesture),
    });
  });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: full.get() - visible.get() }],
  }));

  const onKeyDown = (event: KeyEvent) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      change(stepPanel(state, event.key === 'ArrowUp' ? 'up' : 'down'));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      change(tapPanel(state));
    }
  };
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate') change(tapPanel(state));
    if (name === 'increment') change(stepPanel(state, 'up'));
    if (name === 'decrement') change(stepPanel(state, 'down'));
  };

  // The page behind gets this much room at its end, so its lowest content scrolls above the panel.
  const reportInset = useContext(AsideInsetContext);
  const covered = props.open && ready ? snapHeight(target, heights) : 0;
  useEffect(() => {
    reportInset?.(covered);
  }, [reportInset, covered]);
  useEffect(() => () => reportInset?.(0), [reportInset]);

  const hidden = heights.full - snapHeight(target, heights);
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => setContainer(Math.round(event.nativeEvent.layout.height))}
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, HOST_CLIP]}
    >
      <Animated.View
        testID={props.testID}
        role="region"
        aria-label={props.label}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -BLEED,
            height: heights.full + BLEED,
            opacity: ready ? 1 : 0,
            backgroundColor: c.bg,
            borderTopLeftRadius: theme.shape.radius.sheet,
            borderTopRightRadius: theme.shape.radius.sheet,
            borderTopWidth: 1,
            borderTopColor: c.border,
            boxShadow: '0px -6px 24px rgba(0,0,0,0.14)',
          },
          panelStyle,
        ]}
      >
        <View
          {...responder.panHandlers}
          onLayout={(event) => setLine(Math.round(event.nativeEvent.layout.height))}
          style={WEB_HANDLE}
        >
          <View
            testID={props.testID ? `${props.testID}-handle` : undefined}
            accessibilityRole="button"
            accessibilityLabel={props.handleLabel}
            accessibilityActions={[
              { name: 'activate' },
              { name: 'increment' },
              { name: 'decrement' },
            ]}
            onAccessibilityAction={onAccessibilityAction}
            focusable
            onFocus={(event) => setHandleFocused(keyboardFocus(event))}
            onBlur={() => setHandleFocused(false)}
            {...({ onKeyDown } as object)}
            style={[
              {
                alignSelf: 'center',
                width: 64,
                height: 20,
                alignItems: 'center',
                justifyContent: 'flex-end',
                borderRadius: theme.shape.radius.control,
              },
              keyboardFocusRing(theme, handleFocused),
            ]}
          >
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: c.textMuted }} />
          </View>
          <PanelHeader {...props} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={[{ flex: 1 }, WEB_SCROLL]}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 6,
            paddingBottom: 20 + BLEED + Math.max(0, hidden) + insets.bottom,
          }}
        >
          {props.children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
