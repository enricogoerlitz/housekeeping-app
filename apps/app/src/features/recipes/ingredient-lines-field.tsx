import { starterCatalogEntries, useArticles, useRecipes } from '@housekeeping/api';
import {
  articleUseCounts,
  ingredientDrafts,
  ingredientPreview,
  linePickKey,
  replaceLineArticle,
  typingSuggestions,
  withLinePicks,
  type DraftArticle,
  type IngredientPreviewLine,
  type LinePicks,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  Icon,
  List,
  ListRow,
  revealInScrollParent,
  SearchOrCreate,
  stickyBottomStyle,
  Text,
  TextField,
  useTheme,
} from '@housekeeping/ui';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, ScrollView, View, type TextInput } from 'react-native';

import { useArticleSearch } from './article-search';

// react-native-web passes `onKeyDownCapture` and `onKeyUpCapture` through to the DOM. Its text input
// stops keydown from bubbling, so the wrapper listens while the event goes down to it.
type KeyEvent = { key: string; preventDefault: () => void; stopPropagation: () => void };
type InputRef = ComponentRef<typeof TextInput>;

/** The text area behind the field on the web, for the cursor; undefined elsewhere. */
function textArea(node: InputRef | null): HTMLTextAreaElement | undefined {
  if (Platform.OS !== 'web') return undefined;
  const element = node as unknown;
  return typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement
    ? element
    : undefined;
}

export interface IngredientLinesFieldProps {
  label: string;
  text: string;
  onChangeText: (text: string) => void;
  /** The articles picked in the preview, by line name; used on saving (spec 0050, REQ-003). */
  picks: LinePicks;
  onChangePicks: (picks: LinePicks) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  testID: string;
}

/**
 * "Zutaten einfügen" with suggestions (spec 0050): while a line is typed, up to five household
 * articles stand as chips under the field — at the window's bottom edge, i.e. on the keyboard,
 * when the field reaches further (Entscheidung 3). A chip replaces the line's article words and
 * keeps amount and unit (REQ-002); on the desktop arrow down/up mark one and Enter takes it.
 * Below, every line shows what it becomes; a tap picks another article for it (REQ-003).
 */
