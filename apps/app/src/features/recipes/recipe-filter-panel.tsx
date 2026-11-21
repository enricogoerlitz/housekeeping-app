import {
  courseLabel,
  isQuickFilterActive,
  MIN_RATINGS,
  minRatingLabel,
  QUICK_FILTERS,
  TIME_LIMITS,
  timeLimitLabel,
  toggleQuickFilter,
  type Course,
  type CuisineFacet,
  type QuickFilter,
  type RecipeListFilter,
} from '@housekeeping/core';
import { Chip, Row, Text, useBreakpoint } from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Gerichtart in the panel, in the order of the concept (Konzept v2, 3.2). */
const COURSES: readonly Course[] = ['main', 'side', 'dessert', 'breakfast', 'snack', 'drink'];

/** "Schnell" without the diets, which have their own section "Ernährung" (Konzept v2, 3.2). */
const PANEL_QUICK = QUICK_FILTERS.filter(
  (chip) => chip.value !== 'vegetarian' && chip.value !== 'vegan',
);
const DIETS = QUICK_FILTERS.filter((chip) => chip.value === 'vegan' || chip.value === 'vegetarian');

function toggleIn<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function Part(props: { title: string; children: ReactNode; testID: string }) {
  return (
    <View style={{ gap: 8 }} testID={props.testID}>
      <Text variant="smallStrong">{props.title}</Text>
      <Row wrap gap={8}>
        {props.children}
      </Row>
    </View>
  );
}

/**
 * The fields of the filter panel on "Essen → Rezepte" (spec 0008, REQ-002): Schnell, Ernährung,
 * Gerichtart, Küche from the household's recipes (left out when none has one, AC-009), Zeit and
 * Bewertung. Every tap applies at once.
 */
export function RecipeFilterPanel(props: {
  filter: RecipeListFilter;
  onChange: (filter: RecipeListFilter) => void;
  cuisines: readonly CuisineFacet[];
}) {
  const { filter, onChange } = props;
  const { isPhone } = useBreakpoint();
  const quick = (chip: { value: QuickFilter; label: string }, part: string) => (
    <Chip
      key={chip.value}
      label={chip.label}
      selected={isQuickFilterActive(filter, chip.value)}
      onPress={() => onChange(toggleQuickFilter(filter, chip.value))}
      testID={`recipe-filter-${part}-${chip.value}`}
    />
  );

  return (
    <View
      style={
        isPhone
          ? { gap: 16 }
          : { flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 16 }
      }
    >
      <Part title="Schnell" testID="recipe-filter-quick">
        {PANEL_QUICK.map((chip) => quick(chip, 'quick'))}
      </Part>
      <Part title="Ernährung" testID="recipe-filter-diet">
        {DIETS.map((chip) => quick(chip, 'diet'))}
      </Part>
      <Part title="Gerichtart" testID="recipe-filter-course">
        {COURSES.map((course) => (
          <Chip
            key={course}
            label={courseLabel(course)}
            selected={filter.courses.includes(course)}
            onPress={() => onChange({ ...filter, courses: toggleIn(filter.courses, course) })}
            testID={`recipe-filter-course-${course}`}
          />
        ))}
      </Part>
      {props.cuisines.length > 0 ? (
        <Part title="Küche" testID="recipe-filter-cuisine">
          {props.cuisines.map((facet) => (
            <Chip
              key={facet.key}
              label={`${facet.label} ${facet.count}`}
              selected={filter.cuisines.includes(facet.key)}
              onPress={() =>
                onChange({ ...filter, cuisines: toggleIn(filter.cuisines, facet.key) })
              }
              testID={`recipe-filter-cuisine-${facet.key}`}
            />
          ))}
        </Part>
      ) : null}
      <Part title="Zeit" testID="recipe-filter-time">
        {TIME_LIMITS.map((minutes) => (
          <Chip
            key={minutes}
            label={timeLimitLabel(minutes)}
            selected={filter.maxMinutes === minutes}
            onPress={() =>
              onChange({
                ...filter,
                maxMinutes: filter.maxMinutes === minutes ? undefined : minutes,
              })
            }
            testID={`recipe-filter-time-${minutes}`}
          />
        ))}
      </Part>
      <Part title="Bewertung" testID="recipe-filter-rating">
        {MIN_RATINGS.map((stars) => (
          <Chip
            key={stars}
            label={minRatingLabel(stars)}
            selected={filter.minRating === stars}
            onPress={() =>
              onChange({ ...filter, minRating: filter.minRating === stars ? undefined : stars })
            }
            testID={`recipe-filter-rating-${String(stars).replace('.', '-')}`}
          />
        ))}
      </Part>
    </View>
  );
}
