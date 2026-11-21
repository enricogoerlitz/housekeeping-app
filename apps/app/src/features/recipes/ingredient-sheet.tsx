import { useArticles } from '@housekeeping/api';
import {
  addIngredientRows,
  chooseRowArticle,
  defaultShoppingRuleFor,
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
  ChoiceChips,
  List,
  ListRow,
  SearchOrCreate,
  Sheet,
  Stack,
  Text,
  TextField,
  type ChoiceOption,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

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
 * "+ Zutat" and ⋯ → "Bearbeiten" in the open section "Zutaten" (spec 0008, E9): Menge, the article
 * per "Suchen oder anlegen" over the household and the starter catalog, the Einkaufsregel
 * preselected from the article (spec 0007, AC-005), Zusatz for the list, Hinweis for cooking,
 * Variante and Gruppe. "Übernehmen" only changes the draft; a new or starter article is created
 * with "Fertig" in the same change. Without an article a new row is not taken (spec 0007, AC-004).
 */
export function IngredientSheet(props: {
  draft: IngredientsDraft;
  /** The row to edit; undefined = "+ Zutat". */
  rowKey?: string;
  onApply: (draft: IngredientsDraft) => void;
  onClose: () => void;
}) {
  const { draft } = props;
  const articles = useArticles();
  const row = draft.rows.find((candidate) => candidate.key === props.rowKey);

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

  const choose = (article: DraftArticle) => {
    setChosen(article);
    setQuery('');
    setArticleError(undefined);
  };
  const createNew = () => {
    const [problem] = validateArticleDraft({ name, synonyms: [] }, articles);
    if (problem) setArticleError(problem.message);
    else choose({ kind: 'new', name });
  };

  const apply = () => {
    if (!chosen) {
      setArticleError(CHOOSE_ARTICLE);
      return;
    }
    if (prepError) return;
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
    props.onApply(next);
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

  return (
    <Sheet
      visible
      size="m"
      title={row ? 'Zutat bearbeiten' : 'Neue Zutat'}
      onClose={props.onClose}
      testID="ingredient-sheet"
      footer={
        <Button
          label="Übernehmen"
          icon="check"
          full
          disabled={!!prepError}
          onPress={apply}
          testID="ingredient-save"
        />
      }
    >
      <Stack gap={18}>
        <TextField
          label="Menge"
          placeholder="z. B. 400 ml"
          value={amountText}
          onChangeText={setAmountText}
          autoFocus={!row}
          testID="ingredient-amount"
        />

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
              autoFocus={!!row}
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
        <TextField
          label="Gruppe"
          placeholder="z. B. Für die Soße"
          value={group}
          onChangeText={setGroup}
          testID="ingredient-group"
        />
      </Stack>
    </Sheet>
  );
}
