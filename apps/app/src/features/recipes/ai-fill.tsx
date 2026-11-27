import {
  checkImageFile,
  draftRecipeAsync,
  loadPhotoFromAddress,
  OfflineError,
  preparePhoto,
  starterCatalogEntries,
  useAreas,
  useArticles,
  useRecipes,
} from '@housekeeping/api';
import {
  AI_DRAFT_UNREACHABLE_MESSAGE,
  DRAFT_PHOTO_MAX_SIDE,
  RECIPE_DRAFT_LIMITS,
  draftLinks,
  draftToPageInput,
  imageAddress,
  aiFillDefaults,
  linkChipLabel,
  promptWebQuery,
  tagValues,
  type AiFillTab,
  type PageDraftInput,
  type RecipeDraft,
  type RecipeDraftReply,
  type RecipeDraftSource,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  Chip,
  IconButton,
  LoadingLines,
  Photo,
  Row,
  Sheet,
  Stack,
  SwitchRow,
  Text,
  TabSwipeContent,
  TextField,
  ViewTabs,
  focusAfterChange,
  pickImageFile,
  toast,
  useBreakpoint,
  useFinePointer,
  useImageDropAndPaste,
  type TabSwipe,
} from '@housekeeping/ui';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
  type Ref,
} from 'react';
import { View, type TextInput } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';
import { pasteKeys } from '@/features/shell/photo-window';
import { useWebSearch, type WebSearch } from '@/features/web-search/use-web-search';
import {
  webSearchPrimary,
  WebSearchPanel,
  type WebTake,
} from '@/features/web-search/web-search-panel';

import { draftPagePhoto } from './ai-draft';
import { newRowKey } from './sections/ingredient-handover';

// "Mit KI ausfüllen" (spec 0040, REQ-001 – REQ-003, REQ-006): a sentence, up to three links and
// up to four photos become a recipe draft. The field keeps its input when the AI fails (AC-005).
// Nothing is saved here: the result fills the edit mode of the recipe page.

interface DraftPhoto {
  photo: Blob;
  uri: string;
}

export interface AiFill {
  text: string;
  setText: (text: string) => void;
  links: string[];
  photos: DraftPhoto[];
  addPhoto: (camera: boolean) => void;
  /** A file dropped or pasted on the desktop (spec 0049, REQ-009). */
  addFile: (file: File) => void;
  /** An image address, loaded by the server (fetch-image, spec 0039). */
  addAddress: (url: string) => void;
  removePhoto: (index: number) => void;
  generatePhoto: boolean;
  setGeneratePhoto: (on: boolean) => void;
  /** Spec 0055, REQ-007: "Websuche" in "Prompt" — one web search as context, off by default. */
  webSearch: boolean;
  setWebSearch: (on: boolean) => void;
  busy: boolean;
  preparing: boolean;
  error: string | undefined;
  /** What the last answer said per link (chips "… konnte nicht gelesen werden"). */
  sources: RecipeDraftSource[];
  /** Something to send: text, a link or a photo. */
  ready: boolean;
  /**
   * "Ausfüllen": the reply, or undefined when it failed (the message is in `error`). `prefix`
   * goes before the text (the window "Neu": title, pasted ingredients); `current` is the recipe
   * the text changes (spec 0055, REQ-006); `title` is searched with the wish (REQ-007).
   */
  run: (options?: {
    prefix?: string;
    current?: RecipeDraft;
    title?: string;
  }) => Promise<RecipeDraftReply | undefined>;
  reset: () => void;
}

/** AC-023 (spec 0055): the draft came, the web search did not. */
const WEB_CONTEXT_UNAVAILABLE = 'Ohne Websuche ausgefüllt – die Suche war nicht erreichbar.';

