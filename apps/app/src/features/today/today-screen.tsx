import {
  rateRecipe,
  useCurrentMember,
  useHousehold,
  usePlanEntries,
  useRecipesById,
  useToday,
} from '@housekeeping/api';
import { addDays, entriesForDay, formatLongDate } from '@housekeeping/core';
import { Row, Screen, ScreenHeader, Stars, Surface, Text, useBreakpoint } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { StartPageActions } from '@/features/shell/profile-button';

import { TodayChores } from './today-chores';
import { TodayMeals } from './today-meals';
import { TodayShopping } from './today-shopping';
import { WeekStrip } from './week-strip';

function greeting(hour: number): string {
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Guten Tag';
  return 'Guten Abend';
}

/** "Übersicht" (tab, spec 0005 REQ-011): the day at a glance (F2, AC-017). */
export function TodayScreen() {
  const { isPhone, bp } = useBreakpoint();
  // The time of day only picks the greeting; the date itself comes from useToday().
  const [hour] = useState(() => new Date().getHours());
  const today = useToday();
  const me = useCurrentMember();
  const household = useHousehold();
  const planEntries = usePlanEntries();
  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);
  const slotOrder = slots.map((slot) => slot.id);
  const slotNames = Object.fromEntries(slots.map((slot) => [slot.id, slot.name]));

  const todayEntries = entriesForDay(planEntries, today, slotOrder);
  const tomorrowEntries = entriesForDay(planEntries, addDays(today, 1), slotOrder);

  const header = (
    <ScreenHeader
      kicker={formatLongDate(today)}
      title={`${greeting(hour)}, ${me.name}`}
      right={isPhone ? <StartPageActions /> : undefined}
    />
  );

  const meals = (
    <TodayMeals entries={todayEntries} tomorrowEntries={tomorrowEntries} slotNames={slotNames} />
  );

  if (isPhone) {
    return (
      <Screen testID="today-screen" header={header}>
        <Recap />
        {meals}
        <TodayChores />
        <TodayShopping preview={false} />
        <WeekStrip today={today} slotOrder={slotOrder} compact />
      </Screen>
    );
  }

  return (
    <Screen testID="today-screen" header={header}>
      <View
        style={{ flexDirection: 'row', gap: bp === 'desktop' ? 48 : 28, alignItems: 'flex-start' }}
      >
        <View style={{ flex: 1.6, minWidth: 0 }}>
          {meals}
          <WeekStrip today={today} slotOrder={slotOrder} compact={bp !== 'desktop'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Recap />
          <TodayChores />
          <TodayShopping preview />
        </View>
      </View>
    </Screen>
  );
}

/** "Wie war's?": rate yesterday's dish with one tap (F2). */
function Recap() {
  const today = useToday();
  const household = useHousehold();
  const planEntries = usePlanEntries();
  const recipesById = useRecipesById();
  const me = useCurrentMember();
  const online = useOnlineOnly();
  const slotOrder = [...household.mealSlots].sort((a, b) => a.sort - b.sort).map((slot) => slot.id);
  const cooked = entriesForDay(planEntries, addDays(today, -1), slotOrder)
    .filter((entry) => entry.kind === 'recipe' && !entry.notCooked)
    .flatMap((entry) => {
      const recipe = entry.recipeId ? recipesById[entry.recipeId] : undefined;
      return recipe ? [recipe] : [];
    });
  const recipe = cooked[cooked.length - 1];
  if (!recipe) return null;
  const mine = recipe.ratings[me.id] ?? 0;
  return (
    <Surface testID="recap" style={{ marginBottom: 22, gap: 6 }}>
      <Text variant="smallStrong" color="muted">
        Wie war’s?
      </Text>
      <Row justify="space-between" wrap gap={10}>
        <Text variant="cardTitle" style={{ flexShrink: 1 }}>
          Gestern: {recipe.title}
        </Text>
        <Stars
          value={mine}
          onChange={online.disabled ? undefined : (stars) => rateRecipe(recipe.id, stars)}
          testID="recap-stars"
        />
      </Row>
    </Surface>
  );
}
