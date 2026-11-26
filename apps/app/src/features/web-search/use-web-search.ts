import {
  draftRecipeAsync,
  loadPhotoFromAddress,
  OfflineError,
  placePreviewAsync,
  preparePhoto,
  useActivities,
  useRestaurants,
  webSearchAsync,
} from '@housekeeping/api';
import {
  defaultWebPhotoChoice,
  searchCenter,
  WEB_SEARCH_LIMITS,
  type PlaceProposal,
  type RecipeDraftReply,
  type WebResult,
  type WebPhotoChoice,
  type WebSearchKind,
} from '@housekeeping/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { OFFLINE_EDIT_HINT } from '@/features/shell/offline';

// The Websuche (spec 0049) of one window: the query, the cards with their photos (loaded through
// fetch-image, CSP), and the preview of the card the person tapped. Nothing is saved here.

export const NOTHING_FOUND = 'Nichts gefunden. Versuch es mit anderen Wörtern.';
const PREVIEW_FAILED = 'Diese Seite konnte nicht gelesen werden. Versuch einen anderen Treffer.';
/** AC-023; places have no „Eigene Angaben“. */
const UNAVAILABLE = 'Die Websuche ist gerade nicht erreichbar. Versuch es gleich noch einmal';

export type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; results: WebResult[] }
  | { status: 'failed'; message: string };

export type PreviewState =
  | { status: 'loading'; card: WebResult }
  | { status: 'recipe'; card: WebResult; reply: RecipeDraftReply }
  | { status: 'place'; card: WebResult; proposal: PlaceProposal }
  | { status: 'failed'; card: WebResult; message: string };

/** A card's photo: shown from a blob URL, and the photo of the item on "Übernehmen". */
export type CardPhoto =
  { status: 'loading' } | { status: 'ready'; uri: string; photo: Blob } | { status: 'none' };

export interface WebSearch {
  kind: WebSearchKind;
  query: string;
  setQuery: (query: string) => void;
  state: SearchState;
  preview: PreviewState | undefined;
  /** REQ-008: what the photo should show, read from the search text; then no page photo is used. */
  imageWish: string | undefined;
  /** REQ-010: the photo the previewed hit gives the entry; set before „Übernehmen“. */
  photoChoice: WebPhotoChoice;
  setPhotoChoice: (choice: WebPhotoChoice) => void;
  photos: Record<string, CardPhoto>;
  search: () => void;
  open: (card: WebResult) => void;
  /** "Zurück zu den Ergebnissen". */
  back: () => void;
  /** "Nichts dabei? Suche ändern" (AC-013): the field again, the query kept. */
  edit: () => void;
  /** A closed window starts empty again. */
  reset: () => void;
  /** Bumps when the field should take the focus again. */
  focusRequest: number;
  busy: boolean;
}

function searchMessage(error: unknown, kind: WebSearchKind): string {
  if (error instanceof OfflineError) return OFFLINE_EDIT_HINT;
  return kind === 'recipe' ? `${UNAVAILABLE} oder nutze „Eigene Angaben“.` : `${UNAVAILABLE}.`;
}

/** AC-008: where the household's restaurants and activities are. */
function useSearchCenter() {
  const restaurants = useRestaurants();
  const activities = useActivities();
  return searchCenter(
    [...restaurants, ...activities].flatMap((place) => (place.location ? [place.location] : [])),
  );
}

