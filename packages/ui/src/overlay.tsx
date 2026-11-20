import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from './controls';
import { Text } from './primitives';
import { ToneContext, useBreakpoint, useTheme } from './theme-context';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Fixed area below the scrolling content, e.g. the primary button. */
  footer?: ReactNode;
  /** Wider dialog on tablet and desktop (default 520). */
  width?: number;
  testID?: string;
}

/** A bottom sheet on phones and a centred dialog on wider screens. */
export function Sheet(props: SheetProps) {
  const theme = useTheme();
  const { isPhone, height } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType={isPhone ? 'slide' : 'fade'}
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      <ToneContext.Provider value={undefined}>
        <View
          style={{
            flex: 1,
            justifyContent: isPhone ? 'flex-end' : 'center',
            alignItems: isPhone ? 'stretch' : 'center',
          }}
        >
          <Pressable
            accessibilityLabel="Schließen"
            accessibilityRole="button"
            onPress={props.onClose}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: c.scrim,
            }}
          />
          <View
            testID={props.testID}
            accessibilityViewIsModal
            style={{
              backgroundColor: c.bg,
              borderTopLeftRadius: theme.shape.radius.sheet,
              borderTopRightRadius: theme.shape.radius.sheet,
              borderBottomLeftRadius: isPhone ? 0 : theme.shape.radius.sheet,
              borderBottomRightRadius: isPhone ? 0 : theme.shape.radius.sheet,
              maxHeight: Math.round(height * (isPhone ? 0.9 : 0.84)),
              width: isPhone ? undefined : (props.width ?? 520),
              maxWidth: '100%',
              paddingBottom: isPhone ? Math.max(insets.bottom, 12) : 0,
            }}
          >
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
              <Text variant="heading" heading style={{ flex: 1 }}>
                {props.title}
              </Text>
              <IconButton
                icon="x"
                label="Schließen"
                onPress={props.onClose}
                testID={props.testID ? `${props.testID}-close` : undefined}
              />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 6 }}
            >
              {props.children}
            </ScrollView>
            {props.footer ? (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingTop: 10,
                  paddingBottom: isPhone ? 4 : 18,
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                }}
              >
                {props.footer}
              </View>
            ) : null}
          </View>
        </View>
      </ToneContext.Provider>
    </Modal>
  );
}

// ---------- Toast with "Rückgängig" ----------

export interface ToastOptions {
  message: string;
  /** e.g. "Rückgängig". */
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; default 5000 (the undo window). */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

let current: ToastState | null = null;
let counter = 0;
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}

/** Shows one short message at the bottom of the screen; a new toast replaces the previous one. */
export const toast = {
  show(options: ToastOptions) {
    counter += 1;
    current = { ...options, id: counter };
    emit();
  },
  hide() {
    current = null;
    emit();
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Mount once near the root, above the tab bar. `bottomOffset` keeps it clear of bars. */
export function ToastHost(props: { bottomOffset?: number }) {
  const theme = useTheme();
  const state = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
  useEffect(() => {
    if (!state) return;
    const id = state.id;
    const timer = setTimeout(() => {
      if (current?.id === id) toast.hide();
    }, state.duration ?? 5000);
    return () => clearTimeout(timer);
  }, [state]);
  if (!state) return null;
  const c = theme.colors;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: props.bottomOffset ?? 100,
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
              onPress={() => {
                state.onAction?.();
                toast.hide();
              }}
            />
          ) : null}
        </View>
      </ToneContext.Provider>
    </View>
  );
}
