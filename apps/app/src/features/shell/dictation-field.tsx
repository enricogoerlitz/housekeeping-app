import { insertAtCursor } from '@housekeeping/core';
import { IconButton, Text, TextField, type TextFieldProps } from '@housekeeping/ui';
import { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { features } from '@/lib/features';
import { useDictation } from '@/lib/use-dictation';

/**
 * A text field of the AI (spec 0040, REQ-002) with a microphone: the first tap listens, the
 * second puts what was understood at the cursor (core insertAtCursor, AC-008). A refused
 * microphone shows how to allow it, and typing goes on (AC-009). Online only, like the AI.
 */
export function DictationField(
  props: Omit<TextFieldProps, 'value' | 'onChangeText' | 'right' | 'onSelectionChange'> & {
    value: string;
    onChangeText: (text: string) => void;
  },
) {
  const { value, onChangeText, testID, ...field } = props;
  const online = useOnlineOnly();
  const dictation = useDictation();
  const selection = useRef<{ start: number; end: number } | undefined>(undefined);
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  const listening = dictation.status === 'listening';
  const busy = dictation.status === 'starting' || dictation.status === 'stopping';

  const press = () => {
    if (listening) {
      void dictation.stop().then((heard) => {
        const next = insertAtCursor(latest.current, selection.current, heard);
        selection.current = { start: next.cursor, end: next.cursor };
        onChangeText(next.text);
      });
      return;
    }
    if (dictation.status === 'idle') dictation.start();
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
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          if (dictation.error) dictation.dismissError();
        }}
        onSelectionChange={(event) => {
          selection.current = event.nativeEvent.selection;
        }}
        right={mic}
        testID={testID}
      />
      {listening || dictation.status === 'stopping' ? (
        <Text variant="small" color="muted" testID={testID ? `${testID}-listening` : undefined}>
          {dictation.transcript ? `Ich höre: ${dictation.transcript}` : 'Ich höre zu …'}
        </Text>
      ) : null}
      {dictation.error ? (
        <Text variant="small" color="warn" testID={testID ? `${testID}-mic-error` : undefined}>
          {dictation.error}
        </Text>
      ) : null}
    </View>
  );
}
