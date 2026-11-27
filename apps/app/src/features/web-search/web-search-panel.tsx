import { useArticlesById, useHousehold } from '@housekeeping/api';
import {
  effectiveWebPhotoChoice,
  hoursToday,
  isoWeekdayIn,
  pastedLink,
  previewIngredients,
  ratingLabel,
  searchStatusLine,
  WEB_SEARCH_LIMITS,
  type IngredientRow,
  type PlaceProposal,
  type RecipeDraftReply,
  type RecipeVariant,
  type WebPhotoChoice,
  type WebResult,
} from '@housekeeping/core';
import {
  Button,
  ChoiceChips,
  Notice,
  Photo,
  Row,
  Stack,
  SwitchRow,
  Text,
  useTheme,
  type SheetAction,
} from '@housekeeping/ui';
import { Pressable, View } from 'react-native';

import { DictationField } from '@/features/shell/dictation-field';
import { useOnlineOnly } from '@/features/shell/offline';
import { openLink } from '@/lib/open-link';

import { NOTHING_FOUND, type CardPhoto, type WebSearch } from './use-web-search';

// The Websuche (spec 0049, REQ-001 – REQ-003): the search field, the cards and the preview of one
// card. The window around it carries the primary action (webSearchPrimary): "Suchen" or
// "Übernehmen".

const SKELETONS = 3;
const THUMB = 76;

/** What "Übernehmen" hands over: the card, its photo and the preview's data. */
export interface WebTake {
  card: WebResult;
  photo?: Blob;
  recipe?: RecipeDraftReply;
  place?: PlaceProposal;
  /** REQ-008: what the made photo should show; without it the name with its context. */
  imageWish?: string;
  /** REQ-010: `photo` only with "source"; "ai" makes three suggestions; "none" no photo. */
  photoChoice: WebPhotoChoice;
}

/** The primary action of the window: "Suchen", or "Übernehmen" in a preview. */
export function webSearchPrimary(
  search: WebSearch,
  online: { disabled: boolean; hint: string | undefined },
  onTake: (take: WebTake) => void,
  testID: string,
): SheetAction {
  const preview = search.preview;
  if (preview) {
    const ready = preview.status === 'recipe' || preview.status === 'place';
    return {
      label: 'Übernehmen',
      icon: 'check',
      disabled: online.disabled || !ready,
      hint: online.hint,
      testID: `${testID}-take`,
      onPress: () => {
        if (!ready) return;
        const photo = search.photos[preview.card.url];
        const photoChoice = effectiveWebPhotoChoice(search.photoChoice, photo?.status === 'ready');
        onTake({
          card: preview.card,
          photoChoice,
          ...(photo?.status === 'ready' && photoChoice === 'source' ? { photo: photo.photo } : {}),
          ...(preview.status === 'recipe' ? { recipe: preview.reply } : {}),
          ...(preview.status === 'place' ? { place: preview.proposal } : {}),
          ...(search.imageWish ? { imageWish: search.imageWish } : {}),
        });
      },
    };
  }
  return {
    label: search.state.status === 'searching' ? 'Sucht …' : 'Suchen',
    icon: 'search',
    disabled: online.disabled || search.busy || search.query.trim() === '',
    hint: online.hint,
    testID: `${testID}-submit`,
    onPress: search.search,
  };
}

function CardImage(props: { photo: CardPhoto | undefined; size?: number; alt: string }) {
  const photo = props.photo;
  return (
    <Photo
      source={photo?.status === 'ready' ? { uri: photo.uri } : undefined}
      loading={photo?.status === 'loading'}
      placeholderIcon="image"
      width={props.size ?? '100%'}
      aspectRatio={props.size ? 1 : 16 / 10}
      alt={photo?.status === 'ready' ? props.alt : undefined}
    />
  );
}

