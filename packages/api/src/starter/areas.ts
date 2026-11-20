import type { AreaKey } from './types';

/** Predefined supermarket areas in their default order. Households may rename or extend them. */
export const starterAreas: { key: AreaKey; name: string }[] = [
  { key: 'obst-gemuese', name: 'Obst & Gemüse' },
  { key: 'brot', name: 'Brot & Backwaren' },
  { key: 'kuehlregal', name: 'Kühlregal & Molkerei' },
  { key: 'kaese', name: 'Käse' },
  { key: 'fleisch', name: 'Fleisch & Wurst' },
  { key: 'fisch', name: 'Fisch' },
  { key: 'tiefkuehl', name: 'Tiefkühl' },
  { key: 'nudeln-reis', name: 'Nudeln, Reis & Hülsenfrüchte' },
  { key: 'konserven', name: 'Konserven & Saucen' },
  { key: 'backen', name: 'Backen' },
  { key: 'gewuerze-oel', name: 'Gewürze & Öl' },
  { key: 'fruehstueck', name: 'Frühstück & Aufstriche' },
  { key: 'suesses', name: 'Süßes & Snacks' },
  { key: 'getraenke', name: 'Getränke' },
  { key: 'kaffee-tee', name: 'Kaffee & Tee' },
  { key: 'drogerie', name: 'Drogerie & Hygiene' },
  { key: 'haushalt', name: 'Haushalt & Reinigung' },
  { key: 'tierbedarf', name: 'Tierbedarf' },
  { key: 'sonstiges', name: 'Sonstiges' },
];
