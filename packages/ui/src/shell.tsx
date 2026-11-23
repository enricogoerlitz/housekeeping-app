import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { bottomInset } from './bottom-inset';
import { IconButton, keyboardFocusRing } from './controls';
import { useHover } from './pointer';
import { tabSwipeTouchAction, type TabSwipe } from './tab-swipe';
import { TabSwipeArea } from './tab-swipe-area';
import { icons, type IconName } from './icons';
import { Divider, Icon, Text } from './primitives';
import { AreaToneContext, ToneContext, useBreakpoint, useTheme } from './theme-context';
import type { Tone } from './themes';

export const TAB_BAR_HEIGHT = 62;

/**
 * Distance from the bottom edge for anything at the bottom of the screen: the safe area plus the
 * gap above the home bar, or `minimum` without a home bar (spec 0029, REQ-002).
 */
export function useBottomInset(minimum = 0): number {
  return bottomInset(useSafeAreaInsets().bottom, minimum);
}
export const SIDEBAR_WIDTH = 256;
/** Widest content of a page; wider windows centre it (spec 0005, AC-012). */
export const CONTENT_MAX_WIDTH = 1320;
/** Page margin from tablet width on, next to the sidebar. */
export const WIDE_GUTTER = 36;

// The phone header shrinks after this much scrolling and grows again near the top. The gap
// between both keeps it from flickering on a page that is just long enough to shrink it.
const COLLAPSE_AT = 56;
const EXPAND_AT = 8;

/** Whether the phone header is shrunk to its narrow bar; read by ScreenHeader. */
const ScreenChromeContext = createContext({ collapsed: false });

/**
 * Set by a Screen with `scroll={false}` for the list that scrolls the page instead (InfiniteList):
 * `inset` is the space the fixed header takes above the content on phones, `onScroll` a worklet
 * that receives the scroll offset, so header and toolbar react as on a scrolling Screen.
 */
export const PageScrollContext = createContext<
  { inset: number; onScroll: (y: number) => void; touch?: ViewStyle | null } | undefined
>(undefined);

/**
 * The scroll switch of a Screen that scrolls itself (spec 0016, plan decision 2): a drag turns
 * the page's scrolling off on native while an entry hangs on the finger, and scrolls the page
 * along at the top and bottom edges.
 */
export interface PageScrollControl {
  setScrollEnabled: (enabled: boolean) => void;
  scrollBy: (dy: number) => void;
  /** The scroll area in window coordinates, where the bands that scroll along lie. */
  measure: (
    done: (rect: { x: number; y: number; width: number; height: number } | null) => void,
  ) => void;
}

export const PageScrollControlContext = createContext<PageScrollControl | undefined>(undefined);

/**
 * Set by Screen around its `aside`: a DockedPanel at the bottom reports the height it covers, so
 * the page gets that much room at its end.
 */
export const AsideInsetContext = createContext<((height: number) => void) | undefined>(undefined);

