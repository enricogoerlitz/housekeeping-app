// TimeField and the detail button of SwitchRow (spec 0013, Decision 25 and 27): what a screen
// reader hears and which parts are shown. Pure, so it is tested in Node; the words come from the
// feature, and reading or checking a time is the job of `parseTimeInput` in core.

/** The value a screen reader hears: the typed time, or the feature's word for none. */
export function timeFieldA11yValue(text: string, emptyLabel: string): string {
  const value = text.trim();
  return value === '' ? emptyLabel : value;
}

/** ✕ clears the time; it shows only when there is one and the field can be edited. */
export function timeFieldShowsClear(text: string, editable: boolean): boolean {
  return editable && text.trim() !== '';
}

/**
 * The accessible names of a SwitchRow. With details, the text and "›" are one button of their
 * own beside the switch (never nested), named by the feature and followed by the description, so
 * the two controls never share a name.
 */
export function switchRowParts(input: {
  label: string;
  description?: string;
  detailLabel?: string;
  hasDetail: boolean;
}): { switchLabel: string; detailLabel: string | undefined } {
  if (!input.hasDetail || input.detailLabel === undefined) {
    return { switchLabel: input.label, detailLabel: undefined };
  }
  return {
    switchLabel: input.label,
    detailLabel: input.description
      ? `${input.detailLabel}, ${input.description}`
      : input.detailLabel,
  };
}
