import {
  splitForEaters,
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
  refreshPlanEaters,
  weekdayShort,
  weekDays,
  weekOffsetFor,
  withPlanDay,
  type PlanChoice,
  type PlanEntryVariant,
  type Recipe,
} from '@housekeeping/core';
import { Chip, ChoiceChips, IconButton, Row, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { PlanDateCalendar } from '@/lib/plan-date-calendar';
import { useOnlineOnly } from '@/features/shell/offline';

import { CookPicker, EaterPicker, FieldLabel, PortionFields, usePortions } from './plan-fields';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

const message = (error: unknown) => errorMessage(error, FAILED_MESSAGE);

/** What "Wer isst mit?" means for a recipe or a collection: portions over its variants. */
export interface PlanSplit {
  portions: number;
  variants: PlanEntryVariant[];
}

/**
 * The one window "Einplanen" (spec 0023, REQ-013, Decision 14) for recipes and collections, later
 * also restaurants and activities (spec 0024): the week (‹ › without limit) with day chips "Mi"
 * over "25.11.", "Ohne Tag vormerken", "Anderes Datum …" (a month calendar in the window), the
 * Tageszeit, "Wer isst mit?", for a recipe the split over its variants, and "Wer kocht?". It opens
 * on today and the last Tageszeit; while "Wer isst mit?" is untouched the preselection follows
 * members arriving later. Afterwards the page stays and a notice offers "Ansehen".
 */
export function PlanSheet(props: {
  /** The name of what is planned, shown on top. */
  title: string;
  /** A recipe or a collection: the split over its variants and the cook. */
  recipe?: Recipe;
  /**
   * More fields under the Tageszeit: "Uhrzeit (optional)" and "Zusatz" of a restaurant or an
   * activity (spec 0024, REQ-005); a function sees the choice (no time while "vorgemerkt").
   */
  extra?: ReactNode | ((choice: PlanChoice) => ReactNode);
  /** "Wer isst mit?"; an activity has none (spec 0024, REQ-006). Default true. */
  eaters?: boolean;
  /**
   * Spec 0041, REQ-005: an activity's "Wer ist dabei?", which may stay empty (`optional`).
   */
  eatersLabel?: string;
  eatersOptional?: boolean;
  /** The notice after planning instead of "Am Do 26.11. Abend eingeplant" (a series, spec 0041). */
  notice?: (choice: PlanChoice) => string | undefined;
  /** The Tageszeit it opens with: the last ("Abend"), or the first for an activity (REQ-006). */
  slot?: 'first' | 'last';
  /** Adds the entry; a thrown error is shown in the window. */
  onPlan: (choice: PlanChoice, split: PlanSplit | undefined) => void;
  onClose: () => void;
}) {
  const { recipe } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const today = useToday();
  const household = useHousehold();
  const members = useMembers();
  const membersById = useMembersById();
  const slots = household.mealSlots;

  const [weekOffset, setWeekOffset] = useState(0);
  const [choice, setChoice] = useState<PlanChoice>(() =>
    defaultPlanChoice(today, household.mealSlots, members, props.slot),
  );
  // AC-055, AC-056: members that arrive later count while the eaters are untouched.
  const [touched, setTouched] = useState(false);
  const [seen, setSeen] = useState(members);
  // Spec 0021, REQ-006: counters for portions and variants that follow eaters and guests.
  const portions = usePortions(recipe, () => {
    const first = recipe ? splitForEaters(recipe.id, choice.eaterIds, choice.guests) : undefined;
    return {
      eaterIds: choice.eaterIds,
      guests: choice.guests,
      portions: first?.portions ?? 0,
      variants: (recipe?.variants ?? []).map((variant) => ({
        variantId: variant.id,
        portions: first?.variants.find((row) => row.variantId === variant.id)?.portions ?? 0,
      })),
    };
  });
  if (seen !== members) {
    setSeen(members);
    const refreshed = refreshPlanEaters(choice, touched, members);
    if (refreshed.eaterIds !== choice.eaterIds)
      portions.reset(refreshed.eaterIds, refreshed.guests);
    setChoice(refreshed);
  }
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const week = planWeek(today, weekOffset);
  const days = weekDays(week.start);
  const slotName = slots.find((slot) => slot.id === choice.slotId)?.name ?? '';
  const split = recipe ? splitForEaters(recipe.id, choice.eaterIds, choice.guests) : undefined;
  const misfits = split ? split.misfitMemberIds.flatMap((id) => membersById[id] ?? []) : [];
  const withEaters = props.eaters !== false;
  const noEaters =
    withEaters && !props.eatersOptional && choice.eaterIds.length + choice.guests === 0;

  const update = (next: PlanChoice, counted = false) => {
    // New eaters or guests start the counters over; a choice made in the counters counts on.
    if (!counted && (next.eaterIds !== choice.eaterIds || next.guests !== choice.guests)) {
      portions.reset(next.eaterIds, next.guests);
    }
    setChoice(next);
    setError(undefined);
  };
  // Another day keeps "Wer isst mit?" and the counters (spec 0030, AC-031).
  const toDay = (date: string | null) => update(withPlanDay(choice, date));
  const page = (weeks: number) => {
    setWeekOffset(weekOffset + weeks);
    update(pagePlanChoice(choice, weeks));
  };
  const toggleLater = () => {
    if (choice.date !== null) {
      toDay(null);
      return;
    }
    // Back to a day: today's weekday in the week on screen.
    const day = days.find((candidate) => candidate.label === weekdayShort(today)) ?? days[0];
    if (day) toDay(day.date);
  };
  // "Anderes Datum …" (AC-054): the tapped day is chosen and its week shown.
  const pickDate = (date: string) => {
    setPicking(false);
    setWeekOffset(weekOffsetFor(today, date));
    toDay(date);
  };

  const save = () => {
    if (online.disabled || noEaters || !choice.slotId) return;
    const { date } = choice;
    try {
      props.onPlan(
        choice,
        split
          ? {
              portions: portions.state.portions,
              variants: portions.state.variants,
            }
          : undefined,
      );
    } catch (caught) {
      setError(message(caught));
      return;
    }
    props.onClose();
    toast.show({
      message: props.notice?.(choice) ?? plannedNotice(date, slotName, today),
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
      actions={{
        primary: {
          label: planButtonLabel(choice.date, slotName),
          icon: 'calendar-plus',
          disabled: online.disabled || noEaters || !choice.slotId,
          hint:
            online.hint ??
            (noEaters
              ? 'Wähl aus, wer mitisst.'
              : choice.slotId
                ? undefined
                : 'Lege zuerst eine Tageszeit an.'),
          onPress: save,
          testID: 'plan-recipe-save',
        },
      }}
    >
      <Stack gap={18}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        <Text variant="cardTitle" numberOfLines={2} testID="plan-recipe-title">
          {props.title}
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
            options={days.map((day) => ({ value: day.date, label: day.label, detail: day.detail }))}
            // No day is chosen while "Ohne Tag vormerken" is on.
            value={choice.date ?? ''}
            onChange={toDay}
            // Spec 0030, REQ-005: seven equal chips, so paging the week never shifts them.
            fill
            testID="plan-recipe-day"
          />
          <Row gap={8} wrap>
            <Chip
              label="Ohne Tag vormerken"
              icon="bookmark"
              selected={choice.date === null}
              onPress={toggleLater}
              testID="plan-recipe-later"
            />
            <Chip
              label="Anderes Datum …"
              icon="calendar-days"
              selected={picking}
              onPress={() => setPicking(!picking)}
              testID="plan-recipe-other-date"
            />
          </Row>
          {picking ? (
            <PlanDateCalendar
              month={week.start}
              today={today}
              marked={choice.date}
              onSelect={pickDate}
              testID="plan-recipe-calendar"
            />
          ) : null}
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
        {typeof props.extra === 'function' ? props.extra(choice) : props.extra}
        {withEaters ? (
          <EaterPicker
            label={props.eatersLabel}
            members={members}
            eaterIds={choice.eaterIds}
            guests={choice.guests}
            onEaters={(eaterIds) => {
              setTouched(true);
              portions.setEaters(eaterIds);
              update({ ...choice, eaterIds }, true);
            }}
            onGuests={(guests) => {
              setTouched(true);
              portions.setGuests(guests);
              update({ ...choice, guests }, true);
            }}
          />
        ) : null}
        {recipe && split ? (
          <PortionFields
            recipe={recipe}
            state={portions.state}
            onChange={portions.setState}
            misfits={misfits}
            testID="plan-recipe"
          />
        ) : null}
        {recipe ? (
          <CookPicker
            members={members}
            cookId={choice.cookId}
            onChange={(cookId) => update({ ...choice, cookId })}
          />
        ) : null}
        {error ? (
          <Text variant="small" color="warn" testID="plan-recipe-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
