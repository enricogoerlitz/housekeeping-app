import { Menu, useBreakpoint, type MenuOption, openKeyboardNow } from '@housekeeping/ui';

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
      // Every entry opens a window to type in: the keyboard opens with the tap (spec 0033, REQ-006).
      onChange={(kind) => {
        openKeyboardNow();
        props.onNew(kind);
      }}
      testID="recipe-new"
    />
  );
}