/** `generatePhoto`: how "Foto generieren" starts (spec 0055, REQ-005; on by default). */
export function useAiFill(initial: { generatePhoto?: boolean } = {}): AiFill {
  const startsGenerating = initial.generatePhoto ?? true;
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [generatePhoto, setGeneratePhoto] = useState(startsGenerating);
  const [webSearch, setWebSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string>();
  const [sources, setSources] = useState<RecipeDraftSource[]>([]);
  const mounted = useRef(true);
  const shown = useRef<DraftPhoto[]>([]);
  useLayoutEffect(() => {
    shown.current = photos;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const photo of shown.current) URL.revokeObjectURL(photo.uri);
    };
  }, []);

  const links = draftLinks(text);
  // Every source ends the same way: shrunk to 1280 px and attached, at most 4 (REQ-001).
  const attach = (source: () => Promise<Blob>) => {
    if (photos.length >= RECIPE_DRAFT_LIMITS.photos) return;
    setPreparing(true);
    setError(undefined);
    source()
      .then((image) => preparePhoto(image, DRAFT_PHOTO_MAX_SIDE))
      .then(
        (photo) => {
          setPreparing(false);
          setPhotos((current) =>
            current.length >= RECIPE_DRAFT_LIMITS.photos
              ? current
              : [...current, { photo, uri: URL.createObjectURL(photo) }],
          );
        },
        (cause: unknown) => {
          setPreparing(false);
          setError(cause instanceof Error ? cause.message : AI_DRAFT_UNREACHABLE_MESSAGE);
        },
      );
  };
  const addPhoto = (camera: boolean) =>
    pickImageFile((file) => attach(async () => file), camera ? { camera: true } : undefined);
  const addFile = (file: File) => attach(async () => checkImageFile(file));
  const addAddress = (url: string) => attach(() => loadPhotoFromAddress(url));
  const removePhoto = (index: number) =>
    setPhotos((current) => {
      const gone = current[index];
      if (gone) URL.revokeObjectURL(gone.uri);
      return current.filter((_, at) => at !== index);
    });

  const run: AiFill['run'] = async (options = {}) => {
    setBusy(true);
    setError(undefined);
    setSources([]);
    const webQuery = webSearch ? promptWebQuery(options.title ?? '', text) : undefined;
    try {
      const reply = await draftRecipeAsync({
        text: [options.prefix?.trim(), text.trim()]
          .filter(Boolean)
          .join('\n')
          .slice(0, RECIPE_DRAFT_LIMITS.text),
        links,
        photos: photos.map((entry) => entry.photo),
        imagePrompt: generatePhoto,
        ...(options.current ? { current: options.current } : {}),
        ...(webQuery ? { webQuery } : {}),
      });
      if (mounted.current) setSources(reply.sources);
      if (reply.webContext === 'unavailable') toast.show({ message: WEB_CONTEXT_UNAVAILABLE });
      return reply;
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof OfflineError ? OFFLINE_EDIT_HINT : AI_DRAFT_UNREACHABLE_MESSAGE);
      return undefined;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const reset = () => {
    for (const photo of photos) URL.revokeObjectURL(photo.uri);
    setText('');
    setPhotos([]);
    setGeneratePhoto(startsGenerating);
    setWebSearch(false);
    setError(undefined);
    setSources([]);
  };

  return {
    text,
    setText: (next) => {
      setText(next.slice(0, RECIPE_DRAFT_LIMITS.text));
      if (error) setError(undefined);
    },
    links,
    photos,
    addPhoto,
    addFile,
    addAddress,
    removePhoto,
    generatePhoto,
    setGeneratePhoto,
    webSearch,
    setWebSearch,
    busy,
    preparing,
    error,
    sources,
    ready: text.trim() !== '' || links.length > 0 || photos.length > 0,
    run,
    reset,
  };
}

/**
 * The draft as the edit mode takes it, with the household's articles (AC-002) and tags (spec 0045,
 * REQ-002); new variants get ids like "+ Variante".
 */
export function useDraftInput(): (reply: RecipeDraftReply) => PageDraftInput {
  const articles = useArticles();
  const recipes = useRecipes();
  const areas = useAreas();
  return (reply) =>
    draftToPageInput(reply.draft, reply.sources, {
      articles,
      areas,
      catalog: starterCatalogEntries,
      newKey: newRowKey,
      newId: () => crypto.randomUUID(),
      tags: tagValues(recipes),
    });
}

/** AC-004, AC-017: the links that could not be read, once the draft is open. */
export function toastUnreadLinks(sources: readonly RecipeDraftSource[]): void {
  const failed = sources.filter((source) => !source.read);
  if (failed.length === 0) return;
  toast.show({
    message: failed.map((source) => linkChipLabel(source.url, 'failed')).join(' · '),
  });
}

const ADDRESS_DELAY_MS = 400;

