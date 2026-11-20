import { Image, type ImageSource } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, Checkbox, focusRing } from './controls';
import type { IconName } from './icons';
import { Icon, Surface, Text } from './primitives';
import { ToneContext, useTheme } from './theme-context';
import type { Tone } from './themes';

const AVATAR_SIZES = { xs: 18, s: 26, m: 40, l: 56 } as const;
// Initials stay white on every member colour; member colours are chosen dark enough for that.
const ON_MEMBER_COLOR = '#FFFFFF';

export interface AvatarProps {
  name: string;
  /** The member's colour (from the data, not from the theme). */
  color: string;
  size?: keyof typeof AVATAR_SIZES;
  testID?: string;
}

export function Avatar(props: AvatarProps) {
  const theme = useTheme();
  const size = AVATAR_SIZES[props.size ?? 's'];
  const face = theme.type.smallStrong;
  return (
    <View
      testID={props.testID}
      accessibilityRole="image"
      accessibilityLabel={props.name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: props.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="smallStrong"
        style={{
          color: ON_MEMBER_COLOR,
          fontSize: Math.round(size * 0.44),
          lineHeight: size,
          fontFamily: face.fontFamily,
        }}
      >
        {props.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function AvatarStack(props: {
  members: { id: string; name: string; color: string }[];
  size?: keyof typeof AVATAR_SIZES;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      {props.members.map((member, index) => (
        <View
          key={member.id}
          style={{
            marginLeft: index === 0 ? 0 : -7,
            borderRadius: 999,
            borderWidth: index === 0 ? 0 : 2,
            borderColor: theme.colors.surface,
          }}
        >
          <Avatar name={member.name} color={member.color} size={props.size} />
        </View>
      ))}
    </View>
  );
}

export interface BadgeProps {
  label: string;
  /** neutral = grey; success = green; warn = orange; accent = theme accent; or an area colour. */
  tone?: 'neutral' | 'success' | 'warn' | 'accent' | Tone;
  icon?: IconName;
  testID?: string;
}

/** A small static tag, e.g. "vegan", "Vorrat", "neu". */
export function Badge(props: BadgeProps) {
  const theme = useTheme();
  const c = theme.colors;
  const tone = props.tone ?? 'neutral';
  const colors =
    tone === 'neutral'
      ? { bg: c.surfaceSunken, fg: c.text }
      : tone === 'success'
        ? c.tones.liste
        : tone === 'warn'
          ? { bg: c.warnBg, fg: c.warnText }
          : tone === 'accent'
            ? { bg: c.accentSoft, fg: c.accent === c.text ? c.text : c.accent }
            : c.tones[tone];
  return (
    <ToneContext.Provider value={{ fg: colors.fg }}>
      <View
        testID={props.testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 8,
          backgroundColor: colors.bg,
        }}
      >
        {props.icon ? <Icon name={props.icon} size={13} /> : null}
        <Text
          variant="caption"
          style={{
            fontFamily: theme.type.smallStrong.fontFamily,
            fontWeight: theme.type.smallStrong.fontWeight,
          }}
        >
          {props.label}
        </Text>
      </View>
    </ToneContext.Provider>
  );
}

export interface PhotoProps {
  /** Bundled image (require) or undefined for the placeholder. */
  source?: ImageSource | number;
  /** Shown as placeholder when there is no image. */
  placeholderIcon?: IconName;
  width?: number | `${number}%`;
  height?: number;
  aspectRatio?: number;
  radius?: number;
  /** Describes the picture; omit for decorative images. */
  alt?: string;
  style?: StyleProp<ViewStyle>;
}

export function Photo(props: PhotoProps) {
  const theme = useTheme();
  const radius = props.radius ?? theme.shape.radius.photo;
  const box: ViewStyle = {
    width: props.width ?? '100%',
    height: props.height,
    aspectRatio: props.aspectRatio,
    borderRadius: radius,
    overflow: 'hidden',
  };
  if (props.source === undefined) {
    return (
      <View
        style={[
          box,
          {
            backgroundColor: theme.colors.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          },
          props.style,
        ]}
      >
        <ToneContext.Provider value={undefined}>
          <Icon name={props.placeholderIcon ?? 'utensils'} size={26} color="muted" />
        </ToneContext.Provider>
      </View>
    );
  }
  return (
    <View style={[box, props.style]}>
      <Image
        source={props.source}
        contentFit="cover"
        accessibilityLabel={props.alt}
        accessible={!!props.alt}
        style={{ width: '100%', height: '100%' }}
        transition={120}
      />
    </View>
  );
}

export interface MediaCardProps {
  title: string;
  /** Small line above the title, e.g. "Abend · 60 Min". */
  kicker?: string;
  /** Line(s) below the title: a string or custom content such as an avatar with text. */
  meta?: ReactNode;
  image?: ImageSource | number;
  placeholderIcon?: IconName;
  onPress?: () => void;
  size?: 'm' | 'l';
  /** auto follows the theme; force a layout only where the design needs it. */
  layout?: 'auto' | 'photoTop' | 'thumbRow';
  /** Small element in the top right corner, e.g. a favourite heart or a badge. */
  corner?: ReactNode;
  testID?: string;
}

/** A card with a picture: recipe tiles, today's meals. */
export function MediaCard(props: MediaCardProps) {
  const theme = useTheme();
  const layout = !props.layout || props.layout === 'auto' ? theme.shape.media : props.layout;
  const large = props.size === 'l';
  const text = (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      {props.kicker ? (
        <Text variant="caption" color="muted" numberOfLines={1}>
          {props.kicker}
        </Text>
      ) : null}
      <Text
        variant="cardTitle"
        numberOfLines={2}
        style={
          large
            ? {
                fontSize: theme.type.cardTitle.fontSize + 3,
                lineHeight: theme.type.cardTitle.lineHeight + 4,
              }
            : undefined
        }
      >
        {props.title}
      </Text>
      {typeof props.meta === 'string' ? (
        <Text variant="caption" color="muted" numberOfLines={2} style={{ marginTop: 2 }}>
          {props.meta}
        </Text>
      ) : props.meta ? (
        <View style={{ marginTop: 3 }}>{props.meta}</View>
      ) : null}
    </View>
  );
  const body =
    layout === 'photoTop' ? (
      <Surface padding={0} style={{ overflow: 'hidden', flex: 1 }}>
        <Photo
          source={props.image}
          placeholderIcon={props.placeholderIcon}
          height={large ? 190 : 122}
          radius={0}
        />
        <View style={{ padding: 12, paddingTop: 10 }}>{text}</View>
        {props.corner ? (
          <View style={{ position: 'absolute', top: 8, right: 8 }}>{props.corner}</View>
        ) : null}
      </Surface>
    ) : (
      <Surface
        padding={large ? 12 : 9}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
      >
        <Photo
          source={props.image}
          placeholderIcon={props.placeholderIcon}
          width={large ? 104 : 68}
          height={large ? 104 : 68}
          radius={theme.shape.radius.photo}
        />
        {text}
        {props.corner}
      </Surface>
    );
  if (!props.onPress)
    return (
      <View testID={props.testID} style={{ flex: 1 }}>
        {body}
      </View>
    );
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      onPress={props.onPress}
      style={(state) => [
        { flex: 1, opacity: state.pressed ? 0.75 : 1, borderRadius: theme.shape.radius.card },
        focusRing(theme, (state as { focused?: boolean }).focused),
      ]}
    >
      {body}
    </Pressable>
  );
}

/** Progress of a list or a step sequence; value 0…1. */
export function ProgressBar(props: { value: number; label: string; testID?: string }) {
  const theme = useTheme();
  const value = Math.max(0, Math.min(1, props.value));
  return (
    <View
      testID={props.testID}
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.surfaceSunken,
        overflow: 'hidden',
        flex: 1,
      }}
    >
      <View
        style={{
          width: `${value * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: theme.colors.success,
        }}
      />
    </View>
  );
}

/** How much of a flexible chore's interval has passed; value 0…1 and above when overdue. */
export function DueBar(props: { value: number; label: string }) {
  const theme = useTheme();
  const value = Math.max(0.04, Math.min(1, props.value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        height: 6,
        width: 128,
        borderRadius: 3,
        backgroundColor: theme.colors.surfaceSunken,
        overflow: 'hidden',
        marginTop: 7,
      }}
    >
      <View
        style={{
          width: `${value * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: theme.colors.due,
        }}
      />
    </View>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  text?: string;
  /** First steps: usually one to three buttons. */
  children?: ReactNode;
  testID?: string;
}

export function EmptyState(props: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      testID={props.testID}
      style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16, gap: 10 }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.colors.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <ToneContext.Provider value={undefined}>
          <Icon name={props.icon} size={28} color="muted" />
        </ToneContext.Provider>
      </View>
      <Text variant="heading" align="center" heading>
        {props.title}
      </Text>
      {props.text ? (
        <Text color="muted" align="center" style={{ maxWidth: 360 }}>
          {props.text}
        </Text>
      ) : null}
      {props.children ? (
        <View style={{ gap: 10, marginTop: 10, alignItems: 'center' }}>{props.children}</View>
      ) : null}
    </View>
  );
}