export interface ScreenProps {
  children?: ReactNode;
  /**
   * Fixed content above the scroll area that stays visible, usually a ScreenHeader. On phones a
   * ScreenHeader here shrinks to a narrow bar while the page is scrolled.
   */
  header?: ReactNode;
  /** View tabs below the header; they stay visible. */
  tabs?: ReactNode;
  /**
   * On phones a sideways swipe over the content changes these view tabs (spec 0029, REQ-003);
   * build it with `tabSwipe(options, value, onChange)`, the same as the tabs get.
   */
  tabSwipe?: TabSwipe;
  /**
   * Search field and filter row below the tabs. On phones they slide away while scrolling down and
   * come back on scrolling up; on wider screens they stay.
   */
  toolbar?: ReactNode;
  /** Fixed content below the scroll area, e.g. a ComposerBar. */
  footer?: ReactNode;
  /**
   * A DockedPanel: from 1100 px it stands right of the scroll area, below header and tabs; on
   * phones and tablets it lies over the lower part of the screen area, above the tab bar.
   */
  aside?: ReactNode;
  /**
   * false for screens that manage their own scrolling. With a header on phones the scrolling child
   * must be an InfiniteList: it takes the header's space as its inset (PageScrollContext).
   */
  scroll?: boolean;
  /** Area of the screen (spec 0005, D4); "Frisch" paints its primary action in this colour. */
  tone?: Tone;
  /**
   * Maximum page width including the margins. Keep the default: one width per area, never per tab
   * or content, or the content jumps when switching tabs (spec 0005, AC-011).
   */
  maxWidth?: number;
  /** Extra space at the end so the last row can scroll clear of the floating assistant button. */
  clearFab?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Page container: background, safe area, margins and content width (36 px next to the sidebar, at
 * most 1320 px, centred above). Header, tabs and toolbar stay at the top while the page scrolls;
 * a fine line under them appears once content scrolls underneath (spec 0005, REQ-002).
 */
export function Screen(props: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isPhone } = useBreakpoint();
  const c = theme.colors;
  const gutter = isPhone ? theme.shape.gutter : WIDE_GUTTER;
  const inner: ViewStyle = {
    width: '100%',
    maxWidth: props.maxWidth ?? CONTENT_MAX_WIDTH + 2 * WIDE_GUTTER,
    alignSelf: 'center',
    paddingHorizontal: gutter,
  };
  const hasChrome = !!(props.header || props.tabs || props.toolbar);
  // Phones: header and toolbar lie over the content, which scrolls underneath; so the header can
  // shrink and the toolbar slide away without moving the content.
  const overlay = isPhone && hasChrome;

  const [collapsed, setCollapsed] = useState(false);
  const [chrome, setChrome] = useState<{ expanded?: number; narrow?: number; now: number }>({
    now: 0,
  });
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [asideInset, setAsideInset] = useState(0);

  const scrollY = useSharedValue(0);
  const isCollapsed = useSharedValue(false);
  const toolbarShift = useSharedValue(0);
  const toolbarMax = useSharedValue(0);

