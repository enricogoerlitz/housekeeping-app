import { Image, type ImageSource } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, PanResponder, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './controls';
import { PhotoCollage } from './display';
import { closesViewer, viewerDrag } from './photo-viewer-gesture';
import { useTheme } from './theme-context';

export interface PhotoViewerProps {
  /** The photos; one fills the screen, several show as their collage. */
  sources: readonly (ImageSource | number)[];
  /** Describes the photo. */
  alt?: string;
  /** Accessible name of ✕, e.g. "Schließen". */
  closeLabel: string;
  onClose: () => void;
  /** Parts get `${testID}-close`. */
  testID?: string;
}

const SPRING_BACK = { damping: 22, stiffness: 260 };

function isVertical(gesture: { dx: number; dy: number }): boolean {
  return Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
}
const LEAVE_MS = 160;

/**
 * A photo on the whole screen (spec 0036, REQ-009): ✕, Escape (onRequestClose) or a swipe down
 * close it; the photo follows the finger and springs back when the swipe was too short.
 */
export function PhotoViewer(props: PhotoViewerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(0);
  const height = useSharedValue(0);
  const [leaving, setLeaving] = useState(false);
  // The handlers only move the photo and say when it leaves; the effect below closes.
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) => isVertical(gesture),
      onMoveShouldSetPanResponder: (_event, gesture) => isVertical(gesture),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) => offset.set(viewerDrag(gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        if (closesViewer(gesture, height.get())) setLeaving(true);
        else offset.set(withSpring(0, SPRING_BACK));
      },
      onPanResponderTerminate: () => offset.set(withSpring(0, SPRING_BACK)),
    }),
  );
  const { onClose } = props;
  useEffect(() => {
    if (!leaving) return;
    offset.set(withTiming(height.get(), { duration: LEAVE_MS }));
    const timer = setTimeout(onClose, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, offset, height, onClose]);
  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
    opacity: 1 - Math.min(0.6, Math.max(0, offset.get()) / (height.get() || 1)),
  }));
  const [only] = props.sources;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View
        testID={props.testID}
        accessibilityViewIsModal
        onLayout={(event) => height.set(event.nativeEvent.layout.height)}
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
      >
        <Animated.View
          {...responder.panHandlers}
          style={[
            {
              flex: 1,
              justifyContent: 'center',
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
            photoStyle,
          ]}
        >
          {/* The picture never takes the drag itself (on the web an image would be dragged). */}
          <View pointerEvents="none" style={{ flex: 1, justifyContent: 'center' }}>
            {props.sources.length > 1 ? (
              <PhotoCollage
                sources={props.sources}
                aspectRatio={4 / 3}
                radius={0}
                alt={props.alt}
              />
            ) : only !== undefined ? (
              <Image
                source={only}
                contentFit="contain"
                accessibilityLabel={props.alt}
                accessible={!!props.alt}
                style={{ width: '100%', height: '100%' }}
              />
            ) : null}
          </View>
        </Animated.View>
        <View style={{ position: 'absolute', top: insets.top + 8, right: insets.right + 8 }}>
          <IconButton
            icon="x"
            label={props.closeLabel}
            variant="soft"
            size={44}
            onPress={onClose}
            testID={props.testID ? `${props.testID}-close` : undefined}
          />
        </View>
      </View>
    </Modal>
  );
}
