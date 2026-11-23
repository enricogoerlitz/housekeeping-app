import type { ViewStyle } from 'react-native';

// Chips in a row (ChoiceChips): by default each as wide as its label, wrapping; with `fill` they
// share the full width in equal parts and never wrap, so labels that change (the days of "Einplanen"
// when paging weeks) never shift a chip (spec 0030, REQ-005).

/** The row of a ChoiceChips group. */
export function chipRowStyle(fill: boolean): ViewStyle {
  return fill
    ? { flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }
    : { flexDirection: 'row', flexWrap: 'wrap', gap: 8 };
}

/** One chip of a filled row: an equal share, its content centred, little side padding. */
export function fillChipStyle(): ViewStyle {
  return {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 2,
  };
}