  const onPageScroll = (y: number) => {
    'worklet';
    const delta = y - scrollY.get();
    scrollY.set(y);
    if (overlay) {
      if (!isCollapsed.get() && y > COLLAPSE_AT) {
        isCollapsed.set(true);
        scheduleOnRN(setCollapsed, true);
      } else if (isCollapsed.get() && y < EXPAND_AT) {
        isCollapsed.set(false);
        scheduleOnRN(setCollapsed, false);
      }
      // The toolbar follows the content up and returns as soon as the page scrolls down again.
      const shift =
        y <= 0 ? 0 : Math.min(toolbarMax.get(), Math.max(0, toolbarShift.get() + delta));
      toolbarShift.set(shift);
    }
  };
  const scrollView = useRef<ScrollViewInstance>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [scrollControl] = useState<PageScrollControl>(() => ({
    setScrollEnabled,
    scrollBy: (dy) => {
      scrollView.current?.scrollTo({ y: Math.max(0, scrollY.get() + dy), animated: false });
    },
    measure: (done) => {
      const view = scrollView.current;
      if (!view) done(null);
      else view.measureInWindow((x, y, width, height) => done({ x, y, width, height }));
    },
  }));
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      onPageScroll(event.contentOffset.y);
    },
  });
  const toolbarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -toolbarShift.get() }],
  }));
  // The line under the fixed part: under the toolbar while it shows, else under header and tabs.
  const chromeLine = useAnimatedStyle(() => ({
    opacity: scrollY.get() > 0 && toolbarShift.get() >= toolbarMax.get() ? 1 : 0,
  }));
  const toolbarLine = useAnimatedStyle(() => ({
    opacity: scrollY.get() > 0 && toolbarShift.get() < toolbarMax.get() ? 1 : 0,
  }));

  const onChromeLayout = (event: LayoutChangeEvent) => {
    const now = event.nativeEvent.layout.height;
    setChrome((previous) =>
      collapsed ? { ...previous, now, narrow: now } : { ...previous, now, expanded: now },
    );
  };
  const onToolbarLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    toolbarMax.set(height);
    setToolbarHeight(height);
  };

  // Once the narrow bar was measured the scroll area starts below it, so sticky group headings
  // stick under the bar instead of behind it; only the rest of the header lies over the content.
  const top = overlay ? (chrome.narrow ?? 0) : 0;
  // Spec 0030, REQ-007: under a tab swipe the scroll area pans only vertically (iOS).
  const touch = tabSwipeTouchAction(props.tabSwipe !== undefined, Platform.OS);
  const inset = overlay ? (chrome.expanded ?? 0) + toolbarHeight - top : 0;
  const measured = !overlay || chrome.expanded !== undefined;
  const content = (
    <View
      style={[
        inner,
        {
          paddingTop: 8,
          paddingBottom: Math.max((props.clearFab ?? true) ? 96 : 24, asideInset + 24),
        },
        touch,
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
  const scrolling =
    props.scroll === false ? (
      <PageScrollContext.Provider value={{ inset, onScroll: onPageScroll, touch }}>
        <View style={{ flex: 1, marginTop: top, opacity: measured ? 1 : 0 }}>{content}</View>
      </PageScrollContext.Provider>
    ) : (
      <Animated.ScrollView
        ref={scrollView}
        style={{ flex: 1, marginTop: top, opacity: measured ? 1 : 0 }}
        contentContainerStyle={{ paddingTop: inset }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        <PageScrollControlContext.Provider value={scrollControl}>
          {content}
        </PageScrollControlContext.Provider>
      </Animated.ScrollView>
    );
  const body = props.tabSwipe ? (
    <TabSwipeArea swipe={props.tabSwipe}>{scrolling}</TabSwipeArea>
  ) : (
    scrolling
  );
  const line: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: c.border,
  };
  const header = props.header ? (
    <ScreenChromeContext.Provider value={{ collapsed: overlay && collapsed }}>
      <View style={inner}>{props.header}</View>
    </ScreenChromeContext.Provider>
  ) : null;
  const tabs = props.tabs ? <View style={inner}>{props.tabs}</View> : null;
  const aside = props.aside ? (
    <AsideInsetContext.Provider value={setAsideInset}>{props.aside}</AsideInsetContext.Provider>
  ) : null;

  if (!overlay) {
    return (
      <AreaToneContext.Provider value={props.tone}>
        <View
          testID={props.testID}
          style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}
        >
          {hasChrome ? (
            <View style={{ zIndex: 1, paddingTop: 8 }}>
              {header}
              {tabs}
              {props.toolbar ? (
                <View style={[inner, { paddingTop: 8, paddingBottom: 8 }]}>{props.toolbar}</View>
              ) : null}
              <Animated.View pointerEvents="none" style={[line, chromeLine]} />
            </View>
          ) : null}
          {props.aside ? (
            <View style={{ flex: 1, flexDirection: 'row', overflow: 'hidden' }}>
              <View style={{ flex: 1 }}>{body}</View>
              {aside}
            </View>
          ) : (
            body
          )}
          {props.footer}
        </View>
      </AreaToneContext.Provider>
    );
  }

  return (
    <AreaToneContext.Provider value={props.tone}>
      <View testID={props.testID} style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          {body}
          {props.toolbar ? (
            <Animated.View
              onLayout={onToolbarLayout}
              style={[
                {
                  position: 'absolute',
                  top: chrome.now,
                  left: 0,
                  right: 0,
                  paddingTop: 8,
                  paddingBottom: 8,
                  backgroundColor: c.bg,
                },
                toolbarStyle,
              ]}
            >
              <View style={inner}>{props.toolbar}</View>
              <Animated.View pointerEvents="none" style={[line, toolbarLine]} />
            </Animated.View>
          ) : null}
          <View
            onLayout={onChromeLayout}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              paddingTop: insets.top,
              backgroundColor: c.bg,
            }}
          >
            {header}
            {tabs}
            <Animated.View pointerEvents="none" style={[line, chromeLine]} />
          </View>
          {aside}
        </View>
        {props.footer}
      </View>
    </AreaToneContext.Provider>
  );
}