/** The calm offline hint: orange, never red. */
export function OfflineBanner(props: { text?: string; testID?: string }) {
  const theme = useTheme();
  return (
    <ToneContext.Provider value={{ fg: theme.colors.warnText }}>
      <View
        testID={props.testID ?? 'offline-banner'}
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: theme.shape.radius.control,
          backgroundColor: theme.colors.warnBg,
        }}
      >
        <Icon name="wifi-off" size={17} />
        <Text variant="smallStrong" style={{ flex: 1 }}>
          {props.text ?? 'Offline – Lesen und Abhaken gehen'}
        </Text>
      </View>
    </ToneContext.Provider>
  );
}

/** A quiet hint box, e.g. "Passt nicht für Nadja" or "Curry geändert". */
export function Notice(props: {
  text: string;
  icon?: IconName;
  action?: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <ToneContext.Provider value={{ fg: theme.colors.warnText }}>
      <View
        testID={props.testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: theme.shape.radius.control,
          backgroundColor: theme.colors.warnBg,
          alignSelf: 'flex-start',
        }}
      >
        <Icon name={props.icon ?? 'circle-alert'} size={15} />
        <Text variant="small" style={{ flexShrink: 1 }}>
          {props.text}
        </Text>
        {props.action}
      </View>
    </ToneContext.Provider>
  );
}