/** "Bildadresse" (spec 0049, REQ-009): a pasted image address attaches by itself, like spec 0039. */
function ImageAddressField(props: {
  disabled: boolean;
  onAddress: (url: string) => void;
  testID: string;
}) {
  const [address, setAddress] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const load = (text: string) => {
    const url = imageAddress(text);
    if (!url) return;
    clearTimeout(timer.current);
    setAddress('');
    props.onAddress(url);
  };
  return (
    <TextField
      label="Bildadresse"
      placeholder="https://…"
      value={address}
      onChangeText={(text) => {
        setAddress(text);
        clearTimeout(timer.current);
        if (imageAddress(text)) timer.current = setTimeout(() => load(text), ADDRESS_DELAY_MS);
      }}
      onSubmitEditing={() => load(address)}
      keyboardType="url"
      autoComplete="off"
      returnKeyType="go"
      editable={!props.disabled}
      testID={props.testID}
    />
  );
}

type FieldRef = ComponentRef<typeof TextInput>;

/**
 * The field, the link chips, the photos, "Websuche" (spec 0055, REQ-007) and "Foto generieren"
 * (REQ-001 – REQ-003). `inputRef` and `autoFocus` give the field the cursor (spec 0055, REQ-001).
 */
export function AiFillFields(props: {
  fill: AiFill;
  inputRef?: Ref<FieldRef>;
  autoFocus?: boolean;
  testID: string;
}) {
  const { fill, testID } = props;
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const finePointer = useFinePointer();
  const disabled = online.disabled || fill.busy;
  // Spec 0049, REQ-009: on the desktop like the photo window — drop, ⌘V and an image address.
  const desktop = !isPhone && finePointer;
  const room = fill.photos.length < RECIPE_DRAFT_LIMITS.photos;
  const dragging = useImageDropAndPaste(desktop && room && !disabled, fill.addFile);
  const chipState = (url: string): 'reading' | 'read' | 'failed' | undefined => {
    if (fill.busy) return 'reading';
    const source = fill.sources.find((candidate) => candidate.url === url);
    if (!source) return undefined;
    return source.read ? 'read' : 'failed';
  };
  return (
    <Stack gap={12}>
      <DictationField
        label="Was soll ins Rezept?"
        placeholder={'z. B. „Omas Apfelkuchen für 4 mit Streuseln“ oder einen Link einfügen'}
        value={fill.text}
        onChangeText={fill.setText}
        multiline
        maxLength={RECIPE_DRAFT_LIMITS.text}
        editable={!disabled}
        hint="Text, bis zu 3 Links und 4 Fotos – die KI füllt den Entwurf, du prüfst und speicherst."
        autoFocus={props.autoFocus}
        inputRef={props.inputRef}
        testID={`${testID}-text`}
      />
      {fill.links.length > 0 ? (
        <Row gap={8} wrap>
          {fill.links.map((url, index) => {
            const state = chipState(url);
            return (
              <Chip
                key={url}
                icon={state === 'failed' ? 'circle-alert' : 'link'}
                label={linkChipLabel(url, state ?? 'read')}
                tone="ki"
                testID={`${testID}-link-${index}`}
              />
            );
          })}
        </Row>
      ) : null}
      {fill.photos.length > 0 ? (
        <Row gap={8} wrap>
          {fill.photos.map((photo, index) => (
            <View key={photo.uri} style={{ width: 72, gap: 2, alignItems: 'center' }}>
              <Photo
                source={{ uri: photo.uri }}
                width={72}
                aspectRatio={1}
                alt={`Foto ${index + 1}`}
              />
              <IconButton
                icon="x"
                size={32}
                label={`Foto ${index + 1} entfernen`}
                disabled={disabled}
                onPress={() => fill.removePhoto(index)}
                testID={`${testID}-photo-remove-${index}`}
              />
            </View>
          ))}
        </Row>
      ) : null}
      {fill.photos.length < RECIPE_DRAFT_LIMITS.photos ? (
        <Row gap={8} wrap>
          {isPhone ? (
            <Button
              label="Foto aufnehmen"
              icon="camera"
              variant="secondary"
              size="sm"
              disabled={disabled || fill.preparing}
              hint={online.hint}
              onPress={() => fill.addPhoto(true)}
              testID={`${testID}-camera`}
            />
          ) : null}
          <Button
            label={isPhone ? 'Fotomediathek' : 'Foto wählen'}
            icon="image"
            variant="secondary"
            size="sm"
            disabled={disabled || fill.preparing}
            hint={online.hint}
            onPress={() => fill.addPhoto(false)}
            testID={`${testID}-photo`}
          />
        </Row>
      ) : null}
      {desktop && room ? (
        <>
          <Text
            variant="small"
            color={dragging ? 'accent' : 'muted'}
            testID={`${testID}-drop-hint`}
          >
            {dragging
              ? 'Zum Anhängen hier loslassen'
              : `Fotos hierher ziehen, mit ${pasteKeys()} einfügen oder eine Bildadresse angeben`}
          </Text>
          <ImageAddressField
            disabled={disabled || fill.preparing}
            onAddress={fill.addAddress}
            testID={`${testID}-address`}
          />
        </>
      ) : null}
      <SwitchRow
        label="Websuche"
        description="Sucht vorher einmal im Web nach Titel und Wunsch – als Hintergrund für die KI."
        value={fill.webSearch}
        onValueChange={fill.setWebSearch}
        disabled={disabled}
        testID={`${testID}-web-search`}
      />
      <SwitchRow
        label="Foto generieren"
        description="Die KI schlägt drei Fotos vor; du wählst eins oder keins."
        value={fill.generatePhoto}
        onValueChange={fill.setGeneratePhoto}
        disabled={disabled}
        testID={`${testID}-generate-photo`}
      />
      {fill.busy ? (
        <LoadingLines
          label="Die KI füllt das Rezept aus … das dauert bis zu einer halben Minute."
          lines={4}
          testID={`${testID}-busy`}
        />
      ) : null}
      {fill.error ? (
        <Text variant="small" color="warn" testID={`${testID}-error`}>
          {fill.error}
        </Text>
      ) : null}
    </Stack>
  );
}

