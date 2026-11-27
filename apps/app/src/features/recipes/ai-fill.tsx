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
  draftWantsImagePrompt,
  imageAddress,
  aiFillDefaults,
  linkChipLabel,
  promptWebQuery,
  tagValues,
  type AiFillTab,
  type DraftPhotoChoice,
  type PageDraftInput,
  type RecipeDraft,
  type RecipeDraftReply,
  type RecipeDraftSource,
  type WebPhotoChoice,
  unreadLinksNotice,
} from '@housekeeping/core';
import {
  Button,
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

import { discardFirst } from '@/features/shell/confirm-dialog';
import { DictationField } from '@/features/shell/dictation-field';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';
import { pasteKeys } from '@/features/shell/photo-window';
import { useWebSearch, type WebSearch } from '@/features/web-search/use-web-search';
import {
  PhotoChoiceChips,
  webSearchPrimary,
  WebSearchPanel,
  type WebTake,
} from '@/features/web-search/web-search-panel';
import { usePromptDictation, type PromptDictation } from '@/lib/use-prompt-dictation';

import { draftPhoto } from './ai-draft';
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
  addPhoto: () => void;
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
  /** Spec 0065, REQ-002: „Original · KI-Bild · Keins“ while "Websuche" is on. */
  webPhoto: WebPhotoChoice;
  setWebPhoto: (choice: WebPhotoChoice) => void;
  /** What decides the draft's photo (REQ-003), taken when "Erzeugen" is pressed. */
  photoChoice: DraftPhotoChoice;
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
  // Spec 0065, Entscheidung 4: a recipe with a photo keeps it unless asked ("Keins").
  const startsWebPhoto: WebPhotoChoice = startsGenerating ? 'source' : 'none';
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [generatePhoto, setGeneratePhoto] = useState(startsGenerating);
  const [webSearch, setWebSearch] = useState(false);
  const [webPhoto, setWebPhoto] = useState<WebPhotoChoice>(startsWebPhoto);
  const photoChoice: DraftPhotoChoice = webSearch ? { generatePhoto, webPhoto } : { generatePhoto };
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
  const addPhoto = () => pickImageFile((file) => attach(async () => file));
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
        imagePrompt: draftWantsImagePrompt(photoChoice),
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
    setWebPhoto(startsWebPhoto);
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
    webPhoto,
    setWebPhoto,
    photoChoice,
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

// Spec 0040, Entscheidung 8: the notice says what to do instead, so it stays longer than 5 s.
const UNREAD_NOTICE_MS = 8000;

/** AC-004, AC-017, AC-019 (spec 0064, AC-011): the links that could not be read, once the draft is open. */
export function toastUnreadLinks(sources: readonly RecipeDraftSource[]): void {
  const message = unreadLinksNotice(sources);
  if (message) toast.show({ message, duration: UNREAD_NOTICE_MS });
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
  /** "Mit KI ändern" (spec 0062, REQ-007): the wish, links and the chips "Web" and "Bild". */
  compact?: boolean;
  /** The recipe has content the wish changes (spec 0055, REQ-006): its words, not "new" ones (D-02). */
  changes?: boolean;
  /** The window's dictation: its primary action sends with the last words (spec 0068). */
  dictation: PromptDictation;
  testID: string;
}) {
  const { fill, testID } = props;
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const finePointer = useFinePointer();
  const disabled = online.disabled || fill.busy;
  // Spec 0049, REQ-009: on the desktop like the photo window — drop, ⌘V and an image address.
  const desktop = !isPhone && finePointer && !props.compact;
  // Spec 0047, REQ-002: on phones and touch devices one button, the system asks for library,
  // camera or file (koordinator, review 0004).
  const touch = isPhone || !finePointer;
  const changes = props.compact === true || props.changes === true;
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
        label={changes ? 'Was soll anders sein?' : 'Was soll ins Rezept?'}
        placeholder={
          changes
            ? 'z. B. „Füg eine vegane Variante hinzu“'
            : 'z. B. „Omas Apfelkuchen für 4 mit Streuseln“ oder einen Link einfügen'
        }
        value={fill.text}
        onChangeText={fill.setText}
        dictation={props.dictation}
        multiline
        maxLength={RECIPE_DRAFT_LIMITS.text}
        editable={!disabled}
        hint={
          props.compact
            ? undefined
            : changes
              ? 'Die KI ändert nur, was du dir wünschst – du prüfst jede Änderung.'
              : 'Text, bis zu 3 Links und 4 Fotos – die KI füllt den Entwurf, du prüfst und speicherst.'
        }
        autoFocus={props.autoFocus}
        inputRef={props.inputRef}
        testID={`${testID}-text`}
      />
      {/* Nachklick 27.11., N-05: right under the wish, so it stands in sight on every screen;
          N-08: a change gets its own words. */}
      {fill.busy ? (
        <LoadingLines
          label={
            changes
              ? 'Die KI schreibt einen Vorschlag … das dauert bis zu einer halben Minute.'
              : 'Die KI füllt das Rezept aus … das dauert bis zu einer halben Minute.'
          }
          lines={4}
          testID={`${testID}-busy`}
        />
      ) : null}
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
      {props.compact ? (
        // Spec 0062, REQ-007: "Web" holds context from one web search, "Bild" makes three photos.
        <Row gap={8} wrap>
          <Chip
            label="Web"
            icon="globe"
            selected={fill.webSearch}
            onPress={() => fill.setWebSearch(!fill.webSearch)}
            disabled={disabled}
            hint={online.hint}
            accessibilityLabel="Web: vorher im Web suchen"
            testID={`${testID}-web-search`}
          />
          {/* Spec 0065, AC-005: with "Web" the photo choice below decides, no second photo chip. */}
          {fill.webSearch ? null : (
            <Chip
              label="Bild"
              icon="image"
              selected={fill.generatePhoto}
              onPress={() => fill.setGeneratePhoto(!fill.generatePhoto)}
              disabled={disabled}
              hint={online.hint}
              accessibilityLabel="Bild: drei Fotos vorschlagen"
              testID={`${testID}-generate-photo`}
            />
          )}
        </Row>
      ) : null}
      {props.compact && fill.webSearch ? (
        <WebPhotoField fill={fill} changes={changes} testID={testID} />
      ) : null}
      {!props.compact && fill.photos.length > 0 ? (
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
      {!props.compact && fill.photos.length < RECIPE_DRAFT_LIMITS.photos ? (
        <Row gap={8} wrap>
          <Button
            label={touch ? 'Foto auswählen' : 'Foto wählen'}
            icon="image"
            variant="secondary"
            size="sm"
            disabled={disabled || fill.preparing}
            hint={online.hint}
            onPress={fill.addPhoto}
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
      {/* "Foto generieren" above "Websuche" (spec 0062, decision 13); with "Websuche" on, its
          photo choice takes that place, so the switch under the finger does not move. */}
      {props.compact ? null : (
        <>
          {fill.webSearch ? (
            <WebPhotoField fill={fill} changes={changes} testID={testID} />
          ) : (
            <SwitchRow
              label="Foto generieren"
              description="Die KI schlägt drei Fotos vor; du wählst eins oder keins."
              value={fill.generatePhoto}
              onValueChange={fill.setGeneratePhoto}
              disabled={disabled}
              testID={`${testID}-generate-photo`}
            />
          )}
          <SwitchRow
            label="Websuche"
            description="Sucht vorher einmal im Web nach Titel und Wunsch – als Hintergrund für die KI."
            value={fill.webSearch}
            onValueChange={fill.setWebSearch}
            disabled={disabled}
            testID={`${testID}-web-search`}
          />
        </>
      )}
      {fill.error ? (
        <Text variant="small" color="warn" testID={`${testID}-error`}>
          {fill.error}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * Spec 0065, REQ-002: with "Websuche" on, the photo choice of the web search's preview (spec 0049,
 * REQ-010) instead of "Foto generieren", with one line on what the choice does.
 */
function WebPhotoField(props: { fill: AiFill; changes: boolean; testID: string }) {
  const { fill, testID } = props;
  const online = useOnlineOnly();
  const note =
    fill.webPhoto === 'source'
      ? 'Hat ein Treffer der Websuche ein Foto, bekommt das Rezept es; sonst schlägt die KI drei vor.'
      : fill.webPhoto === 'ai'
        ? 'Die KI schlägt drei Fotos vor; du wählst eins oder keins.'
        : props.changes
          ? 'Kein neues Foto.'
          : 'Das Rezept bekommt kein Foto.';
  return (
    <Stack gap={6}>
      <PhotoChoiceChips
        value={fill.webPhoto}
        onChange={fill.setWebPhoto}
        disabled={online.disabled || fill.busy}
        hint={online.hint}
        testID={`${testID}-web-photo`}
      />
      <Text variant="small" color="muted" testID={`${testID}-web-photo-note`}>
        {note}
      </Text>
    </Stack>
  );
}

/** The two tabs of "Mit KI ausfüllen" (spec 0049, REQ-001; spec 0055, REQ-004: „Prompt“). */
const AI_FILL_TABS: { value: AiFillTab; label: string }[] = [
  { value: 'web', label: 'Websuche' },
  { value: 'prompt', label: 'Prompt' },
];

/**
 * The tabs of "Mit KI ausfüllen" (spec 0055, REQ-001, REQ-002): a tap on a tab gives its field the
 * cursor within the tap (the keyboard stays), a swipe changes the tab and moves the cursor only
 * while typing. "Websuche" with cards or a preview has no field to type in, so none is focused.
 */
export function useAiFillTabs(
  initial: AiFillTab,
  search: WebSearch,
  /** "Mit KI ändern" shows "Prompt" first (spec 0062, REQ-007). */
  order: readonly { value: AiFillTab; label: string }[] = AI_FILL_TABS,
) {
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
  const index = order.findIndex((option) => option.value === tab);
  // Like `tabSwipe`, written out: the step reads the fields only when it happens.
  const swipe: TabSwipe = {
    index,
    count: order.length,
    onStep: (step) => {
      const next = order[index + step]?.value;
      if (next) choose(next, { onlyWhenTyping: true });
    },
  };
  return {
    tab,
    setTab,
    choose,
    swipe,
    order,
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
  /**
   * Spec 0062, REQ-009: a recipe from the web search for one with ingredients; the
   * Änderungsansicht offers "Ergänzen · Ersetzen".
   */
  fromWeb?: boolean;
  /** The photo of the page found on the web (spec 0049, REQ-004). */
  photo?: Blob;
  /** Spec 0049, REQ-010: „KI-Bild“ — three suggestions from the wish or the title. */
  makePhoto?: boolean;
  imageWish?: string;
}

/** "Mit KI ändern" (spec 0062, REQ-007): "Prompt" first. */
const CHANGE_TABS: { value: AiFillTab; label: string }[] = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'web', label: 'Websuche' },
];

/**
 * The AI window of a recipe page: "Websuche" (spec 0049, prefilled with the title) and „Prompt“
 * (the field of spec 0040). Spec 0055: a recipe with content opens on „Prompt“ and sends itself
 * as `current` (REQ-005, REQ-006); „Foto generieren“ starts off when it has a photo. `entry`
 * "page" is ✨ "Mit KI ändern" of the reading page (spec 0062, REQ-007): "Prompt" first with the
 * chips "Web" and "Bild" and "Vorschlag"; "edit" is "Mit KI ausfüllen" in the edit mode. Neither
 * asks "Ergänzen oder ersetzen?" any more: the proposal of the web search offers it (REQ-011).
 */
export function AiFillSheet(props: {
  entry: 'page' | 'edit';
  title: string;
  hasIngredients: boolean;
  /** Ingredients or steps: there is something to change (spec 0055, REQ-005). */
  hasContent: boolean;
  hasPhoto: boolean;
  /** The recipe of the page in the draft format (spec 0055, REQ-006). */
  current: () => RecipeDraft;
  onDraft: (result: AiFillResult) => void;
  onClose: () => void;
  searchNow?: boolean;
}) {
  // Nachklick 27.11., iN-05: a recipe with content gets one window from ✨ and from the pen:
  // "Mit KI ändern", "Prompt" first, the chips "Web" and "Bild". Only an empty one is filled.
  const changing = props.hasContent;
  const [defaults] = useState(() =>
    aiFillDefaults({ editing: true, hasContent: props.hasContent, hasPhoto: props.hasPhoto }),
  );
  const fill = useAiFill({ generatePhoto: defaults.generatePhoto });
  const online = useOnlineOnly();
  const search = useWebSearch('recipe', props.title);
  const draftInput = useDraftInput();
  const tabs = useAiFillTabs(defaults.tab, search, changing ? CHANGE_TABS : AI_FILL_TABS);
  const { tab } = tabs;
  // Spec 0061, REQ-004: "Ausarbeiten" searches the title as the window opens, without the keyboard.
  const searchTitle = useEffectEvent(() => {
    if (props.searchNow && defaults.tab === 'web') search.search(props.title);
  });
  useEffect(() => searchTitle(), []);
  const id = props.entry === 'page' ? 'recipe-ai-change' : 'recipe-ai-fill';
  const name = changing ? 'Mit KI ändern' : 'Mit KI ausfüllen';
  const proposes = changing;
  // Nachklick 27.11., N-17: a typed wish goes only when asked, like in "Neu".
  const dismiss = () => discardFirst(fill.text.trim() !== '', props.onClose);
  const submit = () => {
    if (!fill.ready || fill.busy) return;
    const photoChoice = fill.photoChoice;
    const change = props.hasContent;
    void fill
      .run({ title: props.title, ...(change ? { current: props.current() } : {}) })
      .then(async (reply) => {
        if (!reply) return;
        // AC-042 (spec 0049): without "Foto generieren" the linked page's photo is proposed;
        // spec 0065: with "Websuche" the photo choice decides.
        const { photo, generate } = await draftPhoto(reply, photoChoice);
        props.onClose();
        props.onDraft({
          reply,
          replace: change,
          ...(change ? { change } : {}),
          generatePhoto: generate,
          ...(photo ? { photo } : {}),
        });
      });
  };
  // Spec 0068, AC-012: "Vorschlag" / "Ausfüllen" while dictating takes the last words along.
  const dictation = usePromptDictation({
    value: fill.text,
    onChangeText: fill.setText,
    onSend: submit,
  });
  const take = (taken: WebTake) => {
    if (!taken.recipe) return;
    props.onClose();
    props.onDraft({
      reply: taken.recipe,
      replace: false,
      generatePhoto: false,
      ...(props.hasIngredients ? { fromWeb: true } : {}),
      ...(taken.photo ? { photo: taken.photo } : {}),
      ...(taken.photoChoice === 'ai' ? { makePhoto: true } : {}),
      ...(taken.imageWish ? { imageWish: taken.imageWish } : {}),
    });
  };
  return (
    <Sheet
      visible
      size="l"
      title={name}
      onClose={dismiss}
      header={
        <ViewTabs
          label={name}
          options={[...tabs.order]}
          value={tab}
          onChange={(next) => tabs.choose(next)}
          testID={`${id}-tab`}
        />
      }
      actions={{
        primary:
          tab === 'web'
            ? webSearchPrimary(search, online, take, `${id}-web`)
            : {
                // A recipe with content gets a proposal to check, not a filled draft (review 0004).
                label: fill.busy
                  ? proposes
                    ? 'Wird vorgeschlagen …'
                    : 'Wird ausgefüllt …'
                  : proposes
                    ? 'Vorschlag'
                    : 'Ausfüllen',
                icon: 'sparkles',
                onPress: dictation.send,
                disabled: online.disabled || fill.busy || (!fill.ready && !dictation.pending),
                hint: online.hint,
                testID: `${id}-submit`,
              },
        cancel: { label: 'Abbrechen', onPress: dismiss, testID: `${id}-cancel` },
      }}
      testID={id}
    >
      <TabSwipeContent swipe={tabs.swipe} testID={`${id}-swipe`}>
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
            testID={`${id}-web`}
          />
        ) : (
          <AiFillFields
            fill={fill}
            compact={changing}
            changes={props.hasContent}
            dictation={dictation}
            autoFocus={defaults.tab === 'prompt'}
            inputRef={tabs.promptField}
            testID={`${id}-field`}
          />
        )}
      </TabSwipeContent>
    </Sheet>
  );
}
