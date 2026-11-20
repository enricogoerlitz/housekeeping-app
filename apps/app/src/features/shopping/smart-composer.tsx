import { addShoppingItemFromText, useArticles } from '@housekeeping/api';
import {
  formatAmount,
  parseSmartInput,
  searchArticles,
  type Id,
  type SmartInput,
} from '@housekeeping/core';
import { Chip, ComposerBar, IconButton, TextField, toast } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

// Frequent articles as one-tap tiles; all of them exist in the starter catalog.
const QUICK_ADD = ['Milch', 'Brot', 'Eier', 'Bananen', 'Butter', 'Käse', 'Tomaten', 'Joghurt'];
const MAX_SUGGESTIONS = 4;

function amountText(parsed: SmartInput): string | undefined {
  if (parsed.qty !== undefined) return formatAmount(parsed.qty, parsed.unit);
  if (parsed.count !== undefined) return `${parsed.count}×`;
  return undefined;
}

/** The typed line with the article name replaced, so a suggestion keeps amount and note. */
function withName(parsed: SmartInput, name: string): string {
  const amount =
    parsed.qty !== undefined
      ? formatAmount(parsed.qty, parsed.unit)
      : parsed.count !== undefined
        ? String(parsed.count)
        : '';
  return [amount, name, parsed.note ? `(${parsed.note})` : '']
    .filter((part) => part !== '')
    .join(' ');
}

function ChipRow(props: { children: ReactNode; testID?: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View testID={props.testID} style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
        {props.children}
      </View>
    </ScrollView>
  );
}

/**
 * The input bar of the shopping list: smart input with live preview, article suggestions,
 * quick-add tiles, dictation and the assistant. Adding works offline too (ADR-0008 addendum).
 */
export function SmartComposer(props: {
  listId: Id;
  onDictate: () => void;
  onAssistant: () => void;
}) {
  const articles = useArticles();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  // Remounting with autoFocus brings the focus back after the send button took it.
  const [fieldKey, setFieldKey] = useState(0);

  const parsed = parseSmartInput(text);
  const suggestions = parsed ? searchArticles(parsed.name, articles, MAX_SUGGESTIONS) : [];
  const amount = parsed ? amountText(parsed) : undefined;

  const submit = (line: string, refocus: boolean) => {
    if (!line.trim()) return;
    try {
      addShoppingItemFromText(props.listId, line);
      setText('');
      setError(undefined);
      if (refocus) setFieldKey(fieldKey + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  const quickAdd = (name: string) => {
    const added = addShoppingItemFromText(props.listId, name);
    if (added) toast.show({ message: `${added.articleName} auf der Liste`, duration: 2000 });
  };

  return (
    <ComposerBar testID="composer">
      {parsed ? (
        <>
          <ChipRow testID="smart-preview">
            {amount ? <Chip label={`Menge ${amount}`} /> : null}
            <Chip label={`Artikel ${parsed.name}`} />
            {parsed.note ? <Chip label={`Zusatz ${parsed.note}`} /> : null}
          </ChipRow>
          {suggestions.length > 0 ? (
            <ChipRow testID="smart-suggestions">
              {suggestions.map((match) => (
                <Chip
                  key={match.article.id}
                  label={
                    match.matchedSynonym
                      ? `${match.article.name} · auch: ${match.matchedSynonym}`
                      : match.article.name
                  }
                  icon="plus"
                  testID={`suggestion-${match.article.id}`}
                  onPress={() => submit(withName(parsed, match.article.name), true)}
                />
              ))}
            </ChipRow>
          ) : null}
        </>
      ) : (
        <ChipRow testID="quick-add">
          {QUICK_ADD.map((name) => (
            <Chip
              key={name}
              label={name}
              icon="plus"
              testID={`quick-${name}`}
              onPress={() => quickAdd(name)}
            />
          ))}
        </ChipRow>
      )}
      <TextField
        key={fieldKey}
        autoFocus={fieldKey > 0}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(undefined);
        }}
        placeholder="Was fehlt? z. B. 2 Käse (Gouda)"
        accessibilityLabel="Artikel hinzufügen"
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => submit(text, false)}
        error={error}
        round
        testID="smart-input"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton
              icon="sparkles"
              label="Assistent"
              testID="list-assistant"
              onPress={props.onAssistant}
            />
            <IconButton icon="mic" label="Sprechen" testID="dictate" onPress={props.onDictate} />
            <IconButton
              icon="send"
              label="Hinzufügen"
              variant="filled"
              testID="smart-submit"
              onPress={() => submit(text, true)}
            />
          </View>
        }
      />
    </ComposerBar>
  );
}
