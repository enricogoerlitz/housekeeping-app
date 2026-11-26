import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type HostInstance,
  type ScrollViewInstance,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { bottomInset } from './bottom-inset';

import { Button, IconButton } from './controls';
import type { IconName } from './icons';
import { Text } from './primitives';
import { sheetFrame, type SheetSize } from './sheet-size';
import {
  PageScrollContext,
  PageScrollControlContext,
  TAB_BAR_HEIGHT,
  useBottomInset,
} from './shell';
import { ToneContext, useBreakpoint, useTheme } from './theme-context';
import { useKeyboard } from './keyboard';
import { keyboardSheetFrame } from './keyboard-state';
import { handOverKeyboard } from './keyboard-proxy';
import { lockPageScroll } from './page-scroll-lock';
import type { Band } from './scroll-reveal';
import { sheetDragOffset, sheetDragRelease, upwardShadow } from './sheet-drag';
import { useSheetDrag } from './sheet-drag-events';
import { fadeOutCopy } from './sheet-exit';
import {
  FOCUS_SETTLE_MS,
  SheetFocusContext,
  SheetSubmitContext,
  focusQuietly,
} from './sheet-focus';
import { toastBottom, toastEdge, type Box } from './toast-place';
import { useTitleFit } from './use-title-fit';
import { createToastStore } from './toast-state';
import { TopLayer } from './top-layer';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Fixed area between the title and the scrolling middle, e.g. view tabs or a search field. */
  header?: ReactNode;
  /** Fixed area below the scrolling content, e.g. the primary button. */
  footer?: ReactNode;
  /**
   * Fixed size (spec 0005, REQ-003): `s` confirm or pick one of a few, `m` forms, `l` search and
   * pick with tabs. The window keeps its size whatever it shows; only the middle scrolls.
   */
  size: SheetSize;
  /**
   * The window's actions (spec 0032, REQ-003): on phones in the header ("Abbrechen" left, the
   * primary right; without `cancel`, "Abbrechen" closes like ✕), on wider screens at the bottom.
   * `cancel: null` for a window that keeps its changes on closing: no "Abbrechen" then.
   * `footer` then holds only what comes besides them; on phones it ends the content.
   */
  actions?: SheetActions;
  testID?: string;
}

export interface SheetActions {
  primary: SheetAction;
  cancel?: SheetAction | null;
}

export interface SheetAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Why it is greyed out (e.g. offline); screen readers hear it. */
  hint?: string;
  icon?: IconName;
  testID?: string;
}

// Spec 0029, REQ-001: the scrim fades in place, only the sheet travels; 250 ms in, 200 ms out.
const OPEN_MS = 250;
const CLOSE_MS = 200;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// Spec 0033, decision 1: after a drag the window springs back with a little give, or leaves at the
// finger's speed.
const SNAP_BACK = { duration: 300, dampingRatio: 0.8 } as const;
const DRAG_AWAY = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;

/**
 * A bottom sheet on phones and a centred dialog on wider screens. On phones the scrim fades while
 * only the sheet slides up; with reduced motion, and from tablet width on, both only fade. The
 * window stays mounted until it has faded out.
 */
