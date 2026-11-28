import { Icon, ariaRef, useTheme } from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

/** The bookmark in the header of an activity: remembered by the household (spec 0041, AC-015). */
export function RememberButton(props: {
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
      accessibilityLabel={props.active ? 'Gemerkt' : 'Merken'}
      accessibilityHint={props.hint}
      // react-native-web drops accessibilityHint.
      ref={ariaRef({ 'aria-description': props.hint })}
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
        name="bookmark"
        size={22}
        color={props.active ? 'accent' : 'muted'}
        filled={props.active}
      />
    </Pressable>
  );
}

/**
 * The heart and the bookmark at the top right of a list row or tile (spec 0041, AC-017): the
 * state at a glance, a tap toggles it without opening the item. `overlay` puts a round surface
 * behind it for the photo of a tile. The touch target is 44 pt either way.
 */
export function CornerToggle(props: {
  icon: 'heart' | 'bookmark';
  label: string;
  active: boolean;
  disabled: boolean;
  hint?: string;
  overlay?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      ref={ariaRef({ 'aria-description': props.hint })}
      aria-pressed={props.active}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: props.disabled ? 0.45 : state.pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: props.overlay ? theme.colors.surface : 'transparent',
        }}
      >
        <Icon
          name={props.icon}
          size={20}
          color={props.active ? 'accent' : 'muted'}
          filled={props.active}
        />
      </View>
    </Pressable>
  );
}
