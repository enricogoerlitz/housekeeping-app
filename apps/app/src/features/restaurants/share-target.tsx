import { Redirect, useLocalSearchParams } from 'expo-router';

/** Shared text longer than this is not a map link or a name; it is cut instead of carried along. */
const MAX_SHARED_LENGTH = 2000;

function firstString(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().slice(0, MAX_SHARED_LENGTH);
  return trimmed || undefined;
}

/**
 * Share target `/teilen?url=…&text=…` (Android PWA now, native share extension later, AC-008):
 * opens "Essen → Restaurants" of the active household with "Restaurant hinzufügen" prefilled.
 */
export function ShareTarget() {
  const params = useLocalSearchParams<{ url?: string | string[]; text?: string | string[] }>();
  const url = firstString(params.url);
  const text = firstString(params.text);
  // Map apps often share "Name https://…" as one text; the name is what remains without the link.
  const name = text?.replace(/https?:\/\/\S+/g, '').trim() || undefined;
  const link = url ?? text;
  const shareParams: Record<string, string> = { view: 'restaurants', add: '1' };
  if (link) shareParams.share = link;
  if (name) shareParams.shareName = name;
  return <Redirect href={{ pathname: '/rezepte', params: shareParams }} />;
}
