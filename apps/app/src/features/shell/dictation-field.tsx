import { insertAtCursor } from '@housekeeping/core';
import { IconButton, Text, TextField, type TextFieldProps } from '@housekeeping/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { features } from '@/lib/features';
import { useDictation } from '@/lib/use-dictation';

/**
 * A text field of the AI (spec 0040, REQ-002) with a microphone: the first tap listens, the
 * second puts what was understood at the cursor (core insertAtCursor, AC-008). While listening,
 * the words appear live inside the field at the cursor, not in a line below it (spec 0040,
 * decision 6); the field is read-only until the second tap. A refused microphone shows how to
 * allow it, and typing goes on (AC-009). Online only, like the AI.
 */
export function DictationField(
  props: Omit<TextFieldProps, 'value' | 'onChangeText' | 'right' | 'onSelectionChange'> & {
    value: string;
    onChangeText: (text: string) => void;
    /** After the microphone inside the field, e.g. the send button of a composer. */
    trailing?: ReactNode;
  },
) {
  const { value, onChangeText, testID, trailing, ...field } = props;
  const online = useOnlineOnly();
  const dictation = useDictation({ onStopWord: () => finish() });
  const selection = useRef<{ start: number; end: number } | undefined>(undefined);
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  const listening = dictation.status === 'listening';
  const busy = dictation.status === 'starting' || dictation.status === 'stopping';
  const hearing = listening || dictation.status === 'stopping';
  // Where the live words go: the caret at the moment listening started.
  const [anchor, setAnchor] = useState<{ start: number; end: number } | undefined>(undefined);
  const shown =
    hearing && dictation.transcript
      ? insertAtCursor(value, anchor, dictation.transcript).text
      : value;

  // Second tap or „Ende“ (decision 7): what was heard goes in at the cursor.
  function finish() {
    void dictation.stop().then((heard) => {
      const next = insertAtCursor(latest.current, selection.current, heard);
      selection.current = { start: next.cursor, end: next.cursor };
      onChangeText(next.text);
    });
  }

  const press = () => {
    if (listening) {
      finish();
      return;
    }
    if (dictation.status === 'idle') {
      setAnchor(selection.current);
      dictation.start();
    }
  };

  const mic =
    features.aiRecipes && online.disabled === false ? (
      <IconButton
        icon="mic"
        label={listening ? 'Diktat beenden' : 'Diktieren'}
        variant={listening ? 'filled' : 'plain'}
        disabled={busy || field.editable === false}
        onPress={press}
        testID={testID ? `${testID}-mic` : undefined}
      />
    ) : undefined;

  return (
    <View style={{ gap: 6 }}>
      <TextField
        {...field}
        value={shown}
        editable={hearing ? false : field.editable}
        placeholder={hearing && !value ? 'Ich höre zu …' : field.placeholder}
        onChangeText={(text) => {
          onChangeText(text);
          if (dictation.error) dictation.dismissError();
        }}
        onSelectionChange={(event) => {
          // The live words move the caret; the insert point stays where the person put it.
          if (hearing) return;
          selection.current = event.nativeEvent.selection;
        }}
        right={
          trailing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {mic}
              {trailing}
            </View>
          ) : (
            mic
          )
        }
        testID={testID}
      />
      {dictation.error ? (
        <Text variant="small" color="warn" testID={testID ? `${testID}-mic-error` : undefined}>
          {dictation.error}
        </Text>
      ) : null}
    </View>
  );
}
