import { useArticles } from '@housekeeping/api';
import {
  draftArticleName,
  draftLineLabel,
  missingArticlesLabel,
  validateArticleDraft,
  type DraftArticle,
  type IngredientDraft,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  Row,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  TextField,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { STARTER_DETAIL, useArticleSearch } from './article-search';
import type { IngredientDraftsState } from './use-ingredient-drafts';

/**
 * "Zutaten einfügen" (REQ-002, spec 0001 AC-022): a block, one ingredient per line, becomes lines
 * with their article. A line whose name or synonym fits exactly has it; the others stand orange
 * with "Meinst du …?", "„…“ neu anlegen" or "Artikel wählen" (AC-008, AC-009). "Speichern" saves
 * the lines with an article, the rest stays orange (AC-010).
 */
export function IngredientsPasteSheet(props: { state: IngredientDraftsState }) {
  const { state } = props;
  const online = useOnlineOnly();
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | undefined>();
  const [picking, setPicking] = useState<string | undefined>();

  const lines = state.drafts.length > 0;
  const missing = state.drafts.filter((draft) => !draft.article).length;
  const ready = state.drafts.length - missing;

  const close = () => {
    setText('');
    setTextError(undefined);
    setPicking(undefined);
    state.close();
  };

  const paste = () => {
    if (!text.trim()) {
      setTextError('Füge mindestens eine Zutat ein.');
      return;
    }
    if (!state.paste(text)) {
      setTextError('Darin war keine Zutat zu erkennen.');
      return;
    }
    setText('');
  };

  const choose = (key: string, article: DraftArticle) => {
    setPicking(undefined);
    state.choose(key, article);
  };

  const footer = lines ? (
    <Stack gap={8}>
      {missing > 0 ? (
        <Text variant="small" color="warn" testID="ingredients-paste-missing">
          {missingArticlesLabel(missing)}
        </Text>
      ) : null}
      <Button
        label={
          ready === 0
            ? 'Speichern'
            : ready === 1
              ? '1 Zutat speichern'
              : `${ready} Zutaten speichern`
        }
        icon="check"
        full
        onPress={() => {
          setPicking(undefined);
          state.save();
        }}
        disabled={online.disabled || ready === 0}
        hint={online.hint ?? (ready === 0 ? 'Wähle zuerst einen Artikel' : undefined)}
        testID="ingredients-paste-confirm"
      />
    </Stack>
  ) : (
    <Button
      label="Einfügen"
      icon="check"
      full
      onPress={paste}
      disabled={online.disabled}
      hint={online.hint}
      testID="ingredients-paste-save"
    />
  );

  return (
    <Sheet
      visible={state.visible}
      onClose={close}
      title="Zutaten einfügen"
      testID="ingredients-paste-sheet"
      size="m"
      footer={footer}
    >
      {lines ? (
        <View testID="ingredients-paste-lines" style={{ gap: 10 }}>
          {state.error ? (
            <Text variant="small" color="warn" testID="ingredients-paste-error">
              {state.error}
            </Text>
          ) : null}
          {state.drafts.map((draft) => (
            <DraftLine
              key={draft.key}
              draft={draft}
              picking={picking === draft.key}
              onPick={() => setPicking(picking === draft.key ? undefined : draft.key)}
              onChoose={(article) => choose(draft.key, article)}
            />
          ))}
        </View>
      ) : (
        <TextField
          label="Zutaten"
          placeholder={'200 ml Kokosmilch\n1 Mango\n1 Prise Salz'}
          hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (textError) setTextError(undefined);
          }}
          multiline
          autoFocus
          error={textError}
          testID="ingredients-paste"
        />
      )}
    </Sheet>
  );
}