export interface ScreenHeaderProps {
  title: string;
  /** Small line above the title, e.g. the date. */
  kicker?: string;
  /** A control above the title, e.g. the household on the phone's overview (spec 0019). */
  above?: ReactNode;
  /** Small line below the title. */
  subtitle?: string;
  /** Content on the right: avatar, buttons, chips. They stay in the narrow bar. */
  right?: ReactNode;
  /** Shows a back arrow on the left. */
  onBack?: () => void;
  /** Names where "Zurück" leads, e.g. "Kalender": shown as "‹ Kalender" above the title. */
  backLabel?: string;
  /**
   * For a page that shows its title big in its own content (spec 0008, AC-019, AC-020): one bar
   * with "‹ Back", the title small and the buttons. On phones the title only appears once the
   * page is scrolled; wider screens show it from the start.
   */
  titleOnScroll?: boolean;
  testID?: string;
}

/**
 * Title row of a page. In a Screen's `header` on phones it shrinks to a narrow bar (small title,
 * same buttons) once the page is scrolled.
 */
export function ScreenHeader(props: ScreenHeaderProps) {
  const { isPhone } = useBreakpoint();
  const { collapsed } = useContext(ScreenChromeContext);
  if (props.titleOnScroll) return <TitleBar {...props} showTitle={!isPhone || collapsed} />;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: collapsed ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        paddingTop: 8,
        paddingBottom: collapsed ? 8 : 16,
      }}
    >
      {props.onBack && (!props.backLabel || collapsed) ? (
        <View style={{ marginLeft: -8, marginTop: collapsed ? 0 : isPhone ? -2 : 2 }}>
          <IconButton icon="arrow-left" label="Zurück" onPress={props.onBack} testID="back" />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {props.onBack && props.backLabel && !collapsed ? (
          <BackLink label={props.backLabel} onPress={props.onBack} />
        ) : null}
        {props.above && !collapsed ? props.above : null}
        {props.kicker && !collapsed ? (
          <Text variant="small" color="muted" style={{ marginBottom: 2 }}>
            {props.kicker}
          </Text>
        ) : null}
        <Text
          variant={collapsed ? 'cardTitle' : isPhone ? 'title' : 'display'}
          heading
          numberOfLines={collapsed ? 1 : undefined}
          testID={props.testID ?? 'screen-title'}
        >
          {props.title}
        </Text>
        {props.subtitle && !collapsed ? (
          <Text variant="small" color="muted" style={{ marginTop: 4 }}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{props.right}</View>
      ) : null}
    </View>
  );
}

/** The one-row header of `titleOnScroll`: back, the title once `showTitle`, the buttons. */
function TitleBar(props: ScreenHeaderProps & { showTitle: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      {props.onBack ? (
        props.backLabel ? (
          // BackLink aligns itself to the start; the wrapper centres it in the row.
          <View>
            <BackLink label={props.backLabel} onPress={props.onBack} />
          </View>
        ) : (
          <View style={{ marginLeft: -8 }}>
            <IconButton icon="arrow-left" label="Zurück" onPress={props.onBack} testID="back" />
          </View>
        )
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {props.showTitle ? (
          <Text
            variant="cardTitle"
            heading
            numberOfLines={1}
            testID={props.testID ?? 'screen-title'}
          >
            {props.title}
          </Text>
        ) : null}
      </View>
      {props.right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{props.right}</View>
      ) : null}
    </View>
  );
}

/** "‹ Kalender": back with the name of the page it leads to (spec 0010, AC-025, AC-039). */
function BackLink(props: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="back"
      accessibilityRole="button"
      accessibilityLabel={`Zurück: ${props.label}`}
      onPress={props.onPress}
      hitSlop={8}
      style={(state) => {
        const { pressed, focused } = state as { pressed: boolean; focused?: boolean };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 2,
            minHeight: 32,
            marginLeft: -6,
            paddingRight: 6,
            borderRadius: theme.shape.radius.control,
            opacity: pressed ? 0.6 : 1,
          },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <Icon name="chevron-left" size={20} color="accent" />
      <Text variant="smallStrong" color="accent" testID="back-label">
        {props.label}
      </Text>
    </Pressable>
  );
}

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  tone?: Tone;
}

