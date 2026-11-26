import {
  confirmArticle,
  deleteArticle,
  updateArticle,
  useAreas,
  useArticles,
  useRecipes,
  useShoppingItems,
} from '@housekeeping/api';
import {
  articleUsage,
  mergeTargets,
  validateArticleDraft,
  type Article,
  type Id,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  Chip,
  Icon,
  IconButton,
  List,
  ListRow,
  Notice,
  Row,
  SearchOrCreate,
  Sheet,
  Stack,
  Surface,
  SwitchRow,
  Text,
  TextField,
  toast,
  type SheetAction,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useOpenRecipe } from '@/features/recipes/navigation';
import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';
import { AreaPicker } from '@/features/stores/area-picker';

import { DIET_OPTIONS, RULE_OPTIONS, type RuleChoice } from './labels';
import { errorMessage } from '@/features/shell/error-message';

const FAILED = 'Das hat nicht geklappt.';
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const messageOf = (error: unknown) => errorMessage(error, FAILED);

export interface ArticleEditorProps {
  articleId: Id;
  /** "Fertig" or ✕. */
  onClose: () => void;
  /** "Zusammenführen" with this target: the screen asks first (small window, AC-036). */
  onMerge: (targetId: Id) => void;
}

type Step = 'main' | 'area' | 'merge';

/** A label above a field that is not a TextField. */
function FieldLabel(props: { children: string }) {
  return (
    <Text variant="smallStrong" style={{ marginBottom: 6 }}>
      {props.children}
    </Text>
  );
}

