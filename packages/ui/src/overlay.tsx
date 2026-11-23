import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type HostInstance,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
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
import { fadeOutCopy } from './sheet-exit';
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

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() =>
    slide
      ? { transform: [{ translateY: (1 - progress.get()) * travel.get() }] }
      : { opacity: progress.get() },
  );
  // While fading out the window takes no taps, and a tap on the scrim closes nothing twice.
  const close = props.visible ? props.onClose : undefined;

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
              style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, scrimStyle]}
            >
              <Pressable
                accessibilityLabel="Schließen"
                accessibilityRole="button"
                onPress={close}
                testID={props.testID ? `${props.testID}-scrim` : undefined}
                style={{ flex: 1, backgroundColor: c.scrim }}
              />
            </Animated.View>
            <Animated.View
              {...PANEL_PART}
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
                sheetStyle,
              ]}
            >
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
              {props.header ? <View style={{ paddingHorizontal: 20 }}>{props.header}</View> : null}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                // Scrolled to the end, a drag does not move the page behind (AC-027).
                style={[frame.height ? { flex: 1 } : null, OVERSCROLL_CONTAIN]}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 6 }}
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
        </PageScrollContext.Provider>
      </ToneContext.Provider>
    </Modal>
  );
}

/** Room above a phone window while the keyboard is open (spec 0032, AC-004). */
const TOP_GAP_TYPING = 12;

/** A phone window's header with its actions: "Abbrechen" · title · primary (spec 0032). */
function SheetActionsHeader(props: {
  title: string;
  actions: SheetActions;
  onClose: () => void;
  testID?: string;
}) {
  const id = (suffix: string) => (props.testID ? `${props.testID}-${suffix}` : undefined);
  const cancel =
    props.actions.cancel === null
      ? null
      : (props.actions.cancel ?? {
          label: 'Abbrechen',
          onPress: props.onClose,
          testID: id('close'),
        });
  return (
    <View
      testID={id('header')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 52,
        paddingHorizontal: 12,
        paddingTop: 6,
      }}
    >
      {cancel ? <HeaderAction action={cancel} /> : <View style={{ width: 8 }} />}
      <Text
        variant="rowTitle"
        heading
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'center' }}
        testID={id('title')}
      >
        {props.title}
      </Text>
      <HeaderAction action={props.actions.primary} />
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

/** On the web: a scrolling panel keeps its scroll to itself (spec 0019, REQ-009). */
const OVERSCROLL_CONTAIN = { overscrollBehavior: 'contain' } as object;

// ---------- Toast with "Rückgängig" ----------

const store = createToastStore();

/** Shows one short message at the bottom of the screen; a new toast replaces the previous one. */
export const toast = {
  show: store.show,
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

/** Mount once near the root: above the tab bar and the home bar on phones (AC-024). */
const WEB_TOAST_LAYER = { position: 'fixed', zIndex: 10000 } as unknown as ViewStyle;

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomEdge = useBottomInset();
  const { isPhone } = useBreakpoint();
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const bar = useSyncExternalStore(subscribeClearance, clearanceSnapshot, clearanceSnapshot);
  const keyboard = useKeyboard();
  if (!state) return null;
  const c = theme.colors;
  const below = bar ?? (isPhone ? TAB_BAR_HEIGHT : 0);
  // On the keyboard, which hides the tab bar (spec 0032, REQ-002).
  const bottom = keyboard.open ? keyboard.inset + 12 : bottomEdge + below + (isPhone ? 12 : 24);
  return (
    <TopLayer>
      <View
        pointerEvents="box-none"
        style={{
          // Above react-native-web's Modal layers (z-index 9999) beside it in the body.
          ...(Platform.OS === 'web' ? WEB_TOAST_LAYER : { position: 'absolute' }),
          left: insets.left,
          right: insets.right,
          bottom,
          alignItems: 'center',
          paddingHorizontal: 16,
        }}
      >
        <ToneContext.Provider value={{ fg: c.bg }}>
          <View
            testID="toast"
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: 48,
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
