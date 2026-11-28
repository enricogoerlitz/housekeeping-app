import {
  draftRecipeAsync,
  OfflineError,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  setRecipePhoto,
  useArticlesById,
} from '@housekeeping/api';
import {
  AI_DRAFT_UNREACHABLE_MESSAGE,
  applyRecipeProposal,
  draftImageContext,
  IMAGE_EXTRA_MAX,
  imageFailureNotice,
  isUnfinishedRecipe,
  proposalIsEmpty,
  proposesPagePhoto,
  recipeDraftOf,
  recipeProposal,
  type FieldChange,
  type IngredientRow,
  type Recipe,
  type RecipeDraftReply,
  type RecipeProposal,
} from '@housekeeping/core';
import {
  Button,
  IconButton,
  Notice,
  Photo,
  Row,
  Stack,
  Text,
  openKeyboardNow,
  toast,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { errorMessage } from '@/features/shell/error-message';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';
import { revokeLater } from '@/features/shell/revoke-later';
import { ProposalSheet, type ProposalRefine } from '@/features/web-search/proposal-sheet';
import { features } from '@/lib/features';
import { usePromptDictation } from '@/lib/use-prompt-dictation';

import {
  dismissPhotoSuggestions,
  regeneratePhotoSuggestions,
  startPhotoSuggestions,
  usePhotoSuggestions,
} from './ai-draft';
import { peekAiChange, takeAiChange } from './ai-change-request';
import { AiFillSheet, toastUnreadLinks, useDraftInput, type AiFillResult } from './ai-fill';
import type { PageEditor } from './sections/use-page-editor';

/** Whether a recipe page offers the AI at all: recipes only, with the AI switch. */
function offersAi(recipe: Recipe): boolean {
  return features.aiRecipes && recipe.kind === 'recipe';
}

/**
 * ✨ in the header of the reading recipe page (spec 0062, REQ-007): on phones the symbol, from
 * tablet width with its text; greyed out offline. "Mit KI ändern" opens its window, the keyboard
 * comes with the tap for the window's field (spec 0055, AC-004). On an unfinished recipe it is
 * "Mit KI ausarbeiten" and does what the card does (Nachklick 27.11., N-02): the edit mode with
 * the web search of the title, without the keyboard.
 */
export function AiChangeButton(props: {
  recipe: Recipe;
  onPress: () => void;
  onWorkOut: () => void;
}) {
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  if (!offersAi(props.recipe)) return null;
  const workOut = isUnfinishedRecipe(props.recipe);
  const label = workOut ? 'Mit KI ausarbeiten' : 'Mit KI ändern';
  const testID = workOut ? 'recipe-ai-work-out' : 'recipe-ai-change-open';
  const press = () => {
    if (workOut) {
      props.onWorkOut();
      return;
    }
    openKeyboardNow();
    props.onPress();
  };
  return isPhone ? (
    <IconButton
      icon="sparkles"
      size={44}
      label={label}
      disabled={online.disabled}
      hint={online.hint}
      onPress={press}
      testID={testID}
    />
  ) : (
    // Nachklick 27.11., N-15: a Button keeps to the top of its row; the wrapper is centred like
    // the other buttons of the header.
    <View>
      <Button
        label={label}
        icon="sparkles"
        variant="ghost"
        size="sm"
        disabled={online.disabled}
        hint={online.hint}
        onPress={press}
        testID={testID}
      />
    </View>
  );
}

/**
 * The AI of a recipe page (spec 0040): "Mit KI ausfüllen" in the edit mode (REQ-001, AC-006),
 * ✨ "Mit KI ändern" of the reading page (spec 0062, `changing`) and the three photo suggestions
 * of "Foto generieren" (REQ-003, AC-010). Both open the Änderungsansicht (spec 0049, REQ-005);
 * from the edit mode "Übernehmen" fills it, from the reading page it saves at once (spec 0062,
 * REQ-010). Not for collections; only with `features.aiRecipes`.
 */
export function AiPageTools(props: {
  recipe: Recipe;
  editor: PageEditor;
  /** ✨ was tapped: "Mit KI ändern" is open. */
  changing: boolean;
  onChangeClose: () => void;
}) {
  const { recipe, editor } = props;
  const online = useOnlineOnly();
  const [filling, setFilling] = useState(false);
  const [review, setReview] = useState<Review>();
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string>();
  const draftInput = useDraftInput();
  const articlesById = useArticlesById();
  // The wish of the agent's chat, read while the page opens (taken by the effect below).
  const [asked, setAsked] = useState(() => peekAiChange(recipe.id));
  // Spec 0061, REQ-004: "Ausarbeiten" opens the edit mode with the window searching the title;
  // the intent stays until the window closes.
  const workOut = editor.intent?.kind === 'ai';
  const closeFill = () => {
    setFilling(false);
    if (workOut) editor.clearIntent();
  };
  const editing = editor.draft !== undefined;
  const page = editor.page();
  const hasIngredients = page.ingredients.rows.length > 0;
  // Spec 0055, REQ-005: something to change — then "Prompt" first and the recipe goes along.
  const hasContent = hasIngredients || (page.steps?.steps.length ?? 0) > 0;
  const hadPhoto = recipe.photoPath !== undefined || recipe.photo !== undefined;
  const articleName = (row: IngredientRow) => {
    const article = row.article;
    if (article?.kind === 'article') return articlesById[article.articleId]?.name ?? row.name ?? '';
    if (article?.kind === 'hit') return article.hit.name;
    return article?.name ?? row.name ?? '';
  };
  // The proposal for one way of comparing; the page's photo only where it is proposed (AC-047 of
  // spec 0049: "Ergänzen" proposes it only to a recipe without one).
  const compare = (
    reply: RecipeDraftReply,
    replace: boolean,
    change: boolean,
    photo: Blob | undefined,
  ) => {
    const proposal = recipeProposal(
      editor.page(),
      editor.filled(draftInput(reply), { replace, change }),
      { articleName },
    );
    const pagePhoto =
      photo && proposesPagePhoto({ hasPhoto: hadPhoto, replace }) ? photo : undefined;
    if (pagePhoto) proposal.fields.push(photoField(hadPhoto));
    return { proposal, pagePhoto };
  };
  // Spec 0049, REQ-005: a draft for a recipe that has content opens the Änderungsansicht first.
  const propose = (result: AiFillResult, direct: boolean) => {
    const { reply, replace, change = false, generatePhoto, photo, makePhoto, imageWish } = result;
    const { proposal, pagePhoto } = compare(reply, replace, change, photo);
    toastUnreadLinks(reply.sources);
    if (generatePhoto && reply.draft.imagePrompt) {
      startPhotoSuggestions(recipe.id, {
        prompt: reply.draft.imagePrompt,
        context: draftImageContext(reply.draft),
        coverUrl: reply.sources.find((source) => source.coverUrl)?.coverUrl,
      });
    } else if (makePhoto) {
      // Spec 0049, REQ-010: „KI-Bild“ chosen in the preview, with the wish or the title.
      startPhotoSuggestions(recipe.id, {
        prompt: imageWish ?? reply.draft.title,
        context: draftImageContext(reply.draft),
      });
    }
    // Spec 0062, REQ-009: "Ergänzen" may change nothing where "Ersetzen" would.
    if (proposalIsEmpty(proposal) && !result.fromWeb) {
      toast.show({ message: 'Der Vorschlag ändert nichts am Rezept.' });
      return;
    }
    setRefineError(undefined);
    setReview({
      proposal,
      reply,
      replace,
      change,
      direct,
      fromWeb: result.fromWeb === true,
      ...(photo ? { sourcePhoto: photo } : {}),
      ...(pagePhoto ? { photo: pagePhoto } : {}),
    });
  };
  // Spec 0062, REQ-009: "Ergänzen · Ersetzen" compares the same answer again.
  const switchMode = (mode: 'add' | 'replace') => {
    if (!review) return;
    const replace = mode === 'replace';
    const { proposal, pagePhoto } = compare(
      review.reply,
      replace,
      review.change,
      review.sourcePhoto,
    );
    const next: Review = { ...review, proposal, replace };
    delete next.photo;
    setReview(pagePhoto ? { ...next, photo: pagePhoto } : next);
  };
  // Spec 0055, REQ-008: the proposal and one sentence go to the AI; its answer is compared with
  // the same page, in the same way, and replaces the proposal (AC-026). A failure keeps it (AC-027).
  const refine = async (wish: string): Promise<boolean> => {
    if (!review) return false;
    setRefining(true);
    setRefineError(undefined);
    try {
      const answer = await draftRecipeAsync({
        text: wish,
        links: [],
        photos: [],
        imagePrompt: false,
        current: review.reply.draft,
      });
      // The links read for the first proposal stay its links.
      const reply = { ...answer, sources: review.reply.sources };
      const proposal = recipeProposal(
        editor.page(),
        editor.filled(draftInput(reply), { replace: review.replace, change: review.change }),
        { articleName },
      );
      if (review.photo) proposal.fields.push(photoField(hadPhoto));
      setReview({ ...review, proposal, reply });
      return true;
    } catch (cause) {
      setRefineError(
        cause instanceof OfflineError ? OFFLINE_EDIT_HINT : AI_DRAFT_UNREACHABLE_MESSAGE,
      );
      return false;
    } finally {
      setRefining(false);
    }
  };
  const window = (entry: 'page' | 'edit', onClose: () => void) => (
    <AiFillSheet
      entry={entry}
      title={page.head.title}
      hasIngredients={hasIngredients}
      hasContent={hasContent}
      hasPhoto={hadPhoto || editor.chosenPhoto !== undefined}
      current={() => recipeDraftOf(editor.page(), articleName)}
      onClose={onClose}
      searchNow={entry === 'edit' && workOut}
      onDraft={(result) => propose(result, entry === 'page')}
    />
  );
  // The panel and the windows show nothing in place on the reading page, so no empty slot takes
  // the page's gap above the photo (Nachklick 27.11.: 24 pt gap under the head).
  const panel = <PhotoSuggestionsPanel recipe={recipe} editor={editor} />;
  // Spec 0067, step C: a change asked for in the agent's chat ("vegetarische Variante") runs
  // "Mit KI ändern" with that wish as the page opens; its Änderungsansicht shows the result.
  const runs = offersAi(recipe) && !editing && hasContent && !online.disabled;
  const runAsked = useEffectEvent(() => {
    const wish = takeAiChange(recipe.id);
    if (!wish || !runs) return;
    draftRecipeAsync({
      text: wish,
      links: [],
      photos: [],
      imagePrompt: false,
      current: recipeDraftOf(editor.page(), articleName),
    })
      .then((reply) => propose({ reply, replace: true, change: true, generatePhoto: false }, true))
      .catch((cause: unknown) =>
        toast.show({
          message: cause instanceof OfflineError ? OFFLINE_EDIT_HINT : AI_DRAFT_UNREACHABLE_MESSAGE,
        }),
      )
      .finally(() => setAsked(undefined));
  });
  useEffect(() => runAsked(), []);
  if (!offersAi(recipe)) return null;
  return (
    <>
      {asked && runs ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          testID="recipe-ai-change-asked"
        >
          <ActivityIndicator size="small" />
          <Text variant="small" color="muted" style={{ flex: 1 }}>
            {`Die KI ändert das Rezept: „${asked}“ …`}
          </Text>
        </View>
      ) : null}
      {editing ? (
        <Stack gap={12}>
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              // Nachklick 27.11., iN-05: the name of the window it opens.
              label={hasContent ? 'Mit KI ändern' : 'Mit KI ausfüllen'}
              icon="sparkles"
              variant="link"
              size="sm"
              disabled={online.disabled || editor.saving}
              hint={online.hint}
              onPress={() => {
                // Spec 0055, AC-004: the keyboard comes with the tap, for the field of the window.
                openKeyboardNow();
                setFilling(true);
              }}
              testID="recipe-ai-fill-open"
            />
          </View>
          {panel}
        </Stack>
      ) : (
        panel
      )}
      {(filling || workOut) && editing ? window('edit', closeFill) : null}
      {props.changing && !editing ? window('page', props.onChangeClose) : null}
      {review ? (
        <RecipeReview
          review={review}
          refine={{ busy: refining, error: refineError, onSend: refine }}
          onApply={(rejected) => {
            const next = applyRecipeProposal(review.proposal, rejected);
            const photo = review.photo && !rejected.has(PHOTO_FIELD) ? review.photo : undefined;
            setReview(undefined);
            // Spec 0062, REQ-008: from the reading page "Übernehmen" saves at once.
            if (review.direct && !editor.draft) {
              editor.apply(next, photo);
              return;
            }
            editor.adopt(next);
            if (photo) editor.choosePhoto(photo);
          }}
          onMode={review.fromWeb ? switchMode : undefined}
          onClose={() => setReview(undefined)}
        />
      ) : null}
    </>
  );
}