/** "Zusammenführen mit …": the other articles of the household; the article itself never shows. */
function MergeStep(props: { article: Article; onPick: (targetId: Id) => void }) {
  const articles = useArticles();
  const areas = useAreas();
  const [query, setQuery] = useState('');
  const hits = query.trim() ? mergeTargets(query, props.article.id, articles) : [];
  const areaName = (areaId: Id | undefined) => areas.find((area) => area.id === areaId)?.name;
  return (
    <Stack gap={12}>
      <Text color="muted">
        In welchem Artikel soll „{props.article.name}“ aufgehen? Rezepte, Posten und Synonyme ziehen
        mit.
      </Text>
      <SearchOrCreate
        query={query}
        onQueryChange={setQuery}
        label="Artikel suchen"
        placeholder="Artikel suchen …"
        clearLabel="Suche leeren"
        autoFocus
        hits={hits.map((match) => ({
          key: match.item.id,
          title: match.item.name,
          detail: match.matchedSynonym ? `auch: ${match.matchedSynonym}` : undefined,
          meta: areaName(match.item.areaId),
        }))}
        onSelect={props.onPick}
        createOptions={[]}
        onCreate={() => {}}
        testID="article-merge-search"
      />
      {query.trim() && hits.length === 0 ? (
        <Text variant="small" color="muted" testID="article-merge-none">
          Kein anderer Artikel passt zu „{query.trim()}“.
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * "Artikel bearbeiten" (REQ-006): name, synonyms, area, Vorrat, diet, Standard-Einkaufsregel,
 * "In Rezepten", "Zusammenführen mit …" and "Löschen". The name is saved with "Fertig" (or Enter,
 * or when the field loses focus); every other field at once. Returns the parts, so the same editor
 * fills the medium window on phones and the right column on wide screens.
 */
export function useArticleEditor(props: ArticleEditorProps): {
  title: string;
  body: ReactNode;
  footer: ReactNode;
  /** "Fertig" of the main step; a window shows it among its actions instead of `footer`. */
  done?: SheetAction;
} {
  const articles = useArticles();
  const areas = useAreas();
  const recipes = useRecipes();
  const items = useShoppingItems();
  const online = useOnlineOnly();
  const openRecipe = useOpenRecipe();
  const article = articles.find((candidate) => candidate.id === props.articleId);

  const [step, setStep] = useState<Step>('main');
  const [name, setName] = useState(article?.name ?? '');
  const [synonym, setSynonym] = useState('');
  const [synonymError, setSynonymError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (!article) return { title: 'Artikel bearbeiten', body: null, footer: null };

  const write = (action: () => void): boolean => {
    try {
      action();
      setError(undefined);
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    }
  };

  const nameProblem = validateArticleDraft(
    { id: article.id, name, synonyms: article.synonyms },
    articles,
  ).find((problem) => problem.field === 'name');
  const saveName = (): boolean => {
    if (nameProblem) return false;
    if (collapse(name) === article.name) return true;
    return write(() => updateArticle(article.id, { name }));
  };
  const done = () => {
    if (online.disabled || saveName()) props.onClose();
  };

  const addSynonym = () => {
    const text = collapse(synonym);
    if (!text) return;
    const synonyms = [...article.synonyms, text];
    const [problem] = validateArticleDraft(
      { id: article.id, name: article.name, synonyms },
      articles,
    ).filter((candidate) => candidate.field === 'synonyms');
    if (problem) {
      setSynonymError(problem.message);
      return;
    }
    if (write(() => updateArticle(article.id, { synonyms }))) setSynonym('');
  };
  const removeSynonym = (removed: string) =>
    write(() =>
      updateArticle(article.id, {
        synonyms: article.synonyms.filter((candidate) => candidate !== removed),
      }),
    );

  const usage = articleUsage(article.id, recipes, items);
  // Asks first (spec 0036, Entscheidung 1).
  const remove = () =>
    confirmFirst({
      title: `„${article.name}“ löschen?`,
      confirmLabel: 'Löschen',
      onConfirm: () => {
        if (!write(() => deleteArticle(article.id))) return;
        props.onClose();
        toast.show({ message: `„${article.name}“ gelöscht` });
      },
      testID: 'confirm-delete-article',
    });

  const area = areas.find((candidate) => candidate.id === article.areaId);
  // Text fields and choice chips have no greyed-out look of their own; offline they get one.
  const offlineGrey = online.disabled ? { opacity: 0.45 } : undefined;
  const rule: RuleChoice = article.defaultShoppingRule ?? 'unset';

  if (step === 'area') {
    return {
      title: `Bereich für ${article.name}`,
      body: (
        <AreaPicker
          articleId={article.id}
          currentAreaId={article.areaId}
          onPicked={() => setStep('main')}
          testID="article-area"
        />
      ),
      footer: (
        <Button
          label="Zurück"
          icon="chevron-left"
          variant="secondary"
          onPress={() => setStep('main')}
          testID="article-step-back"
        />
      ),
    };
  }
  if (step === 'merge') {
    return {
      title: `${article.name} zusammenführen mit …`,
      body: (
        <MergeStep
          article={article}
          onPick={(targetId) => {
            setStep('main');
            props.onMerge(targetId);
          }}
        />
      ),
      footer: (
        <Button
          label="Zurück"
          icon="chevron-left"
          variant="secondary"
          onPress={() => setStep('main')}
          testID="article-step-back"
        />
      ),
    };
  }

  const body = (
    <Stack gap={18}>
      {article.needsReview ? (
        <Notice
          icon="circle-alert"
          text="Neu aus Rezepten – stimmen Name, Bereich und Ernährung?"
          action={
            <Button
              label="Passt so"
              variant="link"
              size="sm"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => write(() => confirmArticle(article.id))}
              testID="article-confirm"
            />
          }
          testID="article-needs-review"
        />
      ) : null}
      {online.hint ? (
        <Text variant="small" color="warn" testID="article-offline-hint">
          {online.hint}
        </Text>
      ) : null}
      <View style={offlineGrey}>
        <TextField
          label="Name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(undefined);
          }}
          onSubmitEditing={() => saveName()}
          onBlur={() => saveName()}
          returnKeyType="done"
          editable={!online.disabled}
          error={nameProblem?.message}
          testID="article-name"
        />
        {nameProblem?.kind === 'taken' ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <Button
              label="Zusammenführen …"
              variant="link"
              size="sm"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => props.onMerge(nameProblem.existing.id)}
              testID="article-name-merge"
            />
          </View>
        ) : null}
      </View>

      <View>
        <FieldLabel>Synonyme</FieldLabel>
        {article.synonyms.length > 0 ? (
          <Row wrap gap={8} style={{ marginBottom: 8 }}>
            {article.synonyms.map((entry, index) => (
              <Chip
                key={entry}
                label={entry}
                removable
                disabled={online.disabled}
                accessibilityLabel={`${entry} entfernen`}
                onPress={() => removeSynonym(entry)}
                testID={`article-synonym-${index}`}
              />
            ))}
          </Row>
        ) : null}
        <View style={offlineGrey}>
          <TextField
            accessibilityLabel="Synonym hinzufügen"
            placeholder="Synonym hinzufügen, z. B. Karotten"
            value={synonym}
            onChangeText={(value) => {
              setSynonym(value);
              setSynonymError(undefined);
            }}
            onSubmitEditing={addSynonym}
            blurOnSubmit={false}
            returnKeyType="done"
            editable={!online.disabled}
            error={synonymError}
            hint={synonymError ? undefined : 'Andere Namen, unter denen die Suche ihn findet'}
            right={
              synonym.trim() ? (
                <IconButton
                  icon="plus"
                  label="Synonym hinzufügen"
                  size={36}
                  disabled={online.disabled}
                  onPress={addSynonym}
                  testID="article-synonym-add"
                />
              ) : undefined
            }
            testID="article-synonym-input"
          />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <List>
          <ListRow
            title="Bereich"
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                <Text color="muted" numberOfLines={1} testID="article-area-name">
                  {area?.name ?? 'Ohne Bereich'}
                </Text>
                <Icon name="chevron-right" size={18} color="muted" />
              </View>
            }
            accessibilityLabel={`Bereich: ${area?.name ?? 'Ohne Bereich'}`}
            disabled={online.disabled}
            onPress={() => setStep('area')}
            testID="article-area"
          />
        </List>
        <SwitchRow
          label="Vorrat"
          description="Im Vorratscheck zuerst abgewählt"
          value={article.isPantry}
          disabled={online.disabled}
          onValueChange={(isPantry) => write(() => updateArticle(article.id, { isPantry }))}
          testID="article-pantry"
        />
      </View>

      <View style={offlineGrey} pointerEvents={online.disabled ? 'none' : 'auto'}>
        <FieldLabel>Ernährung</FieldLabel>
        <ChoiceChips
          label="Ernährung"
          options={DIET_OPTIONS}
          value={article.diet}
          onChange={(diet) => {
            if (!online.disabled) write(() => updateArticle(article.id, { diet }));
          }}
          testID="article-diet"
        />
      </View>

      <View style={offlineGrey} pointerEvents={online.disabled ? 'none' : 'auto'}>
        <FieldLabel>Standard-Einkaufsregel</FieldLabel>
        <ChoiceChips<RuleChoice>
          label="Standard-Einkaufsregel"
          options={RULE_OPTIONS}
          value={rule}
          onChange={(choice) => {
            if (online.disabled || choice === 'unset') return;
            write(() => updateArticle(article.id, { defaultShoppingRule: choice }));
          }}
          testID="article-rule"
        />
        <Text variant="small" color="muted" style={{ marginTop: 6 }}>
          {rule === 'unset'
            ? 'Noch nicht festgelegt – neue Zutaten richten sich nach ihrer Menge.'
            : 'Wird für neue Zutaten im Rezept vorgeschlagen.'}
        </Text>
      </View>

      <View testID="article-recipes">
        <FieldLabel>In Rezepten</FieldLabel>
        {usage.recipes.length === 0 ? (
          <Text color="muted">In keinem Rezept</Text>
        ) : (
          <Row wrap gap={4}>
            {usage.recipes.map((recipe) => (
              <Button
                key={recipe.id}
                label={recipe.title}
                variant="link"
                size="sm"
                onPress={() => {
                  props.onClose();
                  openRecipe(recipe.id);
                }}
                testID={`article-recipe-${recipe.id}`}
              />
            ))}
          </Row>
        )}
      </View>

      {error ? (
        <Text variant="small" color="warn" testID="article-error">
          {error}
        </Text>
      ) : null}

      <View style={{ gap: 8 }}>
        <Row wrap gap={10}>
          <Button
            label="Zusammenführen mit …"
            icon="layers"
            variant="secondary"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setStep('merge')}
            testID="article-merge"
          />
          <Button
            label="Löschen"
            icon="trash"
            variant="ghost"
            disabled={online.disabled || !usage.canDelete}
            hint={online.hint ?? usage.deleteBlockedReason}
            onPress={remove}
            testID="article-delete"
          />
        </Row>
        {usage.deleteBlockedReason ? (
          <Text variant="small" color="muted" testID="article-delete-reason">
            {usage.deleteBlockedReason}
          </Text>
        ) : null}
      </View>
    </Stack>
  );

  const doneAction: SheetAction = {
    label: 'Fertig',
    disabled: !online.disabled && nameProblem !== undefined,
    onPress: done,
    testID: 'article-done',
  };
  return {
    title: 'Artikel bearbeiten',
    body,
    footer: (
      <Row gap={10} style={{ justifyContent: 'flex-end' }}>
        <Button {...doneAction} />
      </Row>
    ),
    done: doneAction,
  };
}

/** "Artikel bearbeiten" on phones: a medium window (AC-028). */
export function ArticleSheet(props: ArticleEditorProps & { visible: boolean }) {
  const editor = useArticleEditor(props);
  return (
    <Sheet
      visible={props.visible}
      size="m"
      title={editor.title}
      onClose={props.onClose}
      footer={editor.done ? undefined : editor.footer}
      actions={editor.done ? { primary: editor.done } : undefined}
      testID="article-sheet"
    >
      {editor.body}
    </Sheet>
  );
}

/** "Artikel bearbeiten" in the right column of "Liste und Detail" (AC-025). */
export function ArticlePanel(props: ArticleEditorProps) {
  const editor = useArticleEditor(props);
  return (
    <Surface testID="article-panel" padding={20} style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          variant="heading"
          heading
          style={{ flex: 1, minWidth: 0 }}
          testID="article-panel-title"
        >
          {editor.title}
        </Text>
        <IconButton
          icon="x"
          label="Schließen"
          onPress={props.onClose}
          testID="article-panel-close"
        />
      </View>
      {editor.body}
      {editor.footer}
    </Surface>
  );
}