function cardLines(card: WebResult): string[] {
  const rating = ratingLabel(card.rating, card.ratingCount);
  if (card.address || card.category) {
    return [[rating, card.category].filter(Boolean).join(' · '), card.address ?? ''].filter(
      Boolean,
    );
  }
  return [
    [rating, card.totalMinutes ? `${card.totalMinutes} Min` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean);
}

function ResultCard(props: {
  card: WebResult;
  photo: CardPhoto | undefined;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const { card } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.title}, ${card.source}`}
      onPress={props.onPress}
      testID={props.testID}
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 8,
        borderRadius: theme.shape.radius.card,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        minHeight: 44,
      }}
    >
      <View style={{ width: THUMB }}>
        <CardImage photo={props.photo} size={THUMB} alt={card.title} />
      </View>
      <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
        <Text variant="rowTitle" numberOfLines={2}>
          {card.title}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {card.source}
        </Text>
        {cardLines(card).map((line) => (
          <Text key={line} variant="small" color="muted" numberOfLines={2}>
            {line}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

function SkeletonCard(props: { label: string; testID: string }) {
  const theme = useTheme();
  const bar = (width: `${number}%`) => (
    <View
      style={{
        width,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.colors.surfaceSunken,
      }}
    />
  );
  return (
    <View
      testID={props.testID}
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 8,
        borderRadius: theme.shape.radius.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ width: THUMB }}>
        <Photo generating={props.label} width={THUMB} aspectRatio={1} />
      </View>
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        {bar('80%')}
        {bar('40%')}
        {bar('60%')}
      </View>
    </View>
  );
}

/** The draft's ingredients and variants as the edit mode takes them (recipes' useDraftInput). */
export type RecipeRows = (reply: RecipeDraftReply) => {
  ingredients?: readonly IngredientRow[];
  variants?: readonly RecipeVariant[];
};

function RecipePreview(props: { reply: RecipeDraftReply; rows: RecipeRows; testID: string }) {
  const articlesById = useArticlesById();
  const input = props.rows(props.reply);
  const ingredients = previewIngredients(input.ingredients ?? [], articlesById, input.variants);
  return (
    <Stack gap={12}>
      <Text variant="smallStrong">Zutaten</Text>
      <View style={{ gap: 4 }} testID={`${props.testID}-ingredients`}>
        {ingredients.map((ingredient, index) => (
          <Text
            key={`${ingredient.label}-${index}`}
            variant="small"
            color={ingredient.known ? 'success' : 'muted'}
          >
            {ingredient.label}
          </Text>
        ))}
      </View>
      <Text variant="smallStrong">Schritte</Text>
      <View style={{ gap: 6 }} testID={`${props.testID}-steps`}>
        {props.reply.draft.steps.map((step, index) => (
          <Text key={`${index}-${step.text}`} variant="small">
            {`${index + 1}. ${step.text}`}
          </Text>
        ))}
      </View>
    </Stack>
  );
}

function PlacePreview(props: {
  card: WebResult;
  proposal: PlaceProposal;
  kindLabel: string;
  testID: string;
}) {
  const household = useHousehold();
  const { card, proposal } = props;
  const today = hoursToday(card.openingHours, isoWeekdayIn(new Date(), household.timeZone));
  const sort = proposal.cuisine ?? proposal.kind;
  const lines = [
    card.address,
    sort ? `${props.kindLabel}: ${sort}` : card.category,
    today,
    ratingLabel(card.rating, card.ratingCount),
  ].filter((line): line is string => Boolean(line));
  return (
    <Stack gap={8}>
      {lines.map((line) => (
        <Text key={line} variant="small" testID={`${props.testID}-line`}>
          {line}
        </Text>
      ))}
      {proposal.description ? <Text variant="small">{proposal.description}</Text> : null}
      <Row gap={12} wrap>
        {card.mapsUrl ? (
          <Button
            label="Auf der Karte"
            icon="map-pin"
            variant="link"
            size="sm"
            onPress={() => openLink(card.mapsUrl ?? '')}
            testID={`${props.testID}-maps`}
          />
        ) : null}
        {card.websiteUrl ? (
          <Button
            label="Webseite"
            icon="link"
            variant="link"
            size="sm"
            onPress={() => openLink(card.websiteUrl ?? '')}
            testID={`${props.testID}-website`}
          />
        ) : null}
      </Row>
    </Stack>
  );
}

const PHOTO_OPTIONS: { value: WebPhotoChoice; label: string }[] = [
  { value: 'source', label: 'Original' },
  { value: 'ai', label: 'KI-Bild' },
  { value: 'none', label: 'Keins' },
];

/**
 * REQ-010: which photo the entry gets. With a photo of the hit „Original · KI-Bild · Keins“
 * (AC-034), without one the switch „Foto generieren“ (AC-035).
 */
function PhotoChoice(props: { search: WebSearch; testID: string }) {
  const { search, testID } = props;
  const card = search.preview?.card;
  if (!card) return null;
  const photo = search.photos[card.url];
  const hasPhoto = photo?.status === 'ready' || photo?.status === 'loading';
  const choice = effectiveWebPhotoChoice(search.photoChoice, hasPhoto);
  const note =
    choice === 'ai'
      ? search.imageWish
        ? `Nach „Übernehmen“ macht die KI drei Fotos: „${search.imageWish}“.`
        : 'Nach „Übernehmen“ macht die KI drei Fotos zur Auswahl.'
      : choice === 'none'
        ? 'Der Eintrag bekommt kein Foto.'
        : undefined;
  return (
    <Stack gap={6}>
      {hasPhoto ? (
        <ChoiceChips
          label="Foto"
          options={PHOTO_OPTIONS}
          value={choice}
          onChange={search.setPhotoChoice}
          testID={testID}
        />
      ) : (
        <SwitchRow
          label="Foto generieren"
          description="Der Treffer hat kein Foto; die KI schlägt drei vor."
          value={choice === 'ai'}
          onValueChange={(on) => search.setPhotoChoice(on ? 'ai' : 'none')}
          testID={`${testID}-generate`}
        />
      )}
      {note && hasPhoto ? (
        <Text variant="small" color="muted" testID={`${testID}-note`}>
          {note}
        </Text>
      ) : null}
    </Stack>
  );
}

function Preview(props: { search: WebSearch; rows?: RecipeRows; testID: string }) {
  const { search, testID } = props;
  const preview = search.preview;
  if (!preview) return null;
  const { card } = preview;
  const id = `${testID}-preview`;
  return (
    <View style={{ gap: 12 }} testID={id}>
      <CardImage photo={search.photos[card.url]} alt={card.title} />
      <PhotoChoice search={search} testID={`${id}-photo`} />
      <Stack gap={2}>
        <Text variant="cardTitle">
          {preview.status === 'place' && preview.proposal.name ? preview.proposal.name : card.title}
        </Text>
        <Text variant="caption" color="muted">
          {card.source}
        </Text>
      </Stack>
      {preview.status === 'loading' ? (
        <Text variant="small" color="muted" testID={`${id}-busy`}>
          {search.kind === 'recipe' ? 'Das Rezept wird gelesen …' : 'Der Ort wird eingeordnet …'}
        </Text>
      ) : null}
      {preview.status === 'failed' ? <Notice icon="circle-alert" text={preview.message} /> : null}
      {preview.status === 'recipe' && props.rows ? (
        <RecipePreview reply={preview.reply} rows={props.rows} testID={id} />
      ) : null}
      {preview.status === 'place' ? (
        <PlacePreview
          card={card}
          proposal={preview.proposal}
          kindLabel={search.kind === 'restaurant' ? 'Küche' : 'Art'}
          testID={id}
        />
      ) : null}
      <Row gap={12} wrap>
        <Button
          label="Quelle öffnen"
          icon="external-link"
          variant="secondary"
          size="sm"
          onPress={() => openLink(card.url)}
          testID={`${id}-source`}
        />
        <Button
          label="Zurück zu den Ergebnissen"
          icon="arrow-left"
          variant="ghost"
          size="sm"
          onPress={search.back}
          testID={`${id}-back`}
        />
      </Row>
    </View>
  );
}

const PLACEHOLDERS = {
  // Short enough for a phone beside the microphone (iPhone click-through, review 0003).
  recipe: 'z. B. „Spaghetti Bolognese“',
  restaurant: 'z. B. „vietnamesisch Friedrichshain“',
  activity: 'z. B. „Kletterhalle“',
} as const;

/**
 * The field, the status line with pulsing cards while searching (AC-005), the cards (AC-005 –
 * AC-009) and the preview (AC-010 – AC-013). A link pasted alone goes to `onLink` (AC-002).
 */
export function WebSearchPanel(props: {
  search: WebSearch;
  onLink?: (link: string) => void;
  /** Recipes: how the preview matches ingredients to the household's articles. */
  recipeRows?: RecipeRows;
  testID: string;
}) {
  const { search, testID } = props;
  const online = useOnlineOnly();
  if (search.preview) return <Preview search={search} rows={props.recipeRows} testID={testID} />;
  const status = searchStatusLine(search.kind);
  return (
    <Stack gap={12}>
      <DictationField
        key={search.focusRequest}
        label="Im Web suchen"
        placeholder={PLACEHOLDERS[search.kind]}
        value={search.query}
        onChangeText={(text) => {
          const link = props.onLink ? pastedLink(text) : undefined;
          if (link && props.onLink) {
            props.onLink(link);
            return;
          }
          search.setQuery(text.slice(0, WEB_SEARCH_LIMITS.query));
        }}
        onSubmitEditing={search.search}
        returnKeyType="search"
        autoFocus={search.focusRequest > 0}
        editable={!online.disabled && search.state.status !== 'searching'}
        maxLength={WEB_SEARCH_LIMITS.query}
        testID={`${testID}-query`}
      />
      {search.state.status === 'searching' ? (
        <Stack gap={8}>
          <Text variant="small" color="muted" testID={`${testID}-status`}>
            {status}
          </Text>
          {Array.from({ length: SKELETONS }, (_, index) => (
            <SkeletonCard key={index} label={status} testID={`${testID}-skeleton-${index}`} />
          ))}
        </Stack>
      ) : null}
      {search.state.status === 'failed' ? (
        <Notice icon="circle-alert" text={search.state.message} testID={`${testID}-error`} />
      ) : null}
      {search.state.status === 'results' ? (
        search.state.results.length === 0 ? (
          <Text color="muted" testID={`${testID}-empty`}>
            {NOTHING_FOUND}
          </Text>
        ) : (
          <Stack gap={8}>
            {search.state.results.map((card, index) => (
              <ResultCard
                key={card.url}
                card={card}
                photo={search.photos[card.url]}
                onPress={() => search.open(card)}
                testID={`${testID}-card-${index}`}
              />
            ))}
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                label="Nichts dabei? Suche ändern"
                variant="link"
                size="sm"
                onPress={search.edit}
                testID={`${testID}-edit`}
              />
            </View>
          </Stack>
        )
      ) : null}
    </Stack>
  );
}
