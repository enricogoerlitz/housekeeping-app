import {
  applyFieldChanges,
  placeProposal,
  placeValuesFromResult,
  proposalIsEmpty,
  type ChangeProposal,
  type GeoPoint,
  type PlaceValues,
  type ProposalPlaceKind,
} from '@housekeeping/core';
import { Button, Sheet, toast } from '@housekeeping/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

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
  if (!features.aiRecipes) return null;
  const { testID } = props;

  const take = (taken: WebTake) => {
    const after = placeValuesFromResult(props.kind, taken.card, taken.place ?? {});
    const location = taken.card.location;
    setOpen(false);
    if (!props.current) {
      props.onApply({
        values: after,
        ...(location ? { location } : {}),
        ...(taken.photo ? { photo: taken.photo } : {}),
      });
      return;
    }
    const proposal = placeProposal(props.kind, props.current, after);
    if (taken.photo) {
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
      ...(taken.photo ? { photo: taken.photo } : {}),
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