interface Review {
  proposal: RecipeProposal;
  /** The page's photo the proposal shows as the field "Foto". */
  photo?: Blob;
  /** The photo of the page found on the web, for comparing again (REQ-011). */
  sourcePhoto?: Blob;
  /** The AI's answer the proposal shows, for "Anpassen" (spec 0055, REQ-008). */
  reply: RecipeDraftReply;
  replace: boolean;
  change: boolean;
  /** ✨ "Mit KI ändern": "Übernehmen" saves (spec 0062, REQ-008). */
  direct: boolean;
  /** From the web search for a recipe with ingredients: "Ergänzen · Ersetzen" (REQ-011). */
  fromWeb: boolean;
}

const PHOTO_FIELD = 'photo';

/** The photo of the page as the field "Foto" of the Änderungsansicht. */
function photoField(hadPhoto: boolean): FieldChange {
  return {
    id: PHOTO_FIELD,
    label: 'Foto',
    before: hadPhoto ? 'bisheriges Foto' : '',
    after: 'Foto der Seite',
    status: hadPhoto ? 'changed' : 'new',
  };
}

/** The Änderungsansicht of the recipe, with the page's photo shown as a picture. */
function RecipeReview(props: {
  review: Review;
  refine: ProposalRefine;
  onApply: (rejected: ReadonlySet<string>) => void;
  onMode?: (mode: 'add' | 'replace') => void;
  onClose: () => void;
}) {
  const { sourcePhoto } = props.review;
  const [uri] = useState(() => (sourcePhoto ? URL.createObjectURL(sourcePhoto) : undefined));
  useEffect(
    () => () => {
      if (uri) revokeLater(uri);
    },
    [uri],
  );
  // The photo comes and goes with "Ergänzen · Ersetzen"; it is always the page's.
  const shown = props.review.photo ? uri : undefined;
  const { onMode } = props;
  return (
    <ProposalSheet
      proposal={props.review.proposal}
      {...(shown ? { photo: { uri: shown } } : {})}
      refine={props.refine}
      onlyChanges
      {...(onMode
        ? { mode: { value: props.review.replace ? 'replace' : 'add', onChange: onMode } }
        : {})}
      onApply={props.onApply}
      onClose={props.onClose}
      testID="recipe-proposal"
    />
  );
}