export interface TabBarProps {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

/** Bottom navigation for phones. */
export function TabBar(props: TabBarProps) {
  const theme = useTheme();
  const bottom = useBottomInset();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        height: TAB_BAR_HEIGHT + bottom,
        paddingBottom: bottom,
        paddingTop: 7,
        paddingHorizontal: 6,
        backgroundColor: c.barBg,
        borderTopWidth: 1,
        borderTopColor: c.border,
      }}
    >
      {props.items.map((item) => {
        const active = item.key === props.activeKey;
        // "Frisch" marks the active tab with an ink pill, never with an area colour (D4).
        const pill = active && theme.shape.tabActive === 'pill';
        const Glyph = icons[item.icon];
        const tint = pill ? c.onAccent : active ? c.accent : c.textMuted;
        return (
          <Pressable
            key={item.key}
            testID={`tab-${item.key}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => props.onSelect(item.key)}
            style={(state) => [
              {
                flex: 1,
                alignItems: 'center',
                gap: 3,
                opacity: state.pressed ? 0.6 : 1,
                borderRadius: 12,
              },
              keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
            ]}
          >
            <View
              style={{
                height: 30,
                paddingHorizontal: 14,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pill ? c.accent : 'transparent',
              }}
            >
              <Glyph size={24} color={tint} strokeWidth={theme.shape.stroke} />
            </View>
            <Text
              variant="tab"
              style={{ color: active ? (pill ? c.text : c.accent) : c.textMuted }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface SidebarEntry {
  key: string;
  label: string;
  icon: IconName;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A titled group below the areas, e.g. "Verwalten"; its blocks are split by fine lines. */
export interface SidebarGroup {
  key: string;
  title: string;
  blocks: SidebarEntry[][];
  /** Extra content after the entries, e.g. a switch. */
  extra?: ReactNode;
}

export interface SidebarProps extends TabBarProps {
  /** Household name at the top, with ▾. */
  brand: string;
  /** Accessible name of the brand button, e.g. "WG, Haushalt wechseln". */
  brandLabel: string;
  onBrandPress?: () => void;
  /** Fixed content right below the areas, e.g. the assistant button. */
  belowItems?: ReactNode;
  /** Groups below the areas; only this part scrolls on a low window (spec 0005, AC-053). */
  groups?: SidebarGroup[];
  /** testID of the scrolling part. */
  groupsTestID?: string;
  /** Bottom area, e.g. the profile entry. */
  footer?: ReactNode;
}

/**
 * Side navigation for tablet and desktop (spec 0005, REQ-010): household name with ▾, the five
 * areas, titled groups ("Verwalten") and a footer. The active entry is marked neutrally in
 * `accentSoft`, also in "Frisch", where area colours belong to the screen, not the navigation.
 */
export function Sidebar(props: SidebarProps) {
  const hover = useHover();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        paddingTop: insets.top + 24,
        paddingBottom: 18,
        backgroundColor: theme.shape.section === 'grouped' ? c.surfaceSunken : c.barBg,
        borderRightWidth: 1,
        borderRightColor: c.border,
      }}
    >
      <View style={{ paddingHorizontal: 14, gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.brandLabel}
          onPress={props.onBrandPress}
          testID="sidebar-brand"
          style={(state) => {
            const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
            return [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                paddingHorizontal: 10,
                marginBottom: 12,
                borderRadius: theme.shape.radius.control,
                backgroundColor: hover(hovered) ? c.surfaceSunken : 'transparent',
              },
              keyboardFocusRing(theme, focused),
            ];
          }}
        >
          <Icon name="house" size={22} color="accent" />
          <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
            {props.brand}
          </Text>
          <Icon name="chevron-down" size={18} color="muted" />
        </Pressable>
        <View accessibilityRole="tablist" style={{ gap: 4 }}>
          {props.items.map((item) => (
            <SidebarRow
              key={item.key}
              tab
              entry={{
                key: item.key,
                label: item.label,
                icon: item.icon,
                active: item.key === props.activeKey,
                onPress: () => props.onSelect(item.key),
                testID: `nav-${item.key}`,
              }}
            />
          ))}
        </View>
        {props.belowItems}
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 20 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12, gap: 20 }}
        showsVerticalScrollIndicator={false}
        testID={props.groupsTestID}
      >
        {props.groups?.map((group) => (
          <View key={group.key}>
            <Text
              variant="caption"
              color="muted"
              style={{ paddingHorizontal: 12, marginBottom: 6, textTransform: 'uppercase' }}
            >
              {group.title}
            </Text>
            {group.blocks.map((block, index) => (
              <View key={index} style={{ gap: 2 }}>
                {index > 0 ? (
                  <View style={{ marginVertical: 8, marginHorizontal: 12 }}>
                    <Divider />
                  </View>
                ) : null}
                {block.map((entry) => (
                  <SidebarRow key={entry.key} entry={entry} />
                ))}
              </View>
            ))}
            {group.extra}
          </View>
        ))}
      </ScrollView>

      {props.footer ? (
        <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>{props.footer}</View>
      ) : null}
    </View>
  );
}

/** One row of the sidebar: an area (role tab) or a page in a group (a link). */
function SidebarRow(props: { entry: SidebarEntry; tab?: boolean }) {
  const hover = useHover();
  const theme = useTheme();
  const c = theme.colors;
  const { entry } = props;
  const active = !!entry.active;
  const Glyph = icons[entry.icon];
  // Themes whose accent is ink ("Frisch") keep the label in ink; others use the accent.
  const activeFg = c.accent === c.text ? c.text : c.accent;
  return (
    <Pressable
      testID={entry.testID}
      accessibilityRole={props.tab ? 'tab' : 'link'}
      accessibilityLabel={entry.label}
      accessibilityState={props.tab ? { selected: active } : undefined}
      aria-current={!props.tab && active ? 'page' : undefined}
      onPress={entry.onPress}
      style={(state) => {
        const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: props.tab ? 46 : 44,
            paddingHorizontal: 12,
            borderRadius: theme.shape.radius.control,
            backgroundColor: active
              ? c.accentSoft
              : hover(hovered)
                ? c.surfaceSunken
                : 'transparent',
          },
          keyboardFocusRing(theme, focused),
        ];
      }}
    >
      <Glyph
        size={props.tab ? 21 : 19}
        color={active ? activeFg : c.textMuted}
        strokeWidth={theme.shape.stroke}
      />
      <Text
        variant={active ? 'bodyStrong' : 'rowTitle'}
        numberOfLines={1}
        style={{ flex: 1, color: active ? activeFg : c.textMuted }}
      >
        {entry.label}
      </Text>
    </Pressable>
  );
}

export interface FabProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Distance from the bottom edge of its container. */
  bottom?: number;
  testID?: string;
}

/** The floating assistant button on phones. */
export function Fab(props: FabProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      testID={props.testID ?? 'assistant-open'}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={(state) => [
        {
          position: 'absolute',
          right: 16,
          bottom: props.bottom ?? 16,
          width: 58,
          height: 58,
          borderRadius: theme.shape.radius.fab,
          backgroundColor: c.fabBg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: state.pressed ? 0.8 : 1,
          boxShadow: '0px 6px 18px rgba(0,0,0,0.22), 0px 1px 3px rgba(0,0,0,0.18)',
        },
        keyboardFocusRing(theme, (state as { focused?: boolean }).focused),
      ]}
    >
      <ToneContext.Provider value={{ fg: c.fabText }}>
        <Icon name={props.icon} size={26} />
      </ToneContext.Provider>
    </Pressable>
  );
}

/** A bar fixed above the tab bar that holds an input, e.g. "Artikel hinzufügen". */
export function ComposerBar(props: { children?: ReactNode; testID?: string }) {
  const theme = useTheme();
  const { isPhone } = useBreakpoint();
  return (
    <View
      testID={props.testID}
      style={{
        backgroundColor: theme.colors.barBg,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: isPhone ? theme.shape.gutter : WIDE_GUTTER,
        paddingTop: 10,
        paddingBottom: 10,
        gap: 8,
      }}
    >
      <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 8 }}>
        {props.children}
      </View>
    </View>
  );
}