/** One pasted line: with its article, or orange with what can be done about it. */
function DraftLine(props: {
  draft: IngredientDraft;
  picking: boolean;
  onPick: () => void;
  onChoose: (article: DraftArticle) => void;
}) {
  const { draft } = props;
  const theme = useTheme();
  const online = useOnlineOnly();
  const id = `paste-line-${draft.key}`;
  const name = draft.line.name;
  const isNew = draft.article?.kind === 'new';
  const fromStarter = draft.article?.kind === 'hit' && draft.article.hit.kind === 'starter';

  if (draft.article) {
    return (
      <View testID={id}>
        <Row gap={10}>
          <Icon name="check" size={18} color="success" />
          <Text style={{ flex: 1, minWidth: 0 }} testID={`${id}-label`}>
            {draftLineLabel(draft)}
          </Text>
          {isNew ? <Badge label="neu" /> : null}
          {fromStarter ? <Badge label={STARTER_DETAIL} /> : null}
          <IconButton
            icon="pencil"
            label={`Artikel für ${draftArticleName(draft)} ändern`}
            onPress={props.onPick}
            testID={`${id}-change`}
          />
        </Row>
        {props.picking ? <DraftPicker initial={name} onChoose={props.onChoose} /> : null}
      </View>
    );
  }

  return (
    <View
      testID={id}
      accessibilityLabel={`${draftLineLabel(draft)}: Artikel wählen`}
      style={{
        gap: 8,
        padding: 10,
        borderRadius: theme.shape.radius.control,
        backgroundColor: theme.colors.warnBg,
      }}
    >
      <Row gap={8}>
        <Icon name="circle-alert" size={16} color="warn" />
        <Text variant="bodyStrong" color="warn" style={{ flex: 1 }} testID={`${id}-label`}>
          {draftLineLabel(draft)}
        </Text>
      </Row>
      {draft.suggestion ? (
        <View
          testID={`${id}-suggestion`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
        >
          <Text color="warn">Meinst du {draft.suggestion.name}?</Text>
          <Button
            label="Ja"
            size="sm"
            variant="secondary"
            onPress={() => {
              if (draft.suggestion) props.onChoose({ kind: 'hit', hit: draft.suggestion });
            }}
            testID={`${id}-accept`}
          />
        </View>
      ) : null}
      <Row gap={8} wrap>
        <Button
          label="Artikel wählen"
          size="sm"
          variant="secondary"
          icon="search"
          onPress={props.onPick}
          testID={`${id}-pick`}
        />
        {draft.suggestion ? null : (
          <Button
            label={`„${name}“ neu anlegen`}
            size="sm"
            variant="link"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => props.onChoose({ kind: 'new', name })}
            testID={`${id}-create`}
          />
        )}
      </Row>
      {props.picking ? <DraftPicker initial={name} onChoose={props.onChoose} /> : null}
    </View>
  );
}

/** "Artikel wählen" for one line: "Suchen oder anlegen", starting with the pasted name. */
function DraftPicker(props: { initial: string; onChoose: (article: DraftArticle) => void }) {
  const articles = useArticles();
  const online = useOnlineOnly();
  const [query, setQuery] = useState(props.initial);
  const [error, setError] = useState<string | undefined>();
  const search = useArticleSearch(query);
  const name = query.replace(/\s+/g, ' ').trim();

  const create = () => {
    const [problem] = validateArticleDraft({ name, synonyms: [] }, articles);
    if (problem) setError(problem.message);
    else props.onChoose({ kind: 'new', name });
  };

  return (
    <Stack gap={6}>
      <SearchOrCreate
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setError(undefined);
        }}
        label="Artikel suchen"
        placeholder="Artikel suchen oder anlegen"
        clearLabel="Suche leeren"
        autoFocus
        hits={search.hits}
        onSelect={(key) => {
          const hit = search.hitFor(key);
          if (hit) props.onChoose({ kind: 'hit', hit });
        }}
        createOptions={
          search.result.canCreate ? [{ key: 'article', label: `„${name}“ neu anlegen` }] : []
        }
        onCreate={create}
        brake={
          search.result.similar
            ? {
                question: `Meinst du ${search.result.similar.name}?`,
                acceptLabel: 'Ja',
                createAnywayLabel: 'Trotzdem neu',
                onAccept: () => {
                  const similar = search.result.similar;
                  if (similar) props.onChoose({ kind: 'hit', hit: similar });
                },
              }
            : undefined
        }
        createDisabledHint={online.hint}
        testID="paste-pick"
      />
      {error ? (
        <Text variant="small" color="warn" testID="paste-pick-error">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
