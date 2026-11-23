import { Icon, useTheme } from '@housekeeping/ui';
import { Pressable } from 'react-native';

/** The heart in the header of a recipe, restaurant or activity: the own favourite. */
export function FavoriteButton(props: {
  active: boolean;
  disabled: boolean;
  hint?: string;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel="Favorit"
      accessibilityHint={props.hint}
      aria-selected={props.active}
      aria-disabled={props.disabled}
      aria-pressed={props.active}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
        opacity: props.disabled ? 0.45 : state.pressed ? 0.6 : 1,
      })}
    >
      <Icon
        name="heart"
        size={22}
        color={props.active ? 'accent' : 'muted'}
        filled={props.active}
      />
    </Pressable>
  );
}
