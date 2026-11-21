import { Button, Sheet, TextField } from '@housekeeping/ui';
import { useState } from 'react';

/**
 * A small window for one text of the open section (a step, a variant name). "Übernehmen" only
 * changes the draft; "Fertig" of the section saves (E9).
 */
export function TextSheet(props: {
  title: string;
  label: string;
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  /** The message that keeps the text from being taken ("Name fehlt", "Gibt es schon"). */
  check: (text: string) => string | undefined;
  /** "Übernehmen" with a text that passed `check`; the caller closes the window. */
  onApply: (text: string) => void;
  /** ✕, Escape or Android back without taking the text. */
  onClose: () => void;
  testID: string;
}) {
  const [text, setText] = useState(props.initial);
  const [error, setError] = useState<string | undefined>();
  const apply = () => {
    const problem = props.check(text);
    if (problem) {
      setError(problem);
      return;
    }
    props.onApply(text);
  };
  return (
    <Sheet
      visible
      size="s"
      title={props.title}
      onClose={props.onClose}
      testID={props.testID}
      footer={
        <Button
          label="Übernehmen"
          icon="check"
          full
          onPress={apply}
          testID={`${props.testID}-apply`}
        />
      }
    >
      <TextField
        label={props.label}
        placeholder={props.placeholder}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
        }}
        multiline={props.multiline}
        onSubmitEditing={props.multiline ? undefined : apply}
        error={error}
        autoFocus
        testID={`${props.testID}-input`}
      />
    </Sheet>
  );
}