export function Sheet(props: SheetProps) {
  const theme = useTheme();
  const { isPhone, width, height } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const c = theme.colors;
  // With the keyboard open a phone window sits on it and fills the visible area (spec 0032).
  const keyboard = useKeyboard();
  const typing = isPhone && keyboard.open;
  const fixedFrame = sheetFrame(props.size, { width, height });
  const frame = typing
    ? keyboardSheetFrame(fixedFrame, keyboard.visibleHeight, insets.top + TOP_GAP_TYPING)
    : fixedFrame;
  const slide = isPhone && !reduced;
  const headerActions = isPhone && props.actions !== undefined;

  const [mounted, setMounted] = useState(props.visible);
  // Mounted at once on opening; unmounted only once the fade-out has finished.
  if (props.visible && !mounted) setMounted(true);
  const progress = useSharedValue(0);
  // The sheet's own height once measured; until then the screen height keeps it out of sight.
  const travel = useSharedValue(height);
  useEffect(() => {
    if (props.visible) {
      progress.set(
        withTiming(1, { duration: OPEN_MS, easing: EASE_OUT, reduceMotion: ReduceMotion.Never }),
      );
    } else {
      // Opened again while fading out (AC-004): the new animation cancels this one, which then
      // does not unmount.
      progress.set(
        withTiming(
          0,
          { duration: CLOSE_MS, easing: EASE_OUT, reduceMotion: ReduceMotion.Never },
          (finished) => {
            if (finished) scheduleOnRN(setMounted, false);
          },
        ),
      );
    }
  }, [props.visible, progress]);

  // Spec 0033, REQ-001: on phones the window follows a finger dragging it down.
  const drag = useSharedValue(0);
  useEffect(() => {
    if (props.visible) drag.set(0);
  }, [props.visible, drag]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => {
    if (!isPhone) return { opacity: progress.get() };
    const entering = slide ? (1 - progress.get()) * travel.get() : 0;
    return {
      opacity: slide ? 1 : progress.get(),
      transform: [{ translateY: entering + drag.get() }],
    };
  });
  // While fading out the window takes no taps, and a tap on the scrim closes nothing twice.
  const close = props.visible ? props.onClose : undefined;
  // Dragged away it does what "Abbrechen" does (AC-004).
  const dismiss = props.actions?.cancel?.onPress ?? props.onClose;
  const live = useRef({ visible: props.visible, dismiss });
  useLayoutEffect(() => {
    live.current = { visible: props.visible, dismiss };
  });
  const panel = useRef<HostInstance>(null);
  const content = useRef<ScrollViewInstance>(null);
  const snapBack = (velocity = 0) =>
    drag.set(
      withSpring(0, { ...SNAP_BACK, velocity: velocity * 1000, reduceMotion: ReduceMotion.System }),
    );
  // The page may keep the window open (a question first, AC-004): then it comes back.
  const keptOpen = () => {
    if (live.current.visible) snapBack();
  };
  useSheetDrag(
    isPhone && props.visible,
    { panel, content },
    {
      onStart: () => cancelAnimation(drag),
      onMove: (dy) => drag.set(sheetDragOffset(dy)),
      onRelease: (dy, velocity, sheetHeight) => {
        const offset = sheetDragOffset(dy);
        if (sheetDragRelease({ offset, height: sheetHeight, velocity }) === 'stay') {
          snapBack(velocity);
          return;
        }
        drag.set(
          withSpring(
            Math.max(offset, sheetHeight),
            { ...DRAG_AWAY, velocity: velocity * 1000, reduceMotion: ReduceMotion.System },
            (finished) => {
              if (finished) scheduleOnRN(keptOpen);
            },
          ),
        );
        live.current.dismiss();
      },
    },
  );

  // Spec 0033, REQ-004: the page behind stays where it is while the window is there.
  useEffect(() => {
    if (!mounted || !isPhone) return;
    const release = lockPageScroll();
    // Focus returning to the page as the window goes (in the same commit) would scroll it; the
    // release comes after it and puts the page back.
    return () => {
      queueMicrotask(release);
    };
  }, [mounted, isPhone]);

  // Spec 0036, REQ-014: Enter in a one-line field presses the primary button, unless greyed out.
  const primary = props.actions?.primary;
  const submit = props.visible && primary && !primary.disabled ? primary.onPress : undefined;

  // Spec 0033, REQ-006: the field that asks for it gets the cursor once the window is in.
  const focusTarget = useRef<unknown>(null);
  const claimFocus = useCallback((input: unknown) => {
    focusTarget.current ??= input;
    // Opened by a tap that opened the keyboard (iPhone, decision 10): the field takes it now,
    // before react-native-web's modal moves the focus into the window and the keyboard closes.
    if (focusTarget.current === input) handOverKeyboard(input);
    return () => {
      if (focusTarget.current === input) focusTarget.current = null;
    };
  }, []);
  useEffect(() => {
    if (!props.visible) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let reclaim: ((event: FocusEvent) => void) | undefined;
    // A field of its own (a search field with autoFocus) took the focus as the window mounted.
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const box = panel.current as unknown;
    const mountedFocus =
      active instanceof HTMLElement &&
      /^(INPUT|TEXTAREA)$/.test(active.tagName) &&
      box instanceof Node &&
      box.contains(active)
        ? active
        : null;
    const opened = setTimeout(() => {
      const input = focusTarget.current ?? mountedFocus;
      if (!input) return;
      focusQuietly(input);
      if (typeof document === 'undefined') return;
      // A menu closing behind the window hands the focus back to its button for a moment.
      reclaim = (event) => {
        const box = panel.current as unknown;
        if (box instanceof Node && event.target instanceof Node && box.contains(event.target))
          return;
        focusQuietly(input);
      };
      document.addEventListener('focusin', reclaim, true);
      settle = setTimeout(() => {
        if (reclaim) document.removeEventListener('focusin', reclaim, true);
        reclaim = undefined;
      }, FOCUS_SETTLE_MS);
    }, OPEN_MS);
    return () => {
      clearTimeout(opened);
      clearTimeout(settle);
      if (reclaim) document.removeEventListener('focusin', reclaim, true);
    };
  }, [props.visible]);

  // Removed by its page while open: a copy fades out in its place (spec 0029, REQ-001).
  const layer = useRef<HostInstance>(null);
  const open = useRef({ shown: false, slide });
  useLayoutEffect(() => {
    open.current = { shown: props.visible && mounted, slide };
  });
  useLayoutEffect(
    () => () => {
      if (open.current.shown) {
        fadeOutCopy(layer.current, { slide: open.current.slide, ms: CLOSE_MS });
      }
    },
    [],
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={() => close?.()}
      statusBarTranslucent
    >
      <ToneContext.Provider value={undefined}>
        <PageScrollContext.Provider value={undefined}>
          <SheetFocusContext.Provider value={claimFocus}>
            <SheetSubmitContext.Provider value={submit}>
              <View
                ref={layer}
                testID={props.testID ? `${props.testID}-layer` : undefined}
                style={{
                  flex: 1,
                  justifyContent: isPhone ? 'flex-end' : 'center',
                  alignItems: isPhone ? 'stretch' : 'center',
                  // Clear of the status bar, the notch and, in landscape, the rounded corners (REQ-008).
                  paddingTop: insets.top,
                  paddingLeft: insets.left,
                  paddingRight: insets.right,
                  // The layer keeps the full height on iOS; the window stands on the keyboard.
                  paddingBottom: typing ? keyboard.inset : 0,
                }}
              >
                <Animated.View
                  {...SCRIM_PART}
                  style={[
                    { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
                    scrimStyle,
                  ]}
                >
                  <Pressable
                    accessibilityLabel="Schließen"
                    accessibilityRole="button"
                    onPress={close}
                    testID={props.testID ? `${props.testID}-scrim` : undefined}
                    // Spec 0033, REQ-002: on phones the page behind stays as it is.
                    style={[
                      { flex: 1, backgroundColor: isPhone ? 'transparent' : c.scrim },
                      NO_PAN,
                    ]}
                  />
                </Animated.View>
                <Animated.View
                  {...PANEL_PART}
                  ref={panel}
                  testID={props.testID}
                  accessibilityViewIsModal
                  pointerEvents={props.visible ? 'auto' : 'none'}
                  onLayout={(event) => travel.set(event.nativeEvent.layout.height)}
                  style={[
                    {
                      backgroundColor: c.bg,
                      borderTopLeftRadius: theme.shape.radius.sheet,
                      borderTopRightRadius: theme.shape.radius.sheet,
                      borderBottomLeftRadius: isPhone ? 0 : theme.shape.radius.sheet,
                      borderBottomRightRadius: isPhone ? 0 : theme.shape.radius.sheet,
                      maxHeight: frame.maxHeight,
                      height: frame.height,
                      width: frame.width,
                      maxWidth: '100%',
                      // Above the home bar with its gap (spec 0029, AC-007); on the keyboard none.
                      paddingBottom: typing ? 0 : isPhone ? bottomInset(insets.bottom, 12) : 0,
                    },
                    // Without the scrim the window stands out by its edge and shadow (decision 2).
                    isPhone
                      ? {
                          borderTopWidth: 1,
                          borderTopColor: c.border,
                          boxShadow: upwardShadow(c.shadowRaised),
                        }
                      : null,
                    sheetStyle,
                  ]}
                >
                  <View {...SHEET_HEAD} style={isPhone ? NO_PAN : null}>
                    {isPhone ? (
                      <View
                        testID={props.testID ? `${props.testID}-grabber` : undefined}
                        aria-hidden
                        style={{ alignItems: 'center', paddingTop: 6 }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: c.border,
                          }}
                        />
                      </View>
                    ) : null}
                    {headerActions && props.actions ? (
                      <SheetActionsHeader
                        title={props.title}
                        actions={props.actions}
                        onClose={props.onClose}
                        testID={props.testID}
                      />
                    ) : (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingLeft: 20,
                          paddingRight: 10,
                          paddingTop: 14,
                          paddingBottom: 6,
                        }}
                      >
                        <Text
                          variant="heading"
                          heading
                          style={{ flex: 1 }}
                          testID={props.testID ? `${props.testID}-title` : undefined}
                        >
                          {props.title}
                        </Text>
                        <IconButton
                          icon="x"
                          label="Schließen"
                          onPress={props.onClose}
                          testID={props.testID ? `${props.testID}-close` : undefined}
                        />
                      </View>
                    )}
                  </View>
                  {props.header ? (
                    <View style={{ paddingHorizontal: 20 }}>{props.header}</View>
                  ) : null}
                  <ScrollView
                    ref={content}
                    testID={props.testID ? `${props.testID}-content` : undefined}
                    keyboardShouldPersistTaps="handled"
                    // Scrolled to the end, a drag does not move the page behind (AC-027).
                    style={[frame.height ? { flex: 1 } : null, OVERSCROLL_CONTAIN]}
                    contentContainerStyle={{
                      paddingHorizontal: 20,
                      paddingBottom: 20,
                      paddingTop: 6,
                    }}
                  >
                    {/* A drag inside the sheet must not switch the page below. */}
                    <PageScrollControlContext.Provider value={undefined}>
                      {props.children}
                    </PageScrollControlContext.Provider>
                    {headerActions && props.footer ? (
                      <View style={{ marginTop: 20 }}>{props.footer}</View>
                    ) : null}
                  </ScrollView>
                  {!headerActions && (props.footer || props.actions) ? (
                    <View
                      testID={props.testID ? `${props.testID}-footer` : undefined}
                      style={{
                        paddingHorizontal: 20,
                        paddingTop: 10,
                        paddingBottom: isPhone ? 4 : 18,
                        borderTopWidth: 1,
                        borderTopColor: c.border,
                        gap: 10,
                      }}
                    >
                      {props.footer}
                      {props.actions ? <SheetActionsFooter actions={props.actions} /> : null}
                    </View>
                  ) : null}
                </Animated.View>
              </View>
            </SheetSubmitContext.Provider>
          </SheetFocusContext.Provider>
        </PageScrollContext.Provider>
      </ToneContext.Provider>
    </Modal>
  );
}

