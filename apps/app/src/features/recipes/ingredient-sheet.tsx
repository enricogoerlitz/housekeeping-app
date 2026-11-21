import {
  addIngredient,
  PREP_NOTE_MAX_LENGTH,
  updateIngredient,
  useArticles,
  type IngredientInput,
} from '@housekeeping/api';
import {
  defaultShoppingRuleFor,
  parseAmount,
  validateArticleDraft,
  type DraftArticle,
  type Id,
  type RecipeIngredient,
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
  toast,
  type ChoiceOption,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { STARTER_DETAIL, useArticleSearch } from './article-search';

const RULE_OPTIONS: ChoiceOption<ShoppingRule>[] = [
  { value: 'count', label: 'Anzahl' },
  { value: 'recipeAmount', label: 'Rezeptmenge' },
  { value: 'skip', label: 'nicht übernehmen' },
];
const CHOOSE_ARTICLE = 'Artikel wählen';
const length = (text: string) => Array.from(text.replace(/\s+/g, ' ').trim()).length;
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * "+ Zutat" and "Zutat bearbeiten" (REQ-001, REQ-003): Menge, the article per "Suchen oder anlegen"
 * over the household and the starter catalog, the Einkaufsregel preselected from the article
 * (AC-005), Einkaufs-Zusatz (goes to the list) and Hinweis (only for cooking). Without an article
 * the ingredient is not saved (AC-004). Online only.
 */
export function IngredientSheet(props: {
  recipeId: Id;
  /** Undefined = "+ Zutat". */
  ingredient?: RecipeIngredient;
  onClose: () => void;
}) {
  const { ingredient } = props;
  const articles = useArticles();
  const online = useOnlineOnly();
  const current = articles.find((article) => article.id === ingredient?.articleId);

  const [amountText, setAmountText] = useState(ingredient?.amount?.text ?? '');
  const [chosen, setChosen] = useState<DraftArticle | undefined>(() =>
    current
      ? {
          kind: 'hit',
          hit: {
            kind: 'article',
            id: current.id,
            name: current.name,
            synonyms: current.synonyms,
            article: current,
          },
        }
      : undefined,
  );
  const [query, setQuery] = useState('');
  const [rule, setRule] = useState<ShoppingRule | undefined>(ingredient?.shoppingRule);
  const [shoppingNote, setShoppingNote] = useState(ingredient?.shoppingNote ?? '');
  const [prepNote, setPrepNote] = useState(ingredient?.prepNote ?? '');
  const [articleError, setArticleError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const search = useArticleSearch(query);

  const amount = parseAmount(amountText);
  const name = collapse(query);
  // AC-005: until the person picks a rule, the article's Standard-Einkaufsregel (or the rule of
  // its amount) is preselected; only a picked rule is sent and remembered at the article (E7).
  const preselected: ShoppingRule | undefined = !chosen
    ? undefined
    : chosen.kind === 'new'
      ? defaultShoppingRuleFor({ isPantry: false }, amount)
      : chosen.hit.kind === 'article'
        ? defaultShoppingRuleFor(chosen.hit.article, amount)
        : defaultShoppingRuleFor({ isPantry: chosen.hit.entry.isPantry ?? false }, amount);
  const shownRule = rule ?? preselected;
  const prepTooLong = length(prepNote) > PREP_NOTE_MAX_LENGTH;
  const prepError = prepTooLong ? `Höchstens ${PREP_NOTE_MAX_LENGTH} Zeichen` : undefined;

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

  const choiceOf = (article: DraftArticle): IngredientInput['article'] =>
    article.kind === 'new' ? { newName: article.name } : { hit: article.hit };

  const save = () => {
    if (online.disabled) return;
    if (!chosen) {
      setArticleError(CHOOSE_ARTICLE);
      return;
    }
    if (prepTooLong) return;
    try {
      if (!ingredient) {
        const input: IngredientInput = { article: choiceOf(chosen) };
        if (amount) input.amount = amount;
        if (rule) input.shoppingRule = rule;
        if (shoppingNote.trim()) input.shoppingNote = shoppingNote;
        if (prepNote.trim()) input.prepNote = prepNote;
        addIngredient(props.recipeId, input);
        toast.show({ message: 'Zutat hinzugefügt' });
      } else {
        const patch: Parameters<typeof updateIngredient>[2] = {};
        const sameArticle =
          chosen.kind === 'hit' &&
          chosen.hit.kind === 'article' &&
          chosen.hit.id === ingredient.articleId;
        if (!sameArticle) patch.article = choiceOf(chosen);
        if ((amount?.text ?? '') !== (ingredient.amount?.text ?? '')) patch.amount = amount;
        if (rule && rule !== ingredient.shoppingRule) patch.shoppingRule = rule;
        if (collapse(shoppingNote) !== (ingredient.shoppingNote ?? ''))
          patch.shoppingNote = shoppingNote;
        if (collapse(prepNote) !== (ingredient.prepNote ?? '')) patch.prepNote = prepNote;
        if (Object.keys(patch).length > 0) {
          updateIngredient(props.recipeId, ingredient.id, patch);
          toast.show({ message: 'Zutat gespeichert' });
        }
      }
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
    }
  };

  const chosenName =
    chosen?.kind === 'new' ? chosen.name : chosen?.kind === 'hit' ? chosen.hit.name : '';
  const chosenDetail = !chosen
    ? undefined
    : chosen.kind === 'new'
      ? 'Wird neu angelegt'
      : [chosen.hit.kind === 'starter' ? STARTER_DETAIL : undefined, search.areaOf(chosen.hit)]
          .filter(Boolean)
          .join(' · ') || 'Ohne Bereich';

  return (
    <Sheet
      visible
      size="m"
      title={ingredient ? 'Zutat bearbeiten' : 'Neue Zutat'}
      onClose={props.onClose}
      testID="ingredient-sheet"
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          disabled={online.disabled || prepTooLong}
          hint={online.hint}
          onPress={save}
          testID="ingredient-save"
        />
      }
    >
      <Stack gap={18}>
        {online.hint ? (
          <Text variant="small" color="warn" testID="ingredient-offline-hint">
            {online.hint}
          </Text>
        ) : null}
        <TextField
          label="Menge"
          placeholder="z. B. 400 ml"
          value={amountText}
          onChangeText={setAmountText}
          editable={!online.disabled}
          autoFocus={!ingredient}
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
                    disabled={online.disabled}
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
              autoFocus={!!ingredient}
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
              createDisabledHint={online.hint}
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

        <View pointerEvents={online.disabled ? 'none' : 'auto'} testID="ingredient-rule-field">
          <Text variant="smallStrong" style={{ marginBottom: 6 }}>
            Einkaufsregel
          </Text>
          {shownRule ? (
            <>
              <ChoiceChips<ShoppingRule>
                label="Einkaufsregel"
                options={RULE_OPTIONS}
                value={shownRule}
                onChange={setRule}
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
          label="Einkaufs-Zusatz"
          placeholder="z. B. Philadelphia, laktosefrei"
          hint="Steht auf der Einkaufsliste in Klammern hinter dem Artikel"
          value={shoppingNote}
          onChangeText={setShoppingNote}
          editable={!online.disabled}
          testID="ingredient-shopping-note"
        />
        <TextField
          label="Hinweis"
          placeholder="z. B. fein gehackt"
          hint={prepError ? undefined : 'Nur fürs Kochen, nicht auf der Einkaufsliste'}
          error={prepError}
          value={prepNote}
          onChangeText={setPrepNote}
          editable={!online.disabled}
          testID="ingredient-prep-note"
        />
        {error ? (
          <Text variant="small" color="warn" testID="ingredient-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