/** Spec 0045, REQ-005: read by screen readers on each pulsing tile. */
const GENERATING_LABEL = 'Foto wird erzeugt';
/** Three tiles stay thumbnails on a wide screen; the large photo stands below. */
const TILE_MAX = 200;

/** "Was soll anders sein?" and "Neu generieren" under the photo suggestions (spec 0068: sent with the last dictated words). */
function RegenerateLine(props: {
  loading: boolean;
  /** Kept by the panel, so the wish stays through the loading state. */
  extra: string;
  setExtra: (extra: string) => void;
  onRegenerate: (extra: string) => void;
  testID: string;
}) {
  const { loading, extra, setExtra, testID: id } = props;
  const online = useOnlineOnly();
  const dictation = usePromptDictation({
    value: extra,
    onChangeText: setExtra,
    onSend: () => props.onRegenerate(extra),
  });
  return (
    <Stack gap={8}>
      <DictationField
        label="Was soll anders sein?"
        placeholder="optional, z. B. heller, von oben"
        value={extra}
        onChangeText={setExtra}
        dictation={dictation}
        maxLength={IMAGE_EXTRA_MAX}
        editable={!loading && !online.disabled}
        testID={`${id}-extra`}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={loading ? 'Wird erzeugt …' : 'Neu generieren'}
          icon="refresh-cw"
          variant="secondary"
          size="sm"
          disabled={loading || online.disabled}
          hint={online.hint}
          onPress={dictation.send}
          testID={`${id}-regenerate`}
        />
      </View>
    </Stack>
  );
}