/** Room above a phone window while the keyboard is open (spec 0032, AC-004). */
const TOP_GAP_TYPING = 12;

const HEADER_PADDING = 12;
const HEADER_GAP = 8;

/**
 * A phone window's header with its actions: "Abbrechen" · title · primary (spec 0032). When the
 * actions leave the title too little room ("Am Do 26.11. Vormittag einplanen"), the title goes
 * on its own line below them instead of shrinking to "Einplan…" (review 0003).
 */
function SheetActionsHeader(props: {
  title: string;
  actions: SheetActions;
  onClose: () => void;
  testID?: string;
}) {
  const id = (suffix: string) => (props.testID ? `${props.testID}-${suffix}` : undefined);
  const {
    ownLine: titleBelow,
    onRow,
    titleRef,
    onTitle,
    onAction,
  } = useTitleFit({ padding: 2 * HEADER_PADDING, gap: HEADER_GAP, actions: 2 });
  const cancel =
    props.actions.cancel === null
      ? null
      : (props.actions.cancel ?? {
          label: 'Abbrechen',
          onPress: props.onClose,
          testID: id('close'),
        });
  const title = (
    // Keyed by the text: a new title is measured anew, even where its box keeps its size.
    <View key={`title-${props.title}`} style={{ flex: 1, minWidth: 0 }} onLayout={onTitle}>
      <Text
        ref={titleRef}
        variant="rowTitle"
        heading
        numberOfLines={1}
        style={{ textAlign: 'center' }}
        testID={id('title')}
      >
        {props.title}
      </Text>
    </View>
  );
  return (
    <View testID={id('header')} style={{ paddingTop: 6 }}>
      <View
        onLayout={onRow}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: HEADER_GAP,
          minHeight: 52,
          paddingHorizontal: HEADER_PADDING,
        }}
      >
        <View onLayout={onAction(0)}>
          {cancel ? <HeaderAction action={cancel} /> : <View style={{ width: 8 }} />}
        </View>
        {titleBelow ? <View key="spacer" style={{ flex: 1 }} /> : title}
        <View onLayout={onAction(1)}>
          <HeaderAction action={props.actions.primary} />
        </View>
      </View>
      {titleBelow ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 4 }}>
          {title}
        </View>
      ) : null}
    </View>
  );
}

