import { useReducer, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ARRIVE, LEAVE, RowTransition } from './check';
import { focusRing } from './controls';
import { disclosureLabel, disclosureState, disclosureTitle } from './disclosure-state';
import { expandableA11y } from './expandable';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

export interface DisclosureProps {
  /** The group's name without the count, e.g. "Gepackt"; shown as "Gepackt (4)". */
  title: string;
  /** Rows in the group. At 0 the group is not shown and folds for its next appearance. */
  count: number;
  /** Screen-reader words for the state, e.g. "aufgeklappt" / "eingeklappt" (iOS only). */
  expandedLabel: string;
  collapsedLabel: string;
  /** Starts unfolded; the default is folded (spec 0012, D31). */
  defaultExpanded?: boolean;
  /** The rows, shown while unfolded. */
  children?: ReactNode;
  /** The group; the header is `${testID}-toggle`, the rows `${testID}-body`. */
  testID?: string;
}

/**
 * A foldable group at the end of a list, e.g. "Gepackt (4)" (spec 0012, REQ-004): folded by
 * default, a tap on the header unfolds it. Rows sliding in or out never fold or unfold it. The
 * group moves with the rows above it (`RowTransition`); the rows fade in and out, with reduced
 * motion too, only the movement goes.
 */
export function Disclosure(props: DisclosureProps) {
  const theme = useTheme();
  const [state, dispatch] = useReducer(disclosureState, undefined, () => ({
    expanded: props.defaultExpanded ?? false,
    count: props.count,
  }));
  // Adjusts the state while rendering (no effect), so an emptied group is folded at once.
  if (state.count !== props.count) dispatch({ type: 'count', count: props.count });
  if (props.count === 0) return null;

  const { expanded } = state;
  const id = (part: string) => (props.testID ? `${props.testID}-${part}` : undefined);
  const a11y = expandableA11y(disclosureLabel(props.title, props.count), expanded, Platform.OS, {
    expanded: props.expandedLabel,
    collapsed: props.collapsedLabel,
  });
  return (
    <RowTransition>
      <View testID={props.testID}>
        <Pressable
          testID={id('toggle')}
          accessibilityRole="button"
          {...a11y}
          onPress={() => dispatch({ type: 'toggle' })}
          style={(pressState) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              minHeight: 44,
              borderRadius: 6,
              alignSelf: 'flex-start',
              opacity: pressState.pressed ? 0.6 : 1,
            },
            focusRing(theme, (pressState as { focused?: boolean }).focused),
          ]}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={18} color="muted" />
          <Text variant="groupLabel">{disclosureTitle(props.title, props.count)}</Text>
        </Pressable>
        {expanded ? (
          <Animated.View entering={ARRIVE} exiting={LEAVE} testID={id('body')}>
            {props.children}
          </Animated.View>
        ) : null}
      </View>
    </RowTransition>
  );
}
