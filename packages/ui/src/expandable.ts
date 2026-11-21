// Screen-reader props for anything that folds or opens: a group header, a menu trigger, a date
// field with its calendar. Pure, so it is tested in Node; the words come from the feature.

export interface ExpandedWords {
  /** e.g. "aufgeklappt" */
  expanded: string;
  /** e.g. "eingeklappt" */
  collapsed: string;
}

export interface ExpandableA11y {
  accessibilityLabel: string | undefined;
  'aria-expanded'?: boolean;
}

/**
 * `aria-expanded`, not `accessibilityState`: react-native-web ignores the latter, so a browser
 * screen reader never heard the state. Android reads `aria-expanded` too. iOS announces only
 * "expanded", never "collapsed": given `words`, the label carries the state there and the node
 * state stays off, so it is not said twice. `os` is `Platform.OS`.
 */
export function expandableA11y(
  label: string | undefined,
  expanded: boolean,
  os: string,
  words?: ExpandedWords,
): ExpandableA11y {
  if (os === 'ios' && words) {
    const state = expanded ? words.expanded : words.collapsed;
    return { accessibilityLabel: label ? `${label}, ${state}` : state };
  }
  return { accessibilityLabel: label, 'aria-expanded': expanded };
}