export function IngredientLinesField(props: IngredientLinesFieldProps) {
  const theme = useTheme();
  const articles = useArticles();
  const recipes = useRecipes();
  const uses = useMemo(() => articleUseCounts(recipes), [recipes]);
  const input = useRef<InputRef | null>(null);
  const [cursor, setCursor] = useState(props.text.length);
  const [marked, setMarked] = useState(-1);
  // Escape hides the chips until the text changes (AC-010).
  const [hiddenFor, setHiddenFor] = useState<string | undefined>();
  const [picking, setPicking] = useState<string | undefined>();
  // The window closes on Escape's keyup (react-native-web's Modal); one that hid the chips must not.
  const escaped = useRef(false);

  const suggestions =
    hiddenFor === props.text || picking !== undefined
      ? []
      : typingSuggestions(props.text, cursor, articles, uses);
  const preview = ingredientPreview(
    withLinePicks(
      ingredientDrafts(props.text, articles, starterCatalogEntries, keys()),
      props.picks,
    ),
  );

  const change = (text: string) => {
    props.onChangeText(text);
    const area = textArea(input.current);
    setCursor(area ? area.selectionEnd : text.length);
    setMarked(-1);
  };

  const take = (name: string) => {
    const next = replaceLineArticle(props.text, cursor, name);
    if (!next) return;
    props.onChangeText(next.text);
    setCursor(next.cursor);
    setMarked(-1);
    // The cursor stays in the field behind the line (AC-008), so typing goes on at once.
    input.current?.focus();
    requestAnimationFrame(() =>
      textArea(input.current)?.setSelectionRange(next.cursor, next.cursor),
    );
  };

  const onKeyDown = (event: KeyEvent) => {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMarked(Math.min(marked + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp' && marked >= 0) {
      event.preventDefault();
      setMarked(marked - 1);
    } else if (event.key === 'Enter' && marked >= 0) {
      const chosen = suggestions[marked];
      if (!chosen) return;
      event.preventDefault();
      take(chosen.item.name);
    } else if (event.key === 'Escape') {
      // Only the chips go; the window stays open.
      event.preventDefault();
      escaped.current = true;
      setHiddenFor(props.text);
      setMarked(-1);
    }
  };

  const onKeyUp = (event: KeyEvent) => {
    if (event.key !== 'Escape' || !escaped.current) return;
    escaped.current = false;
    event.stopPropagation();
  };

  const pick = (typed: string, article: DraftArticle | undefined) => {
    const next = new Map(props.picks);
    if (article) next.set(linePickKey(typed), article);
    else next.delete(linePickKey(typed));
    props.onChangePicks(next);
    setPicking(undefined);
  };

  return (
    <View style={{ gap: 12 }}>
      <View {...({ onKeyDownCapture: onKeyDown, onKeyUpCapture: onKeyUp } as object)}>
        <TextField
          label={props.label}
          placeholder={props.placeholder}
          hint={props.hint}
          error={props.error}
          value={props.text}
          onChangeText={change}
          onSelectionChange={(event) => setCursor(event.nativeEvent.selection.end)}
          multiline
          autoFocus={props.autoFocus}
          inputRef={input}
          testID={props.testID}
        />
      </View>
      {suggestions.length > 0 ? (
        <View
          testID={`${props.testID}-suggestions`}
          style={[{ paddingVertical: 6 }, stickyBottomStyle(Platform.OS, theme.colors.bg)]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {suggestions.map((match, index) => (
                <Chip
                  key={match.item.id}
                  label={match.item.name}
                  icon="plus"
                  selected={index === marked}
                  onPress={() => take(match.item.name)}
                  testID={`${props.testID}-suggestion-${match.item.id}`}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
      {preview.length > 0 ? (
        <View style={{ gap: 6 }} testID={`${props.testID}-preview`}>
          <Text variant="smallStrong">So wird es gespeichert</Text>
          <List>
            {preview.map((line, index) => (
              <PreviewRow
                key={line.key}
                line={line}
                picked={props.picks.has(linePickKey(line.typed))}
                open={picking === line.key}
                onToggle={() => setPicking(picking === line.key ? undefined : line.key)}
                onPick={(article) => pick(line.typed, article)}
                testID={`${props.testID}-preview-${index}`}
              />
            ))}
          </List>
        </View>
      ) : null}
    </View>
  );
}

/** Keys by position, so a preview row keeps its identity while its line is typed. */
function keys(): () => string {
  let next = 0;
  return () => `line-${next++}`;
}

function previewTitle(line: IngredientPreviewLine): string {
  const name = line.state === 'new' ? `${line.name} (neu)` : line.name;
  return line.amount ? `${line.amount} · ${name}` : name;
}

function previewSubtitle(line: IngredientPreviewLine): string | undefined {
  if (line.state === 'similar') return `Meinst du ${line.suggestion ?? ''}?`;
  if (line.state === 'created') return 'Wird neu angelegt';
  if (line.state === 'article' && line.name !== line.typed) return `statt „${line.typed}“`;
  return undefined;
}

function PreviewRow(props: {
  line: IngredientPreviewLine;
  picked: boolean;
  open: boolean;
  onToggle: () => void;
  onPick: (article: DraftArticle | undefined) => void;
  testID: string;
}) {
  const { line } = props;
  const sure = line.state === 'article' || line.state === 'created';
  return (
    <>
      <ListRow
        title={previewTitle(line)}
        subtitle={previewSubtitle(line)}
        trailing={
          sure ? (
            <Icon name="check" size={18} color="accent" />
          ) : (
            <Text variant="small" color="warn">
              Artikel wählen
            </Text>
          )
        }
        onPress={props.onToggle}
        accessibilityLabel={`${previewTitle(line)}${sure ? ', zugeordnet' : ''}`}
        hint="Anderen Artikel wählen"
        testID={props.testID}
      />
      {props.open ? (
        <Revealed>
          <PickArticle typed={line.typed} onPick={props.onPick} testID={`${props.testID}-pick`} />
          {props.picked ? (
            <Button
              label="Wie getippt"
              variant="link"
              onPress={() => props.onPick(undefined)}
              testID={`${props.testID}-unpick`}
            />
          ) : null}
        </Revealed>
      ) : null}
    </>
  );
}

/** The search under a preview row scrolls into the window's view once it opens. */
function Revealed(props: { children: ReactNode }) {
  const box = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    requestAnimationFrame(() => revealInScrollParent(box.current, { align: 'nearest' }));
  }, []);
  return (
    <View ref={box} style={{ padding: 12, gap: 8 }}>
      {props.children}
    </View>
  );
}

/** "Suchen oder anlegen" for one preview line, like the article of an ingredient (spec 0007). */
function PickArticle(props: {
  typed: string;
  onPick: (article: DraftArticle) => void;
  testID: string;
}) {
  const [query, setQuery] = useState(props.typed);
  const search = useArticleSearch(query);
  const name = query.trim();
  return (
    <SearchOrCreate
      query={query}
      onQueryChange={setQuery}
      label="Artikel"
      placeholder="Artikel suchen oder anlegen"
      clearLabel="Suche leeren"
      autoFocus
      enterSelects
      hits={search.hits}
      onSelect={(key) => {
        const hit = search.hitFor(key);
        if (hit) props.onPick({ kind: 'hit', hit });
      }}
      createOptions={
        search.result.canCreate && name !== ''
          ? [{ key: 'article', label: `„${name}“ neu anlegen` }]
          : []
      }
      onCreate={() => props.onPick({ kind: 'new', name })}
      brake={
        search.result.similar
          ? {
              question: `Meinst du ${search.result.similar.name}?`,
              acceptLabel: 'Ja',
              createAnywayLabel: 'Trotzdem neu',
              onAccept: () => {
                const similar = search.result.similar;
                if (similar) props.onPick({ kind: 'hit', hit: similar });
              },
            }
          : undefined
      }
      testID={props.testID}
    />
  );
}
