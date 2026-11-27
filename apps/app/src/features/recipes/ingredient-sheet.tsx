import { useArticles } from '@housekeeping/api';
import {
  addIngredientRows,
  amountScalingHint,
  chooseRowArticle,
  defaultShoppingRuleFor,
  groupProblem,
  groupSuggestions,
  newIngredientRow,
  parseAmount,
  RECIPE_LIMITS,
  setRowShoppingRule,
  updateIngredientRow,
  validateArticleDraft,
  type Article,
  type DraftArticle,
  type IngredientRow,
  type IngredientsDraft,
  type ShoppingRule,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  ChoiceChips,
  List,
  ListRow,
  Row,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  TextField,
  type ChoiceOption,
} from '@housekeeping/ui';
import { useRef, useState, type ComponentRef } from 'react';
import { View, type TextInput } from 'react-native';

import { discardFirst } from '@/features/shell/confirm-dialog';
import { UnitsHint } from '@/features/shell/units-hint';

import { STARTER_DETAIL, useArticleSearch } from './article-search';
import { newRowKey } from './sections/ingredient-handover';

const RULE_OPTIONS: ChoiceOption<ShoppingRule>[] = [
  { value: 'count', label: 'Anzahl' },
  { value: 'recipeAmount', label: 'Rezeptmenge' },
  { value: 'skip', label: 'nicht übernehmen' },
];
const BASE = 'base';
const CHOOSE_ARTICLE = 'Artikel wählen';
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const length = (text: string) => Array.from(collapse(text)).length;

type InputRef = ComponentRef<typeof TextInput>;

/** The article a row shows in the window: its household article as a hit, or what it chose. */
function chosenOf(row: IngredientRow | undefined, articles: readonly Article[]) {
  const article = row?.article;
  if (!article) return undefined;
  if (article.kind !== 'article') return article;
  const stored = articles.find((candidate) => candidate.id === article.articleId);
  if (!stored) return undefined;
  const hit: DraftArticle = {
    kind: 'hit',
    hit: {
      kind: 'article',
      id: stored.id,
      name: stored.name,
      synonyms: stored.synonyms,
      article: stored,
    },
  };
  return hit;
}

/**
 * "Neue Zutat" and "Zutat bearbeiten" (spec 0008, E9; spec 0023, REQ-001, REQ-002): the article
 * first per "Suchen oder anlegen" over the household and the starter catalog (focused on opening),
 * then "Menge" (the focus moves there after the choice, Enter takes it), the Einkaufsregel
 * preselected from the article (spec 0007, AC-005), Zusatz for the list, Hinweis for cooking,
 * Variante and Gruppe with the recipe's groups as suggestions. "Übernehmen" hands the changed
 * draft to the caller: the open section keeps it until "Fertig", the read view saves at once.
 * Without an article nothing is taken (AC-003).
 */