/**
 * AC-010: three suggestions; "Übernehmen" makes one the draft's photo (saved with "Speichern").
 * Spec 0045: the tiles pulse while the photos are made (REQ-005); "Neu generieren" with an
 * optional wish makes three new ones (REQ-006) and replaces "Keins davon". On the reading page
 * (after ✨, spec 0062, REQ-010) "Übernehmen" saves the photo at once and "Ausblenden" closes.
 */
function PhotoSuggestionsPanel(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const theme = useTheme();
  const online = useOnlineOnly();
  const suggestions = usePhotoSuggestions(recipe.id);
  const [selected, setSelected] = useState(0);
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);
  if (!suggestions) return null;
  const reading = editor.draft === undefined;
  const take = (photo: Blob) => {
    if (!reading) {
      editor.choosePhoto(photo);
      return;
    }
    setSaving(true);
    setRecipePhoto(recipe.id, photo).then(
      () => {
        setSaving(false);
        dismissPhotoSuggestions(recipe.id);
        toast.show({ message: 'Foto gespeichert' });
      },
      (cause: unknown) => {
        setSaving(false);
        toast.show({ message: errorMessage(cause, PHOTO_UPLOAD_FAILED_MESSAGE) });
      },
    );
  };
  const hide = reading ? (
    <Button
      label="Ausblenden"
      variant="link"
      size="sm"
      onPress={() => dismissPhotoSuggestions(recipe.id)}
      testID="recipe-photo-suggestions-hide"
    />
  ) : null;
  const id = 'recipe-photo-suggestions';
  const loading = suggestions.status === 'loading';
  const again = (
    <RegenerateLine
      loading={loading}
      extra={extra}
      setExtra={setExtra}
      onRegenerate={(wish) => {
        setSelected(0);
        regeneratePhotoSuggestions(recipe.id, wish);
      }}
      testID={id}
    />
  );
  if (loading) {
    return (
      <Stack gap={8}>
        <Text variant="smallStrong" testID={id}>
          Fotovorschläge
        </Text>
        <Row gap={8}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ flex: 1, maxWidth: TILE_MAX }}>
              <Photo
                generating={GENERATING_LABEL}
                aspectRatio={1}
                testID={`${id}-generating-${index}`}
              />
            </View>
          ))}
        </Row>
        <Text variant="small" color="muted" testID={`${id}-busy`}>
          Die KI erzeugt drei Fotos …
        </Text>
      </Stack>
    );
  }
  if (suggestions.status === 'failed') {
    return (
      <Stack gap={8}>
        <Notice icon="circle-alert" text={suggestions.message} testID={`${id}-error`} />
        {again}
        {hide}
      </Stack>
    );
  }
  const chosen = suggestions.photos.findIndex((entry) => entry.photo === editor.chosenPhoto);
  const failure = imageFailureNotice(suggestions.failed);
  return (
    <Stack gap={8}>
      <Text variant="smallStrong" testID={id}>
        Fotovorschläge
      </Text>
      <Row gap={8}>
        {suggestions.photos.map((entry, index) => (
          <Pressable
            key={entry.uri}
            accessibilityRole="radio"
            accessibilityState={{ selected: index === selected }}
            accessibilityLabel={`Vorschlag ${index + 1}`}
            onPress={() => setSelected(index)}
            testID={`${id}-${index}`}
            style={{
              flex: 1,
              maxWidth: TILE_MAX,
              borderRadius: theme.shape.radius.tile,
              borderWidth: 3,
              borderColor: index === selected ? theme.colors.accent : 'transparent',
              overflow: 'hidden',
            }}
          >
            <Photo source={{ uri: entry.uri }} aspectRatio={1} alt={`Vorschlag ${index + 1}`} />
          </Pressable>
        ))}
      </Row>
      {failure ? (
        <Text variant="small" color="muted" testID={`${id}-failed`}>
          {failure}
        </Text>
      ) : null}
      <Row gap={12} wrap align="center">
        <Button
          label={saving ? 'Wird gespeichert …' : chosen === selected ? 'Übernommen' : 'Übernehmen'}
          icon="check"
          size="sm"
          disabled={chosen === selected || saving || (reading && online.disabled)}
          hint={reading ? online.hint : undefined}
          onPress={() => {
            const entry = suggestions.photos[selected];
            if (entry) take(entry.photo);
          }}
          testID={`${id}-apply`}
        />
        {chosen >= 0 && !reading ? (
          <Text variant="small" color="muted" testID={`${id}-chosen`}>
            Wird mit „Speichern“ das Foto des Rezepts.
          </Text>
        ) : null}
        {hide}
      </Row>
      {again}
    </Stack>
  );
}