/** The two tabs of "Mit KI ausfüllen" (spec 0049, REQ-001; spec 0055, REQ-004: „Prompt“). */
export const AI_FILL_TABS: { value: AiFillTab; label: string }[] = [
  { value: 'web', label: 'Websuche' },
  { value: 'prompt', label: 'Prompt' },
];

/**
 * The tabs of "Mit KI ausfüllen" (spec 0055, REQ-001, REQ-002): a tap on a tab gives its field the
 * cursor within the tap (the keyboard stays), a swipe changes the tab and moves the cursor only
 * while typing. "Websuche" with cards or a preview has no field to type in, so none is focused.
 */
export function useAiFillTabs(initial: AiFillTab, search: WebSearch) {
  const [tab, setTab] = useState<AiFillTab>(initial);
  const webField = useRef<FieldRef>(null);
  const promptField = useRef<FieldRef>(null);
  const fieldOf = (next: AiFillTab) => {
    if (next === 'prompt') return promptField.current;
    const typing = !search.preview && search.state.status !== 'results';
    return typing ? webField.current : null;
  };
  const choose = (next: AiFillTab, options?: { onlyWhenTyping?: boolean }) =>
    focusAfterChange(
      () => setTab(next),
      () => fieldOf(next),
      options,
    );
  const index = AI_FILL_TABS.findIndex((option) => option.value === tab);
  // Like `tabSwipe`, written out: the step reads the fields only when it happens.
  const swipe: TabSwipe = {
    index,
    count: AI_FILL_TABS.length,
    onStep: (step) => {
      const next = AI_FILL_TABS[index + step]?.value;
      if (next) choose(next, { onlyWhenTyping: true });
    },
  };
  return {
    tab,
    setTab,
    choose,
    swipe,
    webField,
    promptField,
  };
}

/** What "Mit KI ausfüllen" hands to the page: a draft, from the web search with its photo. */
export interface AiFillResult {
  reply: RecipeDraftReply;
  replace: boolean;
  generatePhoto: boolean;
  /**
   * Spec 0055, REQ-006: the draft is the whole recipe changed by a wish; the Änderungsansicht
   * compares it variant by variant (fillPageDraft `change`).
   */
  change?: boolean;
  /** The photo of the page found on the web (spec 0049, REQ-004). */
  photo?: Blob;
  /** Spec 0049, REQ-010: „KI-Bild“ — three suggestions from the wish or the title. */
  makePhoto?: boolean;
  imageWish?: string;
}

/**
 * "Mit KI ausfüllen" on the recipe page in the edit mode: "Websuche" (spec 0049, prefilled with
 * the title) and „Prompt“ (the field of spec 0040) in a window. Spec 0055: a recipe with content
 * opens on „Prompt“ and sends itself as `current` (REQ-005, REQ-006); „Foto generieren“ starts off
 * when it has a photo. "Websuche" on a recipe with ingredients asks "Ergänzen oder ersetzen?"
 * (AC-006); "Ergänzen" keeps them. `searchNow` searches the title as the window opens, without
 * the keyboard ("Ausarbeiten", spec 0061, REQ-004).
 */
