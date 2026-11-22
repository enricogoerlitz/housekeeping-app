import {
  useTrips,
  useActivitiesById,
  useMembers,
  useMembersById,
  usePhoto,
  usePlanEntries,
  useRecipeImage,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  tripStripes,
  dayDots,
  dayMonthLongLabel,
  dayTile,
  parseISODate,
  stripeSegment,
  weekDates,
  weekdayLong,
  weekdayShort,
  type TripStripe,
  type Activity,
  type ISODate,
  type KindRole,
  type MealPlanEntry,
  type Recipe,
} from '@housekeeping/core';
import { Badge, Icon, KindDot, Photo, Text, useTheme } from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { stripeA11y, useStripeColors } from '@/features/calendar/calendar-parts';
import { entryTitle } from '@/features/meal-plan/labels';

const KIND_NAMES: Record<KindRole, string> = {
  recipe: 'Rezept',
  collection: 'Sammlung',
  restaurant: 'Restaurant',
  activity: 'Aktivität',
  chore: 'Aufgabe',
};

export interface WeekStripProps {
  shown: ISODate;
  today: ISODate;
  slotOrder: string[];
  /** Desktop: tiles with the photo and title of the day's first entry and "+2" (AC-006). */
  tiles: boolean;
  /** A tap on a day shows the whole page for that day (D6, AC-002). */
  onSelect: (date: ISODate) => void;
  /** Read out with the strip, e.g. "Diese Woche · KW 47". */
  label: string;
}

/**
 * The week of the shown day at the top of the "Übersicht" (spec 0011, REQ-001): up to three dots
 * per day in the colours of the kinds, trips as stripes below (AC-005); on desktop tiles.
 */
export function WeekStrip(props: WeekStripProps) {
  const entries = usePlanEntries();
  const trips = useTrips();
  const members = useMembers();
  const week = weekDates(props.shown);
  const first = week[0] ?? props.shown;
  const last = week[6] ?? props.shown;
  const stripes = tripStripes(trips, members).flatMap((stripe) => {
    const segment = stripeSegment(stripe, first, last);
    return segment ? [{ stripe, start: segment.start, end: segment.end }] : [];
  });

  return (
    <View
      testID="today-week"
      accessibilityLabel={props.label}
      style={{ marginBottom: props.tiles ? 28 : 20 }}
    >
      <View style={{ flexDirection: 'row', gap: props.tiles ? 10 : 0 }}>
        {week.map((date) =>
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
            <StripeLine key={item.stripe.key} {...item} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface DayProps extends WeekStripProps {
  date: ISODate;
  entries: MealPlanEntry[];
}

function dayLabel(date: ISODate, today: ISODate, dots: KindRole[]): string {
  const day = `${date === today ? 'Heute, ' : ''}${weekdayLong(date)}, ${dayMonthLongLabel(date)}`;
  const kinds = dots.map((role) => KIND_NAMES[role]).join(', ');
  return kinds ? `${day}: ${kinds}` : `${day}: nichts geplant`;
}

/** Phone: weekday, date in a circle (filled when chosen, ringed for today), the kinds' dots. */
function DayColumn(props: DayProps) {
  const theme = useTheme();
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
      accessibilityState={{ selected }}
      onPress={() => props.onSelect(date)}
      style={(state) => ({
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        minHeight: 64,
        opacity: state.pressed ? 0.7 : 1,
      })}
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

/** Desktop: a tile with the photo and title of the day's first entry and "+2" (AC-006). */
function DayTile(props: DayProps) {
  const theme = useTheme();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const { date } = props;
  const { first, more } = dayTile(props.entries, date, props.slotOrder);
  const dots = dayDots(props.entries, date, recipesById);
  const selected = date === props.shown;
  const isToday = date === props.today;
  const title = first
    ? entryTitle(first, recipesById, props.entries, restaurantsById, activitiesById)
    : undefined;
  const recipe =
    first?.recipeId && (first.kind === 'recipe' || first.kind === 'leftovers')
      ? recipesById[first.recipeId]
      : undefined;
  const activity =
    first?.kind === 'activity' && first.activityId ? activitiesById[first.activityId] : undefined;
  const head = isToday ? 'Heute' : weekdayShort(date);
  return (
    <Pressable
      testID={`today-week-${date}`}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(date, props.today, dots)}${selected ? ', gewählt' : ''}`}
      accessibilityState={{ selected }}
      onPress={() => props.onSelect(date)}
      style={(state) => ({
        flex: 1,
        minWidth: 0,
        padding: 8,
        gap: 6,
        borderRadius: theme.shape.radius.control,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: state.pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color={isToday || selected ? 'accent' : 'muted'}>
          {head}
        </Text>
        <Text variant="caption" color={isToday || selected ? 'accent' : 'muted'}>
          {String(parseISODate(date).getDate())}
        </Text>
      </View>
      {first ? (
        <View>
          <TilePhoto recipe={recipe} activity={activity} restaurant={first.kind === 'restaurant'} />
          {more > 0 ? (
            <View style={{ position: 'absolute', right: 4, bottom: 4 }}>
              <Badge label={`+${more}`} testID={`today-week-${date}-more`} />
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            aspectRatio: 1.2,
            borderRadius: theme.shape.radius.photo,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={18} color="muted" />
        </View>
      )}
      <Text variant="caption" numberOfLines={2} style={{ minHeight: 32 }}>
        {title ?? 'frei'}
      </Text>
    </Pressable>
  );
}

function TilePhoto(props: { recipe?: Recipe; activity?: Activity; restaurant: boolean }) {
  const recipeImage = useRecipeImage(props.recipe);
  const activityPhoto = usePhoto(props.activity?.photoPath);
  const source = props.activity
    ? activityPhoto.uri
      ? { uri: activityPhoto.uri }
      : undefined
    : recipeImage;
  return (
    <Photo
      source={source}
      aspectRatio={1.2}
      placeholderIcon={props.activity ? 'mountain' : props.restaurant ? 'utensils' : 'chef-hat'}
    />
  );
}

/** A trip below the days it covers, in the person's colour (rules of spec 0010). */
function StripeLine(props: { stripe: TripStripe; start: number; end: number }) {
  const membersById = useMembersById();
  const colors = useStripeColors(props.stripe, membersById);
  return (
    <View
      style={{ height: 4 }}
      testID={`today-week-stripe-${props.stripe.tripId}`}
      accessibilityLabel={stripeA11y(props.stripe, membersById)}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(props.start / 7) * 100}%`,
          width: `${((props.end - props.start + 1) / 7) * 100}%`,
          borderRadius: 2,
          backgroundColor: colors.edge,
        }}
      />
    </View>
  );
}