export interface ProposalPartView {
  id: string;
  label: string;
  /** Previous value, shown struck through. */
  before?: string;
  /** New value. */
  after?: string;
  checked: boolean;
}

export interface ProposalCardProps {
  title: string;
  /** Marks simulated answers, e.g. "Beispielantwort – KI ist noch nicht angeschlossen". */
  note?: string;
  parts: ProposalPartView[];
  onTogglePart: (id: string) => void;
  onAccept: () => void;
  onEdit?: () => void;
  onDiscard: () => void;
  /** After acceptance the card shows a confirmation instead of the buttons. */
  status?: 'open' | 'accepted' | 'discarded';
  testID?: string;
}

/** An assistant proposal as a diff the user accepts fully, partly, or discards. */
export function ProposalCard(props: ProposalCardProps) {
  const theme = useTheme();
  const status = props.status ?? 'open';
  return (
    <Surface testID={props.testID} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles" size={18} color="accent" />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {props.title}
        </Text>
      </View>
      {props.note ? (
        <Text
          variant="caption"
          color="muted"
          testID={props.testID ? `${props.testID}-note` : undefined}
        >
          {props.note}
        </Text>
      ) : null}
      <View>
        {props.parts.map((part, index) => (
          <View
            key={part.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: 48,
              paddingVertical: 6,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="small" color="muted">
                {part.label}
              </Text>
              <Text variant="rowTitle">
                {part.before ? (
                  <Text variant="rowTitle" color="muted" strike>
                    {part.before}
                  </Text>
                ) : null}
                {part.before && part.after ? ' → ' : ''}
                {part.after}
              </Text>
            </View>
            <Checkbox
              label={`${part.label} übernehmen`}
              checked={part.checked}
              disabled={status !== 'open'}
              onChange={() => props.onTogglePart(part.id)}
              testID={props.testID ? `${props.testID}-part-${part.id}` : undefined}
            />
          </View>
        ))}
      </View>
      {status === 'open' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Button
            label="Übernehmen"
            icon="check"
            onPress={props.onAccept}
            size="sm"
            testID={props.testID ? `${props.testID}-accept` : undefined}
          />
          {props.onEdit ? (
            <Button label="Ändern …" variant="ghost" size="sm" onPress={props.onEdit} />
          ) : null}
          <Button
            label="Verwerfen"
            variant="link"
            size="sm"
            onPress={props.onDiscard}
            testID={props.testID ? `${props.testID}-discard` : undefined}
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon
            name={status === 'accepted' ? 'circle-check' : 'x'}
            size={17}
            color={status === 'accepted' ? 'success' : 'muted'}
          />
          <Text variant="smallStrong" color={status === 'accepted' ? 'success' : 'muted'}>
            {status === 'accepted' ? 'Übernommen' : 'Verworfen'}
          </Text>
        </View>
      )}
    </Surface>
  );
}

const TYPING_DOT = 7;

/**
 * "Is writing …": three softly pulsing dots in a bubble, e.g. while the assistant thinks. Static
 * when the system asks for reduced motion. `label` is read by screen readers.
 */
export function TypingIndicator(props: { label: string; testID?: string }) {
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [phase] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!cancelled) setReduceMotion(reduced);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 3,
        duration: 1200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reduceMotion]);

  return (
    <View
      testID={props.testID}
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      style={{
        flexDirection: 'row',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: theme.shape.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={{
            width: TYPING_DOT,
            height: TYPING_DOT,
            borderRadius: TYPING_DOT / 2,
            backgroundColor: theme.colors.textMuted,
            opacity: reduceMotion
              ? 0.6
              : phase.interpolate({
                  inputRange: [0, index, index + 0.5, index + 1, 3],
                  outputRange: [0.3, 0.3, 1, 0.3, 0.3],
                  extrapolate: 'clamp',
                }),
          }}
        />
      ))}
    </View>
  );
}
