import { generateImagesAsync } from '@housekeeping/api';
import {
  applyFieldChanges,
  placeImageContext,
  placeProposal,
  placeValuesFromResult,
  proposalIsEmpty,
  type AiImageContext,
  type ChangeProposal,
  type GeoPoint,
  type PlaceValues,
  type ProposalPlaceKind,
} from '@housekeeping/core';
import { Button, Photo, Row, Sheet, Stack, Text, toast, useTheme } from '@housekeeping/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { features } from '@/lib/features';

import { ProposalSheet } from './proposal-sheet';
import { useWebSearch } from './use-web-search';
import { webSearchPrimary, WebSearchPanel, type WebTake } from './web-search-panel';

// "Im Web suchen" of a restaurant or an activity (spec 0049, REQ-001 – REQ-005): the search
// window; "Übernehmen" fills the form of a new one at once (AC-015) and shows an existing one's
// changes in the Änderungsansicht first (AC-021). Saving stays with the form's "Speichern".

/** A place found on the web as the form takes it. */
export interface WebPlace {
  values: PlaceValues;
  location?: GeoPoint;
  photo?: Blob;
}

const PHOTO_FIELD = 'photo';
const TILE_MAX = 160;
const GENERATING_LABEL = 'Foto wird erzeugt';

type Suggestions =
  | { status: 'loading' }
  | { status: 'done'; photos: { photo: Blob; uri: string }[] }
  | { status: 'failed' };

/** Three photos made from the image wish or the place's name (REQ-008, AC-030); none is stored. */
function usePhotoSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestions>();
  const [chosen, setChosen] = useState<number>();
  const round = useRef(0);
  const shown = useRef<Suggestions | undefined>(undefined);
  useLayoutEffect(() => {
    shown.current = suggestions;
  });
  const free = (current: Suggestions | undefined) => {
    if (current?.status === 'done')
      for (const entry of current.photos) URL.revokeObjectURL(entry.uri);
  };
  useEffect(
    () => () => {
      round.current += 1;
      free(shown.current);
    },
    [],
  );
  const suggest = (prompt: string, context: AiImageContext) => {
    round.current += 1;
    const mine = round.current;
    free(shown.current);
    setChosen(undefined);
    setSuggestions({ status: 'loading' });
    generateImagesAsync({ prompt, styles: [], context }).then(
      (result) => {
        if (round.current !== mine) return;
        setSuggestions({
          status: 'done',
          photos: result.images.map((photo) => ({ photo, uri: URL.createObjectURL(photo) })),
        });
      },
      () => {
        if (round.current === mine) setSuggestions({ status: 'failed' });
      },
    );
  };
  return { suggestions, suggest, chosen, choose: setChosen };
}

function SuggestionStrip(props: {
  suggestions: Suggestions;
  chosen: number | undefined;
  onChoose: (index: number, photo: Blob) => void;
  testID: string;
}) {
  const theme = useTheme();
  const { suggestions } = props;
  if (suggestions.status === 'failed') {
    return (
      <Text variant="small" color="muted" testID={`${props.testID}-failed`}>
        Die Fotovorschläge sind gerade nicht gelungen. Du kannst unten selbst ein Foto wählen.
      </Text>
    );
  }
  return (
    <Stack gap={8}>
      <Text variant="smallStrong" testID={props.testID}>
        {suggestions.status === 'loading'
          ? 'Fotovorschläge werden erzeugt …'
          : 'Fotovorschläge – tippe eins an'}
      </Text>
      <Row gap={8}>
        {suggestions.status === 'loading'
          ? [0, 1, 2].map((index) => (
              <View key={index} style={{ flex: 1, maxWidth: TILE_MAX }}>
                <Photo generating={GENERATING_LABEL} aspectRatio={1} />
              </View>
            ))
          : suggestions.photos.map((entry, index) => (
              <Pressable
                key={entry.uri}
                accessibilityRole="radio"
                accessibilityState={{ selected: index === props.chosen }}
                accessibilityLabel={`Vorschlag ${index + 1}`}
                onPress={() => props.onChoose(index, entry.photo)}
                testID={`${props.testID}-${index}`}
                style={{
                  flex: 1,
                  maxWidth: TILE_MAX,
                  borderRadius: theme.shape.radius.tile,
                  borderWidth: 3,
                  borderColor: index === props.chosen ? theme.colors.accent : 'transparent',
                  overflow: 'hidden',
                }}
              >
                <Photo source={{ uri: entry.uri }} aspectRatio={1} alt={`Vorschlag ${index + 1}`} />
              </Pressable>
            ))}
      </Row>
    </Stack>
  );
}

interface Review {
  proposal: ChangeProposal;
  after: PlaceValues;
  location?: GeoPoint;
  photo?: Blob;
}