function HeaderAction(props: { action: SheetAction }) {
  const { action } = props;
  // A Button aligns itself to the start; the wrapper centres it on the title's line.
  return (
    <View>
      <Button
        label={action.label}
        variant="link"
        size="sm"
        disabled={action.disabled}
        hint={action.hint}
        onPress={action.onPress}
        testID={action.testID}
      />
    </View>
  );
}

/** The actions at the bottom of a window on wider screens, as before (spec 0032, AC-009). */
function SheetActionsFooter(props: { actions: SheetActions }) {
  const { primary, cancel } = props.actions;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {cancel ? (
        <View style={{ flex: 1 }}>
          <Button
            label={cancel.label}
            variant="secondary"
            full
            disabled={cancel.disabled}
            hint={cancel.hint}
            onPress={cancel.onPress}
            testID={cancel.testID}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Button
          label={primary.label}
          icon={primary.icon}
          full
          disabled={primary.disabled}
          hint={primary.hint}
          onPress={primary.onPress}
          testID={primary.testID}
        />
      </View>
    </View>
  );
}

// The parts the copy of a dropped window animates (sheet-exit.web.ts).
const SCRIM_PART = { dataSet: { sheetPart: 'scrim' } } as object;
const PANEL_PART = { dataSet: { sheetPart: 'panel' } } as object;

// The window's head, where a drag takes the whole window (sheet-drag-events.web.ts).
const SHEET_HEAD = { dataSet: { sheetHead: 'true' } } as object;
/** On the web: a swipe here moves nothing of the browser's own (spec 0033, AC-013). */
const NO_PAN = (Platform.OS === 'web' ? { touchAction: 'none' } : null) as ViewStyle | null;

/** On the web: a scrolling panel keeps its scroll to itself (spec 0019, REQ-009). */
const OVERSCROLL_CONTAIN = { overscrollBehavior: 'contain' } as object;

// ---------- Toast with "Rückgängig" ----------

const store = createToastStore();

// Buttons of the page the toast must not cover, e.g. "Einplanen" (spec 0033, REQ-009).
// Where they stood as the toast appeared: a store, so React (and its compiler) sees the change.
const avoided = new Set<RefObject<unknown>>();
interface Obstacles {
  avoid: Band[];
  /** Everything to press on screen (decision 12): the toast goes to the top rather than on it. */
  pressable: Box[];
}
let obstacles: Obstacles = { avoid: [], pressable: [] };
const obstacleListeners = new Set<() => void>();
function setObstacles(next: Obstacles) {
  if (JSON.stringify(next) === JSON.stringify(obstacles)) return;
  obstacles = next;
  for (const listener of obstacleListeners) listener();
}
function subscribeObstacles(listener: () => void): () => void {
  obstacleListeners.add(listener);
  return () => obstacleListeners.delete(listener);
}
const obstaclesSnapshot = () => obstacles;

/** Shows one short message at the bottom of the screen; a new toast replaces the previous one. */
export const toast = {
  show: (options: Parameters<typeof store.show>[0]) => {
    // Where the page's buttons stand as it appears; it keeps its place while shown (AC-025).
    setObstacles(measureObstacles());
    store.show(options);
  },
  /** Ends the toast without its action; its `onExpire` runs. */
  hide: store.hide,
};

// A page without the tab bar (store mode, cooking mode) names the height of its own bottom bar,
// so the toast stands above it (spec 0019, AC-024).
let clearance: number | undefined;
const clearanceListeners = new Set<() => void>();
function setClearance(next: number | undefined) {
  clearance = next;
  for (const listener of clearanceListeners) listener();
}
function subscribeClearance(listener: () => void): () => void {
  clearanceListeners.add(listener);
  return () => clearanceListeners.delete(listener);
}
const clearanceSnapshot = () => clearance;

/**
 * Keeps the toast above this page's own bottom bar of `height` points (above the home bar) while
 * the page is shown; undefined gives the default (above the tab bar on phones).
 */
export function useToastClearance(height: number | undefined): void {
  useEffect(() => {
    if (height === undefined) return;
    setClearance(height);
    return () => setClearance(undefined);
  }, [height]);
}

/** Keeps the toast off this view (in window coordinates when the toast appears) while mounted. */
export function useToastAvoid(ref: RefObject<unknown>): void {
  useEffect(() => {
    avoided.add(ref);
    return () => {
      avoided.delete(ref);
    };
  }, [ref]);
}

function avoidedBands(): Band[] {
  const bands: Band[] = [];
  for (const ref of avoided) {
    const node = ref.current;
    if (typeof HTMLElement === 'undefined' || !(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.height > 0) bands.push({ top: rect.top, bottom: rect.bottom });
  }
  return bands;
}

const PRESSABLE =
  'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="tab"], ' +
  '[role="switch"], [role="checkbox"], [role="radio"], [role="slider"]';

/** What can be pressed on screen now, outside the toast and outside inert pages (web only). */
function pressableBoxes(): Box[] {
  if (typeof document === 'undefined' || typeof window === 'undefined') return [];
  const boxes: Box[] = [];
  for (const node of document.querySelectorAll(PRESSABLE)) {
    if (node.closest('[inert], [data-testid="toast"]')) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
    boxes.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  }
  return boxes;
}

function measureObstacles(): Obstacles {
  return { avoid: avoidedBands(), pressable: pressableBoxes() };
}

/** Mount once near the root: above the tab bar and the home bar on phones (AC-024). */
const WEB_TOAST_LAYER = { position: 'fixed', zIndex: 10000 } as unknown as ViewStyle;
const TOAST_MIN_HEIGHT = 48;

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomEdge = useBottomInset();
  const { isPhone, width, height } = useBreakpoint();
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const bar = useSyncExternalStore(subscribeClearance, clearanceSnapshot, clearanceSnapshot);
  const keyboard = useKeyboard();
  // Until measured, the widest the toast can be.
  const [toastWidth, setToastWidth] = useState<number>();
  // The page may still change as the toast appears (a "wird gespeichert" line goes): once it has
  // drawn, the buttons are measured again.
  const measured = useSyncExternalStore(subscribeObstacles, obstaclesSnapshot, obstaclesSnapshot);
  const shownId = state?.id;
  useEffect(() => {
    if (shownId === undefined || typeof requestAnimationFrame === 'undefined') return;
    const frame = requestAnimationFrame(() => setObstacles(measureObstacles()));
    return () => cancelAnimationFrame(frame);
  }, [shownId]);
  if (!state) return null;
  const c = theme.colors;
  const below = bar ?? (isPhone ? TAB_BAR_HEIGHT : 0);
  // On the keyboard, which hides the tab bar (spec 0032, REQ-002); else above the bottom bar and
  // the page's buttons, or at the top when that would cover something to press (decision 12).
  const place = keyboard.open
    ? { bottom: keyboard.inset + 12 }
    : toastEdge({
        windowWidth: width,
        windowHeight: height,
        toastWidth: toastWidth ?? Math.min(440, width - insets.left - insets.right - 32),
        toastHeight: TOAST_MIN_HEIGHT,
        bottom: toastBottom({
          bottom: bottomEdge + below + (isPhone ? 12 : 24),
          windowHeight: height,
          toastHeight: TOAST_MIN_HEIGHT,
          gap: 12,
          obstacles: measured.avoid,
        }),
        top: insets.top + (isPhone ? 8 : 24),
        pressable: measured.pressable,
      });
  return (
    <TopLayer>
      <View
        pointerEvents="box-none"
        style={{
          // Above react-native-web's Modal layers (z-index 9999) beside it in the body.
          ...(Platform.OS === 'web' ? WEB_TOAST_LAYER : { position: 'absolute' }),
          left: insets.left,
          right: insets.right,
          ...place,
          alignItems: 'center',
          paddingHorizontal: 16,
        }}
      >
        <ToneContext.Provider value={{ fg: c.bg }}>
          <View
            testID="toast"
            accessibilityRole="alert"
            onLayout={(event) => setToastWidth(event.nativeEvent.layout.width)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: TOAST_MIN_HEIGHT,
              maxWidth: 440,
              paddingLeft: 16,
              paddingRight: state.actionLabel ? 6 : 16,
              paddingVertical: 6,
              borderRadius: theme.shape.radius.control + 2,
              // Inverted surface: stands out on every theme without a new colour.
              backgroundColor: c.text,
            }}
          >
            <Text variant="small" style={{ flexShrink: 1 }} testID="toast-message">
              {state.message}
            </Text>
            {state.actionLabel ? (
              <Button
                label={state.actionLabel}
                variant="link"
                size="sm"
                testID="toast-action"
                onPress={() => store.act(state.id)}
              />
            ) : null}
          </View>
        </ToneContext.Provider>
      </View>
    </TopLayer>
  );
}
