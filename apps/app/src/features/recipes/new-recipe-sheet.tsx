import {
  createCollection,
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
  newEntryTitleProblem,
  newRecipe,
  pastedLink,
  searchRecipes,
  sortRecipes,
  WEB_SEARCH_LIMITS,
  type AiFillTab,
  type Id,
  type LinePicks,
  type RecipeKind,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  IconButton,
  List,
  Row,
  SelectRow,
  Sheet,
  Stack,
  TabSwipeContent,
  Text,
  TextField,
  ViewTabs,
  focusAfterChange,
  toast,
  type SheetAction,
  type TabSwipe,
} from '@housekeeping/ui';
import { useRef, useState, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';

import { discardFirst } from '@/features/shell/confirm-dialog';
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
import { usePromptDictation } from '@/lib/use-prompt-dictation';

import { draftPhoto, handOverNewRecipe, startPhotoSuggestions } from './ai-draft';
import { AiFillFields, toastUnreadLinks, useAiFill, useAiFillTabs, useDraftInput } from './ai-fill';
import { IngredientLinesField } from './ingredient-lines-field';
import { NewRecipeFields } from './recipe-form';
import { handOverIngredientRows, rowsFromText } from './sections/ingredient-handover';

export interface NewRecipeSheetProps {
  visible: boolean;
  /** "Sammlung" preselected (spec 0009, AC-001); "+" opens it for a recipe (spec 0054). */
  kind?: RecipeKind;
  onClose: () => void;
  /** Called with the new recipe's or collection's id after it was saved. */
  onCreated: (recipeId: Id) => void;
}

/** What the window has opened besides the tabs (spec 0037, REQ-002). */
type Extra = 'photo' | 'ingredients' | 'recipes';

/** The tabs of "Neu" (spec 0062, REQ-002): the AI writes a whole recipe here, so "KI-Rezept". */
const NEW_TABS: { value: AiFillTab; label: string }[] = [
  { value: 'web', label: 'Websuche' },
  { value: 'prompt', label: 'KI-Rezept' },
];

/**
 * The window "Neu" (spec 0062, REQ-001 – REQ-005): "Abbrechen · Neu · Anlegen" in the head (on
 * wide screens at the bottom). Tab "Websuche": the title with a magnifier in the field — Return
 * or the magnifier searches the web (cards and "Übernehmen" as in spec 0049), "Anlegen" saves a
 * recipe with that title. Tab "KI-Rezept": the field of spec 0040 with links, photos and "Foto
 * generieren"; the head says "Erzeugen" there. Cursor, keyboard and swiping as spec 0055. "Sammlung" turns
 * it into a new collection (spec 0009); "Foto" and "Zutaten" go along with "Anlegen" (spec 0018,
 * E-01). A draft opens the recipe page in the edit mode; nothing of it is saved before
 * "Speichern".
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
  const search = useWebSearch('recipe', '', 'KI-Rezept');
  const tabs = useAiFillTabs('web', search, NEW_TABS);
  const tab = features.aiRecipes ? tabs.tab : 'web';
  // Every opening starts with the kind chosen (state adjusted while rendering).
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
    tabs.setTab('web');
    props.onClose();
  };

  // Escape, a tap outside or "Abbrechen" ask before typed text goes (review 0003); an empty
  // window just closes.
  const dirty =
    title.trim() !== '' ||
    fill.text.trim() !== '' ||
    ingredients.trim() !== '' ||
    recipeIds.length > 0 ||
    photo !== undefined;
  // Nachklick 27.11., N-13: nothing exists yet, so it is a draft that goes, not changes.
  const dismiss = () => discardFirst(dirty, close, 'confirm-discard-new', 'Entwurf verwerfen?');
  const open = (extra: Extra) => setExtras((current) => new Set(current).add(extra));
  // Nachklick 27.11., N-12: the field opens with the cursor and in sight (the keyboard comes
  // with the tap on the iPhone).
  const ingredientsField = useRef<unknown>(null);
  const openIngredients = () => {
    focusAfterChange(
      () => open('ingredients'),
      () => ingredientsField.current,
    );
    requestAnimationFrame(() =>
      (
        ingredientsField.current as { scrollIntoView?: (options: object) => void } | null
      )?.scrollIntoView?.({ block: 'nearest' }),
    );
  };
  const chooseKind = (next: RecipeKind) => {
    setError(undefined);
    setKind(next);
  };

  // REQ-003: Return and the magnifier search the title; the keyboard goes for the cards.
  const searchTitle = () => {
    if (title.trim() === '' || online.disabled) return;
    Keyboard.dismiss();
    search.search(title.trim().slice(0, WEB_SEARCH_LIMITS.query));
  };

  // REQ-004 (AC-001 of spec 0040): the draft opens on the recipe page in the edit mode; the
  // recipe exists only there until "Speichern". A typed title, pasted ingredients and a chosen
  // photo go along.
  // Nachklick 27.11., N-12: pasted ingredients go to the AI too, so they alone are enough.
  const aiReady = fill.ready || ingredients.trim() !== '';
  const writeWithAi = () => {
    if (fill.busy || !aiReady) return;
    const typed = [
      title.trim() ? `Titel: ${title.trim()}` : '',
      ingredients.trim() ? `Zutaten:\n${ingredients.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const chosenPhoto = photo;
    const photoChoice = fill.photoChoice;
    void fill.run({ prefix: typed, title: title.trim() }).then(async (reply) => {
      if (!reply) return;
      // AC-042 (spec 0049): without "Foto generieren" the linked page's photo, unless one was
      // chosen; spec 0065: with "Websuche" „Original · KI-Bild · Keins“ decides.
      const { photo: pagePhoto, generate } = await draftPhoto(reply, photoChoice, {
        keepOwn: chosenPhoto !== undefined,
      });
      const input = draftInput(reply);
      if (title.trim()) input.title = title.trim();
      const recipe = newRecipe({
        id: crypto.randomUUID(),
        kind: 'recipe',
        title: input.title ?? reply.draft.title,
        servings: reply.draft.servings,
        createdAt: new Date().toISOString(),
      });
      handOverNewRecipe(recipe, input, chosenPhoto ?? pagePhoto);
      if (generate && reply.draft.imagePrompt) {
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
    // REQ-010 (spec 0049): the photo chosen in the preview — the page's, three made by the AI
    // (with the wish or the title), or none (a photo chosen here stays then).
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
  // REQ-003: "Anlegen" saves at once; a collection with its chosen recipes (spec 0037, AC-009).
  // Without a title the field says why, on "Websuche" where it stands.
  const save = () => {
    const problem = newEntryTitleProblem(title);
    if (problem) {
      setError(problem);
      // Nachklick 27.11., iN-06: the title gets the cursor within the tap, so the keyboard stays
      // and the window does not sink.
      if (kind === 'recipe') tabs.choose('web');
      return;
    }
    let recipeId: Id;
    try {
      if (kind === 'collection') {
        recipeId = createCollection({ title, recipeIds });
      } else {
        // E-01 (spec 0018): the rows with an article are saved with the recipe; only the orange
        // ones wait for its page.
        const created = createRecipeWithIngredients(
          { title },
          rowsFromText(ingredients, articles, picks),
        );
        recipeId = created.recipeId;
        handOverIngredientRows(recipeId, created.open);
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

  const collection = kind === 'collection';
  // Spec 0068, AC-001: "Erzeugen" while dictating writes with the last words.
  const dictation = usePromptDictation({
    value: fill.text,
    onChangeText: fill.setText,
    onSend: writeWithAi,
  });
  // REQ-001: the head names what happens on the shown tab: "Anlegen" with the title on "Websuche"
  // (a previewed hit makes it "Übernehmen", spec 0049), "Erzeugen" on "KI-Rezept" — there is no
  // title to save, the AI writes the recipe (owner, 27.11.2026: no second button below).
  const primary: SheetAction =
    !collection && tab === 'web' && search.preview
      ? webSearchPrimary(search, online, takeFromWeb, 'new-recipe-web')
      : !collection && tab === 'prompt'
        ? {
            label: 'Erzeugen',
            icon: 'sparkles',
            onPress: dictation.send,
            disabled: online.disabled || fill.busy || (!aiReady && !dictation.pending),
            hint: online.hint,
            testID: 'new-recipe-ai-submit',
          }
        : {
            label: 'Anlegen',
            icon: 'check',
            onPress: save,
            disabled: online.disabled || fill.busy,
            hint: online.hint,
            testID: 'new-recipe-save',
          };

  const titleField = (
    <TextField
      label="Titel"
      placeholder="z. B. Spaghetti Bolognese"
      value={title}
      onChangeText={(next) => {
        // A link pasted alone goes to "KI-Rezept", which reads the page (spec 0049, AC-002).
        const link = features.aiRecipes && !collection ? pastedLink(next) : undefined;
        if (link) {
          fill.setText(link);
          tabs.choose('prompt');
          return;
        }
        setTitle(next);
        if (error) setError(undefined);
      }}
      onSubmitEditing={collection || !features.aiRecipes ? save : searchTitle}
      returnKeyType={collection || !features.aiRecipes ? 'done' : 'search'}
      submitsWindow={collection || !features.aiRecipes}
      autoFocus
      error={error}
      inputRef={collection ? undefined : tabs.webField}
      right={
        collection || !features.aiRecipes ? undefined : (
          <IconButton
            icon="search"
            label="Im Web suchen"
            size={40}
            disabled={online.disabled || title.trim() === '' || search.busy}
            hint={online.hint}
            onPress={searchTitle}
            testID="new-recipe-web-submit"
          />
        )
      }
      testID="new-recipe-title"
    />
  );

  const links = (
    <Row gap={16} wrap align="center">
      {/* The recipe's own photo only on "Websuche": on "KI-Rezept" the photos are what the AI
          reads, and it can make three (review 0004). */}
      {extras.has('photo') || !CAN_PICK_PHOTO || (!collection && tab === 'prompt') ? null : (
        <Button
          label="Foto"
          icon="camera"
          variant="link"
          onPress={() => open('photo')}
          testID="new-recipe-open-photo"
        />
      )}
      {!collection && !extras.has('ingredients') ? (
        <Button
          label="Zutaten einfügen"
          icon="clipboard-list"
          variant="link"
          onPress={openIngredients}
          testID="new-recipe-open-ingredients"
        />
      ) : null}
      {collection && !extras.has('recipes') ? (
        <Button
          label="Rezepte wählen"
          icon="plus"
          variant="link"
          onPress={() => open('recipes')}
          testID="new-recipe-open-recipes"
        />
      ) : null}
      {collection ? null : (
        <Button
          label="Sammlung"
          icon="layers"
          variant="link"
          onPress={() => chooseKind('collection')}
          testID="new-recipe-open-collection"
        />
      )}
    </Row>
  );

  return (
    <Sheet
      visible={props.visible}
      onClose={dismiss}
      title="Neu"
      testID="new-recipe-sheet"
      // Nachklick 27.11., N-06: one size whatever the tab shows, so nothing jumps.
      size="l"
      header={
        !collection && features.aiRecipes ? (
          <ViewTabs
            label="Neues Rezept"
            options={NEW_TABS}
            value={tab}
            onChange={(next) => tabs.choose(next)}
            testID="new-recipe-ai-tab"
          />
        ) : undefined
      }
      // REQ-001: "Abbrechen · Anlegen" — on wide screens side by side at the bottom, "Anlegen" right.
      actions={{
        primary,
        cancel: { label: 'Abbrechen', onPress: dismiss, testID: 'new-recipe-cancel' },
      }}
    >
      {/* Spec 0055, REQ-002: the tabs swipe — over the whole window down to its bottom, the
          links below the fields and the empty space included (B-05, Durchklick 27.11.). */}
      <SwipeTabs swipe={collection ? undefined : tabs.swipe}>
        <Stack gap={16}>
          {collection ? (
            <>
              <ChoiceChips
                label="Art"
                options={[...NEW_ENTRY_KINDS]}
                value={kind}
                onChange={chooseKind}
                disabled={online.disabled}
                hint={online.hint}
                testID="new-recipe-kind"
              />
              <NewRecipeFields
                title={title}
                kind={kind}
                onChangeTitle={(next) => {
                  setTitle(next);
                  if (error) setError(undefined);
                }}
                error={error}
                onSubmit={save}
                autoFocus
              />
            </>
          ) : tab === 'web' ? (
            <Stack gap={12}>
              {titleField}
              {search.state.status !== 'idle' || search.preview ? (
                <WebSearchPanel
                  search={search}
                  recipeRows={draftInput}
                  withField={false}
                  testID="new-recipe-web"
                />
              ) : null}
            </Stack>
          ) : (
            <AiFillFields
              fill={fill}
              dictation={dictation}
              inputRef={tabs.promptField}
              testID="new-recipe-ai"
            />
          )}
          {extras.has('photo') ? <NewPhotoSlot photo={photo} onChange={setPhoto} /> : null}
          {!collection && extras.has('ingredients') ? (
            <IngredientLinesField
              label="Zutaten einfügen"
              placeholder={'200 ml Kokosmilch\n1 Mango'}
              hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
              text={ingredients}
              onChangeText={setIngredients}
              picks={picks}
              onChangePicks={setPicks}
              onInput={(input) => {
                ingredientsField.current = input;
              }}
              testID="new-recipe-ingredients"
            />
          ) : null}
          {collection && extras.has('recipes') ? (
            <PickRecipes value={recipeIds} onChange={setRecipeIds} />
          ) : null}
          {/* A previewed hit brings its own photo choice and ingredients; "Foto", "Zutaten einfügen"
            and "Sammlung" would not go with "Übernehmen" (review 0004). */}
          {!collection && tab === 'web' && search.preview ? null : links}
        </Stack>
      </SwipeTabs>
    </Sheet>
  );
}

/** The window's content, swiping between its tabs where it has them. */
function SwipeTabs(props: { swipe: TabSwipe | undefined; children: ReactNode }) {
  if (!props.swipe) return <>{props.children}</>;
  return (
    <TabSwipeContent swipe={props.swipe} testID="new-recipe-ai-swipe">
      {props.children}
    </TabSwipeContent>
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
