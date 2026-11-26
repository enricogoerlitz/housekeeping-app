// What a text field tells the browser about autofill and its keyboard (spec 0033, REQ-005,
// decision 4). iOS ignores autocomplete="off" for its contact autofill and guesses from the
// field's name, id and label; a name of our own that matches none of its words takes that guess
// away. E-mail fields keep their suggestions (AC-016).

export interface FieldAutofill {
  autoComplete: string;
  name: string;
  inputMode?: 'url';
  autoCapitalize?: 'none';
  autoCorrect?: boolean;
}

export function fieldAutofill(input: {
  /** A unique id of the field, e.g. React's useId(). */
  id: string;
  keyboardType?: string;
  autoComplete?: string;
}): FieldAutofill {
  if (input.keyboardType === 'email-address') {
    return { autoComplete: input.autoComplete ?? 'email', name: 'email' };
  }
  const name = `hk-field-${input.id.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
  const autoComplete = input.autoComplete ?? 'off';
  if (input.keyboardType === 'url') {
    return { autoComplete, name, inputMode: 'url', autoCapitalize: 'none', autoCorrect: false };
  }
  return { autoComplete, name };
}
