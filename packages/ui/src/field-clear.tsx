import { useRef, type ComponentRef, type RefObject } from 'react';
import { View, type TextInput } from 'react-native';

import { IconButton } from './controls';

export interface FieldClearButtonProps {
  /** Accessible name, e.g. "Suche leeren". */
  label: string;
  onClear: () => void;
  /** The field it empties. */
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  size?: number;
  testID?: string;
}

/**
 * The ✕ inside a search field (spec 0033, REQ-007): it empties the field; when the cursor stood in
 * the field it goes back there, so the keyboard stays open, otherwise it does not jump in. Whether
 * it stood there is read when the press starts, before the button takes the focus.
 */
export function FieldClearButton(props: FieldClearButtonProps) {
  const wasFocused = useRef(false);
  return (
    <View
      onPointerDown={() => {
        wasFocused.current = props.inputRef.current?.isFocused() ?? false;
      }}
    >
      <IconButton
        icon="x"
        label={props.label}
        size={props.size}
        onPress={() => {
          props.onClear();
          if (wasFocused.current) props.inputRef.current?.focus();
          wasFocused.current = false;
        }}
        testID={props.testID}
      />
    </View>
  );
}
