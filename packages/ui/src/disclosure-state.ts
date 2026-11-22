// The foldable group "Gepackt (n)" (spec 0012, REQ-004, D31): header text, screen-reader label
// and the folded state. Pure, so it is tested in Node; the words come from the feature.

/** The visible header, e.g. "Gepackt (4)". */
export function disclosureTitle(title: string, count: number): string {
  return `${title} (${count})`;
}

/**
 * What a screen reader hears on the header before the state, e.g. "Gepackt, 4"; the state comes
 * from `expandableA11y`.
 */
export function disclosureLabel(title: string, count: number): string {
  return `${title}, ${count}`;
}

export interface DisclosureState {
  expanded: boolean;
  /** The count the state was last told about. */
  count: number;
}

export type DisclosureEvent =
  /** A tap on the header. */
  | { type: 'toggle' }
  /** The number of rows in the group changed, e.g. a packed item slid in. */
  | { type: 'count'; count: number };

export const CLOSED_DISCLOSURE: DisclosureState = { expanded: false, count: 0 };

/**
 * One step of the group: it starts folded and only a tap folds or unfolds it, so rows sliding in
 * or out never change it (AC-020, AC-021). An emptied group folds, so it comes back folded.
 */
export function disclosureState(state: DisclosureState, event: DisclosureEvent): DisclosureState {
  if (event.type === 'toggle') return { ...state, expanded: !state.expanded };
  if (event.count === state.count) return state;
  return { expanded: event.count === 0 ? false : state.expanded, count: event.count };
}
