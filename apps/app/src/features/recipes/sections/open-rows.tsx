import { useArticles } from '@housekeeping/api';
import {
  pastedSaveNotice,
  validateArticleDraft,
  type DraftArticle,
  type IngredientRow,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  IconButton,
  Row,
  SearchOrCreate,
  Stack,
  Text,
  useTheme,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { useArticleSearch } from '../article-search';

/** "200 ml Kokosmilch", "1 TL Bockshornklee", "Salz" — what was pasted or typed. */
export function openRowLabel(row: IngredientRow): string {
  return [row.amountText.trim(), row.name ?? ''].filter(Boolean).join(' ');
}

/**
 * The rows of the section "Zutaten" that are not saved yet (AC-032, spec 0007 AC-008 to AC-010):
 * orange with "Meinst du …?", "Artikel wählen" and "„…“ neu anlegen"; a pasted duplicate with
 * "Steht schon im Rezept", "Weglassen" and "Trotzdem hinzufügen" (spec 0023, REQ-006). Leaving the
 * page drops them. Above them what "Fertig" saved and what stays open.
 */
export function OpenRows(props: {
  rows: IngredientRow[];
  /** After "Fertig": "5 Zutaten gespeichert · 2 brauchen noch einen Artikel". */
  notice?: string;
  onChoose: (key: string, article: DraftArticle) => void;
  onRemove: (key: string) => void;
  /** "Trotzdem hinzufügen" on a duplicate. */
  onKeep: (key: string) => void;
}) {
  const [picking, setPicking] = useState<string | undefined>();
  if (props.rows.length === 0) return null;
  return (
    <Stack gap={10}>
      <Text variant="smallStrong" color="warn" testID="recipe-ingredients-missing">
        {props.notice ?? pastedSaveNotice(0, props.rows)}
      </Text>
      {props.rows.map((row) =>
        row.article !== undefined && row.duplicate ? (
          <DuplicateRow
            key={row.key}
            row={row}
            onDrop={() => props.onRemove(row.key)}
            onKeep={() => props.onKeep(row.key)}
          />
        ) : (
          <OpenRow
            key={row.key}
            row={row}
            picking={picking === row.key}
            onPick={() => setPicking(picking === row.key ? undefined : row.key)}
            onChoose={(article) => {
              setPicking(undefined);
              props.onChoose(row.key, article);
            }}
            onRemove={() => props.onRemove(row.key)}
          />
        ),
      )}
    </Stack>
  );
}

/** A pasted row whose article is in the recipe already (AC-019 to AC-021). */
function DuplicateRow(props: { row: IngredientRow; onDrop: () => void; onKeep: () => void }) {
  const theme = useTheme();
  const id = `open-row-${props.row.key}`;
  const label = openRowLabel(props.row);
  return (
    <View
      testID={id}
      accessibilityLabel={`${label}: Steht schon im Rezept`}
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
          {label}
        </Text>
      </Row>
      <Text color="warn" testID={`${id}-duplicate`}>
        Steht schon im Rezept
      </Text>
      <Row gap={8} wrap>
        <Button
          label="Weglassen"
          size="sm"
          variant="secondary"
          onPress={props.onDrop}
          testID={`${id}-drop`}
        />
        <Button
          label="Trotzdem hinzufügen"
          size="sm"
          variant="link"
          onPress={props.onKeep}
          testID={`${id}-keep`}
        />
      </Row>
    </View>
  );
}

function OpenRow(props: {
  row: IngredientRow;
  picking: boolean;
  onPick: () => void;
  onChoose: (article: DraftArticle) => void;
  onRemove: () => void;
}) {
  const { row } = props;
  const theme = useTheme();
  const online = useOnlineOnly();
  const id = `open-row-${row.key}`;
  const label = openRowLabel(row);
  const name = (row.name ?? '').trim();
  return (
    <View
      testID={id}
      accessibilityLabel={`${label}: Artikel wählen`}
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
          {label || 'Neue Zutat'}
        </Text>
        <IconButton
          icon="trash"
          label={`${label || 'Zutat'} entfernen`}
          onPress={props.onRemove}
          testID={`${id}-remove`}
        />
      </Row>
      {row.suggestion ? (
        <View
          testID={`${id}-suggestion`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
        >
          <Text color="warn">Meinst du {row.suggestion.name}?</Text>
          <Button
            label="Ja"
            size="sm"
            variant="secondary"
            onPress={() => {
              if (row.suggestion) props.onChoose({ kind: 'hit', hit: row.suggestion });
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
        {row.suggestion || !name ? null : (
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
      {props.picking ? <ArticlePicker initial={name} onChoose={props.onChoose} /> : null}
    </View>
  );
}

/** "Artikel wählen" for one row: "Suchen oder anlegen", starting with the pasted name. */
function ArticlePicker(props: { initial: string; onChoose: (article: DraftArticle) => void }) {
  const articles = useArticles();
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
        testID="open-row-pick"
      />
      {error ? (
        <Text variant="small" color="warn" testID="open-row-pick-error">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
