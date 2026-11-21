import {
  addPlanEntry,
  splitForEaters,
  useAbsences,
  useHousehold,
  useMembers,
  useMembersById,
  useToday,
} from '@housekeeping/api';
import {
  defaultPlanChoice,
  pagePlanChoice,
  planButtonLabel,
  plannedNotice,
  planWeek,
  weekdayShort,
  weekDays,
  withPlanDay,
  type PlanChoice,
  type Recipe,
} from '@housekeeping/core';
import { Button, Chip, ChoiceChips, IconButton, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { CookPicker, EaterPicker, FieldLabel, SplitFields } from './plan-fields';

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Das hat nicht geklappt.';

/**
 * "Einplanen" on the recipe page (spec 0008, REQ-009, E11): a medium window with the week (‹ ›
 * without limit), the days Mo to So, "Ohne Tag vormerken", the Tageszeit, "Wer isst mit?", the
 * split over the variants and "Wer kocht?". It opens on today and the last Tageszeit; afterwards
 * the page stays and a notice offers "Ansehen" in the calendar.
 */
export function PlanRecipeSheet(props: { recipe: Recipe; onClose: () => void }) {
  const { recipe } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const today = useToday();
  const household = useHousehold();
  const members = useMembers();
  const membersById = useMembersById();
  const absences = useAbsences();
  const slots = [...household.mealSlots].sort((a, b) => a.sort - b.sort);

  const [weekOffset, setWeekOffset] = useState(0);
  const [choice, setChoice] = useState<PlanChoice>(() =>
    defaultPlanChoice(today, household.mealSlots, members, absences),
  );
  const [error, setError] = useState<string | undefined>();

  const week = planWeek(today, weekOffset);
  const days = weekDays(week.start);
  const slotName = slots.find((slot) => slot.id === choice.slotId)?.name ?? '';
  const split = splitForEaters(recipe.id, choice.eaterIds, choice.guests);
  const misfits = split.misfitMemberIds.flatMap((id) => membersById[id] ?? []);
  const noEaters = choice.eaterIds.length + choice.guests === 0;

  const update = (next: PlanChoice) => {
    setChoice(next);
    setError(undefined);
  };
  const page = (weeks: number) => {
    setWeekOffset(weekOffset + weeks);
    update(pagePlanChoice(choice, weeks, members, absences));
  };
  const toggleLater = () => {
    if (choice.date !== null) {
      update(withPlanDay(choice, null, members, absences));
      return;
    }
    // Back to a day: today's weekday in the week on screen.
    const day = days.find((candidate) => candidate.label === weekdayShort(today)) ?? days[0];
    if (day) update(withPlanDay(choice, day.date, members, absences));
  };

  const save = () => {
    if (online.disabled || noEaters || !choice.slotId) return;
    const { date } = choice;
    try {
      addPlanEntry({
        date,
        slotId: choice.slotId,
        kind: 'recipe',
        recipeId: recipe.id,
        eaterIds: choice.eaterIds,
        guests: choice.guests,
        cookId: choice.cookId,
        portions: split.portions,
        variants: split.variants,
      });
    } catch (caught) {
      setError(message(caught));
      return;
    }
    props.onClose();
    toast.show({
      message: plannedNotice(date, slotName),
      actionLabel: 'Ansehen',
      // AC-035: the calendar opens the week of that day; "Vorgemerkt" opens the calendar.
      onAction: () =>
        router.navigate(date ? { pathname: '/kalender', params: { tag: date } } : '/kalender'),
    });
  };

  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Einplanen"
      size="m"
      testID="plan-recipe-sheet"
      footer={
        <Button
          label={planButtonLabel(choice.date, slotName)}
          icon="calendar-plus"
          full
          disabled={online.disabled || noEaters || !choice.slotId}
          hint={
            online.hint ??
            (noEaters
              ? 'Wähl aus, wer mitisst.'
              : choice.slotId
                ? undefined
                : 'Lege zuerst eine Tageszeit an.')
          }
          onPress={save}
          testID="plan-recipe-save"
        />
      }
    >
      <Stack gap={18}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <Text variant="cardTitle" numberOfLines={2} testID="plan-recipe-title">
          {recipe.title}
        </Text>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <IconButton
              icon="chevron-left"
              label="Woche davor"
              onPress={() => page(-1)}
              testID="plan-recipe-week-prev"
            />
            <Text variant="bodyStrong" align="center" style={{ flex: 1 }} testID="plan-recipe-week">
              {week.label}
            </Text>
            <IconButton
              icon="chevron-right"
              label="Woche danach"
              onPress={() => page(1)}
              testID="plan-recipe-week-next"
            />
          </View>
          <ChoiceChips
            label="Tag"
            options={days.map((day) => ({ value: day.date, label: day.label }))}
            // No day is chosen while "Ohne Tag vormerken" is on.
            value={choice.date ?? ''}
            onChange={(date) => update(withPlanDay(choice, date, members, absences))}
            testID="plan-recipe-day"
          />
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label="Ohne Tag vormerken"
              icon="bookmark"
              selected={choice.date === null}
              onPress={toggleLater}
              testID="plan-recipe-later"
            />
          </View>
        </View>
        {slots.length > 0 ? (
          <View>
            <FieldLabel>Tageszeit</FieldLabel>
            <ChoiceChips
              label="Tageszeit"
              options={slots.map((slot) => ({ value: slot.id, label: slot.name }))}
              value={choice.slotId ?? ''}
              onChange={(slotId) => update({ ...choice, slotId })}
              testID="plan-recipe-slot"
            />
          </View>
        ) : null}
        <EaterPicker
          members={members}
          eaterIds={choice.eaterIds}
          guests={choice.guests}
          onEaters={(eaterIds) => update({ ...choice, eaterIds })}
          onGuests={(guests) => update({ ...choice, guests })}
        />
        <SplitFields recipe={recipe} split={split} misfits={misfits} testID="plan-recipe" />
        <CookPicker
          members={members}
          cookId={choice.cookId}
          onChange={(cookId) => update({ ...choice, cookId })}
        />
        {error ? (
          <Text variant="small" color="warn" testID="plan-recipe-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
