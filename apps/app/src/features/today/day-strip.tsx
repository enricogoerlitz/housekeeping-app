import {
  useTrips,
  useActivitiesById,
  useMembers,
  useMembersById,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  tripStripes,
  dayDots,
  dayMonthLongLabel,
  overviewSection,
  parseISODate,
  stripeSegment,
  tileEntry,
  weekdayLong,
  weekdayShort,
  type TripStripe,
  type ISODate,
  type KindRole,
  type MealPlanEntry,
} from '@housekeeping/core';
import {
  Badge,
  Icon,
  KindDot,
  Text,
  keyboardFocusRing,
  useHover,
  useTheme,
} from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { stripeA11y, stripeLine, useStripeColors } from '@/features/calendar/calendar-parts';
import { EntryPicture } from '@/features/meal-plan/entry-picture';
import { KIND_LABELS } from '@/features/meal-plan/kind-badges';
import { useOnlineOnly } from '@/features/shell/offline';

import { plannedTitle } from './planned-title';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** The picture of a tile; the "+" of an empty day lies exactly over it. */
const TILE_PICTURE_RATIO = 1.2;
const TILE_PADDING = 8;
const TILE_GAP = 6;

export interface DayStripProps {
  shown: ISODate;
  today: ISODate;
  slotOrder: string[];
  /** Desktop: tiles with the most important entry of the day and "+3" (REQ-003). */
  tiles: boolean;
  /** A tap on a day shows the whole page for that day (D6, AC-021). */
  onSelect: (date: ISODate) => void;
  /** "+" of an empty tile: choose the day and open the add window (REQ-005, AC-020). */
  onAdd: (date: ISODate) => void;
}

/**
 * The Tagesleiste of the "Übersicht" (spec 0020, REQ-001): the seven days of the shown day's
 * Abschnitt (yesterday to today + 5 in today's), up to three dots per day in the colours of the
 * kinds and trips as stripes below (AC-004); on desktop tiles.
 */
