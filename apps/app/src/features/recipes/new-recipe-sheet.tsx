import {
  createCollection,
  createRecipe,
  createRecipeWithIngredients,
  preparePhoto,
  setRecipePhoto,
  useArticles,
  useArticlesById,
  useRecipes,
} from '@housekeeping/api';
import {
  draftImageContext,
  NEW_ENTRY_KINDS,
  newEntryTakesIngredients,
  newEntryTitleProblem,
  newRecipe,
  searchRecipes,
  sortRecipes,
  type Id,
  type LinePicks,
  type RecipeKind,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  List,
  Row,
  SelectRow,
  Sheet,
  Stack,
  Text,
  TextField,
  ViewTabs,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';
import { useOnlineOnly } from '@/features/shell/offline';
import { useWebSearch } from '@/features/web-search/use-web-search';
import {
  webSearchPrimary,
  WebSearchPanel,
  type WebTake,
} from '@/features/web-search/web-search-panel';
import { features } from '@/lib/features';
import { CAN_PICK_PHOTO, pickPhotoFile } from '@/lib/pick-photo';

import { handOverNewRecipe, startPhotoSuggestions } from './ai-draft';
import {
  AI_FILL_TABS,
  AiFillFields,
  toastUnreadLinks,
  useAiFill,
  useDraftInput,
  type AiFillTab,
} from './ai-fill';
import { IngredientLinesField } from './ingredient-lines-field';
import { NewRecipeFields } from './recipe-form';
import { handOverIngredientRows, rowsFromText } from './sections/ingredient-handover';

export interface NewRecipeSheetProps {
  visible: boolean;
  /** The kind chosen in "+", preselected each time the window opens (spec 0009, AC-001). */
  kind?: RecipeKind;
  onClose: () => void;
  /** Called with the new recipe's or collection's id after it was saved. */
  onCreated: (recipeId: Id) => void;
}

/** What the window "Neu" has opened besides the title (spec 0037, REQ-002; "ai": spec 0040). */
type Extra = 'photo' | 'ingredients' | 'recipes' | 'ai';

/**
 * The window "Neu" (spec 0009, E16): the choice chips "Rezept · Sammlung" and a title are enough
 * (AC-001 to AC-003; spec 0037, AC-008). Opened on demand (spec 0037, REQ-002): a photo, for a
 * recipe "Zutaten einfügen" (spec 0008, AC-021, AC-022: the pasted lines with an article are saved
 * with the new recipe, spec 0018, REQ-001; its page opens the edit mode with the rest orange) and
 * for a collection "Rezepte wählen" (AC-009, saved with it in one step). "Mit KI ausfüllen" (spec
 * 0040, AC-001) turns the primary action into "Ausfüllen": the recipe page opens in the edit mode
 * with the AI's draft, and nothing is saved before its "Speichern".
 */
export function NewRecipeSheet(props: NewRecipeSheetProps) {
  const online = useOnlineOnly();
  const articles = useArticles();
  const preset = props.kind ?? 'recipe';
  const [kind, setKind] = useState<RecipeKind>(preset);
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [picks, setPicks] = useState<LinePicks>(() => new Map());
  const [recipeIds, setRecipeIds] = useState<Id[]>([]);
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [extras, setExtras] = useState<ReadonlySet<Extra>>(() => new Set());
  const [error, setError] = useState<string | undefined>(undefined);
  const fill = useAiFill();
  const draftInput = useDraftInput();
  // Spec 0049, REQ-001: "Websuche" first, prefilled with the title when the AI opens (AC-001).
  const search = useWebSearch('recipe');
  const [aiTab, setAiTab] = useState<AiFillTab>('web');
  // Every opening starts with the kind chosen in "+" (state adjusted while rendering).
  const [shown, setShown] = useState(props.visible);
  if (props.visible !== shown) {
    setShown(props.visible);
    if (props.visible) setKind(preset);
  }

  const close = () => {
    setTitle('');
    setIngredients('');
    setPicks(new Map());
    setRecipeIds([]);
    setPhoto(undefined);
    setExtras(new Set());
    setError(undefined);
    fill.reset();
    search.reset();
    setAiTab('web');
    props.onClose();
  };

  const takesIngredients = newEntryTakesIngredients(kind);
  const open = (extra: Extra) => {
    if (extra === 'ai' && search.query.trim() === '') search.setQuery(title.trim());
    setExtras((current) => new Set(current).add(extra));
  };
  const withAi = features.aiRecipes && kind === 'recipe' && extras.has('ai');

  // AC-001: the draft opens on the recipe page in the edit mode; the recipe exists only there
  // until "Speichern". A typed title, pasted ingredients and a chosen photo go along.
  const fillWithAi = () => {
    if (fill.busy || (!fill.ready && title.trim() === '')) return;
    const typed = [
      title.trim() ? `Titel: ${title.trim()}` : '',
      ingredients.trim() ? `Zutaten:\n${ingredients.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const chosenPhoto = photo;
    void fill.run(typed).then((reply) => {
      if (!reply) return;
      const input = draftInput(reply);
      if (title.trim()) input.title = title.trim();
      const recipe = newRecipe({
        id: crypto.randomUUID(),
        kind: 'recipe',
        title: input.title ?? reply.draft.title,
        servings: reply.draft.servings,
        createdAt: new Date().toISOString(),
      });
      handOverNewRecipe(recipe, input, chosenPhoto);
      if (fill.generatePhoto && reply.draft.imagePrompt) {
        startPhotoSuggestions(recipe.id, {
          prompt: reply.draft.imagePrompt,
          context: draftImageContext(reply.draft),
          coverUrl: reply.sources.find((source) => source.coverUrl)?.coverUrl,
        });
      }
      close();
      props.onCreated(recipe.id);
      toastUnreadLinks(reply.sources);
    });
  };
  // Spec 0049, AC-014: the recipe found on the web opens like an AI draft, with the page's photo
  // and the page as its link; nothing is saved before "Speichern".
  const takeFromWeb = (taken: WebTake) => {
    const reply = taken.recipe;
    if (!reply) return;
    const input = draftInput(reply);
    const recipe = newRecipe({
      id: crypto.randomUUID(),
      kind: 'recipe',
      title: input.title ?? reply.draft.title,
      servings: reply.draft.servings,
      createdAt: new Date().toISOString(),
    });
    // REQ-010: the photo chosen in the preview — the page's, three made by the AI (with the wish
    // or the title), or none (a photo chosen in "Neu" stays then).
    const pagePhoto = taken.photoChoice === 'source' ? taken.photo : photo;
    handOverNewRecipe(recipe, input, taken.photoChoice === 'ai' ? undefined : pagePhoto);
    if (taken.photoChoice === 'ai') {
      startPhotoSuggestions(recipe.id, {
        // Spec 0052: the raw wish (or the title) with what the photo is for.
        prompt: taken.imageWish ?? recipe.title,
        context: draftImageContext(reply.draft),
      });
    }
    close();
    props.onCreated(recipe.id);
  };
  const save = () => {
    const problem = newEntryTitleProblem(title);
    if (problem) {
      setError(problem);
      return;
    }
    let recipeId: Id;
    try {
      if (takesIngredients) {
        // E-01 (spec 0018): the rows with an article are saved with the recipe; only the orange
        // ones wait for its page.
        const created = createRecipeWithIngredients(
          { title },
          rowsFromText(ingredients, articles, picks),
        );
        recipeId = created.recipeId;
        handOverIngredientRows(recipeId, created.open);
      } else if (kind === 'collection') {
        recipeId = createCollection({ title, recipeIds });
      } else {
        recipeId = createRecipe({ title, kind });
      }
    } catch (cause) {
      setError(errorMessage(cause, FAILED_MESSAGE));
      return;
    }
    if (photo) {
      void setRecipePhoto(recipeId, photo).then(
        () => toast.show({ message: 'Foto gespeichert' }),
        (cause: unknown) => toast.show({ message: errorMessage(cause, FAILED_MESSAGE) }),
      );
    }
    close();
    props.onCreated(recipeId);
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Neu"
      testID="new-recipe-sheet"
      size="m"
      actions={{
        primary: withAi
          ? aiTab === 'web'
            ? webSearchPrimary(search, online, takeFromWeb, 'new-recipe-web')
            : {
                label: fill.busy ? 'Wird ausgefüllt …' : 'Ausfüllen',
                icon: 'sparkles',
                onPress: fillWithAi,
                disabled: online.disabled || fill.busy || (!fill.ready && title.trim() === ''),
                hint: online.hint,
                testID: 'new-recipe-ai-submit',
              }
          : {
              label: 'Anlegen',
              icon: 'check',
              onPress: save,
              disabled: online.disabled,
              hint: online.hint,
              testID: 'new-recipe-save',
            },
      }}
    >
      <Stack gap={16}>
        <ChoiceChips
          label="Art"
          options={[...NEW_ENTRY_KINDS]}
          value={kind}
          onChange={setKind}
          disabled={online.disabled}
          hint={online.hint}
          testID="new-recipe-kind"
        />
        <NewRecipeFields
          title={title}
          kind={kind}
          onChangeTitle={(text) => {
            setTitle(text);
            if (error) setError(undefined);
          }}
          error={error}
          onSubmit={withAi ? (aiTab === 'web' ? search.search : fillWithAi) : save}
          autoFocus
        />
        {withAi ? (
          <Stack gap={12}>
            <ViewTabs
              label="Mit KI ausfüllen"
              options={AI_FILL_TABS}
              value={aiTab}
              onChange={setAiTab}
              testID="new-recipe-ai-tab"
            />
            {aiTab === 'web' ? (
              <WebSearchPanel
                search={search}
                onLink={(link) => {
                  fill.setText(link);
                  setAiTab('own');
                }}
                recipeRows={(reply) => draftInput(reply).ingredients ?? []}
                testID="new-recipe-web"
              />
            ) : (
              <AiFillFields fill={fill} testID="new-recipe-ai" />
            )}
          </Stack>
        ) : null}
        {extras.has('photo') ? <NewPhotoSlot photo={photo} onChange={setPhoto} /> : null}
        {takesIngredients && extras.has('ingredients') ? (
          <IngredientLinesField
            label="Zutaten einfügen"
            placeholder={'200 ml Kokosmilch\n1 Mango'}
            hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
            text={ingredients}
            onChangeText={setIngredients}
            picks={picks}
            onChangePicks={setPicks}
            autoFocus
            testID="new-recipe-ingredients"
          />
        ) : null}
        {kind === 'collection' && extras.has('recipes') ? (
          <PickRecipes value={recipeIds} onChange={setRecipeIds} />
        ) : null}
        <Row gap={16} wrap>
          {features.aiRecipes && kind === 'recipe' && !extras.has('ai') ? (
            <Button
              label="Mit KI ausfüllen"
              icon="sparkles"
              variant="link"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => open('ai')}
              testID="new-recipe-open-ai"
            />
          ) : null}
          {extras.has('photo') || !CAN_PICK_PHOTO ? null : (
            <Button
              label="Foto"
              icon="camera"
              variant="link"
              onPress={() => open('photo')}
              testID="new-recipe-open-photo"
            />
          )}
          {takesIngredients && !extras.has('ingredients') ? (
            <Button
              label="Zutaten einfügen"
              icon="clipboard-list"
              variant="link"
              onPress={() => open('ingredients')}
              testID="new-recipe-open-ingredients"
            />
          ) : null}
          {kind === 'collection' && !extras.has('recipes') ? (
            <Button
              label="Rezepte wählen"
              icon="plus"
              variant="link"
              onPress={() => open('recipes')}
              testID="new-recipe-open-recipes"
            />
          ) : null}
        </Row>
      </Stack>
    </Sheet>
  );
}

/**
 * The slot "Foto" of the window "Neu" (spec 0037, REQ-002): chooses the photo the usual way
 * (pickPhotoFile, preparePhoto) and keeps it until "Anlegen" saves it with setRecipePhoto. Spec
 * 0039 replaces this slot with the photo window.
 */
function NewPhotoSlot(props: {
  photo: Blob | undefined;
  onChange: (photo: Blob | undefined) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const choose = () =>
    pickPhotoFile((file) => {
      setBusy(true);
      setError(undefined);
      preparePhoto(file).then(
        (prepared) => {
          setBusy(false);
          props.onChange(prepared);
        },
        (cause: unknown) => {
          setBusy(false);
          setError(errorMessage(cause, FAILED_MESSAGE));
        },
      );
    });
  return (
    <View style={{ gap: 6 }} testID="new-recipe-photo">
      <Text variant="smallStrong">Foto</Text>
      <Row gap={12} wrap>
        <Text color="muted" testID="new-recipe-photo-state">
          {busy ? 'Wird vorbereitet …' : props.photo ? 'Foto gewählt' : 'Noch kein Foto'}
        </Text>
        <Button
          label={props.photo ? 'Anderes Foto' : 'Foto wählen'}
          icon="camera"
          variant="secondary"
          size="sm"
          onPress={choose}
          disabled={busy}
          testID="new-recipe-photo-pick"
        />
        {props.photo ? (
          <Button
            label="Entfernen"
            variant="ghost"
            size="sm"
            onPress={() => props.onChange(undefined)}
            testID="new-recipe-photo-remove"
          />
        ) : null}
      </Row>
      {error ? (
        <Text variant="small" color="warn">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** "Rezepte wählen" for a new collection (spec 0037, AC-009): a search and recipes to tick. */
function PickRecipes(props: { value: readonly Id[]; onChange: (value: Id[]) => void }) {
  const recipes = useRecipes();
  const articlesById = useArticlesById();
  const [query, setQuery] = useState('');
  const own = recipes.filter((recipe) => recipe.kind === 'recipe');
  const hits = (
    query.trim() ? searchRecipes(query, own, articlesById) : sortRecipes(own, 'title')
  ).slice(0, 30);
  const toggle = (id: Id) =>
    props.onChange(
      props.value.includes(id)
        ? props.value.filter((candidate) => candidate !== id)
        : [...props.value, id],
    );
  return (
    <View style={{ gap: 8 }} testID="new-recipe-recipes">
      <Text variant="smallStrong">
        {props.value.length === 0
          ? 'Rezepte wählen'
          : props.value.length === 1
            ? '1 Rezept gewählt'
            : `${props.value.length} Rezepte gewählt`}
      </Text>
      <TextField
        accessibilityLabel="Rezept suchen"
        placeholder="Rezept suchen"
        value={query}
        onChangeText={setQuery}
        round
        testID="new-recipe-recipes-search"
      />
      {hits.length === 0 ? (
        <Text color="muted">Kein Rezept gefunden.</Text>
      ) : (
        <List>
          {hits.map((recipe) => (
            <SelectRow
              key={recipe.id}
              title={recipe.title}
              selected={props.value.includes(recipe.id)}
              onToggle={() => toggle(recipe.id)}
              testID={`new-recipe-recipes-row-${recipe.id}`}
            />
          ))}
        </List>
      )}
    </View>
  );
}
