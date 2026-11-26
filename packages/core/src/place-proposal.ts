import {
  IMAGE_CONTEXT_LIMITS,
  type AiImageContext,
  type PlaceProposal,
  type WebResult,
} from './ai-contract';
import { diffFieldChanges, type ChangeProposal } from './proposal-diff';
import { priceLabel } from './restaurants';

// A place found on the web (spec 0049) as the values of the restaurant or activity form, and the
// Änderungsansicht of an existing one. Values are text like in the form: the price level as
// "1"…"4", the kind by its name; the app turns them into its draft or patch.

const RESTAURANT_LABELS = {
  name: 'Name',
  address: 'Adresse',
  cuisine: 'Küche',
  tags: 'Schlagworte',
  priceLevel: 'Preis',
  websiteUrl: 'Webseite',
  mapsUrl: 'Karten-Link',
} as const;

const ACTIVITY_LABELS = {
  name: 'Name',
  placeName: 'Ort',
  address: 'Adresse',
  kind: 'Art',
  description: 'Beschreibung',
  websiteUrl: 'Webseite',
  mapsUrl: 'Karten-Link',
} as const;

export type ProposalPlaceKind = 'restaurant' | 'activity';
export type PlaceValues = Partial<
  Record<keyof typeof RESTAURANT_LABELS | keyof typeof ACTIVITY_LABELS, string>
>;

function defined(values: Record<string, string | undefined>): PlaceValues {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

/** AC-015: the card and its preview as form values; what the provider does not know stays out. */
export function placeValuesFromResult(
  kind: ProposalPlaceKind,
  result: WebResult,
  preview: PlaceProposal,
): PlaceValues {
  const shared = {
    // AC-029: the name as people say it ("Phê", not "Phê - Fresh Bánh mì & Phở Bar").
    name: preview.name ?? result.title,
    address: result.address,
    websiteUrl: result.websiteUrl,
    mapsUrl: result.mapsUrl,
  };
  if (kind === 'restaurant') {
    return defined({
      ...shared,
      cuisine: preview.cuisine,
      tags: preview.tags && preview.tags.length > 0 ? preview.tags.join(', ') : undefined,
      priceLevel: result.priceLevel === undefined ? undefined : String(result.priceLevel),
    });
  }
  return defined({
    ...shared,
    placeName: result.title,
    kind: preview.kind,
    description: preview.description,
  });
}

/** AC-021: what the found place changes on an existing restaurant or activity. */
export function placeProposal(
  kind: ProposalPlaceKind,
  before: PlaceValues,
  after: PlaceValues,
): ChangeProposal {
  const fields =
    kind === 'restaurant'
      ? diffFieldChanges<keyof typeof RESTAURANT_LABELS>(RESTAURANT_LABELS, before, after, {
          priceLevel: (value) => priceLabel(Number(value) as 1 | 2 | 3 | 4),
        })
      : diffFieldChanges<keyof typeof ACTIVITY_LABELS>(ACTIVITY_LABELS, before, after);
  return { fields, groups: [] };
}

/**
 * What a generated photo of a found place is for (spec 0052): its name, cuisine or kind, place and
 * description. The person's image wish goes as the prompt beside it, untouched.
 */
export function placeImageContext(kind: ProposalPlaceKind, values: PlaceValues): AiImageContext {
  const cut = (value: string | undefined, max: number) =>
    value?.trim().slice(0, max).trim() || undefined;
  const context: AiImageContext = {
    kind,
    title: cut(values.name, IMAGE_CONTEXT_LIMITS.title) ?? kind,
  };
  const category = cut(
    kind === 'restaurant' ? values.cuisine : values.kind,
    IMAGE_CONTEXT_LIMITS.category,
  );
  if (category) context.category = category;
  const place = kind === 'activity' ? cut(values.placeName, IMAGE_CONTEXT_LIMITS.place) : undefined;
  if (place) context.place = place;
  const description = cut(values.description, IMAGE_CONTEXT_LIMITS.description);
  if (description) context.description = description;
  return context;
}
