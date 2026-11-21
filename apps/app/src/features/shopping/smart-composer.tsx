import { addShoppingItemFromText, useArticles } from '@housekeeping/api';
import {
  formatAmount,
  parseSmartInput,
  searchArticles,
  suggestSimilarArticle,
  type Article,
  type SmartInput,
} from '@housekeeping/core';
import { Button, Chip, ComposerBar, IconButton, Text, TextField, toast } from '@housekeeping/ui';
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
  /** Without it there is no microphone button (AI switched off, spec 0005, AC-044). */
  onDictate?: () => void;
  /** Listening right now: the microphone button stops it. */
  dictating?: boolean;
  /** Dictation needs the network (offline) or is starting/stopping. */
  dictateDisabled?: boolean;
  /** Without it there is no assistant button (AI switched off). */
  onAssistant?: () => void;
}) {
  const articles = useArticles();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  // "Meinst du Kokosmilch?" (AC-031): a typed name close to an article waits for "Ja" or
  // "Trotzdem neu" instead of creating a second article.
  const [brake, setBrake] = useState<{ line: string; similar: Article } | undefined>();
  // Remounting with autoFocus brings the focus back after the send button took it.
  const [fieldKey, setFieldKey] = useState(0);

  const parsed = parseSmartInput(text);
  const suggestions = parsed ? searchArticles(parsed.name, articles, MAX_SUGGESTIONS) : [];
  const amount = parsed ? amountText(parsed) : undefined;

  const submit = (line: string, refocus: boolean, checkSimilar = true) => {
    if (!line.trim()) return;
    const typed = parseSmartInput(line);
    const similar = checkSimilar && typed ? suggestSimilarArticle(typed.name, articles) : undefined;
    if (similar) {
      setBrake({ line, similar });
      return;
    }
    setBrake(undefined);
    try {
      addShoppingItemFromText(line);
      setText('');
      setError(undefined);
      if (refocus) setFieldKey(fieldKey + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  const quickAdd = (name: string) => {
    const added = addShoppingItemFromText(name);
    if (added) toast.show({ message: `${added.articleName} auf der Liste`, duration: 2000 });
  };

  return (
    <ComposerBar testID="composer">
      {brake ? (
        <View
          testID="smart-brake"
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
        >
          <Text variant="small" style={{ flexShrink: 1 }}>
            {`Meinst du ${brake.similar.name}?`}
          </Text>
          <Button
            label="Ja"
            size="sm"
            variant="secondary"
            testID="smart-brake-accept"
            onPress={() => {
              const typed = parseSmartInput(brake.line);
              if (typed) submit(withName(typed, brake.similar.name), true, false);
            }}
          />
          <Button
            label="Trotzdem neu"
            size="sm"
            variant="link"
            testID="smart-brake-create"
            onPress={() => submit(brake.line, true, false)}
          />
        </View>
      ) : null}
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
          setBrake(undefined);
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
            {props.onAssistant ? (
              <IconButton
                icon="sparkles"
                label="Assistent"
                testID="list-assistant"
                onPress={props.onAssistant}
              />
            ) : null}
            {props.onDictate ? (
              <IconButton
                icon="mic"
                label={props.dictating ? 'Aufnahme beenden' : 'Sprechen'}
                variant={props.dictating ? 'filled' : 'plain'}
                disabled={props.dictateDisabled}
                testID="dictate"
                onPress={props.onDictate}
              />
            ) : null}
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
