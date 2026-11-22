import { addPlanEntry } from '@housekeeping/api';
import type { Recipe } from '@housekeeping/core';

import { PlanSheet } from './plan-sheet';

/**
 * "Einplanen" on the page of a recipe or a collection (spec 0008, REQ-009, E11; spec 0023,
 * REQ-013): the shared window with the split over the variants and "Wer kocht?".
 */
export function PlanRecipeSheet(props: { recipe: Recipe; onClose: () => void }) {
  const { recipe } = props;
  return (
    <PlanSheet
      title={recipe.title}
      recipe={recipe}
      onClose={props.onClose}
      onPlan={(choice, split) => {
        if (!choice.slotId) return;
        addPlanEntry({
          date: choice.date,
          slotId: choice.slotId,
          kind: 'recipe',
          recipeId: recipe.id,
          eaterIds: choice.eaterIds,
          guests: choice.guests,
          cookId: choice.cookId,
          portions: split?.portions,
          variants: split?.variants,
        });
      }}
    />
  );
}
