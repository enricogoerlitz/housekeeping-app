import { IconButton, Text, TextField, type TextFieldProps } from '@housekeeping/ui';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { features } from '@/lib/features';
import type { PromptDictation } from '@/lib/use-prompt-dictation';

/**
 * A text field of the AI (spec 0040, REQ-002) with a microphone: the first tap listens, the
 * second puts what was understood at the cursor (core insertAtCursor, AC-008). While listening,
 * the words appear live inside the field at the cursor, not in a line below it (spec 0040,
 * decision 6); the field is read-only until the second tap. A refused microphone shows how to
 * allow it, and typing goes on (AC-009). Online only, like the AI.
 *
 * `dictation` comes from `usePromptDictation` in the window, so its send — the composer's send
 * button or the window's primary action — finishes the dictation first (spec 0068). The field
 * going away stops listening and sends nothing (AC-008).
 */
export function DictationField(
  props: Omit<TextFieldProps, 'value' | 'onChangeText' | 'right' | 'onSelectionChange'> & {
    value: string;
    onChangeText: (text: string) => void;
    dictation: PromptDictation;
    /** After the microphone inside the field, e.g. the send button of a composer. */
    trailing?: ReactNode;
  },
) {
  const { value, onChangeText, dictation, testID, trailing, ...field } = props;
  const online = useOnlineOnly();
  const { cancel } = dictation;
  useEffect(() => cancel, [cancel]);
  const listening = dictation.status === 'listening';
  const busy = dictation.status === 'starting' || dictation.status === 'stopping';
  const hearing = dictation.hearing;

  const mic =
    features.aiRecipes && online.disabled === false ? (
      <IconButton
        icon="mic"
        label={listening ? 'Diktat beenden' : 'Diktieren'}
        variant={listening ? 'filled' : 'plain'}
        disabled={busy || field.editable === false}
        onPress={dictation.toggle}
        testID={testID ? `${testID}-mic` : undefined}
      />
    ) : undefined;

  return (
    <View style={{ gap: 6 }}>
      <TextField
        {...field}
        value={hearing ? dictation.shown : value}
        editable={hearing ? false : field.editable}
        placeholder={hearing && !value ? 'Ich höre zu …' : field.placeholder}
        onChangeText={(text) => {
          onChangeText(text);
          dictation.typed();
        }}
        onSelectionChange={(event) => dictation.select(event.nativeEvent.selection)}
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
