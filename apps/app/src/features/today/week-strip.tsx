import { photoSource, usePlanEntries, useRecipesById, useRestaurantsById } from '@housekeeping/api';
import {
  entriesForDay,
  isoWeekNumber,
  parseISODate,
  weekDates,
  weekdayShort,
  type ISODate,
  type MealPlanEntry,
  type Recipe,
} from '@housekeeping/core';
import { Icon, Photo, Section, Text, useTheme } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

interface DayView {
  date: ISODate;
  entry?: MealPlanEntry;
  recipe?: Recipe;
  title?: string;
}

/** The main dish of a day: the latest meal slot with something planned. */
function mainEntry(entries: MealPlanEntry[]): MealPlanEntry | undefined {
  return entries[entries.length - 1];
}

/** "Diese Woche": the seven days of the current week with what is planned (F2). */
export function WeekStrip(props: { today: ISODate; slotOrder: string[]; compact: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const planEntries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();

  const days: DayView[] = weekDates(props.today).map((date) => {
    const entry = mainEntry(entriesForDay(planEntries, date, props.slotOrder));
    const recipe = entry?.recipeId ? recipesById[entry.recipeId] : undefined;
    const restaurant =
      entry?.kind === 'restaurant' && entry.restaurantId
        ? restaurantsById[entry.restaurantId]
        : undefined;
    const title = entry
      ? entry.kind === 'leftovers'
        ? `Reste ${recipe?.title ?? ''}`.trim()
        : (recipe?.title ?? restaurant?.name ?? entry.text)
      : undefined;
    return { date, entry, recipe, title };
  });

  const tile = (day: DayView) => {
    const isToday = day.date === props.today;
    const label = `${isToday ? 'Heute' : weekdayShort(day.date)} ${parseISODate(day.date).getDate()}.`;
    return (
      <Pressable
        key={day.date}
        testID={`today-week-${day.date}`}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${day.title ?? 'nichts geplant'}`}
        onPress={() => router.push('/plan')}
        style={(state) => ({
          flex: props.compact ? undefined : 1,
          width: props.compact ? 76 : undefined,
          minWidth: 0,
          padding: 8,
          gap: 6,
          borderRadius: theme.shape.radius.control,
          borderWidth: isToday ? 2 : 1,
          borderColor: isToday ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.surface,
          opacity: state.pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" color={isToday ? 'accent' : 'muted'}>
            {isToday ? 'Heute' : weekdayShort(day.date)}
          </Text>
          <Text variant="caption" color={isToday ? 'accent' : 'muted'}>
            {parseISODate(day.date).getDate()}
          </Text>
        </View>
        {day.entry ? (
          <Photo
            source={photoSource(day.recipe?.photo)}
            aspectRatio={1.2}
            placeholderIcon="utensils"
          />
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
        {props.compact ? null : (
          <Text variant="caption" numberOfLines={2}>
            {day.title ?? 'frei'}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <Section
      title="Diese Woche"
      meta={`KW ${isoWeekNumber(props.today)}`}
      tone="plan"
      testID="today-week"
    >
      {props.compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {days.map(tile)}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>{days.map(tile)}</View>
      )}
    </Section>
  );
}
