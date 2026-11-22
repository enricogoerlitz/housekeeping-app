import { snapshot, takeTravellersOut, useMembers, useShoppingItems } from '@housekeeping/api';
import {
  tripMealLine,
  tripMealsDoneText,
  tripMealsTitle,
  type TripMealOffer,
} from '@housekeeping/core';
import { Button, CheckRow, List, Row, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useCalendarData } from '@/features/calendar/calendar-data';
import { FAILED } from '@/features/packing/packing-labels';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';

/**
 * After saving a trip (spec 0022, REQ-007, K-02): "3 Gerichte im Zeitraum – Enrico rausnehmen?"
 * with one ticked row per dish ("Mi 2.12. · Mittag · Shakshuka · danach vorgemerkt"),
 * "Rausnehmen (n)" and "So lassen". Taking them out is one call; 5 s "Rückgängig" undoes it all,
 * the trip stays. Online only.
 */
export function TripMealsDialog(props: { offers: TripMealOffer[]; onDone: () => void }) {
  const members = useMembers();
  const data = useCalendarData();
  const items = useShoppingItems();
  const online = useOnlineOnly();
  const [chosen, setChosen] = useState(() => new Set(props.offers.map((offer) => offer.entry.id)));
  const picked = props.offers.filter((offer) => chosen.has(offer.entry.id));
  const onList = props.offers.some((offer) =>
    items.some((item) =>
      item.contributions.some(
        (contribution) =>
          contribution.source.kind === 'recipe' && contribution.source.entryId === offer.entry.id,
      ),
    ),
  );

  const toggle = (entryId: string) => {
    const next = new Set(chosen);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setChosen(next);
  };

  const take = () => {
    if (online.disabled || picked.length === 0) return;
    const restore = snapshot();
    try {
      takeTravellersOut(
        picked.map((offer) => ({ entryId: offer.entry.id, memberIds: offer.memberIds })),
      );
    } catch {
      toast.show({ message: FAILED });
      return;
    }
    props.onDone();
    toast.show({
      message: tripMealsDoneText(picked, members),
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      duration: 5000,
    });
  };

  return (
    <Sheet
      visible
      size="m"
      title={tripMealsTitle(props.offers, members)}
      onClose={props.onDone}
      testID="trip-meals"
      footer={
        <Row gap={10} style={{ justifyContent: 'flex-end' }}>
          <Button
            label="So lassen"
            variant="secondary"
            onPress={props.onDone}
            testID="trip-meals-keep"
          />
          <Button
            label={`Rausnehmen (${picked.length})`}
            disabled={online.disabled || picked.length === 0}
            hint={online.hint}
            onPress={take}
            testID="trip-meals-take"
          />
        </Row>
      }
    >
      <Stack gap={12}>
        <List testID="trip-meals-list">
          {props.offers.map((offer) => (
            <CheckRow
              key={offer.entry.id}
              title={tripMealLine(
                offer,
                data.slotName(offer.entry.slotId),
                data.lineTitleOf(offer.entry),
              )}
              checked={chosen.has(offer.entry.id)}
              onToggle={() => toggle(offer.entry.id)}
              testID={`trip-meals-${offer.entry.id}`}
            />
          ))}
        </List>
        {onList ? (
          <Text variant="small" color="muted" testID="trip-meals-list-hint">
            Die Einkaufsliste wird angepasst.
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