function ReviewSheet(props: {
  review: Review;
  before: PlaceValues;
  onApply: (web: WebPlace) => void;
  onClose: () => void;
  testID: string;
}) {
  const { review } = props;
  const [uri] = useState(() => (review.photo ? URL.createObjectURL(review.photo) : undefined));
  useEffect(
    () => () => {
      if (uri) URL.revokeObjectURL(uri);
    },
    [uri],
  );
  return (
    <ProposalSheet
      proposal={review.proposal}
      {...(uri ? { photo: { uri } } : {})}
      onClose={props.onClose}
      onApply={(rejected) => {
        // Only what is still active goes into the form; the rest keeps what the form shows.
        const applied = applyFieldChanges(
          props.before as Record<string, string>,
          review.proposal.fields,
          rejected,
        );
        const values: PlaceValues = {};
        for (const field of review.proposal.fields) {
          if (field.id !== PHOTO_FIELD && !rejected.has(field.id))
            values[field.id as keyof PlaceValues] = applied[field.id];
        }
        const mapsTaken = review.proposal.fields.some(
          (field) => field.id === 'mapsUrl' && !rejected.has(field.id),
        );
        props.onApply({
          values,
          ...(mapsTaken && review.location ? { location: review.location } : {}),
          ...(review.photo && !rejected.has(PHOTO_FIELD) ? { photo: review.photo } : {}),
        });
      }}
      testID={props.testID}
    />
  );
}

/**
 * The link "Im Web suchen" and its windows. `current` are the form's values when it edits an
 * existing place (then the Änderungsansicht comes first); without it the form is filled at once.
 */
export function PlaceWebFill(props: {
  kind: ProposalPlaceKind;
  name: string;
  current?: PlaceValues;
  hasPhoto: boolean;
  onApply: (web: WebPlace) => void;
  /** A map link pasted into the search field goes to the form's link. */
  onLink: (link: string) => void;
  testID: string;
}) {
  const online = useOnlineOnly();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review>();
  const search = useWebSearch(props.kind);
  const { suggestions, suggest, chosen, choose } = usePhotoSuggestions();
  if (!features.aiRecipes) return null;
  const { testID } = props;

  const take = (taken: WebTake) => {
    const after = placeValuesFromResult(props.kind, taken.card, taken.place ?? {});
    const location = taken.card.location;
    setOpen(false);
    // REQ-008: an image wish makes the photo; without one the card's photo, and a place without
    // one gets one made from its name (AC-030), unless it has a photo already.
    const photo = taken.imageWish ? undefined : taken.photo;
    if (taken.imageWish || (!photo && !props.hasPhoto)) {
      // Spec 0052: the raw wish (or the name) with what the photo is for.
      suggest(
        taken.imageWish ?? after.name ?? taken.card.title,
        placeImageContext(props.kind, after),
      );
    }
    if (!props.current) {
      props.onApply({
        values: after,
        ...(location ? { location } : {}),
        ...(photo ? { photo } : {}),
      });
      return;
    }
    // Tags are added to the ones there are, never replace them.
    if (after.tags && props.current.tags) {
      const known = props.current.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const added = after.tags.split(',').map((tag) => tag.trim());
      const lower = new Set(known.map((tag) => tag.toLowerCase()));
      after.tags = [...known, ...added.filter((tag) => tag && !lower.has(tag.toLowerCase()))].join(
        ', ',
      );
    }
    const proposal = placeProposal(props.kind, props.current, after);
    if (photo) {
      proposal.fields.push({
        id: PHOTO_FIELD,
        label: 'Foto',
        before: props.hasPhoto ? 'bisheriges Foto' : '',
        after: 'Foto aus der Suche',
        status: props.hasPhoto ? 'changed' : 'new',
      });
    }
    if (proposalIsEmpty(proposal)) {
      toast.show({ message: 'Der Treffer ändert nichts.' });
      return;
    }
    setReview({
      proposal,
      after,
      ...(location ? { location } : {}),
      ...(photo ? { photo } : {}),
    });
  };

  return (
    <>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label="Im Web suchen"
          icon="search"
          variant="link"
          size="sm"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => {
            search.reset();
            search.setQuery(props.name.trim());
            setOpen(true);
          }}
          testID={`${testID}-open`}
        />
      </View>
      {open ? (
        <Sheet
          visible
          size="l"
          title="Im Web suchen"
          onClose={() => setOpen(false)}
          actions={{
            primary: webSearchPrimary(search, online, take, testID),
            cancel: {
              label: 'Abbrechen',
              onPress: () => setOpen(false),
              testID: `${testID}-cancel`,
            },
          }}
          testID={`${testID}-sheet`}
        >
          <WebSearchPanel
            search={search}
            onLink={(link) => {
              setOpen(false);
              props.onLink(link);
            }}
            testID={testID}
          />
        </Sheet>
      ) : null}
      {suggestions ? (
        <SuggestionStrip
          suggestions={suggestions}
          chosen={chosen}
          onChoose={(index, photo) => {
            choose(index);
            props.onApply({ values: {}, photo });
          }}
          testID={`${testID}-photos`}
        />
      ) : null}
      {review && props.current ? (
        <ReviewSheet
          review={review}
          before={props.current}
          onApply={(web) => {
            setReview(undefined);
            props.onApply(web);
          }}
          onClose={() => setReview(undefined)}
          testID={`${testID}-proposal`}
        />
      ) : null}
    </>
  );
}