export function AiFillSheet(props: {
  title: string;
  hasIngredients: boolean;
  /** Ingredients or steps: there is something to change (spec 0055, REQ-005). */
  hasContent: boolean;
  hasPhoto: boolean;
  /** The recipe of the edit mode in the draft format (spec 0055, REQ-006). */
  current: () => RecipeDraft;
  onDraft: (result: AiFillResult) => void;
  onClose: () => void;
  searchNow?: boolean;
}) {
  const [defaults] = useState(() =>
    aiFillDefaults({ editing: true, hasContent: props.hasContent, hasPhoto: props.hasPhoto }),
  );
  const fill = useAiFill({ generatePhoto: defaults.generatePhoto });
  const online = useOnlineOnly();
  const search = useWebSearch('recipe', props.title);
  const draftInput = useDraftInput();
  const tabs = useAiFillTabs(defaults.tab, search);
  const { tab } = tabs;
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const searchTitle = useEffectEvent(() => {
    if (props.searchNow && defaults.tab === 'web') search.search(props.title);
  });
  useEffect(() => searchTitle(), []);
  const submit = () => {
    if (!fill.ready || fill.busy) return;
    const generatePhoto = fill.generatePhoto;
    const change = props.hasContent;
    void fill
      .run({ title: props.title, ...(change ? { current: props.current() } : {}) })
      .then(async (reply) => {
        if (!reply) return;
        // AC-042 (spec 0049): without "Foto generieren" the linked page's photo is proposed.
        const photo = await draftPagePhoto(reply, generatePhoto);
        props.onClose();
        props.onDraft({
          reply,
          replace: change || mode === 'replace',
          ...(change ? { change } : {}),
          generatePhoto,
          ...(photo ? { photo } : {}),
        });
      });
  };
  const take = (taken: WebTake) => {
    if (!taken.recipe) return;
    props.onClose();
    props.onDraft({
      reply: taken.recipe,
      replace: mode === 'replace',
      generatePhoto: false,
      ...(taken.photo ? { photo: taken.photo } : {}),
      ...(taken.photoChoice === 'ai' ? { makePhoto: true } : {}),
      ...(taken.imageWish ? { imageWish: taken.imageWish } : {}),
    });
  };
  return (
    <Sheet
      visible
      size="l"
      title="Mit KI ausfüllen"
      onClose={props.onClose}
      header={
        <ViewTabs
          label="Mit KI ausfüllen"
          options={AI_FILL_TABS}
          value={tab}
          onChange={(next) => tabs.choose(next)}
          testID="recipe-ai-fill-tab"
        />
      }
      actions={{
        primary:
          tab === 'web'
            ? webSearchPrimary(search, online, take, 'recipe-ai-fill-web')
            : {
                label: fill.busy ? 'Wird ausgefüllt …' : 'Ausfüllen',
                icon: 'sparkles',
                onPress: submit,
                disabled: online.disabled || fill.busy || !fill.ready,
                hint: online.hint,
                testID: 'recipe-ai-fill-submit',
              },
        cancel: { label: 'Abbrechen', onPress: props.onClose, testID: 'recipe-ai-fill-cancel' },
      }}
      testID="recipe-ai-fill"
    >
      <TabSwipeContent swipe={tabs.swipe} testID="recipe-ai-fill-swipe">
        <Stack gap={16}>
          {/* Spec 0055, AC-020: "Prompt" changes the whole recipe; only "Websuche" asks. */}
          {props.hasIngredients && tab === 'web' ? (
            <ChoiceChips
              label="Ergänzen oder ersetzen?"
              options={[
                { value: 'add', label: 'Ergänzen' },
                { value: 'replace', label: 'Ersetzen' },
              ]}
              value={mode}
              onChange={setMode}
              disabled={fill.busy}
              testID="recipe-ai-fill-mode"
            />
          ) : null}
          {tab === 'web' ? (
            <WebSearchPanel
              search={search}
              onLink={(link) => {
                fill.setText(link);
                tabs.choose('prompt');
              }}
              recipeRows={draftInput}
              autoFocus={defaults.tab === 'web' && !props.searchNow}
              inputRef={tabs.webField}
              testID="recipe-ai-fill-web"
            />
          ) : (
            <AiFillFields
              fill={fill}
              autoFocus={defaults.tab === 'prompt'}
              inputRef={tabs.promptField}
              testID="recipe-ai-fill-field"
            />
          )}
        </Stack>
      </TabSwipeContent>
    </Sheet>
  );
}