export function useWebSearch(kind: WebSearchKind, initialQuery = ''): WebSearch {
  const near = useSearchCenter();
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [preview, setPreview] = useState<PreviewState>();
  const [imageWish, setImageWish] = useState<string>();
  const [photoChoice, setPhotoChoice] = useState<WebPhotoChoice>('source');
  const [photos, setPhotos] = useState<Record<string, CardPhoto>>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const round = useRef(0);
  // A card's preview is read once per search: tapping it again after „Zurück zu den Ergebnissen“
  // shows it at once instead of asking the model again (KI-Testlauf 26.11.).
  const previews = useRef(new Map<string, PreviewState>());
  const reading = useRef(new Set<string>());
  const shown = useRef<Record<string, CardPhoto>>({});
  useLayoutEffect(() => {
    shown.current = photos;
  });
  useEffect(
    () => () => {
      round.current += 1;
      for (const photo of Object.values(shown.current))
        if (photo.status === 'ready') URL.revokeObjectURL(photo.uri);
    },
    [],
  );

  const loadPhotos = (mine: number, results: readonly WebResult[]) => {
    for (const card of results) {
      const address = card.imageUrl;
      if (!address) continue;
      setPhotos((current) => ({ ...current, [card.url]: { status: 'loading' } }));
      void loadPhotoFromAddress(address)
        .then((raw) => preparePhoto(raw))
        .then(
          (photo) => {
            if (round.current !== mine) return;
            setPhotos((current) => ({
              ...current,
              [card.url]: { status: 'ready', photo, uri: URL.createObjectURL(photo) },
            }));
          },
          () => {
            if (round.current !== mine) return;
            setPhotos((current) => ({ ...current, [card.url]: { status: 'none' } }));
          },
        );
    }
  };

  const search = () => {
    const text = query.trim();
    if (text === '' || state.status === 'searching') return;
    round.current += 1;
    const mine = round.current;
    for (const photo of Object.values(photos))
      if (photo.status === 'ready') URL.revokeObjectURL(photo.uri);
    setPhotos({});
    previews.current.clear();
    reading.current.clear();
    setPreview(undefined);
    setState({ status: 'searching' });
    webSearchAsync({
      kind,
      query: text.slice(0, WEB_SEARCH_LIMITS.query),
      ...(near && kind !== 'recipe' ? { near } : {}),
    }).then(
      (reply) => {
        if (round.current !== mine) return;
        setState({ status: 'results', results: reply.results });
        setImageWish(reply.imageWish);
        loadPhotos(mine, reply.results);
      },
      (error: unknown) => {
        if (round.current !== mine) return;
        setState({ status: 'failed', message: searchMessage(error, kind) });
      },
    );
  };

  const open = (card: WebResult) => {
    const mine = round.current;
    setPhotoChoice(defaultWebPhotoChoice(card.imageUrl !== undefined, imageWish));
    const known = previews.current.get(card.url);
    if (known) {
      setPreview(known);
      return;
    }
    setPreview({ status: 'loading', card });
    // Still being read (back and tapped again): the running answer fills the preview.
    if (reading.current.has(card.url)) return;
    reading.current.add(card.url);
    const done = (next: PreviewState, keep = next.status !== 'failed') => {
      if (round.current !== mine) return;
      reading.current.delete(card.url);
      if (keep) previews.current.set(card.url, next);
      setPreview((current) => (current?.card === card ? next : current));
    };
    if (kind === 'recipe') {
      draftRecipeAsync({ text: '', links: [card.url], photos: [], imagePrompt: false }).then(
        (reply) =>
          done(
            reply.sources.some((source) => source.read)
              ? { status: 'recipe', card, reply }
              : { status: 'failed', card, message: PREVIEW_FAILED },
          ),
        (error: unknown) =>
          done({
            status: 'failed',
            card,
            message: error instanceof OfflineError ? OFFLINE_EDIT_HINT : PREVIEW_FAILED,
          }),
      );
      return;
    }
    placePreviewAsync(kind, card).then(
      (proposal) => done({ status: 'place', card, proposal }),
      // The card alone is a preview too: address, hours and link come from the provider.
      () => done({ status: 'place', card, proposal: {} }, false),
    );
  };

  return {
    kind,
    query,
    setQuery,
    state,
    preview,
    imageWish,
    photoChoice,
    setPhotoChoice,
    photos,
    search,
    open,
    back: () => setPreview(undefined),
    edit: () => {
      setPreview(undefined);
      setState({ status: 'idle' });
      setFocusRequest((count) => count + 1);
    },
    reset: () => {
      round.current += 1;
      previews.current.clear();
      reading.current.clear();
      for (const photo of Object.values(photos))
        if (photo.status === 'ready') URL.revokeObjectURL(photo.uri);
      setPhotos({});
      setPreview(undefined);
      setImageWish(undefined);
      setState({ status: 'idle' });
      setQuery('');
    },
    focusRequest,
    busy: state.status === 'searching' || preview?.status === 'loading',
  };
}
