import {
  MIN_RATINGS,
  minRatingLabel,
  PRICE_LEVELS,
  priceLabel,
  toggleRestaurantFavorites,
  type CuisineFacet,
  type RestaurantListFilter,
} from '@housekeeping/core';
import { Chip, Row, Text, useBreakpoint } from '@housekeeping/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

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
 * The fields of the filter panel on "Essen → Restaurants" (spec 0008, REQ-005): Schnell
 * (Favoriten), Küche from the household's restaurants (left out when none has one), Preisniveau
 * (several) and the own rating. Every tap applies at once.
 */
export function RestaurantFilterPanel(props: {
  filter: RestaurantListFilter;
  onChange: (filter: RestaurantListFilter) => void;
  cuisines: readonly CuisineFacet[];
}) {
  const { filter, onChange } = props;
  const { isPhone } = useBreakpoint();

  return (
    <View
      style={
        isPhone
          ? { gap: 16 }
          : { flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 16 }
      }
    >
      <Part title="Schnell" testID="restaurant-filter-quick">
        <Chip
          label="Favoriten"
          selected={filter.favorites}
          onPress={() => onChange(toggleRestaurantFavorites(filter))}
          testID="restaurant-filter-quick-favorites"
        />
      </Part>
      {props.cuisines.length > 0 ? (
        <Part title="Küche" testID="restaurant-filter-cuisine">
          {props.cuisines.map((facet) => (
            <Chip
              key={facet.key}
              label={`${facet.label} ${facet.count}`}
              selected={filter.cuisines.includes(facet.key)}
              onPress={() =>
                onChange({ ...filter, cuisines: toggleIn(filter.cuisines, facet.key) })
              }
              testID={`restaurant-filter-cuisine-${facet.key}`}
            />
          ))}
        </Part>
      ) : null}
      <Part title="Preisniveau" testID="restaurant-filter-price">
        {PRICE_LEVELS.map((level) => (
          <Chip
            key={level}
            label={priceLabel(level)}
            selected={filter.priceLevels.includes(level)}
            onPress={() =>
              onChange({ ...filter, priceLevels: toggleIn(filter.priceLevels, level) })
            }
            testID={`restaurant-filter-price-${level}`}
          />
        ))}
      </Part>
      <Part title="Bewertung" testID="restaurant-filter-rating">
        {MIN_RATINGS.map((stars) => (
          <Chip
            key={stars}
            label={minRatingLabel(stars)}
            selected={filter.minRating === stars}
            onPress={() =>
              onChange({ ...filter, minRating: filter.minRating === stars ? undefined : stars })
            }
            testID={`restaurant-filter-rating-${String(stars).replace('.', '-')}`}
          />
        ))}
      </Part>
    </View>
  );
}
