import { Image, type ImageSource } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
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
import { MediaGallery } from './media-gallery';
import { closesViewer, viewerDrag } from './photo-viewer-gesture';
import { ThemeProvider, useTheme } from './theme-context';
import { getTheme } from './themes';

export interface PhotoViewerProps {
  /** The photos; one fills the screen, several show as their collage. */
  sources: readonly (ImageSource | number)[];
  /** Describes the photo. */
  alt?: string;
  /** Accessible name of ✕, e.g. "Schließen". */
  closeLabel: string;
  onClose: () => void;
  /**
   * Pages to swipe through instead of `sources` (spec 0056, REQ-003): a recipe's photo and its
   * videos, in the order of its gallery. The photo page is a `ViewerPhoto`.
   */
  pages?: {
    content: readonly ReactNode[];
    /** The page it opens on. */
    initialIndex?: number;
    /** Accessible names from the feature: the arrows and "2 von 3". */
    labels: { previous: string; next: string; position: (page: number, count: number) => string };
    onIndexChange?: (index: number) => void;
  };
  /** Parts get `${testID}-close`, the pages `${testID}-pages`. */
  testID?: string;
}

/** A photo (several: their collage) filling the viewer; never takes the drag itself. */
export function ViewerPhoto(props: { sources: readonly (ImageSource | number)[]; alt?: string }) {
  const [only] = props.sources;
  return (
    // On the web an image would be dragged instead of the viewer.
    <View pointerEvents="none" style={{ flex: 1, justifyContent: 'center' }}>
      {props.sources.length > 1 ? (
        <PhotoCollage sources={props.sources} aspectRatio={4 / 3} radius={0} alt={props.alt} />
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
  );
}

const SPRING_BACK = { damping: 22, stiffness: 260 };

function isVertical(gesture: { dx: number; dy: number }): boolean {
  return Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
}
const LEAVE_MS = 160;

/**
 * A photo on the whole screen (spec 0036, REQ-009): ✕, Escape (onRequestClose) or a swipe down
 * close it; the photo follows the finger and springs back when the swipe was too short. It always
 * stands in the dark mode of the theme: a near-black stage and a light ✕, also in light mode.
 * With `pages` it swipes sideways through them like the gallery does (spec 0056, REQ-003): dots,
 * with a mouse arrows at the sides, ← and →.
 */
export function PhotoViewer(props: PhotoViewerProps) {
  const { id } = useTheme();
  const stage = getTheme(id, 'dark');
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
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <ThemeProvider themeId={id} mode="dark">
        <View
          testID={props.testID}
          accessibilityViewIsModal
          onLayout={(event) => height.set(event.nativeEvent.layout.height)}
          style={{ flex: 1, backgroundColor: stage.colors.bg }}
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
            {props.pages ? (
              <MediaGallery
                labels={props.pages.labels}
                initialIndex={props.pages.initialIndex}
                onIndexChange={props.pages.onIndexChange}
                autoFocus
                testID={props.testID ? `${props.testID}-pages` : undefined}
              >
                {props.pages.content}
              </MediaGallery>
            ) : (
              <ViewerPhoto sources={props.sources} alt={props.alt} />
            )}
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
      </ThemeProvider>
    </Modal>
  );
}