export function IngredientSheet(props: {
  draft: IngredientsDraft;
  /** The row to edit; undefined = "+ Zutat". */
  rowKey?: string;
  /** Under "Menge" when editing from the read view: "für 4 Portionen" (AC-005). */
  servingsNote?: string;
  onApply: (draft: IngredientsDraft, rowKey: string) => void;
  onClose: () => void;
}) {
  const { draft } = props;
  const articles = useArticles();
  const row = draft.rows.find((candidate) => candidate.key === props.rowKey);
  const amountInput = useRef<InputRef>(null);
  const articleInput = useRef<InputRef>(null);

  const [amountText, setAmountText] = useState(row?.amountText ?? '');
  const [initialChosen] = useState(() => chosenOf(row, articles));
  const [chosen, setChosen] = useState<DraftArticle | undefined>(initialChosen);
  const [query, setQuery] = useState(() => (row && !initialChosen ? (row.name ?? '') : ''));
  const [rule, setRule] = useState<ShoppingRule | undefined>();
  const [ruleChosen, setRuleChosen] = useState(false);
  const [shoppingNote, setShoppingNote] = useState(row?.shoppingNote ?? '');
  const [prepNote, setPrepNote] = useState(row?.prepNote ?? '');
  const [variant, setVariant] = useState<string>(row?.variantId ?? BASE);
  const [group, setGroup] = useState(row?.group ?? '');
  const [articleError, setArticleError] = useState<string | undefined>();
  const search = useArticleSearch(query);

  const amount = parseAmount(amountText);
  const name = collapse(query);
  // AC-005: until the person picks a rule, the article's Standard-Einkaufsregel (or the rule of
  // its amount) is preselected; only a picked rule becomes the article's rule (E7).
  const preselected: ShoppingRule | undefined = !chosen
    ? undefined
    : chosen.kind === 'new'
      ? defaultShoppingRuleFor({ isPantry: false }, amount)
      : chosen.hit.kind === 'article'
        ? defaultShoppingRuleFor(chosen.hit.article, amount)
        : defaultShoppingRuleFor({ isPantry: chosen.hit.entry.isPantry ?? false }, amount);
  const shownRule = (ruleChosen ? rule : row?.shoppingRule) ?? preselected;
  const prepError =
    length(prepNote) > RECIPE_LIMITS.prepNote
      ? `Höchstens ${RECIPE_LIMITS.prepNote} Zeichen`
      : undefined;
  const groupError = groupProblem(group);
  const groups = groupSuggestions(draft.rows).filter(
    (suggestion) => suggestion.toLocaleLowerCase('de') !== group.trim().toLocaleLowerCase('de'),
  );
  const amountHint = [props.servingsNote, amountScalingHint(amountText)]
    .filter(Boolean)
    .join(' · ');

  const choose = (article: DraftArticle) => {
    setChosen(article);
    setQuery('');
    setArticleError(undefined);
    // AC-001: after the article the amount, at once: a frame later it would take the focus from a
    // field tapped in between.
    amountInput.current?.focus();
  };
  const createNew = () => {
    const [problem] = validateArticleDraft({ name, synonyms: [] }, articles);
    if (problem) setArticleError(problem.message);
    else choose({ kind: 'new', name });
  };

  const apply = () => {
    if (!chosen) {
      // AC-003: the window stays, the amount too; the focus goes to the article.
      setArticleError(CHOOSE_ARTICLE);
      articleInput.current?.focus();
      return;
    }
    if (prepError || groupError) return;
    const key = row?.key ?? newRowKey();
    let next = row ? draft : addIngredientRows(draft, [newIngredientRow(key)]);
    next = updateIngredientRow(next, key, {
      amountText: collapse(amountText),
      shoppingNote,
      prepNote,
      variantId: variant === BASE ? undefined : variant,
      group,
    });
    if (chosen !== initialChosen) next = chooseRowArticle(next, key, chosen);
    if (ruleChosen && rule) next = setRowShoppingRule(next, key, rule);
    props.onApply(next, key);
  };

  const chosenName =
    chosen?.kind === 'new' ? chosen.name : chosen?.kind === 'hit' ? chosen.hit.name : '';
  const chosenDetail = !chosen
    ? undefined
    : chosen.kind === 'new'
      ? 'Wird mit „Fertig“ neu angelegt'
      : [chosen.hit.kind === 'starter' ? STARTER_DETAIL : undefined, search.areaOf(chosen.hit)]
          .filter(Boolean)
          .join(' · ') || 'Ohne Bereich';

  // Typed or chosen something: closing asks first (I-07).
  const dirty =
    chosen !== initialChosen ||
    query.trim() !== (row && !initialChosen ? (row.name ?? '') : '').trim() ||
    amountText !== (row?.amountText ?? '') ||
    shoppingNote !== (row?.shoppingNote ?? '') ||
    prepNote !== (row?.prepNote ?? '') ||
    group !== (row?.group ?? '');

  return (
    <Sheet
      visible
      size="m"
      title={row ? 'Zutat bearbeiten' : 'Neue Zutat'}
      onClose={() => discardFirst(dirty, props.onClose)}
      testID="ingredient-sheet"
      actions={{
        primary: {
          label: 'Übernehmen',
          icon: 'check',
          disabled: !!prepError || !!groupError,
          onPress: apply,
          testID: 'ingredient-save',
        },
      }}
    >
      <Stack gap={18}>
        <View testID="ingredient-article">
          <Text variant="smallStrong" style={{ marginBottom: 6 }}>
            Artikel
          </Text>
          {chosen ? (
            <List>
              <ListRow
                title={chosenName}
                subtitle={chosenDetail}
                trailing={
                  <Button
                    label="Ändern"
                    variant="link"
                    size="sm"
                    onPress={() => {
                      setQuery(chosenName);
                      setChosen(undefined);
                      requestAnimationFrame(() => articleInput.current?.focus());
                    }}
                    testID="ingredient-article-change"
                  />
                }
                testID="ingredient-article-chosen"
              />
            </List>
          ) : (
            <SearchOrCreate
              query={query}
              onQueryChange={(value) => {
                setQuery(value);
                setArticleError(undefined);
              }}
              label="Artikel"
              placeholder="Artikel suchen oder anlegen"
              clearLabel="Suche leeren"
              autoFocus
              enterSelects
              inputRef={articleInput}
              hits={search.hits}
              onSelect={(key) => {
                const hit = search.hitFor(key);
                if (hit) choose({ kind: 'hit', hit });
              }}
              createOptions={
                search.result.canCreate ? [{ key: 'article', label: `„${name}“ neu anlegen` }] : []
              }
              onCreate={createNew}
              brake={
                search.result.similar
                  ? {
                      question: `Meinst du ${search.result.similar.name}?`,
                      acceptLabel: 'Ja',
                      createAnywayLabel: 'Trotzdem neu',
                      onAccept: () => {
                        const similar = search.result.similar;
                        if (similar) choose({ kind: 'hit', hit: similar });
                      },
                    }
                  : undefined
              }
              testID="ingredient-article-search"
            />
          )}
          {articleError ? (
            <Text
              variant="smallStrong"
              color="warn"
              style={{ marginTop: 6 }}
              testID="ingredient-article-error"
            >
              {articleError}
            </Text>
          ) : null}
        </View>

        <TextField
          label="Menge"
          placeholder="freiwillig, z. B. 400 ml"
          hint={amountHint || undefined}
          value={amountText}
          onChangeText={setAmountText}
          inputRef={amountInput}
          returnKeyType="done"
          onSubmitEditing={apply}
          testID="ingredient-amount"
        />
        <UnitsHint testID="ingredient-units" />

        <View testID="ingredient-rule-field">
          <Text variant="smallStrong" style={{ marginBottom: 6 }}>
            Einkaufsregel
          </Text>
          {shownRule ? (
            <>
              <ChoiceChips<ShoppingRule>
                label="Einkaufsregel"
                options={RULE_OPTIONS}
                value={shownRule}
                onChange={(value) => {
                  setRule(value);
                  setRuleChosen(true);
                }}
                testID="ingredient-rule"
              />
              <Text variant="small" color="muted" style={{ marginTop: 6 }}>
                Wie die Zutat auf die Einkaufsliste kommt; deine Wahl merkt sich der Artikel.
              </Text>
            </>
          ) : (
            <Text variant="small" color="muted">
              Kommt vom Artikel – wähle zuerst einen.
            </Text>
          )}
        </View>

        <TextField
          label="Zusatz für die Liste"
          placeholder="z. B. Philadelphia, laktosefrei"
          hint="Steht auf der Einkaufsliste in Klammern hinter dem Artikel"
          value={shoppingNote}
          onChangeText={setShoppingNote}
          testID="ingredient-shopping-note"
        />
        <TextField
          label="Hinweis fürs Kochen"
          placeholder="z. B. fein gehackt"
          hint={prepError ? undefined : 'Nur fürs Kochen, nicht auf der Einkaufsliste'}
          error={prepError}
          value={prepNote}
          onChangeText={setPrepNote}
          testID="ingredient-prep-note"
        />
        {draft.variants.length > 0 ? (
          <View testID="ingredient-variant-field">
            <Text variant="smallStrong" style={{ marginBottom: 6 }}>
              Variante
            </Text>
            <ChoiceChips<string>
              label="Variante"
              options={[
                { value: BASE, label: 'Basis' },
                ...draft.variants.map((option) => ({
                  value: option.id,
                  label: option.name.trim() || 'Ohne Namen',
                })),
              ]}
              value={draft.variants.some((option) => option.id === variant) ? variant : BASE}
              onChange={setVariant}
              testID="ingredient-variant"
            />
          </View>
        ) : null}
        <Stack gap={8}>
          <TextField
            label="Gruppe"
            placeholder="z. B. Für die Soße"
            error={groupError}
            value={group}
            onChangeText={setGroup}
            testID="ingredient-group"
          />
          {groups.length > 0 ? (
            <View testID="ingredient-group-suggestions">
              <Row gap={8} wrap>
                {groups.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    onPress={() => setGroup(suggestion)}
                    testID={`ingredient-group-${suggestion}`}
                  />
                ))}
              </Row>
            </View>
          ) : null}
        </Stack>
      </Stack>
    </Sheet>
  );
}
