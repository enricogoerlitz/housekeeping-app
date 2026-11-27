import { draftRecipeAsync, OfflineError, useArticlesById } from '@housekeeping/api';
import {
  AI_DRAFT_UNREACHABLE_MESSAGE,
  applyRecipeProposal,
  draftImageContext,
  IMAGE_EXTRA_MAX,
  imageFailureNotice,
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
  Notice,
  Photo,
  Row,
  Stack,
  Text,
  openKeyboardNow,
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';
import { revokeLater } from '@/features/shell/revoke-later';
import { ProposalSheet, type ProposalRefine } from '@/features/web-search/proposal-sheet';
import { features } from '@/lib/features';

import { regeneratePhotoSuggestions, startPhotoSuggestions, usePhotoSuggestions } from './ai-draft';
import { AiFillSheet, toastUnreadLinks, useDraftInput, type AiFillResult } from './ai-fill';
import type { PageEditor } from './sections/use-page-editor';

/**
 * The AI in the edit mode of a recipe (spec 0040): "Mit KI ausfüllen" (REQ-001, AC-006) and the
 * three photo suggestions of "Foto generieren" (REQ-003, AC-010). Hidden while reading and for
 * collections; only with `features.aiRecipes`.
 */
export function AiPageTools(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const online = useOnlineOnly();
  const [filling, setFilling] = useState(false);
  const [review, setReview] = useState<Review>();
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string>();
  const draftInput = useDraftInput();
  const articlesById = useArticlesById();
  // Spec 0061, REQ-004: "Ausarbeiten" opens the edit mode with the window searching the title;
  // the intent stays until the window closes.
  const workOut = editor.intent?.kind === 'ai';
  const closeFill = () => {
    setFilling(false);
    if (workOut) editor.clearIntent();
  };
  if (!features.aiRecipes || !editor.draft || recipe.kind !== 'recipe') return null;
  const page = editor.draft;
  const hasIngredients = editor.draft.ingredients.rows.length > 0;
  // Spec 0055, REQ-005: something to change — then "Prompt" first and the recipe goes along.
  const hasContent = hasIngredients || (editor.draft.steps?.steps.length ?? 0) > 0;
  const hadPhoto = recipe.photoPath !== undefined || recipe.photo !== undefined;
  const articleName = (row: IngredientRow) => {
    const article = row.article;
    if (article?.kind === 'article') return articlesById[article.articleId]?.name ?? row.name ?? '';
    if (article?.kind === 'hit') return article.hit.name;
    return article?.name ?? row.name ?? '';
  };
  // Spec 0049, REQ-005: a draft for a recipe that has content opens the Änderungsansicht first.
  const propose = ({
    reply,
    replace,
    change = false,
    generatePhoto,
    photo,
    makePhoto,
    imageWish,
  }: AiFillResult) => {
    const before = editor.draft;
    if (!before) return;
    const input = draftInput(reply);
    const proposal = recipeProposal(before, editor.filled(input, { replace, change }), {
      articleName,
    });
    // AC-047 (spec 0049): "Ergänzen" proposes the page's photo only to a recipe without one.
    const pagePhoto =
      photo && proposesPagePhoto({ hasPhoto: hadPhoto, replace }) ? photo : undefined;
    if (pagePhoto) proposal.fields.push(photoField(hadPhoto));
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
    if (proposalIsEmpty(proposal)) {
      toast.show({ message: 'Der Vorschlag ändert nichts am Rezept.' });
      return;
    }
    setRefineError(undefined);
    setReview({ proposal, reply, replace, change, ...(pagePhoto ? { photo: pagePhoto } : {}) });
  };
  // Spec 0055, REQ-008: the proposal and one sentence go to the AI; its answer is compared with
  // the same page, in the same way, and replaces the proposal (AC-026). A failure keeps it (AC-027).
  const refine = async (wish: string): Promise<boolean> => {
    const before = editor.draft;
    if (!review || !before) return false;
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
        before,
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
  return (
    <Stack gap={12}>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label="Mit KI ausfüllen"
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
      <PhotoSuggestionsPanel recipe={recipe} editor={editor} />
      {filling || workOut ? (
        <AiFillSheet
          title={editor.draft.head.title}
          hasIngredients={hasIngredients}
          hasContent={hasContent}
          hasPhoto={hadPhoto || editor.chosenPhoto !== undefined}
          current={() => recipeDraftOf(page, articleName)}
          searchNow={workOut}
          onClose={closeFill}
          onDraft={propose}
        />
      ) : null}
      {review ? (
        <RecipeReview
          review={review}
          refine={{ busy: refining, error: refineError, onSend: refine }}
          onApply={(rejected) => {
            editor.adopt(applyRecipeProposal(review.proposal, rejected));
            if (review.photo && !rejected.has(PHOTO_FIELD)) editor.choosePhoto(review.photo);
            setReview(undefined);
          }}
          onClose={() => setReview(undefined)}
        />
      ) : null}
    </Stack>
  );
}

interface Review {
  proposal: RecipeProposal;
  photo?: Blob;
  /** The AI's answer the proposal shows, for "Anpassen" (spec 0055, REQ-008). */
  reply: RecipeDraftReply;
  replace: boolean;
  change: boolean;
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
  onClose: () => void;
}) {
  const { photo } = props.review;
  const [uri] = useState(() => (photo ? URL.createObjectURL(photo) : undefined));
  useEffect(
    () => () => {
      if (uri) revokeLater(uri);
    },
    [uri],
  );
  return (
    <ProposalSheet
      proposal={props.review.proposal}
      {...(uri ? { photo: { uri } } : {})}
      refine={props.refine}
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

/**
 * AC-010: three suggestions; "Übernehmen" makes one the draft's photo (saved with "Speichern").
 * Spec 0045: the tiles pulse while the photos are made (REQ-005); "Neu generieren" with an
 * optional wish makes three new ones (REQ-006) and replaces "Keins davon".
 */
function PhotoSuggestionsPanel(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const theme = useTheme();
  const online = useOnlineOnly();
  const suggestions = usePhotoSuggestions(recipe.id);
  const [selected, setSelected] = useState(0);
  const [extra, setExtra] = useState('');
  if (!suggestions) return null;
  const id = 'recipe-photo-suggestions';
  const loading = suggestions.status === 'loading';
  const regenerate = () => {
    setSelected(0);
    regeneratePhotoSuggestions(recipe.id, extra);
  };
  const again = (
    <Stack gap={8}>
      <DictationField
        label="Was soll anders sein?"
        placeholder="optional, z. B. heller, von oben"
        value={extra}
        onChangeText={setExtra}
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
          onPress={regenerate}
          testID={`${id}-regenerate`}
        />
      </View>
    </Stack>
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
          label={chosen === selected ? 'Übernommen' : 'Übernehmen'}
          icon="check"
          size="sm"
          disabled={chosen === selected}
          onPress={() => {
            const entry = suggestions.photos[selected];
            if (entry) editor.choosePhoto(entry.photo);
          }}
          testID={`${id}-apply`}
        />
        {chosen >= 0 ? (
          <Text variant="small" color="muted" testID={`${id}-chosen`}>
            Wird mit „Speichern“ das Foto des Rezepts.
          </Text>
        ) : null}
      </Row>
      {again}
    </Stack>
  );
}
