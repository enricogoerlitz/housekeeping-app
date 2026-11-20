import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, focusRing } from './controls';
import { icons, type IconName } from './icons';
import { Icon, Text } from './primitives';
import { ToneContext, useBreakpoint, useTheme } from './theme-context';
import type { Tone } from './themes';

export const TAB_BAR_HEIGHT = 62;
export const SIDEBAR_WIDTH = 256;

export interface ScreenProps {
  children?: ReactNode;
  /** Fixed content above the scroll area (stays visible), e.g. a search field. */
  header?: ReactNode;
  /** Fixed content below the scroll area, e.g. a ComposerBar. */
  footer?: ReactNode;
  /** false for screens that manage their own scrolling. */
  scroll?: boolean;
  /** Maximum content width on wide screens; default 1180. */
  maxWidth?: number;
  /** Extra space at the end so the last row can scroll clear of the floating assistant button. */
  clearFab?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Page container: background, safe area, gutters, centred content on wide screens. */
export function Screen(props: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isPhone } = useBreakpoint();
  const gutter = isPhone ? theme.shape.gutter : 36;
  const maxWidth = props.maxWidth ?? 1180;
  const inner: ViewStyle = {
    width: '100%',
    maxWidth,
    alignSelf: 'center',
    paddingHorizontal: gutter,
  };
  const content = (
    <View
      style={[
        inner,
        { paddingTop: 8, paddingBottom: (props.clearFab ?? true) ? 96 : 24 },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
  return (
    <View
      testID={props.testID}
      style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}
    >
      {props.header ? <View style={[inner, { paddingTop: 8 }]}>{props.header}</View> : null}
      {props.scroll === false ? (
        <View style={{ flex: 1 }}>{content}</View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      )}
      {props.footer}
    </View>
  );
}

export interface ScreenHeaderProps {
  title: string;
  /** Small line above the title, e.g. the date. */
  kicker?: string;
  /** Small line below the title. */
  subtitle?: string;
  /** Content on the right: avatar, buttons, chips. */
  right?: ReactNode;
  /** Shows a back arrow on the left. */
  onBack?: () => void;
  testID?: string;
}

export function ScreenHeader(props: ScreenHeaderProps) {
  const { isPhone } = useBreakpoint();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        paddingTop: 8,
        paddingBottom: 16,
      }}
    >
      {props.onBack ? (
        <View style={{ marginLeft: -8, marginTop: isPhone ? -2 : 2 }}>
          <IconButton icon="arrow-left" label="Zurück" onPress={props.onBack} testID="back" />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {props.kicker ? (
          <Text variant="small" color="muted" style={{ marginBottom: 2 }}>
            {props.kicker}
          </Text>
        ) : null}
        <Text
          variant={isPhone ? 'title' : 'display'}
          heading
          testID={props.testID ?? 'screen-title'}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
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
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        height: TAB_BAR_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        paddingTop: 7,
        paddingHorizontal: 6,
        backgroundColor: c.barBg,
        borderTopWidth: 1,
        borderTopColor: c.border,
      }}
    >
      {props.items.map((item) => {
        const active = item.key === props.activeKey;
        const pill = active && theme.shape.tabActive === 'pill';
        const tone = item.tone ? c.tones[item.tone] : undefined;
        const Glyph = icons[item.icon];
        const tint = pill ? (tone?.fg ?? c.text) : active ? c.accent : c.textMuted;
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
              focusRing(theme, (state as { focused?: boolean }).focused),
            ]}
          >
            <View
              style={{
                height: 30,
                paddingHorizontal: 14,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pill ? (tone?.bg ?? c.surfaceSunken) : 'transparent',
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

export interface SidebarProps extends TabBarProps {
  /** Household name at the top. */
  brand: string;
  onBrandPress?: () => void;
  assistantLabel: string;
  onAssistant: () => void;
  /** Bottom area, e.g. the profile entry. */
  footer?: ReactNode;
}

/** Side navigation for tablet and desktop. */
export function Sidebar(props: SidebarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const pillTheme = theme.shape.tabActive === 'pill';
  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        paddingTop: insets.top + 24,
        paddingBottom: 18,
        paddingHorizontal: 14,
        gap: 4,
        backgroundColor: theme.shape.section === 'grouped' ? c.surfaceSunken : c.barBg,
        borderRightWidth: 1,
        borderRightColor: c.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.brand}
        onPress={props.onBrandPress}
        testID="sidebar-brand"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 10,
          paddingBottom: 20,
        }}
      >
        <Icon name="house" size={22} color="accent" />
        <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
          {props.brand}
        </Text>
      </Pressable>
      <View accessibilityRole="tablist" style={{ gap: 4 }}>
        {props.items.map((item) => {
          const active = item.key === props.activeKey;
          const tone = pillTheme && item.tone ? c.tones[item.tone] : undefined;
          const Glyph = icons[item.icon];
          const tint = active ? (tone?.fg ?? c.accent) : c.textMuted;
          return (
            <Pressable
              key={item.key}
              testID={`nav-${item.key}`}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => props.onSelect(item.key)}
              style={(state) => {
                const { hovered, focused } = state as { hovered?: boolean; focused?: boolean };
                return [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 46,
                    paddingHorizontal: 12,
                    borderRadius: theme.shape.radius.control,
                    backgroundColor: active
                      ? (tone?.bg ?? c.accentSoft)
                      : hovered
                        ? c.surfaceSunken
                        : 'transparent',
                  },
                  focusRing(theme, focused),
                ];
              }}
            >
              <Glyph size={21} color={tint} strokeWidth={theme.shape.stroke} />
              <Text
                variant={active ? 'bodyStrong' : 'rowTitle'}
                style={{
                  color: active
                    ? (tone?.fg ?? (c.accent === c.text ? c.text : c.accent))
                    : c.textMuted,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        testID="assistant-open"
        accessibilityRole="button"
        accessibilityLabel={props.assistantLabel}
        onPress={props.onAssistant}
        style={(state) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 46,
            marginTop: 16,
            borderRadius: theme.shape.radius.button,
            backgroundColor: c.fabBg,
            opacity: state.pressed ? 0.75 : 1,
          },
          focusRing(theme, (state as { focused?: boolean }).focused),
        ]}
      >
        <ToneContext.Provider value={{ fg: c.fabText }}>
          <Icon name="sparkles" size={19} />
          <Text variant="button">{props.assistantLabel}</Text>
        </ToneContext.Provider>
      </Pressable>
      <View style={{ flex: 1 }} />
      {props.footer}
    </View>
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
        focusRing(theme, (state as { focused?: boolean }).focused),
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
        paddingHorizontal: isPhone ? theme.shape.gutter : 36,
        paddingTop: 10,
        paddingBottom: 10,
        gap: 8,
      }}
    >
      <View style={{ width: '100%', maxWidth: 1180 - 72, alignSelf: 'center', gap: 8 }}>
        {props.children}
      </View>
    </View>
  );
}
