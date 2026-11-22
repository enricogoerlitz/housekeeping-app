import { Menu, useBreakpoint, type MenuOption } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

export type FoodNewKind = 'recipe' | 'collection' | 'restaurant';

/**
 * "Neu" on "Essen", the same on "Rezepte" and "Restaurants" (spec 0023, REQ-011, AC-045): exactly
 * "Rezept", "Sammlung", "Restaurant", each greyed out offline with the hint.
 */
export function FoodNewMenu(props: { onNew: (kind: FoodNewKind) => void }) {
  const { isPhone } = useBreakpoint();
  const online = useOnlineOnly();
  const options: MenuOption<FoodNewKind>[] = [
    { value: 'recipe', label: 'Rezept', disabled: online.disabled, hint: online.hint },
    { value: 'collection', label: 'Sammlung', disabled: online.disabled, hint: online.hint },
    { value: 'restaurant', label: 'Restaurant', disabled: online.disabled, hint: online.hint },
  ];
  return (
    <Menu
      trigger={isPhone ? 'icon' : 'button'}
      icon="plus"
      label="Neu"
      accessibilityLabel="Neu anlegen"
      options={options}
      onChange={props.onNew}
      testID="recipe-new"
    />
  );
}