export function DayStrip(props: DayStripProps) {
  const entries = usePlanEntries();
  const trips = useTrips();
  const members = useMembers();
  const section = overviewSection(props.shown, props.today);
  const stripes = tripStripes(trips, members).flatMap((stripe) => {
    const segment = stripeSegment(stripe, section.from, section.to);
    return segment ? [{ stripe, start: segment.start, end: segment.end }] : [];
  });

  return (
    <View testID="today-week" style={{ marginBottom: props.tiles ? 28 : 20 }}>
      <View style={{ flexDirection: 'row', gap: props.tiles ? 10 : 0 }}>
        {section.dates.map((date) =>
          props.tiles ? (
            <DayTile key={date} date={date} {...props} entries={entries} />
          ) : (
            <DayColumn key={date} date={date} {...props} entries={entries} />
          ),
        )}
      </View>
      {stripes.length > 0 ? (
        <View style={{ gap: 3, marginTop: 6 }}>
          {stripes.map((item) => (
            <StripeLine key={item.stripe.key} {...item} days={section.dates.length} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface DayProps extends DayStripProps {
  date: ISODate;
  entries: MealPlanEntry[];
}

function dayName(date: ISODate, today: ISODate): string {
  return `${date === today ? 'Heute, ' : ''}${weekdayLong(date)}, ${dayMonthLongLabel(date)}`;
}

function dayLabel(date: ISODate, today: ISODate, dots: KindRole[]): string {
  const kinds = dots.map((role) => KIND_LABELS[role]).join(', ');
  return `${dayName(date, today)}: ${kinds || 'nichts geplant'}`;
}

/** Phone: weekday, date in a circle (filled when chosen, ringed for today), the kinds' dots. */
function DayColumn(props: DayProps) {
  const theme = useTheme();
  const hover = useHover();
  const recipesById = useRecipesById();
  const { date } = props;
  const dots = dayDots(props.entries, date, recipesById);
  const selected = date === props.shown;
  const isToday = date === props.today;
  return (
    <Pressable
      testID={`today-week-${date}`}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(date, props.today, dots)}${selected ? ', gewählt' : ''}`}
      aria-selected={selected}
      onPress={() => props.onSelect(date)}
      // Hover only with a mouse, the ring only with the keyboard (spec 0019, REQ-002, REQ-003).
      style={(state) => [
        {
          flex: 1,
          alignItems: 'center',
          gap: 4,
          paddingVertical: 4,
          minHeight: 64,
          borderRadius: theme.shape.radius.control,
          opacity: state.pressed ? 0.7 : 1,
        },
        hover((state as PressState).hovered)
          ? { backgroundColor: theme.colors.surfaceSunken }
          : null,
        keyboardFocusRing(theme, (state as PressState).focused),
      ]}
    >
      <Text variant="caption" color={isToday ? 'accent' : 'muted'}>
        {weekdayShort(date)}
      </Text>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? theme.colors.text : 'transparent',
          borderWidth: isToday && !selected ? 1.5 : 0,
          borderColor: theme.colors.accent,
        }}
      >
        <Text
          variant="smallStrong"
          style={{ color: selected ? theme.colors.bg : theme.colors.text }}
        >
          {String(parseISODate(date).getDate())}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' }}>
        {dots.map((role) => (
          <View key={role} testID={`today-week-${date}-dot-${role}`}>
            <KindDot kind={role} size={6} />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/**
 * Desktop: a tile with the picture and title of the day's most important entry and "+3"
 * (REQ-003, REQ-004); an empty day shows "+" (REQ-005), which opens the add window. A tap
 * anywhere else only chooses the day (AC-021).
 */
function DayTile(props: DayProps) {
  const theme = useTheme();
  const hover = useHover();
  const online = useOnlineOnly();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const { date } = props;
  const { entry, more } = tileEntry(props.entries, date, props.slotOrder, recipesById);
  const dots = dayDots(props.entries, date, recipesById);
  const selected = date === props.shown;
  const isToday = date === props.today;
  const title = entry
    ? plannedTitle(entry, recipesById, props.entries, restaurantsById, activitiesById)
    : undefined;
  const head = isToday ? 'Heute' : weekdayShort(date);
  // The "+" lies over the picture, beside the tile's pressable: never a button in a button.
  const pictureTop = TILE_PADDING + theme.type.caption.lineHeight + TILE_GAP;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable
        testID={`today-week-${date}`}
        accessibilityRole="button"
        accessibilityLabel={`${dayLabel(date, props.today, dots)}${selected ? ', gewählt' : ''}`}
        aria-selected={selected}
        onPress={() => props.onSelect(date)}
        style={(state) => [
          {
            flex: 1,
            padding: TILE_PADDING,
            gap: TILE_GAP,
            borderRadius: theme.shape.radius.control,
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? theme.colors.accent : theme.colors.border,
            backgroundColor: hover((state as PressState).hovered)
              ? theme.colors.surfaceSunken
              : theme.colors.surface,
            opacity: state.pressed ? 0.7 : 1,
          },
          keyboardFocusRing(theme, (state as PressState).focused),
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" color={isToday || selected ? 'accent' : 'muted'}>
            {head}
          </Text>
          <Text variant="caption" color={isToday || selected ? 'accent' : 'muted'}>
            {String(parseISODate(date).getDate())}
          </Text>
        </View>
        {entry ? (
          <View>
            <EntryPicture entry={entry} aspectRatio={TILE_PICTURE_RATIO} />
            {more > 0 ? (
              <View style={{ position: 'absolute', right: 4, bottom: 4 }}>
                <Badge label={`+${more}`} testID={`today-week-${date}-more`} />
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              aspectRatio: TILE_PICTURE_RATIO,
              borderRadius: theme.shape.radius.photo,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.colors.border,
            }}
          />
        )}
        <Text
          variant="caption"
          numberOfLines={2}
          style={{ minHeight: theme.type.caption.lineHeight * 2 }}
          testID={`today-week-${date}-title`}
        >
          {title ?? 'frei'}
        </Text>
      </Pressable>
      {entry ? null : (
        <Pressable
          testID={`today-week-${date}-add`}
          accessibilityRole="button"
          accessibilityLabel={`Für ${dayName(date, props.today)} hinzufügen`}
          accessibilityHint={online.hint}
          aria-disabled={online.disabled}
          disabled={online.disabled}
          onPress={() => props.onAdd(date)}
          style={(state) => [
            {
              position: 'absolute',
              top: pictureTop,
              left: TILE_PADDING,
              right: TILE_PADDING,
              aspectRatio: TILE_PICTURE_RATIO,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.shape.radius.photo,
              opacity: online.disabled ? 0.4 : state.pressed ? 0.7 : 1,
            },
            hover((state as PressState).hovered) && !online.disabled
              ? { backgroundColor: theme.colors.surfaceSunken }
              : null,
            keyboardFocusRing(theme, (state as PressState).focused),
          ]}
        >
          <Icon name="plus" size={18} color="muted" />
        </Pressable>
      )}
    </View>
  );
}

/**
 * A trip below the days it covers, in the person's colour (rules of spec 0010); a draft is dashed
 * and carries "Entwurf" under its start (spec 0030, REQ-004).
 */
function StripeLine(props: { stripe: TripStripe; start: number; end: number; days: number }) {
  const membersById = useMembersById();
  const colors = useStripeColors(props.stripe, membersById);
  const left = `${(props.start / props.days) * 100}%` as const;
  return (
    <View
      testID={`today-week-stripe-${props.stripe.tripId}`}
      accessibilityLabel={stripeA11y(props.stripe, membersById)}
    >
      <View style={{ height: 4 }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left,
            width: `${((props.end - props.start + 1) / props.days) * 100}%`,
            borderRadius: 2,
            ...stripeLine(colors.edge, props.stripe.draft, 'top', 4),
          }}
        />
      </View>
      {props.stripe.draft ? (
        <View style={{ marginLeft: left, marginTop: 2 }}>
          <Text
            variant="caption"
            color="muted"
            testID={`today-week-stripe-${props.stripe.tripId}-draft`}
          >
            Entwurf
          </Text>
        </View>
      ) : null}
    </View>
  );
}
