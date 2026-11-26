import {
  draftRecipeAsync,
  OfflineError,
  preparePhoto,
  starterCatalogEntries,
  useArticles,
  useRecipes,
} from '@housekeeping/api';
import {
  AI_DRAFT_UNREACHABLE_MESSAGE,
  DRAFT_PHOTO_MAX_SIDE,
  RECIPE_DRAFT_LIMITS,
  draftLinks,
  draftToPageInput,
  linkChipLabel,
  tagValues,
  type PageDraftInput,
  type RecipeDraftReply,
  type RecipeDraftSource,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  Chip,
  IconButton,
  Photo,
  Row,
  Sheet,
  Stack,
  SwitchRow,
  Text,
  ViewTabs,
  pickImageFile,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';
import { useWebSearch } from '@/features/web-search/use-web-search';
import {
  webSearchPrimary,
  WebSearchPanel,
  type WebTake,
} from '@/features/web-search/web-search-panel';

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
  removePhoto: (index: number) => void;
  generatePhoto: boolean;
  setGeneratePhoto: (on: boolean) => void;
  busy: boolean;
  preparing: boolean;
  error: string | undefined;
  /** What the last answer said per link (chips "… konnte nicht gelesen werden"). */
  sources: RecipeDraftSource[];
  /** Something to send: text, a link or a photo. */
  ready: boolean;
  /** "Ausfüllen": the reply, or undefined when it failed (the message is in `error`). */
  run: (extraText?: string) => Promise<RecipeDraftReply | undefined>;
  reset: () => void;
}

export function useAiFill(): AiFill {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [generatePhoto, setGeneratePhoto] = useState(true);
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
  const addPhoto = (camera: boolean) =>
    pickImageFile(
      (file) => {
        setPreparing(true);
        setError(undefined);
        preparePhoto(file, DRAFT_PHOTO_MAX_SIDE).then(
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
      },
      camera ? { camera: true } : undefined,
    );
  const removePhoto = (index: number) =>
    setPhotos((current) => {
      const gone = current[index];
      if (gone) URL.revokeObjectURL(gone.uri);
      return current.filter((_, at) => at !== index);
    });

  const run = async (extraText?: string) => {
    setBusy(true);
    setError(undefined);
    setSources([]);
    try {
      const reply = await draftRecipeAsync({
        text: [extraText?.trim(), text.trim()]
          .filter(Boolean)
          .join('\n')
          .slice(0, RECIPE_DRAFT_LIMITS.text),
        links,
        photos: photos.map((entry) => entry.photo),
        imagePrompt: generatePhoto,
      });
      if (mounted.current) setSources(reply.sources);
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
    setGeneratePhoto(true);
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
    removePhoto,
    generatePhoto,
    setGeneratePhoto,
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
  return (reply) =>
    draftToPageInput(reply.draft, reply.sources, {
      articles,
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

/** The field, the link chips, the photos and "Foto generieren" (REQ-001 – REQ-003). */
export function AiFillFields(props: { fill: AiFill; testID: string }) {
  const { fill, testID } = props;
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const disabled = online.disabled || fill.busy;
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
      <SwitchRow
        label="Foto generieren"
        description="Die KI schlägt drei Fotos vor; du wählst eins oder keins."
        value={fill.generatePhoto}
        onValueChange={fill.setGeneratePhoto}
        disabled={disabled}
        testID={`${testID}-generate-photo`}
      />
      {fill.busy ? (
        <Text variant="small" color="muted" testID={`${testID}-busy`}>
          Die KI füllt das Rezept aus … das dauert bis zu einer halben Minute.
        </Text>
      ) : null}
      {fill.error ? (
        <Text variant="small" color="warn" testID={`${testID}-error`}>
          {fill.error}
        </Text>
      ) : null}
    </Stack>
  );
}

/** The two tabs of "Mit KI ausfüllen" (spec 0049, REQ-001): "Websuche" first, always. */
export type AiFillTab = 'web' | 'own';
export const AI_FILL_TABS: { value: AiFillTab; label: string }[] = [
  { value: 'web', label: 'Websuche' },
  { value: 'own', label: 'Eigene Angaben' },
];

/** What "Mit KI ausfüllen" hands to the page: a draft, from the web search with its photo. */
export interface AiFillResult {
  reply: RecipeDraftReply;
  replace: boolean;
  generatePhoto: boolean;
  /** The photo of the page found on the web (spec 0049, REQ-004). */
  photo?: Blob;
}

/**
 * "Mit KI ausfüllen" on the recipe page in the edit mode: "Websuche" (spec 0049, prefilled with
 * the title) and „Eigene Angaben“ (the field of spec 0040) in a window. A recipe with ingredients
 * asks "Ergänzen oder ersetzen?" (AC-006); "Ergänzen" keeps them.
 */
export function AiFillSheet(props: {
  title: string;
  hasIngredients: boolean;
  onDraft: (result: AiFillResult) => void;
  onClose: () => void;
}) {
  const fill = useAiFill();
  const online = useOnlineOnly();
  const search = useWebSearch('recipe', props.title);
  const draftInput = useDraftInput();
  const [tab, setTab] = useState<AiFillTab>('web');
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const submit = () => {
    if (!fill.ready || fill.busy) return;
    void fill.run().then((reply) => {
      if (!reply) return;
      props.onClose();
      props.onDraft({ reply, replace: mode === 'replace', generatePhoto: fill.generatePhoto });
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
          onChange={setTab}
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
      <Stack gap={16}>
        {props.hasIngredients ? (
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
              setTab('own');
            }}
            recipeRows={(reply) => draftInput(reply).ingredients ?? []}
            testID="recipe-ai-fill-web"
          />
        ) : (
          <AiFillFields fill={fill} testID="recipe-ai-fill-field" />
        )}
      </Stack>
    </Sheet>
  );
}
