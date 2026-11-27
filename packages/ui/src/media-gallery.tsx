import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, type HostInstance, type ScrollViewInstance } from 'react-native';

import { IconButton } from './controls';
import { galleryKeyStep, pageAt, stepPage } from './gallery-pages';
import { useFinePointer } from './pointer';
import { useTheme } from './theme-context';
import { getTheme } from './themes';

// react-native-web passes `onKeyDown` through to the DOM; native has no such prop and ignores it.
type KeyEvent = { key: string; preventDefault: () => void };

export interface MediaGalleryProps {
  /** The pages, each filling the frame (a photo, a video's poster). */
  children: ReactNode;
  /**
   * Width : height of the frame, the same for every page; without it the gallery fills its parent
   * (the full-screen viewer, spec 0056, REQ-003).
   */
  aspectRatio?: number;
  /** The page it opens on (spec 0056, AC-013). */
  initialIndex?: number;
  /**
   * With a mouse it takes the keyboard focus when it appears, so ← and → turn the pages at once
   * (spec 0056, AC-012).
   */
  autoFocus?: boolean;
  /** Accessible names from the feature: the arrows and "2 von 3". */
  labels: { previous: string; next: string; position: (page: number, count: number) => string };
  onIndexChange?: (index: number) => void;
  /** Parts get `${testID}-dots`, `${testID}-dot-<n>`, `${testID}-previous`, `${testID}-next`. */
  testID?: string;
}

const DOT = 6;
const ARROW = 36;

/**
 * Pages side by side in one frame (spec 0046, REQ-003): the finger swipes them like the system
 * does (a paging scroll view, on the web CSS scroll snap, so a page swipe around it never takes the
 * touch: spec 0029, Entscheidung 8); with a mouse arrows sit at the sides; ← and → turn the pages
 * while the gallery has the focus. Dots at the bottom of the frame show where it stands. A single
 * page is shown as it is, without dots or arrows (AC-010, AC-011).
 */
export function MediaGallery(props: MediaGalleryProps) {
  const pages = Children.toArray(props.children);
  const count = pages.length;
  const theme = useTheme();
  const stage = getTheme(theme.id, 'dark');
  const fine = useFinePointer();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const frameRef = useRef<HostInstance>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = size.width;
  const [shown, setShown] = useState(props.initialIndex ?? 0);
  const fill = props.aspectRatio === undefined;
  // Each page in numbers: a percentage of the scrolling content would be circular.
  const pageHeight = fill ? size.height : width / (props.aspectRatio ?? 1);
  const frame = fill
    ? { flex: 1, width: '100%' as const }
    : { width: '100%' as const, aspectRatio: props.aspectRatio };
  // A page that went away (a removed video) leaves the gallery on the last one there is.
  const index = Math.min(shown, Math.max(0, count - 1));
  const { onIndexChange } = props;
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  // The page it opens on, once its width is known; the focus for the arrow keys.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || width === 0) return;
    placed.current = true;
    if (index > 0) scrollRef.current?.scrollTo({ x: index * width, animated: false });
  }, [width, index]);
  // Only with a mouse: a touch screen has no arrow keys and would show the focus ring.
  const takeFocus = props.autoFocus === true && fine;
  useEffect(() => {
    if (takeFocus) frameRef.current?.focus();
  }, [takeFocus]);

  if (count <= 1) {
    return (
      <View testID={props.testID} style={frame}>
        {pages}
      </View>
    );
  }

  const show = (next: number) => {
    if (next === index) return;
    setShown(next);
    onIndexChange?.(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };
  const onKeyDown = (event: KeyEvent) => {
    const step = galleryKeyStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    show(stepPage(index, step, count));
  };

  return (
    <View
      ref={frameRef}
      testID={props.testID}
      focusable
      style={frame}
      onLayout={(event) =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
      {...({ onKeyDown } as object)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const next = pageAt(event.nativeEvent.contentOffset.x, width, count);
          if (next === index) return;
          setShown(next);
          onIndexChange?.(next);
        }}
        style={{ flex: 1 }}
      >
        {pages.map((page, at) => (
          <View
            key={at}
            // Only the page shown is read out; the others are beside it, off the frame.
            accessibilityElementsHidden={at !== index}
            importantForAccessibility={at === index ? 'auto' : 'no-hide-descendants'}
            style={{ width: width || '100%', height: width && pageHeight ? pageHeight : '100%' }}
          >
            {page}
          </View>
        ))}
      </ScrollView>
      {fine && index > 0 ? (
        <View style={{ position: 'absolute', left: 8, top: '50%', marginTop: -ARROW / 2 }}>
          <IconButton
            icon="chevron-left"
            label={props.labels.previous}
            variant="soft"
            size={ARROW}
            onPress={() => show(stepPage(index, -1, count))}
            testID={id('previous')}
          />
        </View>
      ) : null}
      {fine && index < count - 1 ? (
        <View style={{ position: 'absolute', right: 8, top: '50%', marginTop: -ARROW / 2 }}>
          <IconButton
            icon="chevron-right"
            label={props.labels.next}
            variant="soft"
            size={ARROW}
            onPress={() => show(stepPage(index, 1, count))}
            testID={id('next')}
          />
        </View>
      ) : null}
      <View
        pointerEvents="none"
        testID={id('dots')}
        accessibilityLabel={props.labels.position(index + 1, count)}
        accessibilityLiveRegion="polite"
        style={{
          position: 'absolute',
          bottom: 10,
          alignSelf: 'center',
          flexDirection: 'row',
          gap: DOT,
          paddingHorizontal: DOT + 2,
          paddingVertical: DOT - 1,
          borderRadius: DOT * 2,
          backgroundColor: stage.colors.scrim,
        }}
      >
        {pages.map((_, at) => (
          <View
            key={at}
            testID={id(`dot-${at}`)}
            {...({ dataSet: { active: String(at === index) } } as object)}
            style={{
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: stage.colors.text,
              opacity: at === index ? 1 : 0.45,
            }}
          />
        ))}
      </View>
    </View>
  );
}
