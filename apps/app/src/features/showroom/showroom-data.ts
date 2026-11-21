// Sample data of the showroom (spec 0005): only for showing the building blocks, never saved.

export interface SampleArticle {
  id: string;
  name: string;
  synonyms?: string[];
  area: string;
}

/** AC-032 to AC-035: articles with synonyms and areas. */
export const SAMPLE_ARTICLES: SampleArticle[] = [
  { id: 'moehren', name: 'Möhren', synonyms: ['Karotten'], area: 'Obst & Gemüse' },
  { id: 'kokosmilch', name: 'Kokosmilch', area: 'Konserven & Saucen' },
  { id: 'kokosmilch-light', name: 'Kokosmilch light', area: 'Konserven & Saucen' },
  { id: 'milch', name: 'Milch', area: 'Kühlregal & Molkerei' },
  { id: 'tomaten', name: 'Tomaten', area: 'Obst & Gemüse' },
  { id: 'brot', name: 'Brot', area: 'Brot & Backwaren' },
  { id: 'zwiebeln', name: 'Zwiebeln', area: 'Obst & Gemüse' },
];

export type SampleKind = 'recipe' | 'restaurant' | 'activity';

export const KIND_LABELS: Record<SampleKind, string> = {
  recipe: 'Rezept',
  restaurant: 'Restaurant',
  activity: 'Aktivität',
};

/** AC-036: entries of three kinds for the "Hinzufügen" example. */
export const SAMPLE_ENTRIES: { id: string; name: string; kind: SampleKind }[] = [
  { id: 'lasagne', name: 'Lasagne', kind: 'recipe' },
  { id: 'mango-curry', name: 'Mango-Curry', kind: 'recipe' },
  { id: 'shakshuka', name: 'Shakshuka', kind: 'recipe' },
  { id: 'enzo', name: 'Trattoria Da Enzo', kind: 'restaurant' },
  { id: 'pho', name: 'Pho Saigon', kind: 'restaurant' },
  { id: 'eislaufen', name: 'Eislaufen', kind: 'activity' },
  { id: 'bouldern', name: 'Bouldern', kind: 'activity' },
];

export interface SampleRecipe {
  id: string;
  title: string;
  vegan: boolean;
  favorite: boolean;
  minutes: number;
  rating: number;
  cuisine: 'Italienisch' | 'Asiatisch' | 'Orientalisch' | 'Deutsch';
  /** Position in "Zuletzt gekocht" (0 = most recent). */
  lastCooked: number;
  /** Position in "Neu" (0 = newest). */
  added: number;
}

const DISHES = [
  'Lasagne',
  'Mango-Curry',
  'Shakshuka',
  'Linsen-Dal',
  'Halloumi-Pfanne',
  'Kichererbsen-Eintopf',
  'Pasta Pomodoro',
  'Ramen',
  'Falafel-Bowl',
  'Gemüsesuppe',
];
const VARIANTS = ['', ' mit Spinat', ' scharf', ' vom Blech'];
const CUISINES: SampleRecipe['cuisine'][] = ['Italienisch', 'Asiatisch', 'Orientalisch', 'Deutsch'];

/** AC-038: 40 sample recipes for the filter row. */
export const SAMPLE_RECIPES: SampleRecipe[] = Array.from({ length: 40 }, (_, index) => ({
  id: `rezept-${index + 1}`,
  title: `${DISHES[index % DISHES.length] ?? 'Gericht'}${VARIANTS[Math.floor(index / DISHES.length)] ?? ''}`,
  vegan: index % 3 === 0,
  favorite: index % 4 === 1,
  minutes: 15 + ((index * 7) % 50),
  rating: (index * 3) % 6,
  cuisine: CUISINES[index % CUISINES.length] ?? 'Deutsch',
  lastCooked: (index * 13) % 40,
  added: 39 - index,
}));

/** AC-026 to AC-031: the rows of the check example. */
export const SAMPLE_CHECK_ITEMS = ['Milch', 'Brot', 'Eier', 'Butter', 'Äpfel'];

/** AC-042: rows of the endless list, a group heading every 100 rows. */
export type EndlessRow =
  { kind: 'group'; id: string; label: string } | { kind: 'row'; id: string; number: number };

export const ENDLESS_ROWS: EndlessRow[] = Array.from(
  { length: 1000 },
  (_, index) => index + 1,
).flatMap((number): EndlessRow[] => {
  const row: EndlessRow = { kind: 'row', id: `zeile-${number}`, number };
  return number % 100 === 1
    ? [{ kind: 'group', id: `gruppe-${number}`, label: `Zeilen ${number}–${number + 99}` }, row]
    : [row];
});

/** Spec 0008, AC-013: 150 tiles; A–Z ends with "Rezept 150". */
export const ENDLESS_TILES: { id: string; number: number; title: string }[] = Array.from(
  { length: 150 },
  (_, index) => ({
    id: `kachel-${index + 1}`,
    number: index + 1,
    title: `Rezept ${String(index + 1).padStart(3, '0')}`,
  }),
);
